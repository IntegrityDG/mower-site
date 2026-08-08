import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { notifyReviewSubmitted } from "../lib/reviews/notification";
import { paymentNotificationEventKey, refundNotificationSemanticId } from "../lib/notifications/notification-keys";

test("new review notification is attempted after storage and contains moderation details", async () => {
  const messages: Array<{ subject: string; text: string }> = [];
  await notifyReviewSubmitted({ firstName: "A", lastName: "Buyer", email: "a@example.com", state: "Missouri", product: "Yarbo", overallRating: 4, easeRating: 5, speedRating: 4, priceRating: 3, supportRating: null, writtenReview: "Useful mower", publishingConsent: true, contactConsent: false }, async (input) => { messages.push(input); return {} as never; });
  assert.equal(messages[0]?.subject, "IDS Website — New Review Submitted");
  assert.match(messages[0]?.text ?? "", /A Buyer[\s\S]*Missouri[\s\S]*Yarbo[\s\S]*Overall rating: 4[\s\S]*Useful mower[\s\S]*\/admin\/reviews/);
  const route = readFileSync("app/api/reviews/route.ts", "utf8");
  assert.ok(route.indexOf("if (error)") < route.indexOf("notifyReviewSubmitted(value)"));
});

test("review email failure does not fail the accepted submission notification step", async () => {
  await assert.doesNotReject(() => notifyReviewSubmitted({ firstName: "A", lastName: "Buyer", email: "a@example.com", state: "Missouri", product: "Yarbo", overallRating: 4, easeRating: 5, speedRating: 4, priceRating: 3, supportRating: null, writtenReview: "", publishingConsent: true }, async () => { throw new Error("offline"); }));
});

test("existing normal and Pandag lead notifications remain", () => {
  assert.match(readFileSync("app/api/quote-request/route.ts", "utf8"), /sendLeadEmail\(summary\)/);
  assert.match(readFileSync("app/api/pandag/project-quote/route.ts", "utf8"), /sendLeadEmail\(/);
  assert.match(readFileSync("lib/email.ts", "utf8"), /sendLeadEmail[\s\S]*sendIdsNotification/);
});

test("payment business outcomes use semantic outbox keys and skip expiration", () => {
  const source = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
  assert.match(source, /type: "ach_processing"/);
  assert.match(source, /type: "paid"/);
  assert.match(source, /type: "payment_failed"/);
  assert.match(source, /const cumulativeRefunded = event\.type === "charge\.refunded" \? \(stripeObject as Stripe\.Charge\)\.amount_refunded : null/);
  assert.match(source, /type: kind, semanticId: kind === "refund" \? refundNotificationSemanticId\(cumulativeRefunded!\)/);
  assert.doesNotMatch(source, /type: "expired"/);
  const notifications = readFileSync("lib/notifications/payment-notifications.ts", "utf8");
  assert.match(notifications, /paymentNotificationEventKey\(input\)/);
  assert.match(notifications, /if \(!claim\.claimed\) return "skipped"/);
  assert.match(notifications, /context\.orderStatus === "confirmed" && context\.paymentStatus === "paid"/);
  assert.match(notifications, /context\.paymentMethod === "ach_debit" && context\.paymentStatus === "processing"/);
});

test("payment content uses canonical context, includes referral, and isolates send failures", () => {
  const source = readFileSync("lib/notifications/payment-notifications.ts", "utf8");
  assert.match(source, /REFERRAL ATTACHED/);
  assert.match(source, /Referrer name:/);
  assert.match(source, /Referrer email:/);
  for (const field of ["subtotalCents", "discountCents", "taxCents", "shippingCents", "totalCents", "refundedCents"]) assert.match(source, new RegExp(`context\\.${field}`));
  assert.match(source, /catch \{ console\.error\("Payment notification failed"/);
  const webhook = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
  assert.match(webhook, /await applyCardEventV2\([\s\S]*?await notifyPaymentBusinessEvent\(\{ orderId: record\.orderId, type: "paid" \}\)/);
});

test("notification ledger is private, retryable, and service-role only", () => {
  const sql = readFileSync("supabase/migrations/20260808230000_create_private_notification_outbox.sql", "utf8");
  assert.match(sql, /event_key text not null unique/);
  assert.match(sql, /status in \('pending','sent','failed'\)/);
  assert.match(sql, /if e\.status='failed'/);
  assert.match(sql, /attempt_count=attempt_count\+1/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table checkout_private\.notification_events from public,anon,authenticated/);
  assert.match(sql, /grant select,insert,update on table checkout_private\.notification_events to service_role/);
  assert.doesNotMatch(sql, /grant .* to anon|grant .* to authenticated/);
});

test("fresh pending notification cannot be claimed twice", () => {
  const sql = readFileSync("supabase/migrations/20260808230000_create_private_notification_outbox.sql", "utf8");
  assert.match(sql, /e\.status='pending' and e\.claimed_at <= now\(\) - interval '10 minutes'/);
  assert.match(sql, /return jsonb_build_object\('claimed',false,'eventId',e\.id,'claimedAt',e\.claimed_at\)/);
  assert.match(sql, /where event_key=p_event_key for update/);
});

test("stale pending notification can be reclaimed and increments its attempt count", () => {
  const sql = readFileSync("supabase/migrations/20260808230000_create_private_notification_outbox.sql", "utf8");
  assert.match(sql, /claimed_at timestamptz not null default now\(\)/);
  assert.match(sql, /e\.claimed_at <= now\(\) - interval '10 minutes'/);
  assert.match(sql, /attempt_count=attempt_count\+1,claimed_at=now\(\),last_error=null,updated_at=now\(\)/);
  assert.match(sql, /'claimedAt',e\.claimed_at/);
  assert.match(sql, /where id=p_event_id and status='pending' and claimed_at=p_claimed_at/);
});

test("sent notification cannot be reclaimed while failed notification can be retried", () => {
  const sql = readFileSync("supabase/migrations/20260808230000_create_private_notification_outbox.sql", "utf8");
  const reclaimCondition = sql.match(/if (.+) then\r?\n\s+update checkout_private\.notification_events set status='pending'/)?.[1] ?? "";
  assert.match(reclaimCondition, /e\.status='failed'/);
  assert.match(reclaimCondition, /e\.status='pending'/);
  assert.doesNotMatch(reclaimCondition, /e\.status='sent'/);
});

test("equal-sized refunds use distinct cumulative states and duplicate states stay idempotent", () => {
  const orderId = "order-1";
  const firstState = refundNotificationSemanticId(5_000);
  const secondEqualRefundState = refundNotificationSemanticId(10_000);
  const firstKey = paymentNotificationEventKey({ orderId, type: "refund", semanticId: firstState });
  const secondKey = paymentNotificationEventKey({ orderId, type: "refund", semanticId: secondEqualRefundState });
  const duplicateFirstKey = paymentNotificationEventKey({ orderId, type: "refund", semanticId: refundNotificationSemanticId(5_000) });
  assert.notEqual(firstKey, secondKey);
  assert.equal(firstKey, duplicateFirstKey);
  assert.equal(firstKey, "order:order-1:refund:cumulative-5000");
});
