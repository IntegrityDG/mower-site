import sharp, { type Sharp } from "sharp";
// heic-to's public converter is browser-only. This packaged libheif build is its
// low-level decoder and runs in the server runtime without eval or a subprocess.
// @ts-expect-error heic-to does not publish types for its low-level decoder.
import buildLibheif from "../../node_modules/heic-to/src/lib/libheif-without-unsafe-eval.js";
import type { MessageImageType } from "./messaging-validation";

export const MESSAGE_OUTPUT_LONG_EDGE = 2_560;
export const MESSAGE_MAX_INPUT_EDGE = 9_000;
export const MESSAGE_MAX_INPUT_PIXELS = 50_000_000;

type DecodedHeicImage = {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(
    target: HeicPixels,
    callback: (result: HeicPixels | null) => void,
  ): void;
  free(): void;
};

type HeicPixels = {
  data: Uint8ClampedArray<ArrayBufferLike>;
  width: number;
  height: number;
};

type Libheif = {
  HeifDecoder: new () => {
    decoder: unknown;
    decode(buffer: Uint8Array): DecodedHeicImage[];
  };
  heif_context_free(context: unknown): void;
};

let libheif: Libheif | null = null;

function fourCharacters(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function isJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array) {
  return (
    bytes[0] === 0x89 &&
    fourCharacters(bytes, 1) === "PNG\r" &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isWebp(bytes: Uint8Array) {
  return fourCharacters(bytes, 0) === "RIFF" && fourCharacters(bytes, 8) === "WEBP";
}

export function inspectHeicContainer(bytes: Uint8Array) {
  if (bytes.length < 32 || fourCharacters(bytes, 4) !== "ftyp") return null;
  const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (boxSize < 16 || boxSize > bytes.length) return null;
  const majorBrand = fourCharacters(bytes, 8);
  const compatibleBrands: string[] = [];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4)
    compatibleBrands.push(fourCharacters(bytes, offset));
  const stillBrands = new Set(["heic", "heix"]);
  const sequenceBrands = new Set(["hevc", "hevx", "msf1"]);
  if (
    sequenceBrands.has(majorBrand) ||
    compatibleBrands.some((brand) => sequenceBrands.has(brand)) ||
    (![majorBrand, ...compatibleBrands].some((brand) => stillBrands.has(brand)))
  )
    return null;

  const text = Buffer.from(bytes).toString("latin1");
  if (!text.includes("hvc1") || text.includes("unci") || text.includes("moov"))
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions: Array<{ width: number; height: number }> = [];
  let index = text.indexOf("ispe");
  while (index >= 0) {
    if (index + 16 <= bytes.length) {
      const width = view.getUint32(index + 8);
      const height = view.getUint32(index + 12);
      if (width && height) dimensions.push({ width, height });
    }
    index = text.indexOf("ispe", index + 4);
  }
  if (
    dimensions.length === 0 ||
    dimensions.some(
      ({ width, height }) =>
        width > MESSAGE_MAX_INPUT_EDGE ||
        height > MESSAGE_MAX_INPUT_EDGE ||
        width * height > MESSAGE_MAX_INPUT_PIXELS,
    )
  )
    return null;
  return { majorBrand, dimensions };
}

export function detectMessageImageType(
  bytes: Uint8Array,
  declaredType: MessageImageType,
) {
  if (declaredType === "image/jpeg" && isJpeg(bytes)) return "jpeg" as const;
  if (declaredType === "image/png" && isPng(bytes)) return "png" as const;
  if (declaredType === "image/webp" && isWebp(bytes)) return "webp" as const;
  if (
    (declaredType === "image/heic" || declaredType === "image/heif") &&
    inspectHeicContainer(bytes)
  )
    return "heic" as const;
  return null;
}

async function decodeHeic(bytes: Uint8Array) {
  libheif ??= buildLibheif() as Libheif;
  const decoder = new libheif.HeifDecoder();
  let images: DecodedHeicImage[] = [];
  try {
    images = decoder.decode(bytes);
    if (images.length !== 1) throw new Error("INVALID_HEIC");
    const image = images[0];
    const width = image.get_width();
    const height = image.get_height();
    if (
      !width ||
      !height ||
      width > MESSAGE_MAX_INPUT_EDGE ||
      height > MESSAGE_MAX_INPUT_EDGE ||
      width * height > MESSAGE_MAX_INPUT_PIXELS
    )
      throw new Error("INVALID_IMAGE_DIMENSIONS");
    const target: HeicPixels = {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    };
    target.data.fill(255);
    const result = await new Promise<HeicPixels>((resolve, reject) =>
      image.display(target, (displayed) =>
        displayed ? resolve(displayed) : reject(new Error("HEIC_DECODE_FAILED")),
      ),
    );
    return { data: Buffer.from(result.data), width, height };
  } finally {
    for (const image of images) image.free();
    if (decoder.decoder) libheif.heif_context_free(decoder.decoder);
  }
}

async function preflightHeic(bytes: Uint8Array) {
  // Sharp 0.35.3's patched native libheif parser validates the complete HEIC
  // container before the HEVC-capable JS decoder sees it. The native package
  // intentionally lacks an HEVC codec, but metadata parsing still rejects
  // malformed transforms, invalid item graphs, sequences, and unsafe sizes.
  const metadata = await sharp(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    {
      failOn: "warning",
      limitInputPixels: MESSAGE_MAX_INPUT_PIXELS,
      pages: 1,
    },
  ).metadata();
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (
    metadata.format !== "heif" ||
    metadata.compression !== "hevc" ||
    metadata.pages !== 1 ||
    !width ||
    !height ||
    width > MESSAGE_MAX_INPUT_EDGE ||
    height > MESSAGE_MAX_INPUT_EDGE ||
    width * height > MESSAGE_MAX_INPUT_PIXELS
  )
    throw new Error("INVALID_HEIC");
}

export async function normalizeMessageImage(
  bytes: Uint8Array,
  declaredType: MessageImageType,
) {
  const detected = detectMessageImageType(bytes, declaredType);
  if (!detected) throw new Error("INVALID_IMAGE_SIGNATURE");
  let pipeline: Sharp;
  if (detected === "heic") {
    await preflightHeic(bytes);
    const source = await decodeHeic(bytes);
    pipeline = sharp(source.data, {
      raw: { width: source.width, height: source.height, channels: 4 },
      limitInputPixels: MESSAGE_MAX_INPUT_PIXELS,
    });
  } else {
    pipeline = sharp(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      {
        failOn: "warning",
        limitInputPixels: MESSAGE_MAX_INPUT_PIXELS,
        sequentialRead: true,
      },
    ).rotate();
  }
  const metadata = await pipeline.clone().metadata();
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (
    (metadata.pages ?? 1) !== 1 ||
    !width ||
    !height ||
    width > MESSAGE_MAX_INPUT_EDGE ||
    height > MESSAGE_MAX_INPUT_EDGE ||
    width * height > MESSAGE_MAX_INPUT_PIXELS
  )
    throw new Error("INVALID_IMAGE_DIMENSIONS");
  const output = await pipeline
    .resize({
      width: MESSAGE_OUTPUT_LONG_EDGE,
      height: MESSAGE_OUTPUT_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: output.data,
    contentType: "image/jpeg" as const,
    width: output.info.width,
    height: output.info.height,
  };
}

export function exactStorageArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
