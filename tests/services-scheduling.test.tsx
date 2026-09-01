import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type Stripe from "stripe";

import ServicesSchedulingPage from "../app/services-scheduling/page";
import HostPortal from "../components/services-scheduling/HostPortal";
import { APPOINTMENT_TYPE_CONFIG, APPOINTMENT_TYPES_IN_ORDER } from "../lib/scheduling/config";
import { generateAppointmentSlots } from "../lib/scheduling/availability";
import {
  DEMO_FEE_CENTS,
  MAX_FOOD_AND_DRINKS_CENTS,
  accessoryCreditApplication,
  calculateDemoPartyBenefits,
  canChangeBonusCreditElection,
  chooseMachinePricingRoute,
  guestMeetsContinuousHourRule,
  referralPurchaseIsWithinWindow,
  reserveBenefit,
} from "../lib/demo-party/benefits";
import { generatePortalToken, hashPortalToken, portalTokenHashMatches, portalTokenIsWellFormed } from "../lib/demo-party/security";
import { buildDemoCheckoutSession, DemoPaymentReconciliationError, reconcileDemoCheckoutSession } from "../lib/demo-party/stripe-policy";
import { applyDemoPartyBenefitToOrder, MINIMUM_CARD_CHECKOUT_CENTS } from "../lib/demo-party/order-benefit";
import { validateDemoAppointmentRequest } from "../lib/demo-party/validation";
import { buildCardCheckoutSession } from "../lib/stripe/checkout-session";
import { demoPartyReferralRewardForProduct, referralRewardForProduct } from "../lib/checkout/referral-rewards";
import { DEMO_PARTY_CONFIRMATION_SUMMARY, DEMO_PARTY_DISCLAIMER } from "../lib/demo-party/disclaimer";
import type { OrderPriceSnapshot } from "../lib/checkout/types";
import type { DemoPartyPortal } from "../lib/demo-party/types";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260831231030_services_scheduling_demo_party.sql");
const webhook = source("app/api/stripe/webhook/route.ts");
const portalServer = source("lib/demo-party/server.ts");
const portalPage = source("app/services-scheduling/manage/[token]/page.tsx");
const servicePage = source("app/services-scheduling/page.tsx");
const hostPortal = source("components/services-scheduling/HostPortal.tsx");
const requestForm = source("components/services-scheduling/DemoRequestForm.tsx");
const notifications = source("lib/demo-scheduling/notifications.ts");
const benefitRoute = source("app/api/services-scheduling/portal/[token]/benefits/reserve/route.ts");
const partyAdmin = source("components/services-scheduling/AdminPartyExtras.tsx");
const referralAdmin = source("app/admin/referrals/page.tsx");
const attendanceRoute = source("app/api/admin/services-scheduling/guests/[guestId]/attendance/route.ts");
const referralRoute = source("app/api/admin/services-scheduling/guests/[guestId]/referral/route.ts");
const retryRoute = source("app/api/admin/demo-scheduling/requests/[id]/retry/route.ts");
const adminOperations = source("components/services-scheduling/AdminAppointmentOperations.tsx");
const pricingResolver = source("lib/checkout/pricing-resolver.ts");
const demoCheckoutRoute = source("app/api/services-scheduling/portal/[token]/checkout/route.ts");
const originalReferralMigration = source("supabase/migrations/20260808120000_add_private_referral_records.sql");

const orderSnapshot = (overrides: Partial<OrderPriceSnapshot> = {}): OrderPriceSnapshot => ({
  currency: "usd",
  product: { id: "10000000-0000-4000-8000-000000000101", slug: "test-machine", name: "Test machine" },
  variant: null,
  purchaseMode: "standard",
  chargeableItems: [{ itemType: "product", sourceId: "10000000-0000-4000-8000-000000000101", sku: "TEST-1", name: "Test machine", description: null, quantity: 1, unitAmountCents: 495_000, extendedAmountCents: 495_000, includedInPackagePrice: false, parentSourceId: null }],
  includedPackageComponents: [],
  subtotalCents: 495_000,
  discountCents: 0,
  feeCents: 0,
  shippingCents: 0,
  taxCents: 0,
  totalCents: 495_000,
  paymentMethod: "card",
  pricedAt: "2026-09-01T00:00:00.000Z",
  catalogSources: [],
  warnings: [],
  safeMetadata: { phase: "4B2B", discountPolicy: "none" },
  ...overrides,
});

const validRequest = {
  appointmentType: "demo",
  name: "Demo Host",
  email: "host@example.com",
  phone: "555-555-1212",
  propertyAddress: "100 Main Street",
  requestedStartAt: "2026-09-14T14:00:00.000Z",
  source: "contact_ids",
  equipmentInterest: "Help Me Decide",
  notes: "North gate",
  demoFormat: "private",
  partyScreening: null,
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
  company: "",
};

test("shared appointment registry has the requested durations and activates Demo only", () => {
  assert.deepEqual(APPOINTMENT_TYPES_IN_ORDER.map(({ type, durationMinutes, active }) => [type, durationMinutes, active]), [
    ["demo", 240, true], ["install", 240, false], ["setup", 240, false], ["service", 120, false],
  ]);
  assert.equal(APPOINTMENT_TYPE_CONFIG.demo.label, "Demo");
});

test("all appointment types share one collision calendar", () => {
  const slots = generateAppointmentSlots({
    start: "2026-09-14", end: "2026-09-14", now: new Date("2026-09-01T00:00:00Z"),
    rules: [{ weekday: 1, enabled: true, start_time: "08:00", end_time: "16:00" }],
    exceptions: [], durationMinutes: 240, horizonDays: 90,
    appointments: [{ appointment_type: "install", requested_start_at: "2026-09-14T13:00:00.000Z", requested_end_at: "2026-09-14T17:00:00.000Z", status: "approved" }],
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].timeLabel, "12:00 PM");
  assert.match(migration, /demo_requests_no_overlap|demo_requests_type_calendar_idx/);
});

test("request and payment retries are serialized and reuse their original records", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_idempotency_key::text,0\)\)/);
  assert.match(migration, /where idempotency_key=p_idempotency_key for update/);
  assert.match(migration, /request_id uuid not null unique references public\.demo_requests/);
  assert.match(migration, /payment\.status='checkout_open'[\s\S]*'state','resume'/);
  assert.match(migration, /payment\.status='creating'[\s\S]*'generationKey',payment\.checkout_generation_key/);
  assert.match(demoCheckoutRoute, /idempotencyKey: `demo-checkout-\$\{String\(prepared\.generationKey\)\}`/);
  assert.match(migration, /if payment\.status in \('paid','partially_refunded','refunded'\) then\s+return jsonb_build_object\('state','paid'/);
});

test("private requests reject party fields and Demo Party requires every screening answer", () => {
  assert.equal(validateDemoAppointmentRequest(validRequest).ok, true);
  assert.equal(validateDemoAppointmentRequest({ ...validRequest, partyScreening: { certification: true } }).ok, false);
  const party = { ...validRequest, demoFormat: "party", partyScreening: { propertyRelationship: "homeowner", propertyType: "residential", mowableAcreage: 2.5, activelyConsideringPurchase: true, purchaseTimeframe: "within_30_days", equipmentBudget: "5000_to_8000", decisionMaker: true, certification: true } };
  assert.equal(validateDemoAppointmentRequest(party).ok, true);
  assert.equal(validateDemoAppointmentRequest({ ...party, partyScreening: { ...party.partyScreening, certification: false } }).ok, false);
  assert.equal(validateDemoAppointmentRequest({ ...party, annualIncome: 50_000 }).ok, false);
  assert.match(migration, /request_id uuid not null references scheduling_private\.demo_parties\(request_id\)/);
  assert.match(hostPortal, /portal\.demoFormat === "party" &&/);
});

test("benefit formulas cap qualifying guests at ten and fee refunds at the original fee", () => {
  assert.deepEqual(calculateDemoPartyBenefits(0), { qualifyingGuests: 0, feeRefundCents: 0, baseMachineDiscountCents: 0, bonusCreditCents: 0, maximumMachineDiscountCents: 0 });
  assert.deepEqual(calculateDemoPartyBenefits(1), { qualifyingGuests: 1, feeRefundCents: 2_000, baseMachineDiscountCents: 2_000, bonusCreditCents: 0, maximumMachineDiscountCents: 2_000 });
  assert.deepEqual(calculateDemoPartyBenefits(5), { qualifyingGuests: 5, feeRefundCents: 10_000, baseMachineDiscountCents: 10_000, bonusCreditCents: 0, maximumMachineDiscountCents: 10_000 });
  assert.deepEqual(calculateDemoPartyBenefits(6), { qualifyingGuests: 6, feeRefundCents: 10_000, baseMachineDiscountCents: 12_000, bonusCreditCents: 2_000, maximumMachineDiscountCents: 14_000 });
  assert.deepEqual(calculateDemoPartyBenefits(10), { qualifyingGuests: 10, feeRefundCents: 10_000, baseMachineDiscountCents: 20_000, bonusCreditCents: 10_000, maximumMachineDiscountCents: 30_000 });
  assert.deepEqual(calculateDemoPartyBenefits(999), calculateDemoPartyBenefits(10));
  assert.equal(DEMO_FEE_CENTS, 10_000);
  assert.equal(MAX_FOOD_AND_DRINKS_CENTS, 15_000);
  assert.match(servicePage, /\$100 of non-cash Bonus Credit/);
  assert.match(DEMO_PARTY_CONFIRMATION_SUMMARY, /\$20 non-cash Bonus Credit/);
  const benefitLedger = migration.slice(migration.indexOf("create table scheduling_private.demo_party_benefit_ledger"), migration.indexOf("create table scheduling_private.demo_party_benefit_events"));
  assert.doesNotMatch(benefitLedger, /expires|expiration/i);
});

test("attendance qualification requires a continuous verified hour", () => {
  assert.equal(guestMeetsContinuousHourRule("2026-09-14T16:00:00Z", "2026-09-14T16:59:59Z"), false);
  assert.equal(guestMeetsContinuousHourRule("2026-09-14T16:00:00Z", "2026-09-14T17:00:00Z"), true);
  assert.equal(guestMeetsContinuousHourRule("2026-09-14T16:20:00Z", "2026-09-14T17:19:59Z"), false);
  assert.equal(guestMeetsContinuousHourRule("2026-09-14T16:20:00Z", "2026-09-14T17:20:00Z"), true);
  assert.match(migration, /qualification_verified_at>=checked_in_at\+interval '1 hour'/);
  assert.match(migration, /now\(\)<guest\.checked_in_at\+interval '1 hour'/);
  assert.match(migration, /checked_out_at is not null and guest\.checked_out_at<guest\.checked_in_at\+interval '1 hour'/);
  assert.match(migration, /one_hour_requirement_not_met/);
  assert.match(migration, /now\(\)<request_row\.requested_start_at\+interval '2 hours'.*guest_check_in_not_open/);
  assert.match(migration, /qualification_status text not null default 'pending'/);
  assert.equal((migration.match(/set qualification_status='qualifying'/g) ?? []).length, 1);
  assert.doesNotMatch(attendanceRoute, /checkedInAt|checkedOutAt|qualificationVerifiedAt/);
  assert.match(adminOperations, /Earliest IDS qualification/);
});

test("party capacity and public operating copy distinguish attendance from the ten-guest benefit cap", () => {
  assert.match(servicePage, /first two hours belong to the host/);
  assert.match(servicePage, /Guests arrive for Hour 3/);
  assert.match(servicePage, /up to 5 large two-topping pizzas, 4 different 2-liter drinks, and a cooler of ice\. More food and drinks may be arranged for larger parties\./);
  assert.match(hostPortal, /additional guests may attend/);
  assert.doesNotMatch(hostPortal, /portal\.guests\.length < 10/);
  const addGuestRpc = migration.slice(migration.indexOf("scheduling_add_demo_party_guest"), migration.indexOf("scheduling_update_demo_party_guest"));
  assert.doesNotMatch(addGuestRpc, /guest_limit|count\(\*\)/);
});

test("new request notifications independently claim the IDS alert and customer receipt", () => {
  assert.match(notifications, /deliver\(request, "ids_new_request"/);
  assert.match(notifications, /deliver\(request, "customer_request_received"/);
  assert.match(notifications, /IDS Demo Request Received/);
  assert.match(migration, /'customer_request_received'/);
  assert.match(notifications, /Pay \$100 Demo Reservation & Travel Fee/);
  assert.match(notifications, /emailButton\("Pay \$100 Demo Reservation & Travel Fee"/);
  assert.match(notifications, /deliver\(request, type, async \(\) =>[\s\S]*token \?\? await issuePortalToken\(request\.id\)/);
  assert.match(notifications, /const \{ error: finishError \} = await client\.rpc\("demo_finish_notification"/);
  assert.match(retryRoute, /event\.status!=="sent"/);
});

test("public Demo choices and eligibility notice use the locked program wording", () => {
  assert.match(requestForm, /No — Private Demo/);
  assert.match(requestForm, /YES — Make It a Demo Party &amp; Unlock Amazing Benefits!/);
  assert.match(requestForm, /intended for property owners and authorized property managers who are genuinely evaluating autonomous lawn-care equipment for purchase/);
  assert.doesNotMatch(requestForm, /annual income|household income/i);
});

test("machine pricing uses exactly one route and MSRP only for comparison", () => {
  assert.deepEqual(chooseMachinePricingRoute({ regularMsrpCents: 500_000, promotionalOrIdsPriceCents: 480_000, baseMachineDiscountCents: 10_000, bonusCreditCents: 5_000, bonusElection: "machine" }), { route: "existing_price", priceCents: 480_000, consumedBaseCents: 0, consumedBonusCents: 0 });
  assert.deepEqual(chooseMachinePricingRoute({ regularMsrpCents: 500_000, promotionalOrIdsPriceCents: 495_000, baseMachineDiscountCents: 10_000, bonusCreditCents: 5_000, bonusElection: "machine" }), { route: "demo_party_msrp", priceCents: 485_000, consumedBaseCents: 10_000, consumedBonusCents: 5_000 });
  assert.match(servicePage, /regular MSRP and may not be combined with other manufacturer sales/);
});

test("accessory credit never exceeds eligible merchandise and benefit balance cannot double-spend", () => {
  assert.deepEqual(accessoryCreditApplication(6_000, 10_000), { appliedCents: 6_000, remainingMerchandiseCents: 0 });
  assert.deepEqual(reserveBenefit({ earnedCents: 10_000, consumedCents: 4_000, requestedCents: 6_000 }), { consumedCents: 10_000, availableCents: 0 });
  assert.throws(() => reserveBenefit({ earnedCents: 10_000, consumedCents: 4_000, requestedCents: 6_001 }), /unavailable/);
  assert.equal(canChangeBonusCreditElection(0), true);
  assert.equal(canChangeBonusCreditElection(1), false);
  assert.match(migration, /for update[\s\S]*benefit_double_spend/);
});

test("direct referrals require purchases on or after the demo and within fourteen days", () => {
  assert.equal(referralPurchaseIsWithinWindow("2026-09-14T14:00:00Z", "2026-09-28T14:00:00Z"), true);
  assert.equal(referralPurchaseIsWithinWindow("2026-09-14T14:00:00Z", "2026-09-28T14:00:01Z"), false);
  assert.equal(referralPurchaseIsWithinWindow("2026-09-14T14:00:00Z", "2026-09-14T13:59:59Z"), false);
  assert.match(migration, /requested_start_at\+interval '14 days'/);
  assert.match(migration, /order_row\.paid_at\+interval '30 days'/);
  assert.match(migration, /lower\(btrim\(coalesce\(order_row\.customer_email,''\)\)\)<>guest\.normalized_email/);
  assert.match(migration, /request_row\.status<>'approved'[\s\S]*demo_party_referral_unavailable/);
  assert.match(migration, /foreign key\(demo_party_guest_id,demo_party_request_id\)[\s\S]*references scheduling_private\.demo_party_guests\(id,request_id\)/);
  assert.match(originalReferralMigration, /order_id uuid not null unique references checkout_private\.orders/);
  const referralLink = migration.slice(migration.indexOf("scheduling_link_demo_party_referral"), migration.indexOf("Demo Party referrals are a fixed Tier 1 exception"));
  assert.doesNotMatch(referralLink, /parent_referral|upline|downline|commission_chain|recursive/i);
  assert.match(referralRoute, /paid order customer email must match the qualifying guest email/i);
  assert.match(portalServer, /demoPartyReferralRewardForProduct/);
});

test("Demo Party referrals always use Tier 1 while normal Yarbo referrals retain both authoritative tiers", () => {
  const normalYarbo = referralRewardForProduct({ id: "2", slug: "yarbo", name: "Yarbo" });
  const demoLymow = demoPartyReferralRewardForProduct({ id: "1", slug: "lymow-one-plus", name: "Lymow One Plus" });
  const demoYarbo = demoPartyReferralRewardForProduct({ id: "2", slug: "yarbo", name: "Yarbo" });
  const demoPandag = demoPartyReferralRewardForProduct({ id: "3", slug: "pandag-g1", name: "Pandag G1" });

  assert.equal(normalYarbo.baseRewardCents, 10_000);
  assert.equal(normalYarbo.higherTierRewardCents, 15_000);
  assert.deepEqual(demoLymow, { brand: "Lymow", tierOneRewardCents: 5_000 });
  assert.deepEqual(demoYarbo, { brand: "Yarbo", tierOneRewardCents: 10_000 });
  assert.deepEqual(demoPandag, { brand: "Pandag", tierOneRewardCents: 75_000 });
  assert.equal(demoYarbo.tierOneRewardCents * 10, 100_000);
  assert.equal("higherTierRewardCents" in demoYarbo, false);
  assert.deepEqual(Array.from({ length: 10 }, () => demoPartyReferralRewardForProduct({ id: "2", slug: "yarbo", name: "Yarbo" }).tierOneRewardCents), Array(10).fill(10_000));

  const demoReferralLink = migration.slice(migration.indexOf("scheduling_link_demo_party_referral"), migration.indexOf("Demo Party referrals are a fixed Tier 1 exception"));
  assert.match(demoReferralLink, /like 'yarbo%'.*tier_one_reward=10000/);
  assert.doesNotMatch(demoReferralLink, /like 'yarbo%'.*tier_one_reward=(15000|20000)/);
  assert.match(migration, /tier_one_reward,tier_one_reward/);
  assert.match(migration, /from pg_catalog\.pg_constraint constraint_row/);
  assert.match(migration, /constraint_row\.conrelid='checkout_private\.referrals'::regclass/);
  assert.match(migration, /constraint_row\.contype='c'/);
  assert.match(migration, /pg_catalog\.pg_get_constraintdef\(constraint_row\.oid\)/);
  assert.match(migration, /candidate\.definition not like '%demo_party_guest_id%'/);
  assert.match(migration, /pg_catalog\.format\([\s\S]*drop constraint %I[\s\S]*old_constraint_name/);
  assert.doesNotMatch(migration, /alter table checkout_private\.referrals\s+drop constraint referrals_higher_tier_reward_cents_check/);
  assert.match(migration, /demo_party_guest_id is not null and higher_tier_reward_cents=base_reward_cents/);
  assert.match(migration, /demo_party_guest_id is null[\s\S]*qualifying_brand='Yarbo' and higher_tier_reward_cents=15000/);
  assert.match(migration, /checkout_referrals_demo_party_tier_one_check/);
  assert.match(migration, /if r\.demo_party_guest_id is not null then\s+chosen_reward:=r\.base_reward_cents;\s+chosen_tier:='base';/);
  assert.match(migration, /benefit_type='referral_reward'[\s\S]*source_key='guest:'\|\|r\.demo_party_guest_id::text/);
  assert.match(migration, /set consumed_cents=earned_cents,\s+state='consumed'/);
  assert.match(migration, /else\s+if exists\([\s\S]*if earlier_count>=5 then chosen_reward:=r\.higher_tier_reward_cents; chosen_tier:='higher'/);
  assert.match(migration, /'isDemoParty',r\.demo_party_guest_id is not null/);
  assert.match(servicePage, /Demo Party rewards are always Tier 1: \$50 for Lymow, \$100 for Yarbo, and \$750 for Pandag/);
  assert.match(servicePage, /Ten qualifying same-brand purchases total \$500 for Lymow, \$1,000 for Yarbo, or \$7,500 for Pandag/);
  assert.match(DEMO_PARTY_CONFIRMATION_SUMMARY, /Demo Party referrals are always Tier 1/);
  assert.match(partyAdmin, /Demo Party Referral — Tier 1/);
  assert.match(partyAdmin, /Tier 2 never applies/);
  assert.match(referralAdmin, /Demo Party Referral — Tier 1 \(fixed\)/);
});

test("every customer-facing Demo Party terms surface states the fixed Tier 1 referral lock", async () => {
  const expected = "Demo Party program terms, eligibility requirements, benefits, credits, discounts, referral rewards, and availability are subject to change. Integrity Distribution Systems reserves the right to modify, suspend, or discontinue the Demo Party program or any portion of it at any time, subject to applicable law. Demo Party referral rewards are limited to the applicable IDS Tier 1 referral reward for the machine purchased, regardless of the host’s normal referral tier, lifetime referral count, or number of Demo Party referrals. Demo Party referrals do not advance to Tier 2.";
  assert.equal(DEMO_PARTY_DISCLAIMER, expected);

  const publicMarkup = renderToStaticMarkup(await ServicesSchedulingPage({ searchParams: Promise.resolve({ source: "contact_ids" }) }));
  assert.ok(publicMarkup.includes(expected), "public Demo Party rules must render the complete disclaimer");

  const applicationTerms = requestForm.slice(requestForm.indexOf('{format === "party"'), requestForm.indexOf("</fieldset>}", requestForm.indexOf('{format === "party"')));
  assert.match(applicationTerms, /Demo Party program terms acknowledgment/);
  assert.match(applicationTerms, /DEMO_PARTY_DISCLAIMER/);
  assert.match(applicationTerms, /name="certification" value="yes" required/);
  assert.match(applicationTerms, /I confirm that I own this property or am authorized/);

  const partyPortal: DemoPartyPortal = {
    appointmentId: "10000000-0000-4000-8000-000000000001",
    customerName: "Demo Host",
    customerEmail: "host@example.com",
    customerPhone: "555-555-1212",
    propertyAddress: "100 Main Street",
    requestedStartAt: "2026-09-14T14:00:00.000Z",
    requestedEndAt: "2026-09-14T18:00:00.000Z",
    equipmentInterest: "Yarbo",
    status: "approved",
    paymentStatus: "paid",
    amountPaidCents: 10_000,
    amountRefundedCents: 0,
    demoFormat: "party",
    guestArrivalAt: "2026-09-14T16:00:00.000Z",
    guestListLocked: false,
    guests: [],
    benefits: { qualifyingGuests: 0, feeRefundCents: 0, baseMachineDiscountCents: 0, bonusCreditCents: 0, maximumMachineDiscountCents: 0 },
    bonusCreditElection: null,
    bonusCreditRedeemedCents: 0,
    benefitCheckoutUrl: null,
    benefitCheckoutExpiresAt: null,
  };
  const portalMarkup = renderToStaticMarkup(<HostPortal token={"A".repeat(43)} initial={partyPortal} />);
  assert.ok(portalMarkup.includes(expected), "secure Demo Party host portal must render the complete disclaimer");
  const cancelledPortalMarkup = renderToStaticMarkup(<HostPortal token={"A".repeat(43)} initial={{ ...partyPortal, status: "cancelled" }} />);
  assert.match(cancelledPortalMarkup, /Cancelled Demo Party/);
  assert.ok(cancelledPortalMarkup.includes(expected), "cancelled Demo Party portal must retain the terms while becoming read-only");
  assert.doesNotMatch(cancelledPortalMarkup, /Pay \$100 securely|Add registered guest|Apply the guest 6/);

  assert.ok(DEMO_PARTY_CONFIRMATION_SUMMARY.includes(expected), "Demo Party confirmation copy must include the complete disclaimer");
  assert.match(notifications, /const partySummary = DEMO_PARTY_CONFIRMATION_SUMMARY/);
  assert.match(notifications, /request\.demoFormat === "party" \? `\$\{partySummary\}/);
  assert.match(notifications, /request\.demoFormat === "party" \? `<p>\$\{escapeHtml\(partySummary\)\}<\/p>`/);

  const customerFacingCopy = [servicePage, requestForm, hostPortal, notifications, DEMO_PARTY_CONFIRMATION_SUMMARY, DEMO_PARTY_DISCLAIMER].join("\n");
  assert.doesNotMatch(customerFacingCopy, /(?:can|may|will|could|does|do)\s+(?:advance|progress|escalate)\s+to Tier 2/i);
  assert.doesNotMatch(customerFacingCopy, /eligible (?:for|to receive) (?:a |the )?(?:higher tier|Tier 2)/i);
});

test("portal bearer tokens have 256 bits of entropy and only hashes reach storage RPCs", () => {
  const token = generatePortalToken();
  const hash = hashPortalToken(token);
  assert.equal(portalTokenIsWellFormed(token), true);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(portalTokenHashMatches(token, hash), true);
  assert.equal(portalTokenHashMatches(generatePortalToken(), hash), false);
  assert.match(portalServer, /p_token_hash: hashPortalToken\(token\)/);
  assert.doesNotMatch(migration, /raw_token|portal_token text/);
});

test("Demo Checkout is server-fixed to one $100 card line item and contains no guest data", () => {
  const params = buildDemoCheckoutSession({ appointmentId: "10000000-0000-4000-8000-000000000001", customerEmail: "host@example.com", appBaseUrl: "https://ids.example", portalToken: "A".repeat(43) });
  assert.equal(params.mode, "payment");
  assert.deepEqual(params.payment_method_types, ["card"]);
  assert.equal(params.line_items?.[0]?.price_data?.unit_amount, 10_000);
  assert.deepEqual(params.metadata, { payment_kind: "demo_reservation_fee", appointment_id: "10000000-0000-4000-8000-000000000001" });
  assert.doesNotMatch(JSON.stringify(params.metadata), /guest|token|screening/i);
});

test("Stripe reconciliation accepts only the stored Demo Session identity and amount", () => {
  const record = { appointmentId: "10000000-0000-4000-8000-000000000001", stripeCheckoutSessionId: "cs_demo", stripePaymentIntentId: null, amountCents: 10_000, currency: "usd" as const, status: "checkout_open" as const };
  const session = { id: "cs_demo", livemode: false, mode: "payment", payment_method_types: ["card"], client_reference_id: record.appointmentId, metadata: { payment_kind: "demo_reservation_fee", appointment_id: record.appointmentId }, currency: "usd", amount_total: 10_000, payment_status: "paid", status: "complete", payment_intent: "pi_demo" } as unknown as Stripe.Checkout.Session;
  assert.deepEqual(reconcileDemoCheckoutSession(session, record, false), { paymentIntentId: "pi_demo" });
  assert.throws(() => reconcileDemoCheckoutSession({ ...session, amount_total: 9_999 }, record, false), DemoPaymentReconciliationError);
  assert.throws(() => reconcileDemoCheckoutSession({ ...session, metadata: { payment_kind: "product_order" } }, record, false), DemoPaymentReconciliationError);
});

test("signed webhook handling isolates Demo payments before product-order handlers", () => {
  assert.match(webhook, /constructEvent\(await request\.text\(\),signature,getStripeWebhookSecret\(\)\)/);
  assert.match(webhook, /isDemoPaymentMetadata\(session\.metadata\)\|\|await readDemoPaymentBySession/);
  assert.match(webhook, /reconcileDemoCheckoutSession/);
  assert.match(webhook, /notifyDemoPaymentConfirmed/);
  assert.doesNotMatch(source("app/api/services-scheduling/portal/[token]/checkout/route.ts"), /applyDemoPayment|payment_status.*paid/);
});

test("private scheduling tables are forced-RLS and browser roles receive no table or RPC access", () => {
  for (const table of ["appointment_portal_tokens", "demo_payments", "demo_parties", "demo_party_guests", "demo_party_benefit_ledger", "demo_refund_attempts", "appointment_audit_events"]) {
    assert.match(migration, new RegExp(`alter table scheduling_private\\.${table} force row level security`));
  }
  assert.match(migration, /revoke all on all tables in schema scheduling_private from public,anon,authenticated,service_role/);
  assert.match(migration, /revoke all on function public\.scheduling_create_demo_request[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.scheduling_create_demo_request[\s\S]*to service_role/);
});

test("portal is dynamic, no-index, no-referrer, and token-scopes all customer writes", () => {
  assert.match(portalPage, /dynamic = "force-dynamic"/);
  assert.match(portalPage, /robots: \{ index: false, follow: false, nocache: true \}/);
  assert.match(portalPage, /referrer: "no-referrer"/);
  for (const rpc of ["scheduling_add_demo_party_guest", "scheduling_update_demo_party_guest", "scheduling_delete_demo_party_guest", "scheduling_set_demo_party_bonus_election"]) assert.match(portalServer, new RegExp(rpc));
  assert.match(migration, /token\.token_hash=p_token_hash and token\.revoked_at is null/);
});

test("refund is explicit, idempotent, capped by earned benefit, and never automatic on qualification", () => {
  const refundRoute = source("app/api/admin/services-scheduling/appointments/[id]/refund/route.ts");
  assert.match(refundRoute, /REFUND EARNED DEMO FEE/);
  assert.match(refundRoute, /refunds\.create/);
  assert.match(refundRoute, /idempotencyKey: String\(prepared\.idempotencyKey\)/);
  assert.match(migration, /target_cents:=least\(payment\.paid_cents,benefit\.earned_cents\)/);
  const attendanceSection = migration.slice(migration.indexOf("scheduling_admin_update_demo_party_guest"), migration.indexOf("scheduling_prepare_demo_checkout"));
  assert.doesNotMatch(attendanceSection, /stripe|refunds?\.create/);
});

test("the additive migration preserves existing appointment timestamps during backfill", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
  assert.match(migration, /duration_minutes=greatest\(1,round\(extract\(epoch from \(requested_end_at-requested_start_at\)\)\/60\)/);
  assert.doesNotMatch(migration, /set requested_start_at|set requested_end_at|drop table public\.demo_requests|truncate/i);
});

test("machine benefit checkout reprices from authoritative MSRP and consumes at most $300", () => {
  const result = applyDemoPartyBenefitToOrder({ snapshot: orderSnapshot(), appointmentId: "10000000-0000-4000-8000-000000000001", baseMachineDiscountCents: 20_000, bonusCreditCents: 10_000, application: "machine", regularMachineMsrpCents: 500_000 });
  assert.equal(result.state, "apply");
  if (result.state !== "apply") return;
  assert.equal(result.benefitCents, 30_000);
  assert.equal(result.snapshot.subtotalCents, 500_000);
  assert.equal(result.snapshot.totalCents, 470_000);
  assert.deepEqual(result.snapshot.safeMetadata, { phase: "demo-party-v1", pricingRoute: "msrp_machine", appointmentId: "10000000-0000-4000-8000-000000000001", benefitCents: 30_000, regularMsrpCents: 500_000 });
});

test("an equal-or-better IDS machine price wins without consuming Demo Party benefit", () => {
  const snapshot = orderSnapshot({ chargeableItems: [{ ...orderSnapshot().chargeableItems[0], unitAmountCents: 470_000, extendedAmountCents: 470_000 }], subtotalCents: 470_000, totalCents: 470_000 });
  const result = applyDemoPartyBenefitToOrder({ snapshot, appointmentId: "10000000-0000-4000-8000-000000000001", baseMachineDiscountCents: 20_000, bonusCreditCents: 10_000, application: "machine", regularMachineMsrpCents: 500_000 });
  assert.equal(result.state, "existing_price_wins");
  assert.equal(result.benefitCents, 0);
  assert.equal(result.snapshot, snapshot);
});

test("accessory credit is accessory-only, nonnegative, and safely leaves a payable card total", () => {
  const accessory = orderSnapshot({ purchaseMode: "accessories", chargeableItems: [{ ...orderSnapshot().chargeableItems[0], itemType: "option", unitAmountCents: 6_000, extendedAmountCents: 6_000 }], subtotalCents: 6_000, totalCents: 6_000 });
  const result = applyDemoPartyBenefitToOrder({ snapshot: accessory, appointmentId: "10000000-0000-4000-8000-000000000001", baseMachineDiscountCents: 0, bonusCreditCents: 10_000, application: "accessories", regularMachineMsrpCents: null });
  assert.equal(result.state, "apply");
  if (result.state !== "apply") return;
  assert.equal(result.benefitCents, 5_950);
  assert.equal(result.snapshot.totalCents, MINIMUM_CARD_CHECKOUT_CENTS);
  const largerAccessory = orderSnapshot({ purchaseMode: "accessories", chargeableItems: [{ ...orderSnapshot().chargeableItems[0], itemType: "option", unitAmountCents: 15_000, extendedAmountCents: 15_000 }], subtotalCents: 15_000, totalCents: 15_000 });
  const fullCredit = applyDemoPartyBenefitToOrder({ snapshot: largerAccessory, appointmentId: "10000000-0000-4000-8000-000000000001", baseMachineDiscountCents: 0, bonusCreditCents: 10_000, application: "accessories", regularMachineMsrpCents: null });
  assert.equal(fullCredit.benefitCents, 10_000);
  assert.equal(fullCredit.snapshot.totalCents, 5_000);
  assert.throws(() => applyDemoPartyBenefitToOrder({ snapshot: orderSnapshot(), appointmentId: "x", baseMachineDiscountCents: 0, bonusCreditCents: 1_000, application: "accessories", regularMachineMsrpCents: null }), /accessory-only/);
  assert.throws(() => applyDemoPartyBenefitToOrder({ snapshot: orderSnapshot({ discountCents: 100, totalCents: 494_900 }), appointmentId: "x", baseMachineDiscountCents: 1_000, bonusCreditCents: 0, application: "machine", regularMachineMsrpCents: 500_000 }), /cannot stack/);
  assert.match(pricingResolver, /option\.accessory_listing_enabled !== true/);
  assert.match(pricingResolver, /option\.accessory_action_type !== "builder"/);
  assert.match(pricingResolver, /ACCESSORY_BLOCKLIST\.has\(option\.option_slug\)/);
  assert.match(pricingResolver, /purchaseMode: "accessories"/);
});

test("private server coupon is the only way discounted line totals reach Stripe", () => {
  const applied = applyDemoPartyBenefitToOrder({ snapshot: orderSnapshot(), appointmentId: "10000000-0000-4000-8000-000000000001", baseMachineDiscountCents: 20_000, bonusCreditCents: 0, application: "machine", regularMachineMsrpCents: 500_000 });
  assert.equal(applied.state, "apply");
  if (applied.state !== "apply") return;
  const params = buildCardCheckoutSession({ snapshot: applied.snapshot, orderId: "10000000-0000-4000-8000-000000000201", attemptId: "10000000-0000-4000-8000-000000000202", publicReference: "IDS-TEST-ORDER", customerEmail: "host@example.com", appBaseUrl: "https://ids.example", signingSecret: "s".repeat(32), returnPath: "/equipment/test-machine", cancelExpiresAt: Date.now() + 60_000, serverDiscount: { couponId: "demo_party_private_1", amountCents: 20_000 } });
  assert.deepEqual(params.discounts, [{ coupon: "demo_party_private_1" }]);
  assert.throws(() => buildCardCheckoutSession({ snapshot: applied.snapshot, orderId: "10000000-0000-4000-8000-000000000201", attemptId: "10000000-0000-4000-8000-000000000202", publicReference: "IDS-TEST-ORDER", customerEmail: null, appBaseUrl: "https://ids.example", signingSecret: "s".repeat(32), returnPath: "/equipment", cancelExpiresAt: Date.now() + 60_000, serverDiscount: { couponId: "public-code", amountCents: 20_000 } }), /Invalid server-authorized/);
});

test("benefit replacement checkout is transactional, idempotent, and service-role only", () => {
  assert.match(migration, /create function public\.scheduling_prepare_demo_party_benefit_checkout/);
  assert.match(migration, /where id=p_old_attempt_id and order_id=order_row\.id for update/);
  assert.match(migration, /order_row\.updated_at is distinct from p_expected_updated_at/);
  assert.match(migration, /benefit\.earned_cents-benefit\.consumed_cents,'existing_price_wins'/);
  assert.match(migration, /demo_party_one_active_(?:base|bonus)_redemption_idx/);
  assert.match(migration, /where benefit_type='bonus_credit' and state='reserved'/);
  assert.match(migration, /order_row\.subtotal_cents::integer - case when is_accessory_order then 50 else 0 end/);
  assert.match(migration, /revoke all on function public\.scheduling_apply_demo_party_benefit_checkout[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.scheduling_apply_demo_party_benefit_checkout[\s\S]*to service_role/);
  assert.match(benefitRoute, /max_redemptions: 1/);
  assert.match(benefitRoute, /idempotencyKey: String\(prepared\.stripeIdempotencyKey\)/);
});

test("product payment webhooks consume benefits only after paid reconciliation and release the checkout link on expiry", () => {
  assert.match(webhook, /applyCardEventV2[\s\S]*finalizeDemoPartyOrderBenefits\(record\.orderId, record\.attemptId, "paid"\)/);
  assert.match(webhook, /reconcileExpiredSession[\s\S]*finalizeDemoPartyOrderBenefits\(record\.orderId, record\.attemptId, "expired"\)/);
  const finalize = migration.slice(migration.indexOf("scheduling_finalize_demo_party_order_benefits"), migration.indexOf("scheduling_link_demo_party_referral"));
  assert.match(finalize, /if p_event='paid'/);
  assert.match(finalize, /state='applied',applied_at=now\(\)/);
  assert.match(finalize, /checkout_attempt_id=null,stripe_checkout_session_id=null/);
});

test("guest identity, attendance bounds, and referral cap are enforced in SQL", () => {
  assert.match(migration, /unique\(request_id,normalized_email\)/);
  assert.match(migration, /unique\(id,request_id\)/);
  assert.match(migration, /requested_start_at\+interval '2 hours'.*guest_check_in_not_open/);
  assert.match(migration, /requested_end_at-interval '1 hour'.*guest_check_in_too_late/);
  assert.match(migration, /order by qualification_verified_at,id\s+limit 10/);
  assert.match(migration, /guest_outside_qualifying_cap/);
  assert.match(migration, /guest_has_linked_referral/);
  assert.match(attendanceRoute, /linked Demo Party referral/);
  assert.match(migration, /create unique index checkout_referrals_demo_party_guest_unique\s+on checkout_private\.referrals\(demo_party_guest_id\)/);
});

test("admin attendance changes refresh the separate party referral workflow", () => {
  assert.match(adminOperations, /ids:appointment-detail-updated/);
  assert.match(partyAdmin, /addEventListener\("ids:appointment-detail-updated", refresh\)/);
  assert.equal((partyAdmin.match(/if \(response\.ok\) await load\(\)/g) ?? []).length, 2);
});

test("portal benefit operations reject cross-customer order references at every mutation stage", () => {
  assert.equal((migration.match(/order_customer_mismatch/g) ?? []).length, 3);
  assert.match(migration, /lower\(btrim\(coalesce\(customer_email,''\)\)\)=host_email for update/);
  assert.match(migration, /token\.token_hash=p_token_hash and token\.revoked_at is null/);
  assert.match(benefitRoute, /readDemoPartyPortal\(token\)/);
});

test("Demo approval and payment remain separate server-authoritative states", () => {
  const demoCheckoutRoute = source("app/api/services-scheduling/portal/[token]/checkout/route.ts");
  assert.match(migration, /request_row\.status<>'approved'.*payment_not_approved/);
  assert.match(migration, /check \(status in \('not_started','creating','checkout_open','paid','partially_refunded','refunded'\)\)/);
  assert.match(demoCheckoutRoute, /getStripeConfiguration\(\)/);
  assert.doesNotMatch(demoCheckoutRoute, /new URL\(request\.url\)|payment_status.*paid|applyDemoPayment/);
  assert.match(webhook, /reconcileDemoCheckoutSession[\s\S]*applyDemoPayment/);
});
