import { validateUuid } from "./validation";

export const MESSAGE_TEXT_LIMIT = 5_000;
export const MESSAGE_PHOTO_LIMIT = 3;
export const MESSAGE_PHOTO_BYTES = 15 * 1024 * 1024;
export const MESSAGE_BATCH_BYTES = MESSAGE_PHOTO_LIMIT * MESSAGE_PHOTO_BYTES;
export const MESSAGE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type MessageImageType = (typeof MESSAGE_IMAGE_TYPES)[number];
const imageTypes = new Set<string>(MESSAGE_IMAGE_TYPES);
const extensionTypes: Record<string, MessageImageType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export function messageFileType(file: { type: string; name?: string }) {
  if (imageTypes.has(file.type)) return file.type as MessageImageType;
  const extension = file.name?.split(".").pop()?.toLowerCase() ?? "";
  return extensionTypes[extension] ?? null;
}

const asRecord = (value: unknown) =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : ({} as Record<string, unknown>);

export function validateMessageFiles(
  files: ArrayLike<Pick<File, "size" | "type"> & { name?: string }>,
) {
  const items = Array.from(files);
  if (items.length > MESSAGE_PHOTO_LIMIT)
    return "Add no more than three photos to a message.";
  if (items.some((file) => file.size < 1 || file.size > MESSAGE_PHOTO_BYTES))
    return "Each photo must be 15 MB or smaller.";
  if (items.reduce((total, file) => total + file.size, 0) > MESSAGE_BATCH_BYTES)
    return "The selected photos are too large in total.";
  if (items.some((file) => !messageFileType(file)))
    return "Use JPEG, PNG, WebP, HEIC, or HEIF photos.";
  return null;
}

export function validateUploadTicketRequest(input: unknown) {
  const body = asRecord(input);
  const conversationId = validateUuid(body.conversationId);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!conversationId || files.length < 1 || files.length > MESSAGE_PHOTO_LIMIT)
    return null;
  const parsed = files.map((item) => {
    const file = asRecord(item);
    const contentType = file.contentType;
    const byteSize = file.byteSize;
    return {
      contentType:
        typeof contentType === "string" && imageTypes.has(contentType)
          ? (contentType as MessageImageType)
          : null,
      byteSize:
        typeof byteSize === "number" &&
        Number.isSafeInteger(byteSize) &&
        byteSize > 0 &&
        byteSize <= MESSAGE_PHOTO_BYTES
          ? byteSize
          : null,
    };
  });
  if (
    parsed.some((item) => !item.contentType || !item.byteSize) ||
    parsed.reduce((total, item) => total + (item.byteSize ?? 0), 0) >
      MESSAGE_BATCH_BYTES
  )
    return null;
  return {
    conversationId,
    files: parsed as Array<{
      contentType: MessageImageType;
      byteSize: number;
    }>,
  };
}

export function validateSendMessage(input: unknown) {
  const body = asRecord(input);
  const conversationId = validateUuid(body.conversationId);
  const clientMessageId = validateUuid(body.clientMessageId);
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";
  const uploadIds = Array.isArray(body.uploadIds)
    ? body.uploadIds.map(validateUuid)
    : [];
  if (
    !conversationId ||
    !clientMessageId ||
    messageBody.length > MESSAGE_TEXT_LIMIT ||
    uploadIds.length > MESSAGE_PHOTO_LIMIT ||
    uploadIds.some((id) => !id) ||
    new Set(uploadIds).size !== uploadIds.length ||
    (!messageBody && uploadIds.length === 0)
  )
    return null;
  return {
    conversationId,
    clientMessageId,
    body: messageBody || null,
    uploadIds: uploadIds as string[],
  };
}

export function validateReport(input: unknown) {
  const body = asRecord(input);
  const conversationId = validateUuid(body.conversationId);
  const clientReportId = validateUuid(body.clientReportId);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  return conversationId &&
    clientReportId &&
    reason.length >= 5 &&
    reason.length <= 2_000
    ? { conversationId, clientReportId, reason }
    : null;
}
