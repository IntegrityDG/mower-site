import "server-only";
import { createHash } from "node:crypto";
import { normalizeMessageImage, exactStorageArrayBuffer } from "@/lib/dealer-network/image-processing";
import { requireStaff } from "./auth";
import { serviceDatabase, serviceRpc, databaseError } from "./repository";
import { MAX_CASE_IMAGE_BYTES } from "./policy";
import { parseAttachment, ServiceError, uuid } from "./validation";
import { readCases } from "./server";

export const SERVICE_IMAGE_BUCKET = "ids-service-private";
type Attachment = { id: string; case_id: string; name: string; storage_path: string; status: string; content_type: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif"; expected_bytes: number; expires_at: string };
export async function reserveServiceImage(caseId: string, value: unknown) {
  const actor = await requireStaff(); const input = parseAttachment(value);
  const row = await serviceRpc<Attachment>("ids_service_attachment_reserve", { p_actor: actor.id, p_case: uuid(caseId), p_id: input.id, p_name: input.name, p_type: input.type, p_bytes: input.size });
  if (row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) throw new ServiceError("This image reservation is no longer available.", 409);
  const { data, error } = await serviceDatabase().storage.from(SERVICE_IMAGE_BUCKET).createSignedUploadUrl(row.storage_path, { upsert: false });
  if (error || !data) throw new ServiceError("A secure image upload could not be created.", 503);
  return { id: row.id, uploadUrl: data.signedUrl };
}
export async function finishServiceImage(caseId: string, imageId: string) {
  const actor = await requireStaff(); await readCases(actor, uuid(caseId));
  const { data, error } = await serviceDatabase().from("service_attachments").select("*").eq("id", uuid(imageId)).eq("case_id", caseId).single();
  if (error) databaseError(error); const row = data as Attachment;
  if (row.status === "ready") return { id: row.id, status: "ready" };
  if (row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) throw new ServiceError("This image reservation expired.", 409);
  const bucket = serviceDatabase().storage.from(SERVICE_IMAGE_BUCKET);
  try {
    const downloaded = await bucket.download(row.storage_path);
    if (downloaded.error || !downloaded.data) throw new ServiceError("Upload the image before finishing.", 409);
    if (downloaded.data.size !== row.expected_bytes || downloaded.data.size > MAX_CASE_IMAGE_BYTES) throw new ServiceError("Image size does not match its reservation.");
    const normalized = await normalizeMessageImage(new Uint8Array(await downloaded.data.arrayBuffer()), row.content_type);
    if (normalized.buffer.byteLength > MAX_CASE_IMAGE_BYTES) throw new ServiceError("The normalized image is too large.");
    const destination = `ready/${caseId}/${imageId}.jpg`;
    const uploaded = await bucket.upload(destination, exactStorageArrayBuffer(normalized.buffer), { contentType: "image/jpeg", upsert: false });
    if (uploaded.error) {
      // A repeated finalize can race after normalization. Only accept the same
      // server-produced bytes at the deterministic, private destination.
      const existing = await bucket.download(destination);
      if (existing.error || !existing.data) throw new ServiceError("Image storage is temporarily unavailable.", 503);
      const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
      if (digest(new Uint8Array(await existing.data.arrayBuffer())) !== digest(normalized.buffer)) throw new ServiceError("Image storage reconciliation failed.", 409);
    }
    await serviceRpc("ids_service_attachment_finish", { p_actor: actor.id, p_case: caseId, p_id: imageId, p_success: true });
    await bucket.remove([row.storage_path]);
    return { id: imageId, status: "ready" };
  } catch (error) {
    if (!(error instanceof ServiceError) || error.status === 400) {
      await serviceRpc("ids_service_attachment_finish", { p_actor: actor.id, p_case: caseId, p_id: imageId, p_success: false });
      await bucket.remove([row.storage_path]);
      throw new ServiceError("This file is not a safe supported image.");
    }
    throw error;
  }
}
export async function readServiceImage(caseId: string, imageId: string) {
  const actor = await requireStaff(); await readCases(actor, uuid(caseId));
  const { data, error } = await serviceDatabase().from("service_attachments").select("storage_path").eq("id", uuid(imageId)).eq("case_id", caseId).eq("status", "ready").single();
  if (error) databaseError(error);
  // Proxy the small normalized image through authenticated access. This avoids
  // retaining a bearer download URL after a technician is disabled/reassigned.
  const image = await serviceDatabase().storage.from(SERVICE_IMAGE_BUCKET).download(data.storage_path);
  if (image.error || !image.data) throw new ServiceError("Image is unavailable.", 404);
  return image.data;
}
