import {
  MESSAGE_BATCH_BYTES,
  MESSAGE_IMAGE_TYPES,
  MESSAGE_PHOTO_BYTES,
  MESSAGE_PHOTO_LIMIT,
  type MessageImageType,
} from "./messaging-validation";
import type { TroubleshootingPhotoKind } from "./types";
import { validateUuid } from "./validation";

export const TROUBLESHOOTING_TITLE_LIMIT = 180;
export const TROUBLESHOOTING_DESCRIPTION_LIMIT = 1_000;
export const TROUBLESHOOTING_PHOTO_LIMIT = MESSAGE_PHOTO_LIMIT;
export const TROUBLESHOOTING_PHOTO_BYTES = MESSAGE_PHOTO_BYTES;
export const TROUBLESHOOTING_BATCH_BYTES = MESSAGE_BATCH_BYTES;

const imageTypes = new Set<string>(MESSAGE_IMAGE_TYPES);
const photoKinds = new Set<string>(["issue", "fix"]);

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : ({} as Record<string, unknown>);
}

function text(value: unknown, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  return result.length > 0 && result.length <= max ? result : null;
}

function optionalText(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  return text(value, max);
}

function issueDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    return null;
  return value <= new Date().toISOString().slice(0, 10) ? value : null;
}

export function validateTroubleshootingSearch(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  return typeof value === "string" && value.trim().length <= 100
    ? value.trim()
    : null;
}

export function validateTroubleshootingUploadRequest(input: unknown) {
  const body = asRecord(input);
  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length < 1 || files.length > TROUBLESHOOTING_PHOTO_LIMIT * 2)
    return null;
  const parsed = files.map((value) => {
    const file = asRecord(value);
    const photoKind = file.photoKind;
    const position = file.position;
    const contentType = file.contentType;
    const byteSize = file.byteSize;
    return {
      photoKind:
        typeof photoKind === "string" && photoKinds.has(photoKind)
          ? (photoKind as TroubleshootingPhotoKind)
          : null,
      position:
        typeof position === "number" &&
        Number.isInteger(position) &&
        position >= 0 &&
        position < TROUBLESHOOTING_PHOTO_LIMIT
          ? position
          : null,
      contentType:
        typeof contentType === "string" && imageTypes.has(contentType)
          ? (contentType as MessageImageType)
          : null,
      byteSize:
        typeof byteSize === "number" &&
        Number.isSafeInteger(byteSize) &&
        byteSize > 0 &&
        byteSize <= TROUBLESHOOTING_PHOTO_BYTES
          ? byteSize
          : null,
    };
  });
  if (
    parsed.some(
      (file) =>
        !file.photoKind ||
        file.position === null ||
        !file.contentType ||
        !file.byteSize,
    )
  )
    return null;
  for (const kind of ["issue", "fix"] as const) {
    const group = parsed.filter((file) => file.photoKind === kind);
    if (
      group.length > TROUBLESHOOTING_PHOTO_LIMIT ||
      group.reduce((total, file) => total + (file.byteSize ?? 0), 0) >
        TROUBLESHOOTING_BATCH_BYTES ||
      new Set(group.map((file) => file.position)).size !== group.length
    )
      return null;
  }
  return {
    files: parsed as Array<{
      photoKind: TroubleshootingPhotoKind;
      position: number;
      contentType: MessageImageType;
      byteSize: number;
    }>,
  };
}

export function validateTroubleshootingEntry(input: unknown) {
  const body = asRecord(input);
  const title = text(body.title, TROUBLESHOOTING_TITLE_LIMIT);
  const brand = text(body.brand, 120);
  const model = text(body.model, 160);
  const date = issueDate(body.issueDate);
  const firmwareSoftwareVersion = text(body.firmwareSoftwareVersion, 160);
  const systemArea = text(body.systemArea, 160);
  const badPart = optionalText(body.badPart, 200);
  const issueDescription = text(
    body.issueDescription,
    TROUBLESHOOTING_DESCRIPTION_LIMIT,
  );
  const fixDescription = text(
    body.fixDescription,
    TROUBLESHOOTING_DESCRIPTION_LIMIT,
  );
  const uploadIds = Array.isArray(body.uploadIds)
    ? body.uploadIds.map(validateUuid)
    : [];
  if (
    !title ||
    title.length < 3 ||
    !brand ||
    !model ||
    !date ||
    !firmwareSoftwareVersion ||
    !systemArea ||
    body.badPart && !badPart ||
    !issueDescription ||
    !fixDescription ||
    uploadIds.length > TROUBLESHOOTING_PHOTO_LIMIT * 2 ||
    uploadIds.some((id) => !id) ||
    new Set(uploadIds).size !== uploadIds.length
  )
    return null;
  return {
    title,
    brand,
    model,
    issueDate: date,
    firmwareSoftwareVersion,
    systemArea,
    badPart,
    issueDescription,
    fixDescription,
    uploadIds: uploadIds as string[],
  };
}
