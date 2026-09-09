import "server-only";
import { cookies } from "next/headers";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { createOneTimeToken, hashPin as hashPassword, hashToken, verifyPin as verifyPassword } from "@/lib/dealer-network/security";
import { consumeDealerRateLimit, requestClientKey } from "@/lib/dealer-network/member-auth";
import { serviceDatabase, serviceRpc } from "./repository";
import { email, ServiceError, text } from "./validation";
import type { StaffActor, StaffProfile } from "./types";

export const STAFF_COOKIE = "ids_service_staff";
export const SUPPORT_COOKIE = "ids_remote_support";
const SESSION_SECONDS = 12 * 60 * 60;
const dummyPassword = hashPassword("ids-service-invalid-password");

export async function serviceRateLimit(request: Request, scope: string, maximum = 20) {
  if (!await consumeDealerRateLimit(`service_${scope}`, requestClientKey(request), maximum, 900)) throw new ServiceError("Too many requests. Please wait and try again.", 429);
}
export async function currentStaff(): Promise<StaffActor | null> {
  if (await isReviewAdmin()) return { id: null, role: "master", name: "Master Admin", canCollectPayments: true, canRecordCash: true };
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const { data: session, error } = await serviceDatabase().from("service_staff_sessions").select("staff_id").eq("token_hash", hashToken(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !session) return null;
  const { data } = await serviceDatabase().from("service_staff").select("id,name,enabled,can_collect_payments,can_record_cash").eq("id", session.staff_id).eq("enabled", true).maybeSingle();
  return data ? { id: data.id, role: "technician", name: data.name, canCollectPayments: data.can_collect_payments, canRecordCash: data.can_record_cash } : null;
}
export async function requireStaff(master = false) {
  const actor = await currentStaff();
  if (!actor) throw new ServiceError("Staff sign-in required.", 401);
  if (master && actor.role !== "master") throw new ServiceError("Master Admin access required.", 403);
  return actor;
}
export async function loginStaff(request: Request, address: unknown, passwordValue: unknown) {
  await serviceRateLimit(request, "staff_login", 10);
  const normalized = email(address); const password = text(passwordValue, "password", 200, true);
  const { data: staff, error } = await serviceDatabase().from("service_staff").select("id,password_hash,password_salt,enabled,locked_until").eq("email", normalized).maybeSingle();
  if (error) throw new ServiceError("Staff sign-in is temporarily unavailable.", 503);
  const dummy = await dummyPassword;
  const valid = await verifyPassword(password, staff?.password_hash ?? dummy.hash, staff?.password_salt ?? dummy.salt);
  const allowed = Boolean(valid && staff?.enabled && (!staff.locked_until || Date.parse(staff.locked_until) <= Date.now()));
  if (staff && !allowed) await serviceRpc("ids_service_staff_login_failure", { p_staff: staff.id });
  if (!allowed || !staff) throw new ServiceError("The email or password is invalid.", 401);
  const token = createOneTimeToken();
  await serviceRpc("ids_service_staff_session", { p_staff: staff.id, p_hash: token.tokenHash });
  (await cookies()).set(STAFF_COOKIE, token.token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS });
}
export async function logoutStaff() {
  const store = await cookies(); const token = store.get(STAFF_COOKIE)?.value;
  if (token) await serviceDatabase().from("service_staff_sessions").delete().eq("token_hash", hashToken(token)).throwOnError();
  store.delete(STAFF_COOKIE);
}
export async function activateStaff(tokenValue: unknown, passwordValue: unknown) {
  const token = text(tokenValue, "activation link", 100, true); const password = text(passwordValue, "password", 200, true);
  if (password.length < 12 || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ServiceError("Use the valid activation link and a password of at least 12 characters.");
  const credentials = await hashPassword(password);
  await serviceRpc("ids_service_staff_activate", { p_token_hash: hashToken(token), p_password_hash: credentials.hash, p_password_salt: credentials.salt });
}
export async function staffProfiles(): Promise<StaffProfile[]> {
  await requireStaff(true);
  const { data, error } = await serviceDatabase().from("service_staff").select("id,name,email,phone,enabled,can_collect_payments,can_record_cash,created_at").order("name");
  if (error) throw new ServiceError("Staff records are unavailable.", 503);
  return data ?? [];
}
