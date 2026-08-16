import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient, getSupabaseUrl } from "@/lib/supabase";
import {
  exactStorageArrayBuffer,
  normalizeMessageImage,
} from "./image-processing";
import {
  TROUBLESHOOTING_BATCH_BYTES,
  TROUBLESHOOTING_PHOTO_BYTES,
  validateTroubleshootingEntry,
  validateTroubleshootingSearch,
  validateTroubleshootingUploadRequest,
} from "./troubleshooting-validation";
import {
  TROUBLESHOOTING_BUCKET,
  TROUBLESHOOTING_SIGNED_READ_SECONDS,
} from "./troubleshooting-storage";
import type {
  AdminTroubleshootingEntry,
  AdminTroubleshootingPhoto,
  TroubleshootingEntry,
  TroubleshootingPhoto,
  TroubleshootingPhotoKind,
  TroubleshootingStatus,
  TroubleshootingUploadTicket,
} from "./types";
import { validateUuid } from "./validation";

export const TROUBLESHOOTING_UPLOAD_SECONDS = 30 * 60;

type EntryRow = {
  id: string;
  member_id: string;
  member_name_snapshot: string;
  company_name_snapshot: string;
  title: string;
  brand: string;
  model: string;
  issue_date: string;
  firmware_software_version: string;
  system_area: string;
  bad_part: string | null;
  issue_description: string;
  fix_description: string;
  status: TroubleshootingStatus;
  approved_at: string | null;
  created_at: string;
};

type PhotoRow = {
  id: string;
  entry_id: string;
  photo_kind: TroubleshootingPhotoKind;
  width: number;
  height: number;
  position: number;
};

type AdminEntryRow = EntryRow & {
  publicly_published: boolean;
};

type AdminPhotoRow = PhotoRow & {
  publicly_visible: boolean;
};

const entryColumns =
  "id,member_id,member_name_snapshot,company_name_snapshot,title,brand,model,issue_date,firmware_software_version,system_area,bad_part,issue_description,fix_description,status,approved_at,created_at";
const adminEntryColumns = `${entryColumns},publicly_published`;

function tusEndpoint() {
  const url = new URL(getSupabaseUrl());
  if (!url.hostname.endsWith(".supabase.co"))
    throw new Error("UPLOAD_NOT_CONFIGURED");
  url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable/sign";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function mapEntry(
  row: EntryRow,
  photos: PhotoRow[],
  photoRoute: (id: string) => string,
): TroubleshootingEntry {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberName: String(row.member_name_snapshot),
    companyName: String(row.company_name_snapshot),
    title: String(row.title),
    brand: String(row.brand),
    model: String(row.model),
    issueDate: String(row.issue_date),
    firmwareSoftwareVersion: String(row.firmware_software_version),
    systemArea: String(row.system_area),
    badPart: row.bad_part,
    issueDescription: String(row.issue_description),
    fixDescription: String(row.fix_description),
    status: row.status,
    photos: photos
      .filter((photo) => photo.entry_id === row.id)
      .sort(
        (a, b) =>
          a.photo_kind.localeCompare(b.photo_kind) || a.position - b.position,
      )
      .map(
        (photo): TroubleshootingPhoto => ({
          id: String(photo.id),
          photoKind: photo.photo_kind,
          url: photoRoute(String(photo.id)),
          width: Number(photo.width),
          height: Number(photo.height),
          position: Number(photo.position),
        }),
      ),
    approvedAt: row.approved_at,
    createdAt: String(row.created_at),
  };
}

async function mapEntries(
  rows: EntryRow[],
  photoRoute: (id: string) => string,
) {
  if (!rows.length) return [];
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_photos")
    .select("id,entry_id,photo_kind,width,height,position")
    .in(
      "entry_id",
      rows.map((row) => row.id),
    );
  if (error) throw error;
  const photos = (data ?? []) as PhotoRow[];
  return rows.map((row) => mapEntry(row, photos, photoRoute));
}

function mapAdminEntry(
  row: AdminEntryRow,
  photos: AdminPhotoRow[],
): AdminTroubleshootingEntry {
  const publiclyVisibleById = new Map(
    photos.map((photo) => [photo.id, Boolean(photo.publicly_visible)]),
  );
  const entry = mapEntry(
    row,
    photos,
    (id) => `/api/admin/dealer-network/troubleshooting/photos/${id}`,
  );
  return {
    ...entry,
    publiclyPublished: Boolean(row.publicly_published),
    photos: entry.photos.map(
      (photo): AdminTroubleshootingPhoto => ({
        ...photo,
        publiclyVisible: publiclyVisibleById.get(photo.id) === true,
      }),
    ),
  };
}

export async function readTroubleshootingLibrary(searchValue: unknown) {
  const search = validateTroubleshootingSearch(searchValue);
  if (search === null) throw new Error("INVALID_SEARCH");
  let query = getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_entries")
    .select(entryColumns)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(100);
  if (search)
    query = query.textSearch("title_search", search, {
      config: "english",
      type: "websearch",
    });
  const { data, error } = await query;
  if (error) throw error;
  return mapEntries(
    (data ?? []) as EntryRow[],
    (id) => `/api/dealer-network/member/troubleshooting/photos/${id}`,
  );
}

export async function readOwnTroubleshootingEntries(memberId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_entries")
    .select(entryColumns)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return mapEntries(
    (data ?? []) as EntryRow[],
    (id) => `/api/dealer-network/member/troubleshooting/photos/${id}`,
  );
}

export async function readAdminTroubleshootingEntries() {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("dealer_network_troubleshooting_entries")
    .select(adminEntryColumns)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as AdminEntryRow[];
  if (!rows.length) return [];
  const { data: photoData, error: photoError } = await client
    .from("dealer_network_troubleshooting_photos")
    .select("id,entry_id,photo_kind,width,height,position,publicly_visible")
    .in(
      "entry_id",
      rows.map((row) => row.id),
    );
  if (photoError) throw photoError;
  const photos = (photoData ?? []) as AdminPhotoRow[];
  const photosByEntry = new Map<string, AdminPhotoRow[]>();
  for (const photo of photos) {
    const group = photosByEntry.get(photo.entry_id) ?? [];
    group.push(photo);
    photosByEntry.set(photo.entry_id, group);
  }
  return rows.map((row) => mapAdminEntry(row, photosByEntry.get(row.id) ?? []));
}

async function cleanExpiredUploads() {
  const client = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const staleProcessing = new Date(Date.now() - 30 * 60 * 1_000).toISOString();
  const [{ data: expired }, { data: abandoned }] = await Promise.all([
    client
      .from("dealer_network_troubleshooting_uploads")
      .select("id,storage_path,status")
      .in("status", ["prepared", "failed", "consumed"])
      .lt("expires_at", now)
      .limit(20),
    client
      .from("dealer_network_troubleshooting_uploads")
      .select("id,storage_path,status")
      .eq("status", "processing")
      .lt("updated_at", staleProcessing)
      .limit(20),
  ]);
  const rows = [...(expired ?? []), ...(abandoned ?? [])];
  if (!rows.length) return;
  const { error } = await client.storage
    .from(TROUBLESHOOTING_BUCKET)
    .remove(rows.map((row) => row.storage_path));
  if (error) return;
  const ids = rows
    .filter((row) => row.status !== "consumed")
    .map((row) => row.id);
  if (ids.length)
    await client
      .from("dealer_network_troubleshooting_uploads")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .in("id", ids)
      .in("status", ["prepared", "processing", "failed"]);
}

export async function prepareTroubleshootingUploads(
  memberId: string,
  input: unknown,
) {
  const parsed = validateTroubleshootingUploadRequest(input);
  if (!parsed) throw new Error("INVALID_UPLOAD_REQUEST");
  await cleanExpiredUploads();
  const client = getSupabaseServiceClient();
  const expiresAt = new Date(
    Date.now() + TROUBLESHOOTING_UPLOAD_SECONDS * 1_000,
  ).toISOString();
  const rows = parsed.files.map((file) => {
    const id = randomUUID();
    return {
      id,
      owner_member_id: memberId,
      storage_path: `staging/${memberId}/${id}`,
      photo_kind: file.photoKind,
      position: file.position,
      declared_content_type: file.contentType,
      declared_byte_size: file.byteSize,
      expires_at: expiresAt,
    };
  });
  const { error } = await client
    .from("dealer_network_troubleshooting_uploads")
    .insert(rows);
  if (error) throw error;
  const tickets: TroubleshootingUploadTicket[] = [];
  try {
    for (const row of rows) {
      const { data, error: signedError } = await client.storage
        .from(TROUBLESHOOTING_BUCKET)
        .createSignedUploadUrl(row.storage_path);
      if (signedError || !data?.token)
        throw signedError ?? new Error("UPLOAD_TICKET_FAILED");
      tickets.push({
        id: row.id,
        path: row.storage_path,
        signedUrl: tusEndpoint(),
        token: data.token,
        photoKind: row.photo_kind,
        position: row.position,
      });
    }
    return { bucket: TROUBLESHOOTING_BUCKET, expiresAt, tickets };
  } catch (error) {
    await client
      .from("dealer_network_troubleshooting_uploads")
      .delete()
      .in(
        "id",
        rows.map((row) => row.id),
      );
    throw error;
  }
}

export async function cancelTroubleshootingUpload(
  memberId: string,
  uploadId: string,
) {
  if (!validateUuid(uploadId)) return;
  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("dealer_network_troubleshooting_uploads")
    .select("storage_path")
    .eq("id", uploadId)
    .eq("owner_member_id", memberId)
    .eq("status", "prepared")
    .maybeSingle();
  if (!data?.storage_path) return;
  const { error } = await client.storage
    .from(TROUBLESHOOTING_BUCKET)
    .remove([data.storage_path]);
  if (!error)
    await client
      .from("dealer_network_troubleshooting_uploads")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", uploadId)
      .eq("owner_member_id", memberId)
      .eq("status", "prepared");
}

type ProcessedPhoto = {
  storagePath: string;
  photoKind: TroubleshootingPhotoKind;
  contentType: "image/jpeg";
  byteSize: number;
  originalContentType: string;
  originalByteSize: number;
  width: number;
  height: number;
  position: number;
};

export async function createTroubleshootingEntry(
  memberId: string,
  input: unknown,
) {
  const parsed = validateTroubleshootingEntry(input);
  if (!parsed) throw new Error("INVALID_TROUBLESHOOTING_ENTRY");
  const client = getSupabaseServiceClient();
  const entryId = randomUUID();
  let uploads: Array<{
    id: string;
    storage_path: string;
    photo_kind: TroubleshootingPhotoKind;
    position: number;
    declared_content_type: Parameters<typeof normalizeMessageImage>[1];
    declared_byte_size: number;
  }> = [];
  if (parsed.uploadIds.length) {
    const { data, error } = await client
      .from("dealer_network_troubleshooting_uploads")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .in("id", parsed.uploadIds)
      .eq("owner_member_id", memberId)
      .eq("status", "prepared")
      .gt("expires_at", new Date().toISOString())
      .select(
        "id,storage_path,photo_kind,position,declared_content_type,declared_byte_size",
      );
    if (error || data?.length !== parsed.uploadIds.length) {
      const claimed = data ?? [];
      if (claimed.length) {
        await client
          .from("dealer_network_troubleshooting_uploads")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .in(
            "id",
            claimed.map((row) => row.id),
          )
          .eq("owner_member_id", memberId);
        await client.storage
          .from(TROUBLESHOOTING_BUCKET)
          .remove(claimed.map((row) => row.storage_path));
      }
      throw new Error("UPLOAD_UNAVAILABLE");
    }
    const byId = new Map((data ?? []).map((row) => [row.id, row]));
    uploads = parsed.uploadIds.map((id) => byId.get(id)!) as typeof uploads;
  }

  const processed: ProcessedPhoto[] = [];
  const stagingPaths = uploads.map((upload) => upload.storage_path);
  const finalPaths: string[] = [];
  try {
    for (const kind of ["issue", "fix"] as const) {
      const group = uploads.filter((upload) => upload.photo_kind === kind);
      if (
        group.length > 3 ||
        new Set(group.map((upload) => upload.position)).size !== group.length ||
        group.reduce((total, upload) => total + upload.declared_byte_size, 0) >
          TROUBLESHOOTING_BATCH_BYTES
      )
        throw new Error("INVALID_UPLOAD_REQUEST");
    }
    const actualBytes = { issue: 0, fix: 0 };
    for (const upload of uploads) {
      const { data, error } = await client.storage
        .from(TROUBLESHOOTING_BUCKET)
        .download(upload.storage_path);
      if (error || !data) throw new Error("UPLOAD_UNAVAILABLE");
      const bytes = new Uint8Array(await data.arrayBuffer());
      actualBytes[upload.photo_kind] += bytes.byteLength;
      if (
        bytes.byteLength !== upload.declared_byte_size ||
        bytes.byteLength > TROUBLESHOOTING_PHOTO_BYTES ||
        actualBytes[upload.photo_kind] > TROUBLESHOOTING_BATCH_BYTES
      )
        throw new Error("INVALID_IMAGE_SIZE");
      const normalized = await normalizeMessageImage(
        bytes,
        upload.declared_content_type,
      );
      if (normalized.buffer.byteLength > TROUBLESHOOTING_PHOTO_BYTES)
        throw new Error("INVALID_IMAGE_SIZE");
      const path = `entries/${memberId}/${entryId}/${upload.photo_kind}/${randomUUID()}.jpg`;
      const { error: uploadError } = await client.storage
        .from(TROUBLESHOOTING_BUCKET)
        .upload(path, exactStorageArrayBuffer(normalized.buffer), {
          contentType: normalized.contentType,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      finalPaths.push(path);
      const { data: stored, error: storedError } = await client.storage
        .from(TROUBLESHOOTING_BUCKET)
        .info(path);
      const storedByteSize = Number(
        stored?.size ?? stored?.metadata?.size ?? Number.NaN,
      );
      if (storedError || storedByteSize !== normalized.buffer.byteLength)
        throw new Error("STORED_IMAGE_SIZE_MISMATCH");
      processed.push({
        storagePath: path,
        photoKind: upload.photo_kind,
        contentType: normalized.contentType,
        byteSize: normalized.buffer.byteLength,
        originalContentType: upload.declared_content_type,
        originalByteSize: bytes.byteLength,
        width: normalized.width,
        height: normalized.height,
        position: upload.position,
      });
    }
    const { data, error } = await client.rpc(
      "dealer_network_create_troubleshooting_entry",
      {
        p_entry_id: entryId,
        p_member_id: memberId,
        p_title: parsed.title,
        p_brand: parsed.brand,
        p_model: parsed.model,
        p_issue_date: parsed.issueDate,
        p_firmware_software_version: parsed.firmwareSoftwareVersion,
        p_system_area: parsed.systemArea,
        p_bad_part: parsed.badPart,
        p_issue_description: parsed.issueDescription,
        p_fix_description: parsed.fixDescription,
        p_photos: processed,
      },
    );
    if (error || !data) throw error ?? new Error("SUBMISSION_FAILED");
    if (parsed.uploadIds.length)
      await client
        .from("dealer_network_troubleshooting_uploads")
        .update({
          status: "consumed",
          consumed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", parsed.uploadIds)
        .eq("owner_member_id", memberId);
    return (await readOwnTroubleshootingEntries(memberId)).find(
      (entry) => entry.id === entryId,
    );
  } catch (error) {
    const { data: committed } = await client
      .from("dealer_network_troubleshooting_entries")
      .select("id")
      .eq("id", entryId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (committed) {
      if (parsed.uploadIds.length)
        await client
          .from("dealer_network_troubleshooting_uploads")
          .update({
            status: "consumed",
            consumed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in("id", parsed.uploadIds)
          .eq("owner_member_id", memberId);
      return (await readOwnTroubleshootingEntries(memberId)).find(
        (entry) => entry.id === entryId,
      );
    }
    if (finalPaths.length)
      await client.storage.from(TROUBLESHOOTING_BUCKET).remove(finalPaths);
    if (parsed.uploadIds.length)
      await client
        .from("dealer_network_troubleshooting_uploads")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .in("id", parsed.uploadIds)
        .eq("owner_member_id", memberId);
    throw error;
  } finally {
    if (stagingPaths.length)
      await client.storage.from(TROUBLESHOOTING_BUCKET).remove(stagingPaths);
  }
}

export async function updateTroubleshootingStatus(
  entryId: string,
  input: unknown,
) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const status = body.status;
  if (status !== "pending" && status !== "approved" && status !== "denied")
    throw new Error("INVALID_TROUBLESHOOTING_STATUS");
  const now = new Date().toISOString();
  const statusUpdate = {
    status,
    approved_at: status === "approved" ? now : null,
    denied_at: status === "denied" ? now : null,
    updated_at: now,
    ...(status === "approved" ? {} : { publicly_published: false }),
  };
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_entries")
    .update(statusUpdate)
    .eq("id", entryId)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw error ?? new Error("TROUBLESHOOTING_ENTRY_NOT_FOUND");
}

function requiredBoolean(
  input: unknown,
  field: string,
  errorCode: string,
) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  if (typeof body[field] !== "boolean") throw new Error(errorCode);
  return body[field];
}

export async function updateTroubleshootingPublication(
  entryId: string,
  input: unknown,
) {
  const publiclyPublished = requiredBoolean(
    input,
    "publiclyPublished",
    "INVALID_PUBLICATION_STATE",
  );
  let query = getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_entries")
    .update({
      publicly_published: publiclyPublished,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);
  if (publiclyPublished) query = query.eq("status", "approved");
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data)
    throw error ?? new Error("PUBLICATION_REQUIRES_APPROVAL");
}

export async function updateTroubleshootingPhotoPublication(
  photoId: string,
  input: unknown,
) {
  const publiclyVisible = requiredBoolean(
    input,
    "publiclyVisible",
    "INVALID_PHOTO_PUBLICATION_STATE",
  );
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_photos")
    .update({ publicly_visible: publiclyVisible })
    .eq("id", photoId)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw error ?? new Error("TROUBLESHOOTING_PHOTO_NOT_FOUND");
}

export async function signedMemberTroubleshootingPhoto(
  memberId: string,
  photoId: string,
) {
  if (!validateUuid(photoId)) throw new Error("PHOTO_UNAVAILABLE");
  const client = getSupabaseServiceClient();
  const { data: photo, error } = await client
    .from("dealer_network_troubleshooting_photos")
    .select("storage_path,entry_id")
    .eq("id", photoId)
    .maybeSingle();
  if (error || !photo) throw new Error("PHOTO_UNAVAILABLE");
  const { data: entry } = await client
    .from("dealer_network_troubleshooting_entries")
    .select("member_id,status")
    .eq("id", photo.entry_id)
    .maybeSingle();
  if (!entry || (entry.status !== "approved" && entry.member_id !== memberId))
    throw new Error("PHOTO_UNAVAILABLE");
  const { data, error: signedError } = await client.storage
    .from(TROUBLESHOOTING_BUCKET)
    .createSignedUrl(photo.storage_path, TROUBLESHOOTING_SIGNED_READ_SECONDS);
  if (signedError || !data?.signedUrl) throw new Error("PHOTO_UNAVAILABLE");
  return data.signedUrl;
}

export async function signedAdminTroubleshootingPhoto(photoId: string) {
  if (!validateUuid(photoId)) throw new Error("PHOTO_UNAVAILABLE");
  const client = getSupabaseServiceClient();
  const { data: photo, error } = await client
    .from("dealer_network_troubleshooting_photos")
    .select("storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (error || !photo) throw new Error("PHOTO_UNAVAILABLE");
  const { data, error: signedError } = await client.storage
    .from(TROUBLESHOOTING_BUCKET)
    .createSignedUrl(photo.storage_path, TROUBLESHOOTING_SIGNED_READ_SECONDS);
  if (signedError || !data?.signedUrl) throw new Error("PHOTO_UNAVAILABLE");
  return data.signedUrl;
}
