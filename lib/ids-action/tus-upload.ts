import * as tus from "tus-js-client";

export const IDS_ACTION_TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const IDS_ACTION_TUS_RETRY_DELAYS = [0, 1000, 3000, 5000, 10000];
export const IDS_ACTION_TUS_STALL_TIMEOUT_MS = 60_000;

type Options = {
  file: File;
  tusEndpoint: string;
  bucket: string;
  path: string;
  signedToken: string;
  onProgress: (percent: number) => void;
  onRetry: () => void;
};

function validateTusEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Invalid Supabase TUS endpoint.");
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".storage.supabase.co") || url.pathname !== "/storage/v1/upload/resumable/sign") {
    throw new Error("Invalid Supabase TUS endpoint.");
  }
  return url.toString();
}

export function safeTusUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : "Photo upload failed.";
  if (/Invalid Compact JWS/i.test(message)) {
    return new Error("Photo upload authorization was rejected by Supabase. Invalid signed upload token (Compact JWS). HTTP 400 / AccessDenied.");
  }
  return error instanceof Error ? error : new Error("Photo upload failed.");
}

export function uploadIdsActionTus(options: Options) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let upload: tus.Upload;
  let rejectPromise: (reason: Error) => void = () => undefined;
  const resetStallTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (settled) return;
      void upload.abort(true);
      rejectPromise(new Error("Upload stalled for 60 seconds. Check your connection and try again."));
      settled = true;
    }, IDS_ACTION_TUS_STALL_TIMEOUT_MS);
  };
  const promise = new Promise<void>((resolve, reject) => {
    rejectPromise = reject;
    upload = new tus.Upload(options.file, {
      endpoint: validateTusEndpoint(options.tusEndpoint),
      uploadSize: options.file.size,
      uploadDataDuringCreation: true,
      chunkSize: IDS_ACTION_TUS_CHUNK_BYTES,
      retryDelays: IDS_ACTION_TUS_RETRY_DELAYS,
      removeFingerprintOnSuccess: true,
      headers: {
        "x-signature": options.signedToken,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: options.bucket,
        objectName: options.path,
        contentType: options.file.type,
        cacheControl: "31536000",
      },
      onShouldRetry(error, attempt) {
        const status = error.originalResponse?.getStatus() ?? 0;
        const shouldRetry = attempt < IDS_ACTION_TUS_RETRY_DELAYS.length && (status === 0 || status === 409 || status === 423 || status === 429 || status >= 500);
        if (shouldRetry) {
          options.onRetry();
          resetStallTimer();
        }
        return shouldRetry;
      },
      onProgress(uploaded, total) {
        resetStallTimer();
        options.onProgress(total ? Math.round((uploaded / total) * 100) : 0);
      },
      onError(error) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(safeTusUploadError(error));
      },
      onSuccess() {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve();
      },
    });
    resetStallTimer();
    upload.start();
  });
  return {
    promise,
    cancel: async () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      await upload.abort(true);
      rejectPromise(new Error("Upload cancelled."));
    },
  };
}
