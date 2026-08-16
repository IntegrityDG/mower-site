import type {
  TroubleshootingPhotoKind,
  TroubleshootingStatus,
} from "@/lib/dealer-network/types";

export type PublicTroubleshootingPhoto = {
  id: string;
  photoKind: TroubleshootingPhotoKind;
  url: string;
  width: number;
  height: number;
  position: number;
};

export type PublicTroubleshootingEntry = {
  id: string;
  title: string;
  brand: string;
  model: string;
  issueDate: string;
  firmwareSoftwareVersion: string;
  systemArea: string;
  badPart: string | null;
  issueDescription: string;
  fixDescription: string;
  photos: PublicTroubleshootingPhoto[];
};

export type PublicTroubleshootingFilters = {
  query: string;
  brand: string;
  model: string;
  systemArea: string;
};

export type PublicTroubleshootingEntryRow = {
  id: string;
  title: string;
  brand: string;
  model: string;
  issue_date: string;
  firmware_software_version: string;
  system_area: string;
  bad_part: string | null;
  issue_description: string;
  fix_description: string;
};

export type PublicTroubleshootingPhotoRow = {
  id: string;
  entry_id: string;
  photo_kind: TroubleshootingPhotoKind;
  width: number;
  height: number;
  position: number;
  publicly_visible: boolean;
};

export type PublicTroubleshootingRecordState = {
  status: TroubleshootingStatus;
  publiclyPublished: boolean;
};

export type PublicTroubleshootingPhotoState =
  PublicTroubleshootingRecordState & {
    publiclyVisible: boolean;
  };

export function isPublicTroubleshootingRecordVisible(
  state: PublicTroubleshootingRecordState,
) {
  return state.status === "approved" && state.publiclyPublished === true;
}

export function isPublicTroubleshootingPhotoVisible(
  state: PublicTroubleshootingPhotoState,
) {
  return (
    isPublicTroubleshootingRecordVisible(state) &&
    state.publiclyVisible === true
  );
}

function boundedFilter(value: unknown, maximumLength: number) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maximumLength ? normalized : null;
}

export function validatePublicTroubleshootingFilters(input: unknown) {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const query = boundedFilter(source.query ?? source.q, 100);
  const brand = boundedFilter(source.brand, 120);
  const model = boundedFilter(source.model, 160);
  const systemArea = boundedFilter(
    source.systemArea ?? source.system,
    160,
  );
  if (
    query === null ||
    brand === null ||
    model === null ||
    systemArea === null
  )
    return null;
  return { query, brand, model, systemArea };
}

export function toPublicTroubleshootingEntry(
  row: PublicTroubleshootingEntryRow,
  photoRows: PublicTroubleshootingPhotoRow[],
): PublicTroubleshootingEntry {
  return {
    id: String(row.id),
    title: String(row.title),
    brand: String(row.brand),
    model: String(row.model),
    issueDate: String(row.issue_date),
    firmwareSoftwareVersion: String(row.firmware_software_version),
    systemArea: String(row.system_area),
    badPart: row.bad_part === null ? null : String(row.bad_part),
    issueDescription: String(row.issue_description),
    fixDescription: String(row.fix_description),
    photos: photoRows
      .filter(
        (photo) =>
          photo.entry_id === row.id && photo.publicly_visible === true,
      )
      .sort(
        (a, b) =>
          a.photo_kind.localeCompare(b.photo_kind) || a.position - b.position,
      )
      .map((photo) => ({
        id: String(photo.id),
        photoKind: photo.photo_kind,
        url: `/api/troubleshooting/photos/${photo.id}`,
        width: Number(photo.width),
        height: Number(photo.height),
        position: Number(photo.position),
      })),
  };
}
