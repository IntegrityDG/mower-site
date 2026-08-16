import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient, getSupabaseUrl } from "@/lib/supabase";
import {
  exactStorageArrayBuffer,
  normalizeMessageImage,
} from "./image-processing";
import {
  MESSAGE_BATCH_BYTES,
  MESSAGE_PHOTO_BYTES,
  validateReport,
  validateSendMessage,
  validateUploadTicketRequest,
} from "./messaging-validation";
import { notifyNewDealerMessage } from "./notifications";
import {
  conversationIncludesMember,
  otherConversationMember,
} from "./messaging-policy";
import {
  MESSAGE_BUCKET,
  MESSAGE_SIGNED_READ_SECONDS,
} from "./messaging-storage";
import type {
  ConversationDetail,
  ConversationSummary,
  DealerMessage,
  MessageUploadTicket,
} from "./types";
import { validateUuid } from "./validation";

export const MESSAGE_UPLOAD_SECONDS = 30 * 60;

type ConversationRow = {
  id: string;
  member_low_id: string;
  member_high_id: string;
  last_message_id: string | null;
  last_message_at: string | null;
};

type MemberRow = {
  id: string;
  member_name: string;
  company_name: string;
  email?: string;
  status: string;
  account_locked: boolean;
};

function otherMemberId(conversation: ConversationRow, memberId: string) {
  const other = otherConversationMember(conversation, memberId);
  if (!other) throw new Error("CONVERSATION_UNAVAILABLE");
  return other;
}

function isParticipant(conversation: ConversationRow, memberId: string) {
  return conversationIncludesMember(conversation, memberId);
}

function tusEndpoint() {
  const url = new URL(getSupabaseUrl());
  if (!url.hostname.endsWith(".supabase.co"))
    throw new Error("UPLOAD_NOT_CONFIGURED");
  url.hostname = url.hostname.replace(
    /\.supabase\.co$/,
    ".storage.supabase.co",
  );
  url.pathname = "/storage/v1/upload/resumable/sign";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function conversationForMember(
  conversationId: string,
  memberId: string,
) {
  if (!validateUuid(conversationId)) throw new Error("CONVERSATION_UNAVAILABLE");
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_conversations")
    .select("id,member_low_id,member_high_id,last_message_id,last_message_at")
    .eq("id", conversationId)
    .maybeSingle();
  const conversation = data as ConversationRow | null;
  if (error || !conversation || !isParticipant(conversation, memberId))
    throw new Error("CONVERSATION_UNAVAILABLE");
  return conversation;
}

async function blockState(memberId: string, otherId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_blocks")
    .select("blocker_member_id,blocked_member_id")
    .or(
      `and(blocker_member_id.eq.${memberId},blocked_member_id.eq.${otherId}),and(blocker_member_id.eq.${otherId},blocked_member_id.eq.${memberId})`,
    );
  if (error) throw error;
  return {
    blockedByYou: (data ?? []).some(
      (row) => row.blocker_member_id === memberId,
    ),
    blockedEitherWay: (data ?? []).length > 0,
  };
}

async function summaryFor(
  conversation: ConversationRow,
  memberId: string,
  memberById: Map<string, MemberRow>,
  unreadByConversation: Map<string, number>,
  previewByMessage: Map<string, { body: string | null; attachment_count: number }>,
) {
  const otherId = otherMemberId(conversation, memberId);
  const other = memberById.get(otherId);
  const available = Boolean(
    other && other.status === "active" && !other.account_locked,
  );
  const { blockedByYou } = await blockState(memberId, otherId);
  const preview = conversation.last_message_id
    ? previewByMessage.get(conversation.last_message_id)
    : null;
  return {
    id: conversation.id,
    participant: {
      id: otherId,
      displayName: available ? other!.member_name : "Member unavailable",
      companyName: available ? other!.company_name : null,
      available,
      blockedByYou,
    },
    unreadCount: unreadByConversation.get(conversation.id) ?? 0,
    lastMessageAt: conversation.last_message_at,
    lastMessagePreview: preview?.body
      ? preview.body.slice(0, 120)
      : preview?.attachment_count
        ? preview.attachment_count === 1
          ? "Photo"
          : `${preview.attachment_count} photos`
        : "No messages yet",
  } satisfies ConversationSummary;
}

export async function listConversations(memberId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("dealer_network_conversations")
    .select("id,member_low_id,member_high_id,last_message_id,last_message_at")
    .or(`member_low_id.eq.${memberId},member_high_id.eq.${memberId}`)
    .not("last_message_id", "is", null)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (error) throw error;
  const conversations = (data ?? []) as ConversationRow[];
  if (!conversations.length)
    return { conversations: [] as ConversationSummary[], unreadTotal: 0 };
  const otherIds = [...new Set(conversations.map((row) => otherMemberId(row, memberId)))];
  const conversationIds = conversations.map((row) => row.id);
  const messageIds = conversations
    .map((row) => row.last_message_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: members }, { data: unread }, { data: previews }] =
    await Promise.all([
      client
        .from("dealer_network_members")
        .select("id,member_name,company_name,status,account_locked")
        .in("id", otherIds),
      client
        .from("dealer_network_conversation_members")
        .select("conversation_id,unread_count")
        .eq("member_id", memberId)
        .in("conversation_id", conversationIds),
      client
        .from("dealer_network_messages")
        .select("id,body,attachment_count")
        .in("id", messageIds),
    ]);
  const memberById = new Map(
    ((members ?? []) as MemberRow[]).map((row) => [row.id, row]),
  );
  const unreadByConversation = new Map(
    (unread ?? []).map((row) => [row.conversation_id, row.unread_count]),
  );
  const previewByMessage = new Map(
    (previews ?? []).map((row) => [row.id, row]),
  );
  const summaries = await Promise.all(
    conversations.map((row) =>
      summaryFor(
        row,
        memberId,
        memberById,
        unreadByConversation,
        previewByMessage,
      ),
    ),
  );
  return {
    conversations: summaries,
    unreadTotal: summaries.reduce((total, row) => total + row.unreadCount, 0),
  };
}

export async function startConversation(memberId: string, otherId: string) {
  if (!validateUuid(otherId) || otherId === memberId)
    throw new Error("RECIPIENT_UNAVAILABLE");
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_get_or_create_conversation",
    { p_member_id: memberId, p_other_member_id: otherId },
  );
  if (error || !data) throw new Error("RECIPIENT_UNAVAILABLE");
  return String((data as { conversationId: string }).conversationId);
}

export async function readConversation(
  memberId: string,
  conversationId: string,
  ownMessagingEnabled: boolean,
  before?: { createdAt: string; id: string } | null,
): Promise<ConversationDetail> {
  const client = getSupabaseServiceClient();
  const conversation = await conversationForMember(conversationId, memberId);
  const otherId = otherMemberId(conversation, memberId);
  let messageQuery = client
    .from("dealer_network_messages")
    .select(
      "id,conversation_id,sender_member_id,body,created_at,dealer_network_message_attachments(id,width,height,position)",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (before)
    messageQuery = messageQuery.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
    );
  const [{ data: other, error: otherError }, { data: unread }, { data: messages, error }] =
    await Promise.all([
      client
        .from("dealer_network_members")
        .select("id,member_name,company_name,status,account_locked")
        .eq("id", otherId)
        .maybeSingle(),
      client
        .from("dealer_network_conversation_members")
        .select("unread_count")
        .eq("conversation_id", conversationId)
        .eq("member_id", memberId)
        .maybeSingle(),
      messageQuery,
    ]);
  if (error || otherError) throw error ?? otherError;
  const otherMember = other as MemberRow | null;
  const available = Boolean(
    otherMember &&
      otherMember.status === "active" &&
      !otherMember.account_locked,
  );
  const blocks = await blockState(memberId, otherId);
  const messageRows = [...(messages ?? [])].reverse();
  const mappedMessages: DealerMessage[] = messageRows.map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    sentByMe: row.sender_member_id === memberId,
    body: row.body as string | null,
    createdAt: String(row.created_at),
    attachments: (
      (row.dealer_network_message_attachments ?? []) as Array<{
        id: string;
        width: number;
        height: number;
        position: number;
      }>
    )
      .sort((a, b) => a.position - b.position)
      .map((attachment) => ({
        id: attachment.id,
        url: `/api/dealer-network/member/messages/attachments/${attachment.id}`,
        width: attachment.width,
        height: attachment.height,
        position: attachment.position,
      })),
  }));
  const summary = await summaryFor(
    conversation,
    memberId,
    new Map(otherMember ? [[otherId, otherMember]] : []),
    new Map([[conversationId, Number(unread?.unread_count ?? 0)]]),
    new Map(),
  );
  summary.lastMessagePreview = mappedMessages.at(-1)?.body?.slice(0, 120) ??
    (mappedMessages.at(-1)?.attachments.length ? "Photo" : "No messages yet");
  const canSend = ownMessagingEnabled && available && !blocks.blockedEitherWay;
  return {
    conversation: summary,
    messages: mappedMessages,
    canSend,
    messagingPermission: canSend ? "send" : "read_only",
    hasMore: (messages ?? []).length === 50,
    nextBefore: messageRows[0]?.created_at && messageRows[0]?.id
      ? `${String(messageRows[0].created_at)}|${String(messageRows[0].id)}`
      : null,
  };
}

export async function markConversationRead(
  memberId: string,
  conversationId: string,
  lastVisibleMessageId: string | null,
) {
  await conversationForMember(conversationId, memberId);
  if (lastVisibleMessageId !== null && !validateUuid(lastVisibleMessageId))
    throw new Error("CONVERSATION_UNAVAILABLE");
  const { error } = await getSupabaseServiceClient().rpc(
    "dealer_network_mark_conversation_read",
    {
      p_conversation_id: conversationId,
      p_member_id: memberId,
      p_last_visible_message_id: lastVisibleMessageId,
    },
  );
  if (error) throw new Error("CONVERSATION_UNAVAILABLE");
}

async function cleanExpiredUploads() {
  const client = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const staleProcessing = new Date(Date.now() - 30 * 60 * 1_000).toISOString();
  const [{ data: expired }, { data: abandoned }] = await Promise.all([
    client
      .from("dealer_network_message_uploads")
      .select("id,storage_path,status")
      .in("status", ["prepared", "failed", "consumed"])
      .lt("expires_at", now)
      .limit(20),
    client
      .from("dealer_network_message_uploads")
      .select("id,storage_path,status")
      .eq("status", "processing")
      .lt("updated_at", staleProcessing)
      .limit(20),
  ]);
  const data = [...(expired ?? []), ...(abandoned ?? [])];
  if (!data?.length) return;
  const { error: removeError } = await client.storage
    .from(MESSAGE_BUCKET)
    .remove(data.map((row) => row.storage_path));
  if (removeError) return;
  const expirableIds = data
    .filter((row) => row.status !== "consumed")
    .map((row) => row.id);
  if (!expirableIds.length) return;
  await client
    .from("dealer_network_message_uploads")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .in("id", expirableIds)
    .in("status", ["prepared", "processing", "failed"]);
}

export async function prepareMessageUploads(memberId: string, input: unknown) {
  const parsed = validateUploadTicketRequest(input);
  if (!parsed) throw new Error("INVALID_UPLOAD_REQUEST");
  await conversationForMember(parsed.conversationId, memberId);
  await cleanExpiredUploads();
  const client = getSupabaseServiceClient();
  const expiresAt = new Date(
    Date.now() + MESSAGE_UPLOAD_SECONDS * 1_000,
  ).toISOString();
  const rows = parsed.files.map((file) => {
    const id = randomUUID();
    return {
      id,
      owner_member_id: memberId,
      conversation_id: parsed.conversationId,
      storage_path: `staging/${memberId}/${parsed.conversationId}/${id}`,
      declared_content_type: file.contentType,
      declared_byte_size: file.byteSize,
      expires_at: expiresAt,
    };
  });
  const { error } = await client.from("dealer_network_message_uploads").insert(rows);
  if (error) throw error;
  const tickets: MessageUploadTicket[] = [];
  try {
    for (const row of rows) {
      const { data, error: signedError } = await client.storage
        .from(MESSAGE_BUCKET)
        .createSignedUploadUrl(row.storage_path);
      if (signedError || !data?.token) throw signedError ?? new Error("UPLOAD_TICKET_FAILED");
      tickets.push({
        id: row.id,
        path: row.storage_path,
        signedUrl: tusEndpoint(),
        token: data.token,
      });
    }
    return { bucket: MESSAGE_BUCKET, expiresAt, tickets };
  } catch (error) {
    await client.from("dealer_network_message_uploads").delete().in("id", rows.map((row) => row.id));
    throw error;
  }
}

export async function cancelMessageUpload(memberId: string, uploadId: string) {
  if (!validateUuid(uploadId)) return;
  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("dealer_network_message_uploads")
    .select("storage_path")
    .eq("id", uploadId)
    .eq("owner_member_id", memberId)
    .eq("status", "prepared")
    .maybeSingle();
  if (!data?.storage_path) return;
  const { error } = await client.storage
    .from(MESSAGE_BUCKET)
    .remove([data.storage_path]);
  if (!error)
    await client
      .from("dealer_network_message_uploads")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", uploadId)
      .eq("owner_member_id", memberId)
      .eq("status", "prepared");
}

type ProcessedAttachment = {
  storagePath: string;
  contentType: "image/jpeg";
  byteSize: number;
  originalContentType: string;
  originalByteSize: number;
  width: number;
  height: number;
  position: number;
};

async function deliverMessageNotice(
  messageId: string,
  senderMemberId: string,
  senderName: string,
  origin: string,
) {
  const client = getSupabaseServiceClient();
  const { data: message } = await client
    .from("dealer_network_messages")
    .select("conversation_id,starts_unread_streak")
    .eq("id", messageId)
    .eq("sender_member_id", senderMemberId)
    .maybeSingle();
  if (!message?.starts_unread_streak) return;
  const conversation = await conversationForMember(
    String(message.conversation_id),
    senderMemberId,
  );
  const recipientMemberId = otherMemberId(conversation, senderMemberId);
  const { data: recipient } = await client
    .from("dealer_network_members")
    .select("member_name,email")
    .eq("id", recipientMemberId)
    .single();
  if (!recipient) return;
  await notifyNewDealerMessage({
    messageId,
    conversationId: String(message.conversation_id),
    recipientMemberId,
    recipientName: String(recipient.member_name),
    recipientEmail: String(recipient.email),
    senderName,
    origin,
  }).catch((error) =>
    console.warn("Dealer message email failed after send", error),
  );
}

export async function sendDealerMessage(
  memberId: string,
  senderName: string,
  origin: string,
  input: unknown,
) {
  const parsed = validateSendMessage(input);
  if (!parsed) throw new Error("INVALID_MESSAGE");
  const client = getSupabaseServiceClient();
  await conversationForMember(parsed.conversationId, memberId);
  const { data: prior } = await client
    .from("dealer_network_messages")
    .select("id,conversation_id")
    .eq("sender_member_id", memberId)
    .eq("client_message_id", parsed.clientMessageId)
    .maybeSingle();
  if (prior) {
    if (prior.conversation_id !== parsed.conversationId)
      throw new Error("MESSAGE_CONFLICT");
    await deliverMessageNotice(
      String(prior.id),
      memberId,
      senderName,
      origin,
    );
    return { messageId: String(prior.id), duplicate: true };
  }

  let uploads: Array<{
    id: string;
    storage_path: string;
    declared_content_type: Parameters<typeof normalizeMessageImage>[1];
    declared_byte_size: number;
  }> = [];
  if (parsed.uploadIds.length) {
    const { data, error } = await client
      .from("dealer_network_message_uploads")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .in("id", parsed.uploadIds)
      .eq("owner_member_id", memberId)
      .eq("conversation_id", parsed.conversationId)
      .eq("status", "prepared")
      .gt("expires_at", new Date().toISOString())
      .select("id,storage_path,declared_content_type,declared_byte_size");
    if (error || data?.length !== parsed.uploadIds.length) {
      const claimed = data ?? [];
      if (claimed.length) {
        await client
          .from("dealer_network_message_uploads")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .in("id", claimed.map((row) => row.id))
          .eq("owner_member_id", memberId);
        await client.storage
          .from(MESSAGE_BUCKET)
          .remove(claimed.map((row) => row.storage_path));
      }
      throw new Error("UPLOAD_UNAVAILABLE");
    }
    const byId = new Map((data ?? []).map((row) => [row.id, row]));
    uploads = parsed.uploadIds.map((id) => byId.get(id)!) as typeof uploads;
  }

  const processed: ProcessedAttachment[] = [];
  const stagingPaths = uploads.map((upload) => upload.storage_path);
  const finalPaths: string[] = [];
  try {
    let totalBytes = 0;
    for (const [position, upload] of uploads.entries()) {
      const { data, error } = await client.storage
        .from(MESSAGE_BUCKET)
        .download(upload.storage_path);
      if (error || !data) throw new Error("UPLOAD_UNAVAILABLE");
      const bytes = new Uint8Array(await data.arrayBuffer());
      totalBytes += bytes.byteLength;
      if (
        bytes.byteLength !== upload.declared_byte_size ||
        bytes.byteLength > MESSAGE_PHOTO_BYTES ||
        totalBytes > MESSAGE_BATCH_BYTES
      )
        throw new Error("INVALID_IMAGE_SIZE");
      const normalized = await normalizeMessageImage(
        bytes,
        upload.declared_content_type,
      );
      if (normalized.buffer.byteLength > MESSAGE_PHOTO_BYTES)
        throw new Error("INVALID_IMAGE_SIZE");
      const path = `conversations/${parsed.conversationId}/messages/${parsed.clientMessageId}/${randomUUID()}.jpg`;
      const { error: uploadError } = await client.storage
        .from(MESSAGE_BUCKET)
        .upload(path, exactStorageArrayBuffer(normalized.buffer), {
          contentType: normalized.contentType,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      finalPaths.push(path);
      const { data: stored, error: storedError } = await client.storage
        .from(MESSAGE_BUCKET)
        .info(path);
      const storedByteSize = Number(
        stored?.size ?? stored?.metadata?.size ?? Number.NaN,
      );
      if (storedError || storedByteSize !== normalized.buffer.byteLength)
        throw new Error("STORED_IMAGE_SIZE_MISMATCH");
      processed.push({
        storagePath: path,
        contentType: normalized.contentType,
        byteSize: normalized.buffer.byteLength,
        originalContentType: upload.declared_content_type,
        originalByteSize: bytes.byteLength,
        width: normalized.width,
        height: normalized.height,
        position,
      });
    }
    const { data, error } = await client.rpc("dealer_network_send_message", {
      p_conversation_id: parsed.conversationId,
      p_sender_member_id: memberId,
      p_client_message_id: parsed.clientMessageId,
      p_body: parsed.body,
      p_attachments: processed,
    });
    if (error || !data) throw error ?? new Error("MESSAGE_SEND_FAILED");
    const result = data as {
      messageId: string;
      recipientMemberId: string;
      startsUnreadStreak: boolean;
      duplicate: boolean;
    };
    if (uploads.length)
      await client
        .from("dealer_network_message_uploads")
        .update({
          status: "consumed",
          consumed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", parsed.uploadIds)
        .eq("owner_member_id", memberId);
    if (result.startsUnreadStreak)
      await deliverMessageNotice(result.messageId, memberId, senderName, origin);
    return result;
  } catch (error) {
    const { data: committed } = await client
      .from("dealer_network_messages")
      .select("id")
      .eq("sender_member_id", memberId)
      .eq("client_message_id", parsed.clientMessageId)
      .maybeSingle();
    if (committed) {
      if (parsed.uploadIds.length)
        await client
          .from("dealer_network_message_uploads")
          .update({
            status: "consumed",
            consumed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in("id", parsed.uploadIds)
          .eq("owner_member_id", memberId);
      await deliverMessageNotice(
        String(committed.id),
        memberId,
        senderName,
        origin,
      );
      return { messageId: String(committed.id), duplicate: true };
    }
    if (finalPaths.length)
      await client.storage.from(MESSAGE_BUCKET).remove(finalPaths);
    if (parsed.uploadIds.length)
      await client
        .from("dealer_network_message_uploads")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .in("id", parsed.uploadIds)
        .eq("owner_member_id", memberId);
    throw error;
  } finally {
    if (stagingPaths.length)
      await client.storage.from(MESSAGE_BUCKET).remove(stagingPaths);
  }
}

export async function setMemberBlock(
  memberId: string,
  otherId: string,
  blocked: boolean,
) {
  if (!validateUuid(otherId) || otherId === memberId)
    throw new Error("MEMBER_UNAVAILABLE");
  const { error } = await getSupabaseServiceClient().rpc(
    "dealer_network_set_block",
    {
      p_blocker_member_id: memberId,
      p_blocked_member_id: otherId,
      p_blocked: blocked,
    },
  );
  if (error) throw new Error("MEMBER_UNAVAILABLE");
}

export async function createMemberReport(memberId: string, input: unknown) {
  const parsed = validateReport(input);
  if (!parsed) throw new Error("INVALID_REPORT");
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_create_report",
    {
      p_reporter_member_id: memberId,
      p_conversation_id: parsed.conversationId,
      p_client_report_id: parsed.clientReportId,
      p_reason: parsed.reason,
    },
  );
  if (error || !data) throw new Error("REPORT_FAILED");
  return String(data);
}

export async function signedMemberAttachment(
  memberId: string,
  attachmentId: string,
) {
  if (!validateUuid(attachmentId)) throw new Error("ATTACHMENT_UNAVAILABLE");
  const client = getSupabaseServiceClient();
  const { data: attachment, error } = await client
    .from("dealer_network_message_attachments")
    .select("storage_path,message_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error || !attachment) throw new Error("ATTACHMENT_UNAVAILABLE");
  const { data: message } = await client
    .from("dealer_network_messages")
    .select("conversation_id")
    .eq("id", attachment.message_id)
    .maybeSingle();
  if (!message) throw new Error("ATTACHMENT_UNAVAILABLE");
  await conversationForMember(String(message.conversation_id), memberId);
  const { data, error: signedError } = await client.storage
    .from(MESSAGE_BUCKET)
    .createSignedUrl(String(attachment.storage_path), MESSAGE_SIGNED_READ_SECONDS);
  if (signedError || !data?.signedUrl) throw new Error("ATTACHMENT_UNAVAILABLE");
  return data.signedUrl;
}
