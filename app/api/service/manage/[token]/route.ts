import { serviceApiError, serviceBody, serviceResponse } from "@/lib/service/api";
import { caseByToken, publicCase } from "@/lib/service/server";
import { serviceRpc } from "@/lib/service/repository";
import { tokenHash } from "@/lib/service/security";
import { createServicePayment } from "@/lib/service/stripe";
import { exact, object, text, uuid, ServiceError } from "@/lib/service/validation";
import { serviceRateLimit } from "@/lib/service/auth";
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) { try { return serviceResponse(await publicCase((await context.params).token)); } catch (error) { return serviceApiError(error); } }
export async function POST(request: Request, context: Context) {
  try {
    const token = (await context.params).token; const body = object(await serviceBody(request)); exact(body, ["key", "action", "decision", "appointmentId", "acceptedTerms"]);
    await serviceRateLimit(request, "customer_action", 20); const key = uuid(body.key); const job = await caseByToken(token);
    if (body.action === "authorize_payment" || body.action === "pay_invoice") {
      if (body.acceptedTerms !== true) throw new ServiceError("Accept the published Service rates and payment authorization.");
      return serviceResponse(await createServicePayment(request, { actor: { id: null, role: "master", name: "Customer", canCollectPayments: true, canRecordCash: false }, caseId: job.id, key, method: body.action === "authorize_payment" ? "setup" : "link", token }));
    }
    if (body.action === "authorize_paid") return serviceResponse(await serviceRpc("ids_service_customer_action", { p_token_hash: tokenHash(token), p_action: "authorize_paid", p_key: key, p_data: { decision: text(body.decision, "decision", 20, true) } }));
    if (body.action === "cancel_appointment") return serviceResponse(await serviceRpc("ids_service_customer_action", { p_token_hash: tokenHash(token), p_action: "cancel_appointment", p_key: key, p_data: { appointmentId: uuid(body.appointmentId), notes: "Customer cancelled through the private request link." } }));
    throw new ServiceError("Unknown customer action.");
  } catch (error) { return serviceApiError(error); }
}
