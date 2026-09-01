import { finishDemoRefund, prepareDemoRefund } from "@/lib/demo-party/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getStripeServerClient } from "@/lib/stripe/server";
import { isSchedulingId } from "@/lib/scheduling/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!isSchedulingId(id)) return Response.json({ error: "Invalid appointment." }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "REFUND EARNED DEMO FEE") return Response.json({ error: "Type REFUND EARNED DEMO FEE to confirm." }, { status: 400 });
  let prepared: Record<string, unknown>;
  try { prepared = await prepareDemoRefund(id); }
  catch { return Response.json({ error: "No additional verified fee refund is available." }, { status: 409 }); }
  if (prepared.state === "settled") return Response.json(prepared);
  const attemptId = String(prepared.attemptId);
  try {
    const refund = await getStripeServerClient().refunds.create({
      payment_intent: String(prepared.paymentIntentId),
      amount: Number(prepared.amountCents),
      metadata: { payment_kind: "demo_reservation_fee_refund", appointment_id: id, refund_attempt_id: attemptId },
    }, { idempotencyKey: String(prepared.idempotencyKey) });
    return Response.json(await finishDemoRefund(attemptId, true, refund.id, null));
  } catch (error) {
    await finishDemoRefund(attemptId, false, null, "STRIPE_REFUND_FAILED").catch(() => undefined);
    console.error("Demo fee refund failed", { appointmentId: id, attemptId, error: error instanceof Error ? error.message : "UNKNOWN" });
    return Response.json({ error: "Stripe could not complete the refund. The attempt is safe to retry." }, { status: 503 });
  }
}
