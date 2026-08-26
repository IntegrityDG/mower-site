import { FEATURED_BUSINESS_IMAGE_TYPES, FEATURED_BUSINESS_MAX_IMAGE_BYTES } from "./validation";

const signatures: Record<keyof typeof FEATURED_BUSINESS_IMAGE_TYPES, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v, i) => b[i] === v),
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

export async function validateBusinessImage(file: unknown) {
  if (!(file instanceof File)) return { ok: false as const, error: "A JPEG, PNG, or WebP logo is required." };
  const type = file.type as keyof typeof FEATURED_BUSINESS_IMAGE_TYPES;
  if (!FEATURED_BUSINESS_IMAGE_TYPES[type]) return { ok: false as const, error: "Upload a JPEG, PNG, or WebP image." };
  if (!file.size || file.size > FEATURED_BUSINESS_MAX_IMAGE_BYTES) return { ok: false as const, error: "Image must be 5 MB or smaller." };
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!signatures[type](bytes)) return { ok: false as const, error: "The uploaded file does not appear to be a valid image." };
  return { ok: true as const, file, extension: FEATURED_BUSINESS_IMAGE_TYPES[type], contentType: type };
}
