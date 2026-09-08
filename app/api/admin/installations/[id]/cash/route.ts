import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { recordInstallationCash } from "@/lib/installations/cash";
import { validateCashReceipt } from "@/lib/installations/cash-validation";
import { installationReadError } from "@/lib/installations/errors";
import { installationControls } from "@/lib/installations/controls";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!installationControls().cashRecordingEnabled) return Response.json({ error: "Cash recording and receipt corrections are disabled. History remains available.", code: "installation_cash_recording_disabled" }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: "Invalid installation." }, { status: 400 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8000) return Response.json({ error: "Receipt is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid receipt.");
    validateCashReceipt(body);
  } catch (error) { return Response.json({ error: (error as Error).message, code: "invalid_receipt" }, { status: 400 }); }
  try {
    return Response.json(await recordInstallationCash(id, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = String((error as Error)?.message ?? "");
    if (["cash_operation_conflict", "installation_ledger_changed", "cash_overpayment_confirmation_required"].includes(message)) {
      return Response.json({ error: message === "cash_operation_conflict" ? "This receipt key already belongs to different receipt details. Review the recorded receipt." : message === "installation_ledger_changed" ? "The balance changed. Reload the record and review the same receipt again." : "This amount exceeds the balance. Explicit overpayment confirmation is required.", code: message }, { status: 409 });
    }
    const failure = installationReadError(error);
    return Response.json({ ...failure.body, error: failure.body.code === "installation_not_initialized" ? failure.body.error : "Cash receipt could not be confirmed. Keep this receipt key and retry the same receipt; do not create another receipt." }, { status: 503 });
  }
}
