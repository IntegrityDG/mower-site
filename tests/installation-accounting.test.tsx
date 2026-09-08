import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { installationBalance, installationCheckoutAmount, type InstallationPayment } from "../lib/installations/accounting";
import { chicagoTimeToUtc, dollarsToCents, validateCashReceipt } from "../lib/installations/cash-validation";
import { DEFAULT_PRICING } from "../lib/installations/policy";
import InstallationBalanceSummary from "../components/installations/InstallationBalanceSummary";
import RecordCashPayment from "../components/installations/RecordCashPayment";
import { installationId, payment, receipt } from "./helpers/installation-fixtures";

const cash = (amount: number) => payment(amount, { id: "cash", method: "cash", purpose: "cash" });
export const accountingExamples = [
  { name: "A: Stripe deposit", payments: [payment()], adjustments: [], paid: 25000, due: 75000, credit: 0 },
  { name: "B: Stripe deposit plus full cash balance", payments: [payment(), cash(75000)], adjustments: [], paid: 100000, due: 0, credit: 0 },
  { name: "C: partial cash balance", payments: [payment(), cash(5000)], adjustments: [], paid: 30000, due: 70000, credit: 0 },
  { name: "D: partially refunded deposit retains its remaining credit", payments: [payment(25000, { status: "partially_refunded", refunded_cents: 5000 })], adjustments: [], paid: 20000, due: 80000, credit: 0 },
  { name: "E: materials credit before refund", payments: [payment(100000)], adjustments: [{ id: "credit", amount_cents: -6000 }], paid: 100000, due: 0, credit: 6000 },
  { name: "E: completed refund after materials credit", payments: [payment(100000, { status: "partially_refunded", refunded_cents: 6000 })], adjustments: [{ id: "credit", amount_cents: -6000 }], paid: 94000, due: 0, credit: 0 },
];
for (const example of accountingExamples) test(example.name, () => {
  const b = installationBalance(DEFAULT_PRICING, example.adjustments, example.payments);
  assert.equal(b.netPaidCents, example.paid); assert.equal(b.balanceDueCents, example.due); assert.equal(b.customerCreditCents, example.credit);
  assert.equal(installationCheckoutAmount(b, "balance", 25000), example.due);
  const html = renderToStaticMarkup(<InstallationBalanceSummary balance={b}/>);
  assert.match(html, /Approved charges/); assert.match(html, /Net payments recorded/);
  if (example.credit) assert.match(html, /Customer credit \/ refund due.*\$60\.00/);
  if (example.name.startsWith("C:")) assert.match(html, /Partial payment/);
});
test("deposit checkout charges only the remaining deposit requirement", () => {
  assert.equal(installationCheckoutAmount(installationBalance(DEFAULT_PRICING, [], [cash(10000)]), "deposit", 25000), 15000);
  assert.equal(installationCheckoutAmount(installationBalance(DEFAULT_PRICING, [], [payment()]), "deposit", 25000), 0);
});
test("pending and failed attempts are not received; pending refunds are separate; linked completed mirrors do not double subtract", () => {
  const original = payment(25000, { status: "partially_refunded", refunded_cents: 5000 });
  const pending = payment(2000, { id: "pending-refund", purpose: "refund", status: "pending", paid_at: null, original_payment_id: original.id });
  const mirror = payment(5000, { id: "refund-mirror", purpose: "refund", original_payment_id: original.id });
  const failed = payment(80000, { id: "failed", status: "failed", paid_at: null });
  const b = installationBalance(DEFAULT_PRICING, [], [original, pending, mirror, failed, { ...failed, id: "pending", status: "pending" }]);
  assert.equal(b.netPaidCents, 20000); assert.equal(b.pendingRefundsCents, 2000); assert.equal(b.completedRefundsCents, 5000);
});
test("inconsistent, unlinked, missing, or unsafe accounting inputs fail visibly", () => {
  for (const invalid of [NaN, Infinity, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, "100"])
    assert.throws(() => installationBalance({ ...DEFAULT_PRICING, laborCents: invalid as number }, [], []));
  for (const p of [payment(25000, { paid_at: null }), payment(25000, { purpose: "refund" }), payment(25000, { refunded_cents: 25001 }), payment(25000, { method: "manual_credit" })])
    assert.throws(() => installationBalance(DEFAULT_PRICING, [], [p]));
  assert.throws(() => installationBalance(DEFAULT_PRICING, [], undefined as unknown as InstallationPayment[]));
  assert.throws(() => installationBalance(DEFAULT_PRICING, [], [payment(), payment()]));
});
test("cash amount parser rejects coercion, nonfinite, malformed and rounded inputs", () => {
  for (const invalid of [null, 750, "0", "-1", "0.00", ".50", "1.001", "1.000", " 50", "50 ", "1e2", "NaN", "Infinity", "1,000", "01", "21474836.48"])
    assert.throws(() => dollarsToCents(invalid));
  assert.equal(dollarsToCents("750.00"), 75000); assert.equal(dollarsToCents("0.01"), 1);
  assert.throws(() => validateCashReceipt(receipt("50", { receivedAt: "2026-02-30T17:30:00.000Z" })));
  assert.throws(() => validateCashReceipt(receipt("50", { confirmOverpayment: "true" })));
});
test("Chicago received times handle summer, winter, DST gap and repeated hour explicitly", () => {
  assert.equal(chicagoTimeToUtc("2026-09-01T12:30"), "2026-09-01T17:30:00.000Z");
  assert.equal(chicagoTimeToUtc("2026-01-01T12:30"), "2026-01-01T18:30:00.000Z");
  assert.throws(() => chicagoTimeToUtc("2026-03-08T02:30"), /does not exist/);
  assert.throws(() => chicagoTimeToUtc("2026-11-01T01:30"), /occurs twice/);
  assert.equal(chicagoTimeToUtc("2026-11-01T01:30", "earlier"), "2026-11-01T06:30:00.000Z");
  assert.equal(chicagoTimeToUtc("2026-11-01T01:30", "later"), "2026-11-01T07:30:00.000Z");
});
test("actual admin cash component exposes a visible Record payment control (server render only)", () => {
  const html = renderToStaticMarkup(<RecordCashPayment installationId={installationId} balance={installationBalance(DEFAULT_PRICING, [], [payment()])} onRecorded={async () => {}}/>);
  assert.match(html, /Record payment/);
});
test("closed work displays an unsettled accounting amount without requesting a new debt", () => {
  const balance = installationBalance(DEFAULT_PRICING, [], [payment(25000, { status: "partially_refunded", refunded_cents: 5000 })]);
  const html = renderToStaticMarkup(<InstallationBalanceSummary balance={balance} settlementRequired/>);
  assert.match(html, /Unsettled accounting amount/);
  assert.match(html, /approved cancellation adjustments/);
  assert.doesNotMatch(html, /Current balance due|Partial payment — balance remains due/);
});
