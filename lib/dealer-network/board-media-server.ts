import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient, getSupabaseUrl } from "@/lib/supabase";
import { exactStorageArrayBuffer, normalizeMessageImage } from "./image-processing";
import { MESSAGE_PHOTO_BYTES } from "./messaging-validation";
import { parseBoardUploadTicketRequest, validateBoardUploadIds } from "./board-media-validation";
import { validateUuid } from "./validation";

const BUCKET = "dealer-network-board-private";
const UPLOADS = "dealer_network_board_comment_uploads";
const ATTACHMENTS = "dealer_network_board_comment_attachments";
const COMMENTS = "dealer_network_discussion_comments";
const DISCUSSIONS = "dealer_network_discussions";
const TOPICS = "dealer_network_board_topics";
const RECIPIENTS = "dealer_network_board_topic_recipients";
const EXPIRES_MS = 30 * 60 * 1000;
const db = getSupabaseServiceClient;

function tusEndpoint() {
  const url = new URL(getSupabaseUrl());
  if (url.hostname.endsWith(".supabase.co"))
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  else if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("UPLOAD_NOT_CONFIGURED");
  url.pathname = "/storage/v1/upload/resumable/sign";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function discussionAccess(memberId: string, discussionId: string, parentId: string | null, write: boolean) {
  if (!validateUuid(discussionId)) throw new Error("DISCUSSION_UNAVAILABLE");
  const client = db();
  const { data: discussion, error } = await client.from(DISCUSSIONS).select("topic_id,status").eq("id", discussionId).maybeSingle();
  if (error || !discussion || (write && discussion.status !== "open")) throw new Error("DISCUSSION_UNAVAILABLE");
  const [topic, recipient] = await Promise.all([
    client.from(TOPICS).select("status").eq("id", discussion.topic_id).maybeSingle(),
    client.from(RECIPIENTS).select("topic_id").eq("topic_id", discussion.topic_id).eq("member_id", memberId).maybeSingle(),
  ]);
  if (topic.error || recipient.error || !topic.data || !recipient.data ||
      (write ? topic.data.status !== "active" : topic.data.status === "draft"))
    throw new Error("DISCUSSION_UNAVAILABLE");
  if (parentId !== null) {
    const { data: parent, error: parentError } = await client.from(COMMENTS).select("id").eq("id", parentId)
      .eq("discussion_id", discussionId).is("parent_comment_id", null).is("removed_at", null).is("deleted_at", null).maybeSingle();
    if (parentError || !parent) throw new Error("INVALID_PARENT");
  }
}

async function cleanExpiredUploads(memberId: string) {
  const client = db();
  // Signed upload tickets can outlive the application ticket; wait before deleting staging objects.
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const expired = await client.from(UPLOADS).select("id,storage_path,verified_path,status")
    .eq("owner_member_id", memberId).lt("expires_at", cutoff).limit(30);
  if (expired.error || !expired.data?.length) return;
  for (const row of expired.data) {
    if (row.status !== "consumed") {
      const claim = await client.from(UPLOADS).update({status:"failed"}).eq("id",row.id)
        .neq("status","consumed").select("id").maybeSingle();
      if (!claim.data || claim.error) continue;
    }
    const paths = [row.storage_path];
    if (row.status !== "consumed" && row.verified_path) paths.push(row.verified_path);
    const removed = await client.storage.from(BUCKET).remove(paths);
    if (!removed.error)
      await client.from(UPLOADS).delete().eq("id", row.id)
        .in("status", ["failed", "consumed"]);
  }
}

export async function prepareBoardUploads(memberId: string, discussionId: string, raw: unknown) {
  const parsed = parseBoardUploadTicketRequest(discussionId, raw);
  if (!parsed) throw new Error("INVALID_UPLOAD_REQUEST");
  const { parentId } = parsed;
  await discussionAccess(memberId, discussionId, parentId, true);
  await cleanExpiredUploads(memberId);
  const url = tusEndpoint();
  const client = db();
  const expiresAt = new Date(Date.now() + EXPIRES_MS).toISOString();
  const rows = parsed.files.map((file) => {
    const id = randomUUID();
    return {
      id, owner_member_id: memberId, discussion_id: discussionId, parent_comment_id: parentId,
      storage_path: `staging/${memberId}/${discussionId}/${id}`, declared_content_type: file.contentType,
      declared_byte_size: file.byteSize, expires_at: expiresAt,
    };
  });
  const { error } = await client.from(UPLOADS).insert(rows);
  if (error) throw error;
  try {
    const tickets = [];
    for (const row of rows) {
      const ticket = await client.storage.from(BUCKET).createSignedUploadUrl(row.storage_path);
      if (ticket.error || !ticket.data?.token) throw new Error("UPLOAD_TICKET_FAILED");
      tickets.push({ id: row.id, path: row.storage_path, signedUrl: url, token: ticket.data.token });
    }
    return { bucket: BUCKET, expiresAt, tickets };
  } catch (cause) {
    await client.from(UPLOADS).update({ status: "failed" }).in("id", rows.map((row) => row.id)).eq("owner_member_id", memberId).eq("status", "prepared");
    throw cause;
  }
}

export async function cancelBoardUpload(memberId: string, uploadId: string) {
  if (!validateUuid(uploadId)) return;
  // Keep a failed row for expiry cleanup, even if a still-valid ticket uploads again.
  const client = db();
  const cancelled = await client.from(UPLOADS).update({ status: "failed" }).eq("id", uploadId)
    .eq("owner_member_id", memberId).eq("status", "prepared").select("storage_path").maybeSingle();
  if (cancelled.data?.storage_path)
    await client.storage.from(BUCKET).remove([cancelled.data.storage_path]);
}

export async function verifyBoardUploads(memberId: string, discussionId: string, parentId: string | null, ids: string[]) {
  if (!ids.length) return;
  if (!validateBoardUploadIds(parentId, ids))
    throw new Error("INVALID_UPLOAD_REQUEST");
  await discussionAccess(memberId, discussionId, parentId, true);
  const client = db();
  const bucket = client.storage.from(BUCKET);
  const now = new Date().toISOString();
  let query = client.from(UPLOADS).select("id,storage_path,declared_content_type,declared_byte_size,status")
    .eq("owner_member_id", memberId).eq("discussion_id", discussionId).in("id", ids).gt("expires_at", now)
    .in("status", ["prepared", "ready"]);
  query = parentId === null ? query.is("parent_comment_id", null) : query.eq("parent_comment_id", parentId);
  const found = await query;
  if (found.error || found.data?.length !== ids.length) throw new Error("UPLOAD_UNAVAILABLE");
  for (const row of found.data) {
    if (row.status === "ready") continue;
    const path = `verified/${memberId}/${discussionId}/${row.id}.jpg`;
    const claim = await client.from(UPLOADS).update({ status: "processing", verified_path: path })
      .eq("id", row.id).eq("owner_member_id", memberId).eq("status", "prepared").gt("expires_at", now).select("id").maybeSingle();
    if (claim.error || !claim.data) throw new Error("UPLOAD_UNAVAILABLE");
    try {
      const staged = await bucket.download(row.storage_path);
      if (staged.error || !staged.data) {
        throw new Error("UPLOAD_UNAVAILABLE");
      }
      if (staged.data.size !== row.declared_byte_size || staged.data.size > MESSAGE_PHOTO_BYTES)
        throw new Error("INVALID_IMAGE_SIZE");
      const normalized = await normalizeMessageImage(new Uint8Array(await staged.data.arrayBuffer()), row.declared_content_type);
      if (normalized.buffer.byteLength > MESSAGE_PHOTO_BYTES) throw new Error("INVALID_IMAGE_SIZE");
      const written = await bucket.upload(path, exactStorageArrayBuffer(normalized.buffer), {
        contentType: "image/jpeg", cacheControl: "0", upsert: false,
      });
      if (written.error) throw written.error;
      const info = await bucket.info(path);
      if (info.error || Number(info.data?.size ?? info.data?.metadata?.size) !== normalized.buffer.byteLength)
        throw new Error("STORED_IMAGE_SIZE_MISMATCH");
      const ready = await client.from(UPLOADS).update({
        status: "ready", width: normalized.width, height: normalized.height,
      }).eq("id",row.id).eq("status","processing").select("id").maybeSingle();
      if (ready.error || !ready.data) throw new Error("UPLOAD_UNAVAILABLE");
      await bucket.remove([row.storage_path]);
    } catch (error) {
      // A ready update may have committed even if its response was lost. Never remove a potentially bound photo.
      const failed = await client.from(UPLOADS).update({status:"failed"}).eq("id",row.id).eq("status","processing").select("id").maybeSingle();
      if (!failed.error && failed.data) await bucket.remove([row.storage_path, path]);
      throw error;
    }
  }
}

export async function readBoardPhoto(id: string, memberId: string | null) {
  if (!validateUuid(id)) throw new Error("PHOTO_UNAVAILABLE");
  const client = db();
  const photo = await client.from(ATTACHMENTS).select("comment_id,storage_path").eq("id",id).maybeSingle();
  if (photo.error || !photo.data?.storage_path.startsWith("verified/")) throw new Error("PHOTO_UNAVAILABLE");
  const comment = await client.from(COMMENTS).select("discussion_id,deleted_at,removed_at").eq("id",photo.data.comment_id).maybeSingle();
  if (comment.error || !comment.data || comment.data.deleted_at || comment.data.removed_at) throw new Error("PHOTO_UNAVAILABLE");
  if (memberId !== null) await discussionAccess(memberId,comment.data.discussion_id,null,false);
  const { data, error } = await client.storage.from(BUCKET).download(photo.data.storage_path);
  if (error || !data || data.size > MESSAGE_PHOTO_BYTES) throw new Error("PHOTO_UNAVAILABLE");
  return new Response(data, {headers:{
    "content-type":"image/jpeg",
    "cache-control":"private, no-store",
    "x-content-type-options":"nosniff",
    "cross-origin-resource-policy":"same-origin",
  }});
}
