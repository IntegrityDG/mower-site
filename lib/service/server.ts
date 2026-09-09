import "server-only";
import { cookies } from "next/headers";
import { requestFingerprint } from "@/lib/dealer-network/security";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
import { requireStaff, serviceRateLimit, SUPPORT_COOKIE } from "./auth";
import { databaseError, serviceDatabase, serviceRpc } from "./repository";
import { requireServiceControl } from "./controls";
import { boolean, email, exact, object, parseIntake, parseServiceAction, phone, ServiceError, text, uuid } from "./validation";
import { serviceToken, tokenHash } from "./security";
import type { CaseDetail, ServiceCase, StaffActor, Subscription, WorkSheet } from "./types";
import { DEFAULT_SERVICE_PRICING } from "./policy";
import { serviceControls } from "./controls";
import { parsePricing } from "./validation";
import { requireServiceAvailability } from "./availability";

export async function publicServicePricing() {
  if (!serviceControls().serviceIntake) return DEFAULT_SERVICE_PRICING;
  const { data, error } = await serviceDatabase().from("service_pricing_settings").select("pricing").eq("id", true).single();
  if (error) databaseError(error);
  return parsePricing(data.pricing);
}

export async function readCases(actor: StaffActor, caseId: string | null = null) {
  return serviceRpc<CaseDetail>("ids_service_read", { p_actor: actor.id, p_case: caseId });
}
export async function subscriptionByToken(token: string): Promise<Subscription & { request_key: string }> {
  const { data, error } = await serviceDatabase().from("remote_support_subscriptions").select("*").eq("manage_token_hash", tokenHash(token)).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new ServiceError("This subscription link is unavailable.", 404);
  return data;
}
export async function verifiedSupportCustomer() {
  const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
  if (!token) return null;
  try { return (await subscriptionByToken(token)).customer_id; } catch { return null; }
}
export async function createServiceCase(request: Request, value: unknown) {
  const input = parseIntake(value);
  requireServiceControl(input.kind === "included_support" ? "remoteSupport" : "serviceIntake");
  if (input.kind === "included_support") await requireServiceAvailability("existing_subscriber_assistance");
  else if (input.warranty === "no") await requireServiceAvailability(input.kind === "remote_service" ? "paid_remote_service" : "onsite_service");
  await serviceRateLimit(request, "intake", 10);
  const token = serviceToken("case", input.key);
  const result = await serviceRpc<{ id: string; caseNumber: string }>("ids_service_intake", {
    p_key: input.key, p_fingerprint: requestFingerprint(input), p_token_hash: tokenHash(token), p_data: input,
    p_verified_customer: await verifiedSupportCustomer(),
  });
  const manageUrl = `${dealerNetworkOrigin(request)}/service/manage/${token}`;
  if (input.email) {
    const { error } = await serviceDatabase().from("service_outbox").upsert({ semantic_key: `case-link:${result.id}`, kind: "customer_link", case_id: result.id, payload: { email: input.email, requestKey: input.key, scope: "case", origin: dealerNetworkOrigin(request) } }, { onConflict: "semantic_key", ignoreDuplicates: true });
    if (error) databaseError(error);
  }
  return { ...result, manageUrl };
}
export async function caseByToken(token: string): Promise<ServiceCase> {
  const { data, error } = await serviceDatabase().from("service_cases").select("*").eq("manage_token_hash", tokenHash(token)).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new ServiceError("This Service link is unavailable.", 404);
  return data;
}
export async function publicCase(token: string) {
  const c = await caseByToken(token);
  const [invoice, appointments] = await Promise.all([
    serviceDatabase().from("service_invoices").select("status,payment_status,totals,pricing").eq("case_id", c.id).maybeSingle(),
    serviceDatabase().from("service_appointments").select("id,starts_at,ends_at,status,session_number").eq("case_id", c.id).order("starts_at"),
  ]);
  if (invoice.error) databaseError(invoice.error); if (appointments.error) databaseError(appointments.error);
  return { caseNumber: c.case_number, kind: c.kind, status: c.status, warrantyStatus: c.warranty_status,
    arrangement: c.arrangement, paymentAuthorized: Boolean(c.paid_authorized_at && c.payment_method_id),
    invoice: invoice.data ? { ...invoice.data, totals: invoice.data.status === "finalized" ? invoice.data.totals : null } : null, appointments: appointments.data ?? [] };
}
export async function applyServiceAction(caseId: string, value: unknown) {
  const actor = await requireStaff(); const input = parseServiceAction(value);
  if (input.action === "save_invoice" || input.action === "submit_invoice") {
    const detail = await readCases(actor, caseId);
    const sheet = input.data.sheet as WorkSheet;
    const old = new Map(detail.invoice?.sheet.labor.map(line => [line.id, line]) ?? []);
    // A handoff never rewrites the identity of the person who entered old work.
    sheet.labor = sheet.labor.map(line => ({ ...line, technicianId: old.has(line.id) ? old.get(line.id)!.technicianId : actor.id }));
  }
  return serviceRpc("ids_service_action", { p_actor: actor.id, p_case: uuid(caseId), p_action: input.action, p_key: input.key, p_version: input.version, p_data: input.data });
}
export async function manageStaff(request: Request, value: unknown) {
  const actor = await requireStaff(true); const input = object(value);
  exact(input, ["key", "id", "name", "email", "phone", "enabled", "canCollectPayments", "canRecordCash", "resetPassword"]);
  const key = uuid(input.key); const staffId = input.id ? uuid(input.id) : null;
  if (staffId) {
    const { data: prior, error } = await serviceDatabase().from("service_staff").select("email").eq("id", staffId).single();
    if (error) databaseError(error);
    if (prior.email !== email(input.email)) throw new ServiceError("Staff email is the account identity and cannot be changed here.", 409);
  }
  const reset = !staffId || input.resetPassword === true;
  const data = { name: text(input.name, "staff name", 200, true), email: email(input.email), phone: phone(input.phone),
    enabled: staffId ? boolean(input.enabled) : true, canCollectPayments: staffId ? boolean(input.canCollectPayments) : false,
    canRecordCash: staffId ? boolean(input.canRecordCash) : false,
    ...(reset ? { activationHash: tokenHash(serviceToken("staff", key)) } : {}) };
  const result = await serviceRpc<{ id: string }>("ids_service_manage_staff", { p_actor: actor.id, p_key: key, p_staff: staffId, p_data: data });
  if (reset) {
    const { error } = await serviceDatabase().from("service_outbox").upsert({ semantic_key: `staff-invitation:${key}`, kind: "staff_invitation", payload: { email: data.email, requestKey: key, origin: dealerNetworkOrigin(request), staffId: result.id } }, { onConflict: "semantic_key", ignoreDuplicates: true });
    if (error) databaseError(error);
  }
  return result;
}
