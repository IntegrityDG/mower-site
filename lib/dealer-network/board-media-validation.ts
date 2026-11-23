import { validateUploadTicketRequest } from "./messaging-validation";
import { validateUuid } from "./validation";

export function boardPhotoLimit(parentId: string | null) {
  return parentId === null ? 3 : 1;
}

export function parseBoardUploadTicketRequest(discussionId: string, raw: unknown) {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const parsed = validateUploadTicketRequest({ conversationId: discussionId, files: body.files });
  const parentId = body.parentCommentId == null ? null : validateUuid(body.parentCommentId);
  if (!parsed || (body.parentCommentId != null && !parentId) || parsed.files.length > boardPhotoLimit(parentId))
    return null;
  return { parentId, files: parsed.files };
}

export function validateBoardUploadIds(parentId: string | null, ids: string[]) {
  return (!parentId || Boolean(validateUuid(parentId))) && new Set(ids).size === ids.length &&
    ids.length <= boardPhotoLimit(parentId) && ids.every((id) => Boolean(validateUuid(id)));
}
