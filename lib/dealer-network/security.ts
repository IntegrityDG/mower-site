import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;
const KEY_BYTES = 64;
const derive = (pin: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    nodeScrypt(pin, salt, KEY_BYTES, SCRYPT_OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await derive(pin, salt);
  return { hash: derived.toString("base64url"), salt };
}

export async function verifyPin(
  pin: string,
  expectedHash: string,
  salt: string,
) {
  try {
    const derived = await derive(pin, salt);
    const expected = Buffer.from(expectedHash, "base64url");
    return (
      expected.length === derived.length && timingSafeEqual(expected, derived)
    );
  } catch {
    return false;
  }
}

export function createOneTimeToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function requestFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function privateIdentifierHash(value: string) {
  const secret =
    process.env.DEALER_NETWORK_RATE_LIMIT_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new Error("Dealer Network rate-limit secret is unavailable.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
