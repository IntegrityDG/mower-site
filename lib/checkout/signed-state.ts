import { createHmac, timingSafeEqual } from "node:crypto";

export type CancelState = { orderId: string; attemptId: string; publicReference: string; expiresAt: number; returnPath: string };
const VERSION = "v1";
const approvedPath = (path: string) => path === "/equipment" || /^\/equipment\/[a-z0-9-]+$/.test(path);
const enc = (value: string) => Buffer.from(value).toString("base64url");
export function signCancelState(state: CancelState, secret: string) { if (!approvedPath(state.returnPath)) throw new Error("Unsafe return path."); const payload = enc(JSON.stringify(state)); const sig = createHmac("sha256", secret).update(`${VERSION}.${payload}`).digest("base64url"); return `${VERSION}.${payload}.${sig}`; }
export function verifyCancelState(token: string, secret: string, now = Date.now()): CancelState | null { try { const [version,payload,sig,...rest] = token.split("."); if (version !== VERSION || rest.length || !payload || !sig) return null; const expected = createHmac("sha256", secret).update(`${version}.${payload}`).digest(); const actual = Buffer.from(sig,"base64url"); if (expected.length !== actual.length || !timingSafeEqual(expected,actual)) return null; const state = JSON.parse(Buffer.from(payload,"base64url").toString()) as CancelState; return Number.isSafeInteger(state.expiresAt) && state.expiresAt >= now && approvedPath(state.returnPath) ? state : null; } catch { return null; } }
