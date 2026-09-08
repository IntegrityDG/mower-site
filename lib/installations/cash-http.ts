import "server-only";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { installationControls } from "./controls";
import { confirmInstallationCash, correctInstallationCash, refundInstallationCash, recordInstallationCash, type CashEntryKind } from "./cash";
import { validateCashReceipt, validateCashCorrection, validateCashRefund } from "./cash-validation";
import { installationReadError } from "./errors";

export async function cashEntryRequest(request: Request, params: Promise<{ id: string }>, kind: CashEntryKind, confirmationOnly: boolean) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!confirmationOnly && !installationControls().cashRecordingEnabled) return Response.json({ code: "installation_cash_recording_disabled", error: "Cash recording and corrections are disabled. History remains available." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: "Invalid installation." }, { status: 400 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8000) return Response.json({ error: "Entry is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (kind === "receipt") validateCashReceipt(body); else if (kind === "refund") validateCashRefund(body); else validateCashCorrection(body);
  } catch (error) { return Response.json({ code: "invalid_receipt", error: (error as Error).message }, { status: 400 }); }
  try {
    const result = confirmationOnly ? await confirmInstallationCash(id, body, kind) : await (kind === "refund" ? refundInstallationCash : kind === "receipt" ? recordInstallationCash : correctInstallationCash)(id, body);
    return Response.json(result ?? { confirmed: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = String((error as Error)?.message ?? "");
    if (["cash_operation_conflict", "installation_ledger_changed", "cash_correction_exceeds_eligible_amount", "invalid_correction_original", "cash_refund_exceeds_eligible_amount", "invalid_cash_refund_original"].includes(message)) {
      return Response.json({ code: message, error: message === "cash_operation_conflict" ? "This entry key belongs to different details. Review history." : "The receipt or balance changed. Refresh history and review this same correction." }, { status: 409 });
    }
    const failure = installationReadError(error);
    return Response.json({ ...failure.body, error: "Entry could not be confirmed. Keep its key and confirm this same entry before creating another." }, { status: 503 });
  }
}
