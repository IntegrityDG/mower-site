import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "ids_reviews_admin";
const secret = () => process.env.REVIEWS_ADMIN_PASSWORD ?? "";
const signature = () => createHmac("sha256", secret()).update("ids-reviews-admin-v1").digest("hex");
export function validAdminPassword(value: string) {
  const expected = Buffer.from(secret());
  const supplied = Buffer.from(value);
  if (!expected.length || supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}
export async function isReviewAdmin() {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  if (!secret()) return false;
  const expected = signature();
  return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
export function adminCookieValue() { return signature(); }
