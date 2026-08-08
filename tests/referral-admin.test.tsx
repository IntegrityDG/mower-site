import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createReferralAdminHandlers } from "../lib/referrals/admin-handlers";
import { displayReferralStatus, isReadyForReview, rewardForQualification, type AdminReferral } from "../lib/referrals/admin";

const id = "00000000-0000-4000-8000-000000000001";
const referral = (overrides: Partial<AdminReferral> = {}): AdminReferral => ({ id, referrerName: "Person", referrerEmail: "person@example.com", orderIdentifier: "IDS-123", brand: "Lymow", productName: "Lymow One Plus", purchaseDate: "2026-01-01T00:00:00Z", eligibleDate: "2026-01-31T00:00:00Z", status: "pending", baseRewardCents: 5000, higherTierRewardCents: 7500, finalRewardCents: null, tierApplied: null, qualifiedAt: null, paidAt: null, disqualifiedAt: null, disqualificationReason: null, orderStatus: "confirmed", paymentStatus: "paid", ...overrides });

test("unauthenticated referral admin read and mutation are rejected", async () => {
  const handlers = createReferralAdminHandlers({ isAdmin: async () => false, list: async () => [], mutate: async () => referral() });
  assert.equal((await handlers.GET()).status, 401);
  assert.equal((await handlers.PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ action: "restore" }) }), id)).status, 401);
});

test("authenticated IDS admin can read private referrals", async () => {
  const handlers = createReferralAdminHandlers({ isAdmin: async () => true, list: async () => [referral()], mutate: async () => referral() });
  const response = await handlers.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).referrals.length, 1);
});

test("pending and ready-for-review status derive from eligibility date", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  assert.equal(isReadyForReview(referral({ eligibleDate: "2026-02-02T00:00:00Z" }), now), false);
  assert.equal(displayReferralStatus(referral(), now), "ready");
});

test("qualification requires all explicit eligibility confirmations", async () => {
  let called = false;
  const handlers = createReferralAdminHandlers({ isAdmin: async () => true, list: async () => [], mutate: async () => { called = true; return referral(); } });
  const incomplete = await handlers.PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ action: "qualify", confirmations: { returnPeriodPassed: true } }) }), id);
  assert.equal(incomplete.status, 400);
  assert.equal(called, false);
  const complete = await handlers.PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ action: "qualify", confirmations: { returnPeriodPassed: true, orderCompleted: true, everydayLowPrice: true } }) }), id);
  assert.equal(complete.status, 200);
});

test("first through fifth qualifying referrals use base and sixth uses higher tier", () => {
  assert.deepEqual(rewardForQualification(5000, 7500, 0), { finalRewardCents: 5000, tierApplied: "base" });
  assert.deepEqual(rewardForQualification(5000, 7500, 4), { finalRewardCents: 5000, tierApplied: "base" });
  assert.deepEqual(rewardForQualification(5000, 7500, 5), { finalRewardCents: 7500, tierApplied: "higher" });
});

test("disqualification requires a private reason", async () => {
  const handlers = createReferralAdminHandlers({ isAdmin: async () => true, list: async () => [], mutate: async () => referral() });
  assert.equal((await handlers.PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ action: "disqualify" }) }), id)).status, 400);
});

test("migration enforces referral state, ordering, tier, paid, disqualify, and restore rules", () => {
  const sql = readFileSync("supabase/migrations/20260808120000_add_private_referral_records.sql", "utf8");
  assert.match(sql, /status in \('pending','qualified','paid','disqualified'\)/);
  assert.match(sql, /now\(\)<r\.return_period_ends_at/);
  assert.match(sql, /o\.paid_at is null/);
  assert.doesNotMatch(sql, /o\.discount_cents<>0/);
  assert.match(sql, /earlier\.status in \('qualified','paid'\)/);
  assert.doesNotMatch(sql, /earlier\.status in \([^)]*pending/);
  assert.doesNotMatch(sql, /earlier\.status in \([^)]*disqualified/);
  assert.match(sql, /earlier pending referral before qualifying this purchase/);
  assert.match(sql, /if earlier_count>=5/);
  assert.match(sql, /status='paid', paid_at=now\(\)/);
  assert.match(sql, /Only pending or qualified unpaid referrals can be disqualified/);
  assert.match(sql, /status='pending', disqualified_at=null/);
  assert.match(sql, /Only disqualified referrals can be restored/);
  assert.match(sql, /Only qualified referrals can be marked paid/);
  assert.match(sql, /revoke all on function public\.checkout_admin_list_referrals\(\) from public, anon, authenticated/);
});

test("Mark Paid requires a qualified referral and re-checks the canonical paid order", () => {
  const sql = readFileSync("supabase/migrations/20260808120000_add_private_referral_records.sql", "utf8");
  const paidBranch = sql.match(/elsif p_action='paid' then[\s\S]*?elsif p_action='disqualify' then/)?.[0] ?? "";
  assert.match(paidBranch, /r\.status<>'qualified'/);
  assert.match(paidBranch, /r\.final_reward_cents is null/);
  assert.match(paidBranch, /r\.tier_applied is null/);
  assert.match(paidBranch, /o\.order_status<>'confirmed'/);
  assert.match(paidBranch, /o\.payment_status<>'paid'/);
  assert.match(paidBranch, /o\.refunded_cents<>0/);
  assert.match(paidBranch, /o\.paid_at is null/);
  assert.match(paidBranch, /The referral cannot be marked paid/);
});

test("purchase and eligibility dates derive only from canonical paid_at", () => {
  const sql = readFileSync("supabase/migrations/20260808120000_add_private_referral_records.sql", "utf8");
  assert.doesNotMatch(sql, /select created_at from checkout_private\.orders/);
  assert.match(sql, /select paid_at from checkout_private\.orders/);
  assert.match(sql, /paid_at \+ interval '30 days'/);
  assert.match(sql, /after update of paid_at on checkout_private\.orders/);
  assert.match(sql, /where r\.purchase_date is not null and r\.return_period_ends_at is not null/);
});

test("referral-aware draft wrappers keep order and referral creation transactional and idempotent", () => {
  const sql = readFileSync("supabase/migrations/20260808120000_add_private_referral_records.sql", "utf8");
  for (const method of ["card", "ach", "wire"]) {
    assert.match(sql, new RegExp(`checkout_create_${method}_draft_with_referral`));
    assert.match(sql, new RegExp(`draft:=public\\.checkout_create_${method}_draft`));
  }
  assert.match(sql, /perform public\.checkout_upsert_referral/);
  assert.match(sql, /order_id uuid not null unique/);
  assert.match(sql, /on conflict \(order_id\)/);
  assert.match(sql, /normalized_referrer_email = excluded\.normalized_referrer_email/);
});

test("quote-only requests preserve referral identity privately without creating purchase referrals", () => {
  const flow = readFileSync("components/customer-paths/purchase/NationwidePurchaseFlow.tsx", "utf8");
  assert.match(flow, /Referred by:/);
  assert.match(flow, /Referrer email:/);
  const quoteRoute = readFileSync("app/api/quote-request/route.ts", "utf8");
  assert.doesNotMatch(quoteRoute, /checkout_private\.referrals|checkout_upsert_referral/);
});

test("public copy, helper copy, and single admin navigation are exact", () => {
  const page = readFileSync("app/referral-program/page.tsx", "utf8");
  assert.match(page, /HELP A FRIEND\. HELP YOURSELF\. GET PAID\./);
  for (const sentence of ["Tell your friends", "When they purchase", "Their qualifying purchase", "Once the 30-day return period"]) assert.match(page, new RegExp(sentence));
  for (const outcome of ["returned", "canceled", "refunded"]) assert.match(page, new RegExp(outcome));
  assert.match(readFileSync("components/customer-paths/purchase/CustomerInformation.tsx", "utf8"), /Optional — help us make sure they get credit\./);
  assert.doesNotMatch(readFileSync("app/admin/referrals/page.tsx", "utf8"), /AdminNav/);
  assert.match(readFileSync("app/admin/layout.tsx", "utf8"), /AdminNav/);
});

test("referral admin endpoints reuse existing IDS admin authentication", () => {
  for (const file of ["app/api/admin/referrals/route.ts", "app/api/admin/referrals/[id]/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /isReviewAdmin/);
  }
});
