import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { IDS_ACTION_IMAGE_TYPES, IDS_ACTION_MAX_IMAGE_BYTES, validateMediaInput } from "@/lib/ids-action/validation";

type AttachmentBody = { type?: unknown; size?: unknown };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as (Record<string, unknown> & AttachmentBody) | null;
  const value = validateMediaInput(body);
  const type = typeof body?.type === "string" ? body.type : "";
  const size = Number(body?.size);
  if (!value || !(type in IDS_ACTION_IMAGE_TYPES) || !Number.isInteger(size) || size <= 0 || size > IDS_ACTION_MAX_IMAGE_BYTES) {
    return Response.json({ error: "Invalid image metadata." }, { status: 400 });
  }
  const { id } = await params;
  if (!value.storagePath.startsWith(`entries/${id}/`)) return Response.json({ error: "Invalid storage path." }, { status: 400 });
  const client = getSupabaseServiceClient();
  const { data: entry } = await client.from("ids_action_entries").select("id").eq("id", id).maybeSingle();
  if (!entry) return Response.json({ error: "Entry not found." }, { status: 404 });
  const slash = value.storagePath.lastIndexOf("/");
  const folder = value.storagePath.slice(0, slash);
  const fileName = value.storagePath.slice(slash + 1);
  const { data: objects, error: storageError } = await client.storage.from("ids-action-media").list(folder, { search: fileName, limit: 10 });
  const object = objects?.find(candidate => candidate.name === fileName);
  const metadata = object?.metadata as { size?: number; mimetype?: string } | undefined;
  if (storageError || !object || Number(metadata?.size) !== size || metadata?.mimetype !== type) {
    return Response.json({ error: "Uploaded photo metadata could not be verified." }, { status: 400 });
  }
  const expectedUrl = client.storage.from("ids-action-media").getPublicUrl(value.storagePath).data.publicUrl;
  if (value.mediaUrl !== expectedUrl) return Response.json({ error: "Invalid media URL." }, { status: 400 });
  const { data, error } = await client.from("ids_action_media").insert({
    entry_id: id,
    media_type: "image",
    media_url: value.mediaUrl,
    storage_path: value.storagePath,
    alt_text: value.altText,
    sort_order: value.sortOrder,
  }).select().single();
  if (error) {
    await client.storage.from("ids-action-media").remove([value.storagePath]);
    return Response.json({ error: "Photo could not be attached; the unused upload was removed." }, { status: 500 });
  }
  return Response.json({ media: data }, { status: 201 });
}
