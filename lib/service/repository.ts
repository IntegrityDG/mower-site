import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { ServiceError } from "./validation";

export const serviceDatabase = () => getSupabaseServiceClient();
export function databaseError(error: { code?: string; message: string }): never {
  const messages: Record<string, string> = {
    service_forbidden: "You do not have access to this Service record.",
    service_version_conflict: "This record changed. Refresh it before saving.",
    service_idempotency_conflict: "This request reference was used for different details.",
    service_subscription_inactive: "Remote Support is not active. Review payment and activation dates.",
    service_no_paid_cycle: "No paid subscription cycle covers this appointment.",
    service_sessions_exhausted: "All available sessions are used or reserved. Paid Remote Service is available.",
    service_payment_authorization_required: "The customer must authorize and save a payment method before scheduling paid Service.",
    service_warranty_verification_required: "Complete warranty verification first.",
    service_schedule_conflict: "That time conflicts with an IDS field appointment or the assigned technician's calendar.",
    service_dropoff_has_no_travel: "Shop drop-off cannot include technician travel.",
    service_attachment_limit: "A case can contain at most three images.",
    service_final_invoice_immutable: "The invoice is finalized and cannot be edited.",
  };
  const key = Object.keys(messages).find(name => error.message.includes(name));
  if (key) throw new ServiceError(messages[key], error.code === "42501" ? 403 : 409);
  if (error.message.startsWith("service_")) throw new ServiceError(error.message.replace(/^service_/, "").replaceAll("_", " "), 409);
  throw new ServiceError("Service records are temporarily unavailable.", 503);
}
export async function serviceRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await serviceDatabase().rpc(name, args);
  if (error) databaseError(error);
  return data as T;
}
