import type Stripe from "stripe";
import { DEMO_FEE_CENTS } from "./benefits";

export const DEMO_PAYMENT_KIND = "demo_reservation_fee";

export type DemoPaymentRecord = {
  appointmentId: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  amountCents: number;
  currency: "usd";
};

export function buildDemoCheckoutSession(input: {
  appointmentId: string;
  customerEmail: string;
  appBaseUrl: string;
  portalToken: string;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = { payment_kind: DEMO_PAYMENT_KIND, appointment_id: input.appointmentId };
  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: DEMO_FEE_CENTS,
        product_data: {
          name: "Demo Reservation & Travel Fee",
          description: "IDS travel, equipment transportation, setup, and the reserved four-hour demonstration appointment.",
        },
      },
    }],
    customer_email: input.customerEmail,
    client_reference_id: input.appointmentId,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${input.appBaseUrl}/services-scheduling/manage/${encodeURIComponent(input.portalToken)}?payment=processing`,
    cancel_url: `${input.appBaseUrl}/services-scheduling/manage/${encodeURIComponent(input.portalToken)}?payment=cancelled`,
  };
}

export class DemoPaymentReconciliationError extends Error {}

export function isDemoPaymentMetadata(metadata: Record<string, string> | null | undefined) {
  return metadata?.payment_kind === DEMO_PAYMENT_KIND;
}

export function reconcileDemoCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "id" | "livemode" | "mode" | "payment_method_types" | "client_reference_id" | "metadata" | "currency" | "amount_total" | "payment_status" | "status" | "payment_intent">,
  record: DemoPaymentRecord,
  expectedLivemode: boolean,
) {
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  if (
    session.livemode !== expectedLivemode ||
    session.mode !== "payment" ||
    session.payment_method_types?.length !== 1 ||
    session.payment_method_types[0] !== "card" ||
    session.client_reference_id !== record.appointmentId ||
    session.metadata?.payment_kind !== DEMO_PAYMENT_KIND ||
    session.metadata?.appointment_id !== record.appointmentId ||
    session.currency !== "usd" ||
    session.amount_total !== DEMO_FEE_CENTS ||
    record.amountCents !== DEMO_FEE_CENTS ||
    record.currency !== "usd" ||
    record.stripeCheckoutSessionId !== session.id
  ) throw new DemoPaymentReconciliationError("Demo Checkout Session reconciliation failed.");
  if (session.status !== "complete" || session.payment_status !== "paid" || !paymentIntentId) {
    throw new DemoPaymentReconciliationError("Demo Checkout Session is not paid.");
  }
  if (record.stripePaymentIntentId && record.stripePaymentIntentId !== paymentIntentId) {
    throw new DemoPaymentReconciliationError("Demo PaymentIntent does not match the stored payment.");
  }
  return { paymentIntentId };
}
