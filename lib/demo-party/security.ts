import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PORTAL_TOKEN_BYTES = 32;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function generatePortalToken() {
  return randomBytes(PORTAL_TOKEN_BYTES).toString("base64url");
}

export function portalTokenIsWellFormed(token: string) {
  return tokenPattern.test(token);
}

export function hashPortalToken(token: string) {
  if (!portalTokenIsWellFormed(token)) throw new Error("Invalid portal token.");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function portalTokenHashMatches(token: string, expectedHash: string) {
  if (!portalTokenIsWellFormed(token) || !/^[0-9a-f]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashPortalToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
