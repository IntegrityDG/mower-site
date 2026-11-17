import "server-only";
import { normalizeHomepageSlideImage } from "./image-processing";
import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { HOMEPAGE_SLIDE_BUCKET, HOMEPAGE_SLIDE_MAX_BYTES, slideIsActive, validSlideUploadPath } from "./policy";
import { adminSlide, slideTable, type SlideRow } from "./server";
export async function finalizeSlideImage(id: string, path: string, expectedUpdatedAt: string) {
  if (!validSlideUploadPath(id, path) || !expectedUpdatedAt) throw new Error("Invalid upload attachment.");
  const { data: row } = await slideTable().select("*").eq("id", id).eq("updated_at", expectedUpdatedAt).maybeSingle();
  if (!row) throw new Error("Slide changed. Reload before attaching this image.");
  const storage = getSupabaseServiceClient().storage.from(HOMEPAGE_SLIDE_BUCKET);
  const { data, error } = await storage.download(path);
  if (error || !data || !data.size || data.size > HOMEPAGE_SLIDE_MAX_BYTES) throw new Error("Image upload is missing or exceeds 10 MB.");
  const bytes = Buffer.from(await data.arrayBuffer());
  const normalized = await normalizeHomepageSlideImage(bytes);
  const finalPath = `slides/${id}/${randomUUID()}.webp`;
  const upload = await storage.upload(finalPath, normalized, { contentType: "image/webp", upsert: false });
  if (upload.error) throw new Error("Image could not be stored.");
  const { data: updated, error: updateError } = await slideTable().update({ image_path: finalPath, updated_at: new Date().toISOString() }).eq("id", id).eq("updated_at", expectedUpdatedAt).select("*").maybeSingle();
  if (updateError || !updated) { await storage.remove([finalPath]); throw new Error("Slide changed. Reload before attaching this image."); }
  await storage.remove([path]); // Prior attached images are retained, avoiding races with in-flight readers.
  return adminSlide(updated as SlideRow);
}
export async function serveSlideImage(id: string, admin = false) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const { data } = await slideTable().select("*").eq("id", id).maybeSingle();
    if (!data?.image_path || (!admin && !slideIsActive(data))) return new Response(null, { status: 404, headers });
    const { data: image, error } = await getSupabaseServiceClient().storage.from(HOMEPAGE_SLIDE_BUCKET).download(data.image_path);
    if (error || !image) return new Response(null, { status: 404, headers });
    return new Response(image, { headers: { ...headers, "Content-Type": "image/webp" } });
  } catch { return new Response(null, { status: 503, headers }); }
}
