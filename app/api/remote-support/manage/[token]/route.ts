import { cookies } from "next/headers";
import { serviceApiError, serviceBody, serviceResponse } from "@/lib/service/api";
import { serviceDatabase, databaseError, serviceRpc } from "@/lib/service/repository";
import { tokenHash } from "@/lib/service/security";
import { subscriptionByToken } from "@/lib/service/server";
import { cancelSupport, supportBillingPortal, retrySupportPayment } from "@/lib/service/stripe";
import { subscriptionEligible } from "@/lib/service/policy";
import { SUPPORT_COOKIE, serviceRateLimit } from "@/lib/service/auth";
import { exact, object, uuid, ServiceError } from "@/lib/service/validation";
type Context = { params: Promise<{ token: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const token = (await context.params).token; const subscription = await subscriptionByToken(token);
    const { data, error } = await serviceDatabase().from("remote_support_cycles").select("id,starts_at,ends_at,remote_support_sessions(number,status,reason)").eq("subscription_id", subscription.id).order("starts_at", { ascending: false });
    if (error) databaseError(error);
    (await cookies()).set(SUPPORT_COOKIE, token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/", maxAge: 12 * 3600 });
    return serviceResponse({ status: subscription.status, activationAt: subscription.activation_at, paidThrough: subscription.paid_through, failedAt: subscription.failed_at, cancelAtPeriodEnd: subscription.cancel_at_period_end, eligible: subscriptionEligible(subscription), cycles: data });
  } catch (error) { return serviceApiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const token = (await context.params).token; const body = object(await serviceBody(request)); exact(body, body.action === "link_installation" ? ["action", "installationToken"] : body.action === "retry_payment" ? ["action", "key"] : ["action"]); await serviceRateLimit(request, "subscription_manage", 15);
    if (body.action === "link_installation") return serviceResponse(await serviceRpc("ids_support_bind_installation", { p_support_hash: tokenHash(token), p_installation_token: uuid(body.installationToken) }));
    if (body.action === "cancel") return serviceResponse(await cancelSupport(token));
    if (body.action === "update_payment") return serviceResponse(await supportBillingPortal(request, token));
    if (body.action === "retry_payment") return serviceResponse(await retrySupportPayment(token, uuid(body.key)));
    throw new ServiceError("Unknown subscription action.");
  } catch (error) { return serviceApiError(error); }
}
