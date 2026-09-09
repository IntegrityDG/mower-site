import "server-only";
import { createHmac } from "node:crypto";
import { hashToken } from "@/lib/dealer-network/security";
import { ServiceError } from "./validation";

export function serviceToken(scope: "support" | "case" | "staff", requestKey: string) {
  const secret = process.env.CHECKOUT_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new ServiceError("Secure Service links are temporarily unavailable.", 503);
  return createHmac("sha256", secret).update(`ids-service-v1:${scope}:${requestKey}`).digest("base64url");
}
export function tokenHash(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new ServiceError("This private link is invalid.", 404);
  return hashToken(value);
}
