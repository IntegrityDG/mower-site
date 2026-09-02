import { buildDemoCheckoutSession } from "@/lib/demo-party/stripe-policy";
import { linkDemoCheckout, prepareDemoCheckout } from "@/lib/demo-party/server";
import { portalTokenIsWellFormed } from "@/lib/demo-party/security";
import { getStripeConfiguration } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!portalTokenIsWellFormed(token)) return Response.json({ error: "This secure link is invalid." }, { status: 404, headers: noStore });
  try {
    const prepared = await prepareDemoCheckout(token);
    if (prepared.state === "paid") return Response.json({ state: "paid" }, { headers: noStore });
    if (prepared.state === "resume") return Response.json({ state: "checkout", url: prepared.checkoutUrl }, { headers: noStore });
    if (prepared.state !== "create") throw new Error("Unexpected checkout state.");
    const { appBaseUrl } = getStripeConfiguration();
    const session = await getStripeServerClient().checkout.sessions.create(buildDemoCheckoutSession({
      appointmentId: String(prepared.requestId),
      customerEmail: String(prepared.customerEmail),
      appBaseUrl,
      portalToken: token,
    }), { idempotencyKey: `demo-checkout-${String(prepared.generationKey)}` });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    await linkDemoCheckout({
      requestId: String(prepared.requestId),
      generationKey: String(prepared.generationKey),
      sessionId: session.id,
      url: session.url,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
    });
    return Response.json({ state: "checkout", url: session.url }, { headers: noStore });
  } catch (error) {
    const message = String((error as { message?: string })?.message ?? "");
    if (/payment_not_approved|portal|invalid token/i.test(message)) return Response.json({ error: "Payment is not available from this link." }, { status: 403, headers: noStore });
    console.error("Demo Checkout creation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Payment is temporarily unavailable. Please try again." }, { status: 503, headers: noStore });
  }
}
