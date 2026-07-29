import type { Metadata } from "next";
import { getStripeServerClient } from "@/lib/stripe/server";
import { findBySessionId, safeProjection } from "@/lib/checkout/order-repository";

export const metadata: Metadata = { title: "Checkout status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const statusLabel = (view: ReturnType<typeof safeProjection>) => {
  if (view.attemptStatus === "expired") return "Expired";
  if (view.attemptStatus === "failed" || view.paymentStatus === "failed") return "Failed";
  if (view.paymentStatus === "paid") return "Paid";
  if (view.paymentStatus === "processing") return "Processing";
  if (view.paymentStatus === "partially_refunded") return "Partially refunded";
  if (view.paymentStatus === "refunded") return "Refunded";
  if (view.paymentStatus === "disputed") return "Disputed";
  return "Pending";
};

export default async function Success({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  let view: ReturnType<typeof safeProjection> | null = null;
  if (sessionId && /^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) {
    try {
      const session = await getStripeServerClient().checkout.sessions.retrieve(sessionId);
      if (!session.livemode) {
        const record = await findBySessionId(session.id);
        if (record && session.client_reference_id === record.orderId && session.metadata?.order_id === record.orderId && session.metadata?.attempt_id === record.attemptId) view = safeProjection(record);
      }
    } catch { /* Render the same safe invalid-session state for configuration, Stripe, and lookup failures. */ }
  }
  return <main className="mx-auto max-w-2xl px-6 py-16">
    <h1 className="text-3xl font-semibold">Checkout status</h1>
    {view ? <>
      <p className="mt-4">Order <strong>{view.publicReference}</strong></p>
      <p>Payment status: <strong>{statusLabel(view)}</strong></p>
      <p className="mt-3 rounded bg-amber-50 p-3">Test mode — no live payment was processed.</p>
      <h2 className="mt-8 text-xl font-semibold">Equipment</h2>
      <ul className="mt-2 list-disc pl-6">{view.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}{item.included ? " (included)" : ""}</li>)}</ul>
      <p className="mt-5 text-lg">Total: {money(view.totalCents)}</p>
      <p className="mt-5 text-sm">Webhook-confirmed payment status is authoritative. This page does not authorize or update payment.</p>
    </> : <p className="mt-4">We could not verify that Checkout Session. No order status was changed.</p>}
  </main>;
}
