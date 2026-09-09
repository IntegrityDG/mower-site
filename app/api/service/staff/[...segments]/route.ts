import { activateStaff, currentStaff, loginStaff, logoutStaff, requireStaff, serviceRateLimit, staffProfiles } from "@/lib/service/auth";
import { serviceApiError, serviceBody, serviceResponse, requireSameOrigin } from "@/lib/service/api";
import { applyServiceAction, manageStaff, readCases } from "@/lib/service/server";
import { createServicePayment, reconcileSubscription, reconcileServicePayments } from "@/lib/service/stripe";
import { finishServiceImage, readServiceImage, reserveServiceImage } from "@/lib/service/attachments";
import { readWarrantySnapshot, runServiceMaintenance, wakeServiceMaintenance } from "@/lib/service/outbox";
import { serviceRpc } from "@/lib/service/repository";
import { warrantyPdf } from "@/lib/service/warranty-pdf";
import { exact, object, text, uuid, integer, parsePricing, ServiceError } from "@/lib/service/validation";
import { readAvailabilityHistory, readServiceAvailability, saveServiceAvailability } from "@/lib/service/availability";
import { SERVICE_AVAILABILITY_KEYS, type ServiceAvailabilityKey, type ServiceAvailabilityStatus } from "@/lib/service/types";
type Context = { params: Promise<{ segments: string[] }> };
export const runtime = "nodejs";
const missing = () => serviceResponse({ error: "Service endpoint not found." }, 404);

export async function GET(request: Request, context: Context) {
  try {
    const parts = (await context.params).segments;
    if (parts.length === 1 && parts[0] === "session") { const actor = await currentStaff(); return serviceResponse({ actor }, actor ? 200 : 401); }
    const actor = await requireStaff();
    if (parts.length === 1 && parts[0] === "availability") { await requireStaff(true); return serviceResponse({ settings: await readServiceAvailability(), history: await readAvailabilityHistory() }); }
    if (parts.length === 1 && parts[0] === "accounts") return serviceResponse({ staff: await staffProfiles() });
    if (parts[0] !== "cases") return missing();
    if (parts.length === 1) return serviceResponse(await readCases(actor));
    const caseId = uuid(parts[1]);
    if (parts.length === 2) return serviceResponse(await readCases(actor, caseId));
    if (parts.length === 4 && parts[2] === "attachments") return new Response(await readServiceImage(caseId, uuid(parts[3])), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
    if (parts.length === 3 && parts[2] === "report") {
      await readCases(actor, caseId); const snapshot = await readWarrantySnapshot(caseId); const pdf = await warrantyPdf(snapshot);
      return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${snapshot.case.case_number}-warranty.pdf"`, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
    }
    return missing();
  } catch (error) { return serviceApiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const parts = (await context.params).segments; const body = object(await serviceBody(request));
    if (parts.length === 1 && parts[0] === "session") { exact(body, ["email", "password"]); await loginStaff(request, body.email, body.password); return serviceResponse({ ok: true }); }
    if (parts.length === 1 && parts[0] === "activate") { exact(body, ["token", "password"]); await serviceRateLimit(request, "activate", 10); await activateStaff(body.token, body.password); return serviceResponse({ ok: true }); }
    const actor = await requireStaff();
    wakeServiceMaintenance();
    if (parts.length === 1 && parts[0] === "availability") {
      await requireStaff(true); exact(body, ["operationKey", "serviceKey", "status", "publicMessage"]);
      const serviceKey = text(body.serviceKey, "service", 100, true) as ServiceAvailabilityKey;
      const status = text(body.status, "availability status", 50, true) as ServiceAvailabilityStatus;
      if (!SERVICE_AVAILABILITY_KEYS.includes(serviceKey) || !["available", "currently_unavailable"].includes(status)) throw new ServiceError("Choose a valid Service availability setting.");
      return serviceResponse(await saveServiceAvailability(actor, { operationKey: uuid(body.operationKey), serviceKey, status, publicMessage: text(body.publicMessage, "public message", 500) }));
    }
    if (parts.length === 1 && parts[0] === "accounts") return serviceResponse(await manageStaff(request, body));
    if (parts.length === 1 && parts[0] === "pricing") {
      await requireStaff(true); exact(body, ["key", "version", "pricing", "reason"]);
      await serviceRpc("ids_service_save_pricing", { p_actor: actor.id, p_key: uuid(body.key), p_version: integer(body.version, "pricing version", 1), p_pricing: parsePricing(body.pricing), p_reason: text(body.reason, "reason", 2000, true) });
      return serviceResponse({ ok: true });
    }
    if (parts.join("/") === "subscriptions/reconcile") { await requireStaff(true); exact(body, ["id"]); await reconcileSubscription(uuid(body.id)); return serviceResponse({ ok: true }); }
    if (parts.length === 1 && parts[0] === "maintenance") { await requireStaff(true); exact(body, []); return serviceResponse(await runServiceMaintenance()); }
    if (parts[0] !== "cases" || parts.length < 2) return missing();
    const caseId = uuid(parts[1]);
    if (parts.length === 2) return serviceResponse(await applyServiceAction(caseId, body));
    if (parts.length === 3 && parts[2] === "attachments") return serviceResponse(await reserveServiceImage(caseId, body));
    if (parts.length === 4 && parts[2] === "attachments") { exact(body, []); return serviceResponse(await finishServiceImage(caseId, uuid(parts[3]))); }
    if (parts.length === 3 && parts[2] === "payments") {
      exact(body, ["key", "method", "receipt", "notes"]);
      if (!["card", "link", "terminal", "cash"].includes(String(body.method))) throw new ServiceError("Choose a payment method.");
      return serviceResponse(await createServicePayment(request, { actor, caseId, key: uuid(body.key), method: body.method as "card" | "link" | "terminal" | "cash", receipt: text(body.receipt, "cash receipt", 200), notes: text(body.notes, "payment notes", 2000) }));
    }
    if (parts.length === 3 && parts[2] === "reconcile-payments") { exact(body, ["closeOpen"]); if (typeof body.closeOpen !== "boolean") throw new ServiceError("Choose whether to close unpaid attempts."); return serviceResponse(await reconcileServicePayments(actor, caseId, body.closeOpen)); }
    return missing();
  } catch (error) { return serviceApiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { requireSameOrigin(request); if ((await context.params).segments.join("/") !== "session") return missing(); await logoutStaff(); return serviceResponse({ ok: true }); } catch (error) { return serviceApiError(error); }
}
