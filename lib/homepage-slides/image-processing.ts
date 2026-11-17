import sharp from "sharp";
import { HOMEPAGE_SLIDE_MAX_BYTES } from "./policy";
/** Decode untrusted uploads and publish only fresh single-frame, metadata-free WebP. */
export async function normalizeHomepageSlideImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > HOMEPAGE_SLIDE_MAX_BYTES) throw new Error("Image must be 10 MB or smaller.");
  const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
  const metadata = await decoder.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Upload a single JPEG, PNG, or WebP image.");
  return decoder.rotate().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
}
