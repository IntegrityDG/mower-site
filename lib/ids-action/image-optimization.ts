import { IDS_ACTION_IMAGE_TYPES, IDS_ACTION_MAX_IMAGE_BYTES, IDS_ACTION_MAX_IMAGE_DIMENSION } from "./validation";

export const IDS_ACTION_IMAGE_QUALITY = 0.88;

export function getOptimizedDimensions(width: number, height: number, maxDimension = IDS_ACTION_MAX_IMAGE_DIMENSION) {
  if (width <= 0 || height <= 0) throw new Error("Invalid image dimensions.");
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function validateIdsActionSource(file: Pick<File, "type" | "size">) {
  if (!(file.type in IDS_ACTION_IMAGE_TYPES)) {
    throw new Error(file.type === "image/heic" || file.type === "image/heif"
      ? "HEIC/HEIF photos are not supported yet. Please convert the photo to JPEG, PNG, or WebP before uploading."
      : "Please choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > IDS_ACTION_MAX_IMAGE_BYTES) throw new Error("Photo must be 50 MB or smaller.");
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Canvas encoding failed.")), type, quality,
  ));
}

export async function optimizeIdsActionImage(file: File): Promise<File> {
  validateIdsActionSource(file);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const dimensions = getOptimizedDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) throw new Error("Canvas is unavailable.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const quality = file.type === "image/png" ? undefined : IDS_ACTION_IMAGE_QUALITY;
    const blob = await canvasToBlob(canvas, file.type, quality);
    const extension = IDS_ACTION_IMAGE_TYPES[file.type as keyof typeof IDS_ACTION_IMAGE_TYPES];
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}-web.${extension}`, { type: file.type, lastModified: Date.now() });
  } catch {
    throw new Error("IDS could not prepare this photo for upload. Please try another JPEG, PNG, or WebP image.");
  } finally {
    bitmap?.close();
  }
}
