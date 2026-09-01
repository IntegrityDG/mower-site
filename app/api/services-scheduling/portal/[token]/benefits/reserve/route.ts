import Stripe from "stripe";
import { linkCheckoutSession } from "@/lib/checkout/order-repository";
import type { OrderPriceSnapshot } from "@/lib/checkout/types";
import { applyDemoPartyBenefitToOrder } from "@/lib/demo-party/order-benefit";
import {
  applyDemoPartyBenefitCheckout,
  linkDemoPartyBenefitCheckout,
  prepareDemoPartyBenefitCheckout,
  readDemoPartyPortal,
  releaseDemoPartyOrderReservations,
  reserveDemoPartyBenefit,
} from "@/lib/demo-party/server";
import { getStripeConfiguration } from "@/lib/stripe/config";
import { buildCardCheckoutSession } from "@/lib/stripe/checkout-session";
import { getStripeServerClient } from "@/lib/stripe/server";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

async function ensurePrivateCoupon(id: string, amountCents: number, appointmentId: string, orderId: string) {
  const stripe = getStripeServerClient();
  let coupon: Stripe.Coupon | null = null;
  try { coupon = await stripe.coupons.retrieve(id); }
  catch (error) {
    if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== "resource_missing") throw error;
  }
  if (!coupon) coupon = await stripe.coupons.create({ id, amount_off: amountCents, currency: "usd", duration: "once", max_redemptions: 1, name: "IDS Demo Party benefit", metadata: { appointment_id: appointmentId, order_id: orderId, private_server_authorized: "true" } });
  if (coupon.deleted || coupon.amount_off !== amountCents || coupon.currency !== "usd" || coupon.duration !== "once" || coupon.max_redemptions !== 1) throw new Error("Demo Party coupon identity mismatch.");
  return coupon;
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2_000) return Response.json({ error: "Request is too large." }, { status: 413, headers: noStore });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const orderReference = typeof body?.orderReference === "string" ? body.orderReference.trim() : "";
  const benefitType = body?.benefitType;
  const application = body?.application;
  if (!/^[A-Za-z0-9-]{4,80}$/.test(orderReference) || !["base_machine_discount", "bonus_credit"].includes(benefitType) || !["accessories", "machine"].includes(application)) return Response.json({ error: "Choose an eligible benefit and enter the IDS order reference." }, { status: 400, headers: noStore });
  if (benefitType === "base_machine_discount" && application !== "machine") return Response.json({ error: "The base benefit applies only to one eligible machine." }, { status: 400, headers: noStore });
  const { token } = await context.params;
  try {
    const portal = await readDemoPartyPortal(token);
    if (!portal) return Response.json({ error: "This secure link is invalid." }, { status: 404, headers: noStore });
    await reserveDemoPartyBenefit(token, orderReference, benefitType, application);
    if (benefitType === "base_machine_discount" && application === "machine" && portal.bonusCreditElection === "machine" && portal.benefits.bonusCreditCents > 0) {
      await reserveDemoPartyBenefit(token, orderReference, "bonus_credit", "machine");
    }
    let prepared = await prepareDemoPartyBenefitCheckout(token, orderReference);
    if (prepared.state === "resume") return Response.json({ state: "checkout", checkoutUrl: prepared.checkoutUrl, message: "Your server-authorized benefit checkout is ready." }, { headers: noStore });
    if (prepared.state === "prepare") {
      const originalSnapshot = prepared.snapshot as OrderPriceSnapshot;
      const result = prepared.pricingApplied
        ? { state: "apply" as const, snapshot: originalSnapshot, benefitCents: Number(originalSnapshot.discountCents), machineOrderItemSourceId: null, machineUnitAmountCents: null }
        : applyDemoPartyBenefitToOrder({ snapshot: originalSnapshot, appointmentId: String(prepared.appointmentId), baseMachineDiscountCents: Number(prepared.baseReservedCents), bonusCreditCents: Number(prepared.bonusReservedCents), application: prepared.application as "machine" | "accessories", regularMachineMsrpCents: prepared.regularMachineMsrpCents === null ? null : Number(prepared.regularMachineMsrpCents) });
      if (result.state === "existing_price_wins") {
        await releaseDemoPartyOrderReservations(token, orderReference);
        return Response.json({ state: "existing_price_wins", message: "The current IDS/promotional machine price is already better than the Demo Party MSRP route, so no Demo Party credit was consumed." }, { headers: noStore });
      }
      if (prepared.activeSessionId) {
        const oldSession = await getStripeServerClient().checkout.sessions.retrieve(String(prepared.activeSessionId));
        if (oldSession.status === "complete") throw new Error("old_checkout_already_completed");
        if (oldSession.status === "open") await getStripeServerClient().checkout.sessions.expire(oldSession.id);
      }
      prepared = await applyDemoPartyBenefitCheckout(token, { orderReference, expectedUpdatedAt: String(prepared.updatedAt), snapshot: result.snapshot, machineOrderItemId: prepared.machineOrderItemId ? String(prepared.machineOrderItemId) : null, machineUnitCents: result.machineUnitAmountCents, oldAttemptId: prepared.activeAttemptId ? String(prepared.activeAttemptId) : null });
    }
    if (prepared.state !== "create") throw new Error("Unexpected benefit checkout state.");
    const snapshot = prepared.snapshot as OrderPriceSnapshot;
    const orderId = String(prepared.orderId);
    const attemptId = String(prepared.attemptId);
    const couponId = `demo_party_${orderId.replaceAll("-", "")}_${attemptId.replaceAll("-", "").slice(0, 12)}`;
    await ensurePrivateCoupon(couponId, Number(prepared.benefitCents), snapshot.safeMetadata.phase === "demo-party-v1" ? snapshot.safeMetadata.appointmentId : "", orderId);
    const config = getStripeConfiguration();
    const createdAt = Date.parse(String(prepared.attemptCreatedAt));
    const session = await getStripeServerClient().checkout.sessions.create(buildCardCheckoutSession({ snapshot, orderId, attemptId, publicReference: String(prepared.publicReference), customerEmail: prepared.customerEmail ? String(prepared.customerEmail) : null, appBaseUrl: config.appBaseUrl, signingSecret: config.checkoutSigningSecret, returnPath: `/equipment/${snapshot.product.slug}`, cancelExpiresAt: createdAt + 30 * 60_000, serverDiscount: { couponId, amountCents: Number(prepared.benefitCents) } }), { idempotencyKey: String(prepared.stripeIdempotencyKey) });
    if (!session.url) throw new Error("benefit_checkout_missing_url");
    await linkCheckoutSession(attemptId, { id: session.id, payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null, status: session.status, payment_status: session.payment_status, created: session.created, expires_at: session.expires_at });
    const expiresAt = new Date(session.expires_at * 1000).toISOString();
    await linkDemoPartyBenefitCheckout(token, { attemptId, sessionId: session.id, checkoutUrl: session.url, expiresAt });
    return Response.json({ state: "checkout", checkoutUrl: session.url, message: "Your private Demo Party benefit is applied to this replacement checkout." }, { status: 201, headers: noStore });
  } catch (error) {
    const code=String((error as{message?:string})?.message??"");
    const message = /requires_card/i.test(code) ? "Demo Party website benefits currently require the card checkout route for the canonical order."
      : /minimum(?:_| )card|below_minimum/i.test(code) ? "Add more eligible accessory merchandise so the private card checkout remains payable; unused Bonus Credit stays available."
      : /non_stacking|double_spend|already_linked|committed/i.test(code) ? "That benefit is already reserved or another machine discount route is active."
      : /order_type|election|base_discount_machine/i.test(code) ? "The order does not match the elected benefit route."
      : /msrp/i.test(code) ? "IDS must review the authoritative MSRP for this machine before applying the Demo Party route."
      : /stale_benefit_order/i.test(code) ? "The order changed while the benefit was being applied. Retry from this secure page."
      : "The benefit could not be applied to that order.";
    return Response.json({ error: message }, { status: 409, headers: noStore });
  }
}
