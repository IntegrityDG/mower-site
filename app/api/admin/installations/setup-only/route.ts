import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { createSetupOnlyJob } from "@/lib/installations/setup-server";
import { installationReadError } from "@/lib/installations/errors";

export async function POST(request: Request) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 12000) return Response.json({ error: "Request is too large." }, { status: 413 });
  try {
    return Response.json(await createSetupOnlyJob(JSON.parse(raw)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = (error as Error).message;
    if (error instanceof SyntaxError || ["invalid_setup_only_request", "recorded_reason_required", "stable_operation_key_required"].includes(message)) return Response.json({ error: "Review the customer, equipment, appointment, acknowledgements, and recorded reason." }, { status: 400 });
    if (message.includes("idempotency_conflict")) return Response.json({ error: "This request key already belongs to different details. Review the saved job." }, { status: 409 });
    if (message.includes("slot_unavailable") || message.includes("slot_conflict")) return Response.json({ error: "That appointment is no longer available. Choose a current slot." }, { status: 400 });
    const failure = installationReadError(error);
    return Response.json(failure.body, { status: failure.status });
  }
}
