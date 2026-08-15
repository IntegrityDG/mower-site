"use client";

import * as tus from "tus-js-client";

export const MESSAGE_TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const MESSAGE_TUS_RETRY_DELAYS = [0, 1_000, 3_000, 5_000, 10_000];

function trustedEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".storage.supabase.co") ||
    url.pathname !== "/storage/v1/upload/resumable/sign"
  )
    throw new Error("Invalid upload endpoint.");
  return url.toString();
}

export function uploadMessagePhoto(input: {
  file: File;
  endpoint: string;
  bucket: string;
  path: string;
  token: string;
  onProgress: (percent: number) => void;
}) {
  let upload: tus.Upload;
  const promise = new Promise<void>((resolve, reject) => {
    upload = new tus.Upload(input.file, {
      endpoint: trustedEndpoint(input.endpoint),
      uploadSize: input.file.size,
      uploadDataDuringCreation: true,
      chunkSize: MESSAGE_TUS_CHUNK_BYTES,
      retryDelays: MESSAGE_TUS_RETRY_DELAYS,
      removeFingerprintOnSuccess: true,
      headers: { "x-signature": input.token, "x-upsert": "false" },
      metadata: {
        bucketName: input.bucket,
        objectName: input.path,
        contentType: input.file.type,
        cacheControl: "3600",
      },
      onProgress(uploaded, total) {
        input.onProgress(total ? Math.round((uploaded / total) * 100) : 0);
      },
      onError(error) {
        reject(new Error(error.message || "Photo upload failed."));
      },
      onSuccess() {
        resolve();
      },
    });
    upload.start();
  });
  return { promise, cancel: () => upload.abort(true) };
}
