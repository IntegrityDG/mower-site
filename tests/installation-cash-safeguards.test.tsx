import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as validation from "../lib/installations/cash-validation";
import * as errors from "../lib/installations/errors";
import { installationBalance } from "../lib/installations/accounting";
import { DEFAULT_PRICING } from "../lib/installations/policy";
import { installationHarness } from "./helpers/installation-harness";
import { installationId, receipt, payment } from "./helpers/installation-fixtures";
import { loadInstallationModule as load } from "./helpers/installation-module";
import CashEntryStatus from "../components/installations/CashEntryStatus";
import CorrectCashReceipt from "../components/installations/CorrectCashReceipt";
import RecordCashPayment from "../components/installations/RecordCashPayment";
const enabled = () => installationHarness({ env: { INSTALLATION_CASH_RECORDING_ENABLED: "true" } });
const correction = (originalPaymentId: string, extra = {}) => ({ originalPaymentId, operationKey: "66666666-6666-4666-8666-666666666666", amountDollars: "675.00", reason: "Entered $750; actually received $75", ...extra });
function http(h: ReturnType<typeof installationHarness>) {
  return load<typeof import("../lib/installations/cash-http")>("lib/installations/cash-http.ts", {
    "@/lib/reviews/admin-auth": h.auth, "./controls": h.controls, "./cash": h.cash,
    "./cash-validation": validation, "./errors": errors,
  });
}
for (const value of [undefined, "", "false", "TRUE", "yes", "1", " true "]) test(`cash writes fail closed for ${String(value)}`, async () => {
  const h = installationHarness({ env: value === undefined ? {} : { INSTALLATION_CASH_RECORDING_ENABLED: value } });
  await assert.rejects(h.cash.recordInstallationCash(installationId, receipt()), /installation_cash_recording_disabled/);
  await assert.rejects(h.cash.correctInstallationCash(installationId, correction(payment().id)), /installation_cash_recording_disabled/);
  assert.equal(h.calls.length, 0);
  const route = load<typeof import("../app/api/admin/installations/[id]/cash/route")>("app/api/admin/installations/[id]/cash/route.ts", {
    "@/lib/reviews/admin-auth": h.auth, "@/lib/installations/controls": h.controls,
    "@/lib/installations/cash": h.cash, "@/lib/installations/cash-validation": validation, "@/lib/installations/errors": errors,
  });
  const request = () => new Request("http://localhost", { method: "POST", body: "not JSON" });
  assert.equal((await route.POST(request(), { params: Promise.resolve({ id: installationId }) })).status, 503);
  const correctionRoute = load<typeof import("../app/api/admin/installations/[id]/cash/corrections/route")>("app/api/admin/installations/[id]/cash/corrections/route.ts", { "@/lib/installations/cash-http": http(h) });
  assert.equal((await correctionRoute.POST(request(), { params: Promise.resolve({ id: installationId }) })).status, 503);
  assert.equal(h.calls.length, 0);
});
test("cash flag is independent of intake and checkout", () => {
  assert.equal(enabled().controls.installationControls().intakeEnabled, false);
  assert.equal(enabled().controls.installationControls().onlinePaymentsEnabled, false);
  assert.equal(installationHarness({ env: { INSTALLATION_INTAKE_ENABLED: "true", INSTALLATION_ONLINE_PAYMENTS_ENABLED: "true" } }).controls.installationControls().cashRecordingEnabled, false);
});
test("forged financial totals, status, snapshot and actor are rejected before trusted arguments are built", async () => {
  for (const key of ["actor", "p_actor", "balance", "balanceBefore", "balanceAfter", "p_balance_before", "expectedLedger", "p_expected_ledger", "paymentStatus", "p_payment_status"]) {
    const h = enabled();
    await assert.rejects(h.cash.recordInstallationCash(installationId, { ...receipt(), [key]: 999999 }), /Unexpected cash entry fields/);
    await assert.rejects(h.cash.correctInstallationCash(installationId, { ...correction(payment().id), [key]: 999999 }), /Unexpected cash entry fields/);
    assert.equal(h.calls.length, 0);
  }
});
test("$750 entered versus $75 received appends $675 correction; original and charges remain intact", async () => {
  const h = enabled();
  const cash = await h.cash.recordInstallationCash(installationId, receipt());
  const original = structuredClone(h.state.installation_payments[1]);
  const result = await h.cash.correctInstallationCash(installationId, correction(cash.paymentId));
  assert.deepEqual(h.state.installation_payments[1], original);
  assert.equal(result.currentBalance!.receiptCorrectionsCents, 67500);
  assert.equal(result.currentBalance!.netPaidCents, 32500);
  assert.equal(result.currentBalance!.approvedChargesCents, 100000);
  assert.equal(result.currentBalance!.completedRefundsCents, 0);
  assert.equal(result.currentBalance!.balanceDueCents, 67500);
  assert.equal(h.state.installation_cash_corrections[0].recorded_by, "IDS shared administrator");
  assert.equal(h.state.installation_audit_events[1].event_type, "cash_receipt_corrected");
  assert.deepEqual(h.external, []);
  assert.equal(h.calls.filter(c => ["insert", "update"].includes(c.verb)).length, 0);
});
test("corrections support partial/full completion and cap net of completed refunds", () => {
  const cash = payment(75000, { method: "cash", purpose: "cash", status: "partially_refunded", refunded_cents: 5000 });
  const first = { id: "correction-1", original_payment_id: cash.id, amount_cents: 67500 };
  assert.equal(installationBalance(DEFAULT_PRICING, [], [cash], [first]).netPaidCents, 2500);
  assert.equal(installationBalance(DEFAULT_PRICING, [], [cash], [first, { ...first, id: "correction-2", amount_cents: 2500 }]).netPaidCents, 0);
  assert.throws(() => installationBalance(DEFAULT_PRICING, [], [cash], [first, { ...first, id: "correction-2", amount_cents: 2501 }]), /exceeds/);
});
test("receipt and correction replay retain original snapshot and refresh today's balance separately", async () => {
  const h = enabled(); const cash = await h.cash.recordInstallationCash(installationId, receipt());
  const input = correction(cash.paymentId);
  const corrected = await h.cash.correctInstallationCash(installationId, input);
  const replay = await h.cash.recordInstallationCash(installationId, receipt());
  assert.equal(replay.balanceAtRecording.balanceDueCents, 0);
  assert.equal(replay.currentBalance!.balanceDueCents, 67500);
  const repeated = await h.cash.correctInstallationCash(installationId, input);
  assert.equal(repeated.correctionId, corrected.correctionId); assert.equal(repeated.recordedAt, corrected.recordedAt);
  assert.equal(h.state.installation_cash_corrections.length, 1);
  for (const extra of [{ reason: "different" }, { amountDollars: "674" }, { originalPaymentId: payment().id }]) await assert.rejects(h.cash.correctInstallationCash(installationId, { ...input, ...extra }), { message: "cash_operation_conflict" });
  h.state.installations[0].pricing_snapshot = null;
  const knownReceipt = await h.cash.recordInstallationCash(installationId, receipt());
  const knownCorrection = await h.cash.correctInstallationCash(installationId, input);
  for (const known of [knownReceipt, knownCorrection]) { assert.equal(known.replayed, true); assert.equal(known.currentBalance, null); assert.equal(known.currentBalanceUnavailable, true); }
  assert.equal(h.state.installation_payments.length, 2); assert.equal(h.state.installation_audit_events.length, 2);
  const html = renderToStaticMarkup(<CashEntryStatus result={knownReceipt}/>);
  assert.match(html, /entry is confirmed/); assert.match(html, /current balance could not be refreshed/); assert.match(html, /do not enter this same entry/);
});
test("confirmation remains read-only when writes are off, and another installation cannot retrieve a receipt", async () => {
  const h = enabled(); await h.cash.recordInstallationCash(installationId, receipt());
  const off = installationHarness(); off.state.installation_payments = h.state.installation_payments;
  const result = await off.cash.confirmInstallationCash(installationId, receipt()); assert.equal(result!.replayed, true);
  assert.equal(off.calls.filter(c => c.table === "ids_record_installation_cash").length, 0);
  await assert.rejects(off.cash.confirmInstallationCash("99999999-9999-4999-8999-999999999999", receipt()), { message: "cash_operation_conflict" });
  const response = await http(off).cashEntryRequest(new Request("http://localhost", { method: "POST", body: JSON.stringify(receipt()) }), Promise.resolve({ id: installationId }), "receipt", true);
  assert.equal(response.status, 200); assert.equal((await response.json()).replayed, true);
});
test("failed RPC retries reuse their key; stale ledger returns a conflict", async () => {
  const h = enabled(); h.fail("ids_record_installation_cash", "rpc", { message: "installation_ledger_changed" });
  await assert.rejects(h.cash.recordInstallationCash(installationId, receipt()), { message: "installation_ledger_changed" });
  h.clearFailure(); await h.cash.recordInstallationCash(installationId, receipt());
  assert.equal(h.state.installation_payments.length, 2);
});
test("disabled cash and correction UI still explains history/confirmation access", () => {
  const balance = installationBalance(DEFAULT_PRICING, [], [payment()]);
  for (const html of [renderToStaticMarkup(<RecordCashPayment installationId={installationId} balance={balance} onRecorded={async () => {}}/>), renderToStaticMarkup(<CorrectCashReceipt installationId={installationId} paymentId={payment().id} eligibleCents={75000} onRecorded={async () => {}}/>)]) {
    assert.match(html, /disabled=""/); assert.match(html, /confirmation remain/);
  }
});
test("admin history remains readable when the current ledger cannot be calculated", async () => {
  const h = enabled(); await h.cash.recordInstallationCash(installationId, receipt());
  h.state.installations[0].pricing_snapshot = { laborCents: null, materialsAllowanceCents: 20000 };
  const history = await h.server.adminInstallations();
  assert.equal(history.balances[installationId], null); assert.equal(history.payments.length, 2);
  const confirmed = await h.cash.confirmInstallationCash(installationId, receipt());
  assert.equal(confirmed!.currentBalanceUnavailable, true); assert.equal(confirmed!.replayed, true);
  const html = renderToStaticMarkup(<RecordCashPayment installationId={installationId} balance={null} enabled onRecorded={async () => {}}/>);
  assert.match(html, /disabled=""/);
});
test("correction endpoint rejects forged fields and unauthenticated confirmation without persistence", async () => {
  const h = enabled();
  const forged = await http(h).cashEntryRequest(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...correction(payment().id), actor: "forged", p_balance_before: {} }) }), Promise.resolve({ id: installationId }), "correction", false);
  assert.equal(forged.status, 400); assert.equal(h.calls.length, 0);
  const denied = installationHarness({ authorized: false });
  for (const kind of ["receipt", "correction"] as const) {
    const result = await http(denied).cashEntryRequest(new Request("http://localhost", { method: "POST", body: "{}" }), Promise.resolve({ id: installationId }), kind, true);
    assert.equal(result.status, 401);
  }
  assert.equal(denied.calls.length, 0); assert.deepEqual(h.external, []);
});
