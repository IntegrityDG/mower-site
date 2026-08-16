import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { TROUBLESHOOTING_BUCKET } from "@/lib/dealer-network/troubleshooting-storage";
import { validateUuid } from "@/lib/dealer-network/validation";
import {
  isPublicTroubleshootingPhotoVisible,
  toPublicTroubleshootingEntry,
  validatePublicTroubleshootingFilters,
  type PublicTroubleshootingEntryRow,
  type PublicTroubleshootingFilters,
  type PublicTroubleshootingPhotoRow,
} from "./types";

export const PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS = {
  "cache-control": "private, no-store, no-cache, max-age=0, must-revalidate",
  "cdn-cache-control": "no-store",
  "vercel-cdn-cache-control": "no-store",
  expires: "0",
  pragma: "no-cache",
} as const;

export const PUBLIC_TROUBLESHOOTING_ENTRY_COLUMNS =
  "id,title,brand,model,issue_date,firmware_software_version,system_area,bad_part,issue_description,fix_description";

const publicPhotoColumns =
  "id,entry_id,photo_kind,width,height,position,publicly_visible";

function likeContains(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

function requireFilters(input: unknown): PublicTroubleshootingFilters {
  const filters = validatePublicTroubleshootingFilters(input);
  if (!filters) throw new Error("INVALID_PUBLIC_TROUBLESHOOTING_FILTERS");
  return filters;
}

async function readPublicPhotos(entryIds: string[]) {
  if (!entryIds.length) return [];
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_photos")
    .select(publicPhotoColumns)
    .in("entry_id", entryIds)
    .eq("publicly_visible", true)
    .order("photo_kind")
    .order("position");
  if (error) throw error;
  return (data ?? []) as PublicTroubleshootingPhotoRow[];
}

export async function readPublicTroubleshootingEntries(input: unknown) {
  const filters = requireFilters(input);
  let query = getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_entries")
    .select(PUBLIC_TROUBLESHOOTING_ENTRY_COLUMNS)
    .eq("status", "approved")
    .eq("publicly_published", true)
    .order("issue_date", { ascending: false })
    .limit(100);

  if (filters.query)
    query = query.ilike("title", likeContains(filters.query));
  if (filters.brand)
    query = query.ilike("brand", likeContains(filters.brand));
  if (filters.model)
    query = query.ilike("model", likeContains(filters.model));
  if (filters.systemArea)
    query = query.ilike("system_area", likeContains(filters.systemArea));

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as PublicTroubleshootingEntryRow[];
  const photos = await readPublicPhotos(rows.map((row) => row.id));
  return rows.map((row) => toPublicTroubleshootingEntry(row, photos));
}

export async function readPublicTroubleshootingEntry(entryId: string) {
  if (!validateUuid(entryId)) return null;
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_troubleshooting_entries")
    .select(PUBLIC_TROUBLESHOOTING_ENTRY_COLUMNS)
    .eq("id", entryId)
    .eq("status", "approved")
    .eq("publicly_published", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as PublicTroubleshootingEntryRow;
  const photos = await readPublicPhotos([row.id]);
  return toPublicTroubleshootingEntry(row, photos);
}

export async function readPublicTroubleshootingPhoto(photoId: string) {
  if (!validateUuid(photoId)) return null;
  const client = getSupabaseServiceClient();
  const { data: photo, error: photoError } = await client
    .from("dealer_network_troubleshooting_photos")
    .select("entry_id,storage_path,content_type,publicly_visible")
    .eq("id", photoId)
    .eq("publicly_visible", true)
    .maybeSingle();
  if (photoError || !photo) return null;

  const { data: entry, error: entryError } = await client
    .from("dealer_network_troubleshooting_entries")
    .select("status,publicly_published")
    .eq("id", photo.entry_id)
    .eq("status", "approved")
    .eq("publicly_published", true)
    .maybeSingle();
  if (
    entryError ||
    !entry ||
    !isPublicTroubleshootingPhotoVisible({
      status: entry.status,
      publiclyPublished: entry.publicly_published,
      publiclyVisible: photo.publicly_visible,
    })
  )
    return null;

  const { data: body, error: downloadError } = await client.storage
    .from(TROUBLESHOOTING_BUCKET)
    .download(photo.storage_path);
  if (downloadError || !body) return null;
  return {
    body,
    contentType:
      photo.content_type === "image/jpeg"
        ? photo.content_type
        : "application/octet-stream",
  };
}
