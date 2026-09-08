import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { DEFAULT_PRICING } from "../lib/installations/policy";
import { installationBalance, installationCheckoutAmount, ledgerSnapshot } from "../lib/installations/accounting";
import { prepareAdminOperation, cumulativeWorkMinutes, type AdminState, type WorkSession } from "../lib/installations/admin-policy";
import { hasSetup, setupOvertime, serviceTravelQuote, supportDiscount } from "../lib/installations/setup";
import { validateInstallationIntake } from "../lib/installations/validation";
import { installation, payment } from "./helpers/installation-fixtures";

const now = new Date("2026-09-08T12:00:00Z");
function state(setup = false, only = false): AdminState {
  return { installation: installation({ status: "requested", internet_availability: "yes", pricing_snapshot: null, setup_selected: setup, installation_selected: !only }), ledger: {}, sessions: [], adjustments: [], payments: [], corrections: [], cashRefunds: [] };
}
function apply(s: AdminState, action: string, body = {}, defaults = DEFAULT_PRICING, syntheticEligibility = false) {
  const op = prepareAdminOperation(s, { action, operationKey: randomUUID(), reason: "IDS verified synthetic fixture", ...body }, defaults, now, syntheticEligibility);
  Object.assign(s.installation, op.patch);
  s.adjustments.push(...op.adjustments.map(a => ({ ...a, id: randomUUID(), amount_cents: a.amount_cents as number })));
  return op;
}
function balance(s: AdminState) { return installationBalance(s.installation.pricing_snapshot, s.adjustments, s.payments, s.corrections, s.cashRefunds); }
function session(minutes: number, service_type: "installation" | "setup"): WorkSession {
  return { id: randomUUID(), status: "paused", service_type, duration_minutes: Math.ceil(minutes), duration_seconds: minutes * 60, corrected_from_id: null, started_at: now.toISOString(), ended_at: now.toISOString(), notes: null };
}
for (const [setup, total, remaining] of [[false, 100000, 75000], [true, 150000, 125000]] as const) test(`one ${setup ? "combined" : "installation-only"} ledger and one credited deposit`, () => {
  const s = state(setup); apply(s, "approve"); assert.equal(balance(s).approvedChargesCents, total); assert.equal(s.installation.deposit_due_cents, 25000);
  assert.equal(installationCheckoutAmount(balance(s), "deposit", 25000), 25000);
  s.payments.push(payment()); assert.equal(balance(s).balanceDueCents, remaining); assert.equal(installationCheckoutAmount(balance(s), "deposit", 25000), 0); assert.equal(installationCheckoutAmount(balance(s), "balance", 25000), remaining);
});
for (const [minutes, travel, remaining] of [[120, 0, 125000], [150, 3500, 128500], [180, 3500, 128500], [210, 7000, 132000]]) test(`combined ${minutes}-minute one-way trip charges ${travel} cents total`, () => {
  const s = state(true); apply(s, "travel", { oneWayMinutes: minutes }); apply(s, "approve"); s.payments.push(payment());
  assert.equal(s.installation.approved_travel_charge_cents, travel); assert.equal(balance(s).balanceDueCents, remaining); assert.equal(s.installation.travel_policy, "combined_visit");
  apply(s, "travel", { oneWayMinutes: minutes }); assert.equal(balance(s).balanceDueCents, remaining);
});
test("separate Installation and Setup-only visits retain existing round-trip travel", () => {
  for (const job of [{}, { installation_selected: false, setup_selected: true }]) assert.equal(serviceTravelQuote(job, 150, DEFAULT_PRICING).approvedChargeCents, 7000);
});
test("adding Setup after Installation approval reconciles existing travel once with an audit delta", () => {
  const s=state();apply(s,"travel",{oneWayMinutes:150});apply(s,"approve");s.payments.push(payment());
  const op=apply(s,"setup",{selected:true});assert.equal(s.installation.approved_travel_charge_cents,3500);
  assert.equal(op.adjustments.find(a=>a.reconciliation_kind==="travel")?.amount_cents,-3500);
  assert.equal(balance(s).balanceDueCents,128500);assert.equal(s.payments.length,1);
  apply(s,"setup",{selected:true});assert.equal(balance(s).balanceDueCents,128500);
});
test("legacy draft receives the current Setup default on first approval, then keeps it",()=>{
  const s=state(true);const legacy={...DEFAULT_PRICING};delete legacy.setupLaborCents;s.installation.draft_pricing=legacy;
  apply(s,"approve",{},{...DEFAULT_PRICING,setupLaborCents:55000});assert.equal(s.installation.pricing_snapshot.setupLaborCents,55000);
  apply(s,"labor",{},{...DEFAULT_PRICING,setupLaborCents:60000});assert.equal(balance(s).approvedChargesCents,155000);
});
test("adding Setup to a legacy job inside 72 hours uses its newly approved price for the upfront balance",()=>{
  const s=state();const legacy={...DEFAULT_PRICING};delete legacy.setupLaborCents;s.installation.draft_pricing=legacy;s.installation.requested_start_at=new Date(now.getTime()+48*3600000).toISOString();
  apply(s,"travel",{oneWayMinutes:150});apply(s,"approve");apply(s,"setup",{selected:true},{...DEFAULT_PRICING,setupLaborCents:55000});
  assert.equal(balance(s).approvedChargesCents,158500);assert.equal(s.installation.deposit_due_cents,158500);
});
test("inside 72 hours an add-on change refreshes the full initial amount even without a travel estimate",()=>{
  const s=state();s.installation.requested_start_at=new Date(now.getTime()+48*3600000).toISOString();apply(s,"approve");apply(s,"setup",{selected:true});
  assert.equal(s.installation.deposit_due_cents,150000);apply(s,"setup",{selected:false});assert.equal(s.installation.deposit_due_cents,100000);assert.equal(s.payments.length,0);
});
for (const [minutes, cents] of [[240, 0], [240 + 1 / 60, 3125], [241, 3125], [255, 3125], [256, 6250], [300, 12500], [315, 15625]]) test(`Setup overtime at ${minutes} minutes is ${cents} cents`, () => assert.equal(setupOvertime(minutes), cents));
for (const [install, setup, installCharge, setupCharge] of [[300, 180, 12500, 0], [180, 315, 0, 15625]]) test(`separate labor buckets: Installation ${install}, Setup ${setup}`, () => {
  const s = state(true); apply(s, "approve"); s.sessions = [session(install, "installation"), session(120, "setup"), session(setup - 120, "setup")];
  apply(s, "labor"); const total = (kind: string) => s.adjustments.filter(a => a.reconciliation_kind === kind).reduce((n, a) => n + a.amount_cents, 0);
  assert.equal(total("labor"), installCharge); assert.equal(total("setup_labor"), setupCharge); assert.equal(cumulativeWorkMinutes(s.sessions, "setup"), setup);
  assert.equal(apply(s, "labor").adjustments.length, 0);
});
test("Setup removal preserves deposit, approved travel, authorized parts, and audit-ready price delta", () => {
  const s = state(true); apply(s, "travel", { oneWayMinutes: 150 }); apply(s, "approve"); s.payments.push(payment()); apply(s, "setup_materials", { actualCents: 4900 });
  const op = apply(s, "setup", { selected: false }); assert.equal(op.adjustments.find(a => a.reconciliation_kind === "setup_base")?.amount_cents, -50000);
  assert.equal(balance(s).balanceDueCents, 75000 + 3500 + 4900); assert.equal(s.installation.deposit_due_cents, 25000); assert.equal(s.payments.length, 1); assert.equal(s.installation.approved_travel_charge_cents, 3500);
  assert.equal(op.body.reason, "IDS verified synthetic fixture"); assert.equal(apply(s, "setup", { selected: false }).adjustments.length, 0);
});
test("Setup-only is a real separate service selection with no Installation charge or allowance", () => {
  const s = state(true, true); apply(s, "approve"); assert.equal(s.installation.pricing_snapshot.laborCents, 0); assert.equal(s.installation.pricing_snapshot.materialsAllowanceCents, 0);
  assert.equal(balance(s).approvedChargesCents, 50000); s.payments.push(payment()); assert.equal(balance(s).balanceDueCents, 25000);
  assert.throws(() => apply(s, "materials", { actualCents: 2000 }), /no_materials_allowance/);
  apply(s, "setup_materials", { actualCents: 2000 }); assert.equal(balance(s).approvedChargesCents, 52000);
});
test("subscriber discount applies once to Setup labor and the one travel charge, excluding parts and Installation labor", () => {
  const s = state(true); const eligible=(action:string,body={})=>apply(s,action,body,DEFAULT_PRICING,true); eligible("travel", { oneWayMinutes: 150 }); eligible("approve");
  eligible("setup_materials", { actualCents: 5000 }); assert.equal(balance(s).approvedChargesCents, 145125);
  s.sessions = [session(256, "setup")]; eligible("labor"); assert.equal(balance(s).approvedChargesCents, 145125 + 4688);
  const previous = balance(s); eligible("travel", { oneWayMinutes: 150 }); eligible("labor"); assert.deepEqual(balance(s), previous);
  assert.equal(s.installation.approved_travel_charge_cents, 2625); assert.equal(s.installation.travel_discount_cents, 875); assert.equal(supportDiscount(6250, true), 1562);
});
test("saved Setup override survives future default changes", () => {
  const s = state(true); apply(s, "approve"); apply(s, "pricing", { pricing: { ...DEFAULT_PRICING, setupLaborCents: 60000 } });
  apply(s, "travel", { oneWayMinutes: 120 }, { ...DEFAULT_PRICING, setupLaborCents: 70000 }); assert.equal(balance(s).approvedChargesCents, 160000); assert.equal(s.installation.pricing_snapshot.setupLaborCents, 60000);
});
test("legacy records never acquire a Setup charge", () => {
  const s = state(); delete s.installation.setup_selected; apply(s, "approve"); assert.equal(hasSetup(s.installation), false); assert.equal(balance(s).approvedChargesCents, 100000); assert.equal(s.adjustments.length, 0);
});
test("refunded payments and cash corrections continue through the existing shared ledger", () => {
  const s = state(true); apply(s, "approve"); s.payments.push(payment(25000, { refunded_cents: 5000, status: "partially_refunded" }));
  assert.equal(balance(s).balanceDueCents, 130000); assert.equal(ledgerSnapshot(s.installation.pricing_snapshot, s.adjustments, s.payments).pricing.laborCents, 80000);
});
test("combined cancellation uses one deposit settlement; Setup-only does not leave an invented materials balance", () => {
  const s = state(true); apply(s, "approve"); apply(s, "cancel"); assert.equal(balance(s).approvedChargesCents, 20000);
  const only = state(true, true); apply(only, "approve"); apply(only, "cancel"); assert.equal(balance(only).approvedChargesCents, 0);
});
test("setup selection must be boolean and cannot carry customer-priced charges or internal flags", () => {
  const input = { name: "Synthetic Owner", email: "owner@example.invalid", phone: "555-010-0123", address: "123 Synthetic Street", internetAvailability: "yes", startAt: "2026-10-01T14:00:00.000Z", idempotencyKey: randomUUID(), groundingAcknowledged: true, responsibilitiesAcknowledged: true, termsAcknowledged: true };
  const accepted = validateInstallationIntake({ ...input, setupSelected: true }); assert.ok(accepted.ok && accepted.value.setupSelected);
  for (const forged of [{ setupSelected: "true" }, { setupLaborCents: 1 }, { installation_selected: false }, { remote_support_eligible: true }]) assert.equal(validateInstallationIntake({ ...input, ...forged }).ok, false);
});
