export type SignedUploadTokenDiagnostics = {
  tokenPresent: boolean;
  tokenType: string;
  tokenLength: number;
  tokenSegmentCount: number;
  tokenSegmentsNonEmpty: boolean;
  tokenHasWhitespace: boolean;
  tokenMatchesSignedUrl: boolean;
};

export function inspectSignedUploadToken(token: unknown, signedUrl: unknown): SignedUploadTokenDiagnostics {
  const tokenString = typeof token === "string" ? token : "";
  const segments = tokenString.split(".");
  let signedUrlToken: string | null = null;
  try {
    signedUrlToken = typeof signedUrl === "string" ? new URL(signedUrl).searchParams.get("token") : null;
  } catch {
    // A malformed signed URL is reported through tokenMatchesSignedUrl without exposing either value.
  }
  return {
    tokenPresent: tokenString.length > 0,
    tokenType: typeof token,
    tokenLength: tokenString.length,
    tokenSegmentCount: segments.length,
    tokenSegmentsNonEmpty: segments.length === 3 && segments.every(segment => segment.length > 0),
    tokenHasWhitespace: tokenString.trim() !== tokenString,
    tokenMatchesSignedUrl: tokenString.length > 0 && tokenString === signedUrlToken,
  };
}

export function isValidSignedUploadToken(diagnostics: SignedUploadTokenDiagnostics) {
  return diagnostics.tokenPresent && diagnostics.tokenType === "string" && diagnostics.tokenSegmentsNonEmpty && !diagnostics.tokenHasWhitespace && diagnostics.tokenMatchesSignedUrl;
}
