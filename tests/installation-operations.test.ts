import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {processorFixture} from "./helpers/installation-stripe-fixtures";
import * as cashValidation from "../lib/installations/cash-validation";
import * as errors from "../lib/installations/errors";
import { installationHarness } from "./helpers/installation-harness";
import { installationId, payment, receipt } from "./helpers/installation-fixtures";
import { loadInstallationModule as load } from "./helpers/installation-module";

const harness = (options: Parameters<typeof installationHarness>[0] = {}) => installationHarness({ ...options, env: { INSTALLATION_CASH_RECORDING_ENABLED: "true", ...options.env } });

test("direct disabled intake and checkout operations do not touch the database or Stripe", async () => {
  const h = harness();
  await assert.rejects(h.server.createInstallation({} as never), /installation_intake_disabled/);
  await assert.rejects(h.stripe.createInstallationCheckout(installationId, "balance"), /installation_online_payments_disabled/);
  assert.equal(h.calls.length, 0); assert.equal(h.external.length, 0);
});
test("installation Checkout retains test-mode safeguard", async () => {
  const h = harness({ env: { INSTALLATION_ONLINE_PAYMENTS_ENABLED: "true" }, stripeMode: "live" });
  await assert.rejects(h.stripe.createInstallationCheckout(installationId, "balance"), /requires_test_mode/);
  assert.equal(h.calls.length, 0);
});
test("actual checkout uses partially refunded and cash receipts in shared balance", async () => {
  const h = harness({ env: { INSTALLATION_ONLINE_PAYMENTS_ENABLED: "true" }, installation: { cash_status: "not_requested" }, payments: [
    { ...payment(25000, { status: "partially_refunded", refunded_cents: 5000 }), installation_id: installationId },
    { ...payment(5000, { id: "cash", method: "cash", purpose: "cash" }), installation_id: installationId },
  ] });
  await h.stripe.createInstallationCheckout(installationId, "balance");
  assert.equal(h.calls.find(c => c.table === "stripe")!.payload.line_items[0].price_data.unit_amount, 75000);
});
test("cash operation authenticates before reads or writes", async () => {
  const h = harness({ authorized: false });
  await assert.rejects(h.cash.recordInstallationCash(installationId, receipt()), /Unauthorized/);
  assert.equal(h.calls.length, 0);
});
for (const [amount, due, status] of [["750.00", 0, "paid"], ["50.00", 70000, "partially_paid"], ["800.00", 0, "paid"]] as const) {
  test(`actual cash operation records ${amount}; mocked RPC returns ${status}`, async () => {
    const h = harness(); const before = structuredClone(h.state.installations[0]);
    const result = await h.cash.recordInstallationCash(installationId, receipt(amount, { confirmOverpayment: amount === "800.00" }));
    assert.equal(result.currentBalance!.balanceDueCents, due); assert.equal(h.state.installations[0].payment_status, status);
    if (amount === "800.00") assert.equal(result.currentBalance!.customerCreditCents, 5000);
    assert.equal(h.state.installation_audit_events.length, 1);
    assert.equal(h.calls.filter(c => c.table === "ids_record_installation_cash").length, 1);
    assert.equal(h.calls.filter(c => ["insert", "update"].includes(c.verb)).length, 0);
    assert.equal(h.external.length, 0);
    assert.equal(h.state.installations[0].status, before.status); assert.equal(h.state.installations[0].safety_status, before.safety_status);
    assert.equal(h.state.installation_payments[1].recorded_by, "IDS shared administrator");
    assert.notEqual(h.state.installation_payments[1].paid_at, h.state.installation_payments[1].created_at);
  });
}
test("overpayment without consent is rejected by the mocked persistence boundary", async () => {
  const h = harness(); await assert.rejects(h.cash.recordInstallationCash(installationId, receipt("800")), { message: "cash_overpayment_confirmation_required" });
  assert.equal(h.state.installation_payments.length, 1);
});
test("same attempted receipt reuses operation key and payload; conflicts do not overwrite (mocked RPC contract)", async () => {
  const h = harness();
  const a = await h.cash.recordInstallationCash(installationId, receipt());
  const b = await h.cash.recordInstallationCash(installationId, receipt());
  assert.equal(a.paymentId, b.paymentId); assert.equal(b.replayed, true);
  assert.equal(h.state.installation_payments.length, 2); assert.equal(h.state.installation_audit_events.length, 1);
  for (const extra of [{ amountDollars: "749" }, { notes: "changed" }, { reference: "changed" }, { receivedAt: "2026-09-01T17:31:00.000Z" }, { confirmOverpayment: true }]) {
    await assert.rejects(h.cash.recordInstallationCash(installationId, { ...receipt(), ...extra }), { message: "cash_operation_conflict" });
  }
});
for (const state of [{ status: "suspended", safety_status: "suspended" }, { status: "cancelled", special_cash_failure_reschedule: true }, { status: "terminated", payment_status: "forfeited" }, { status: "completed" }]) {
  test(`cash receipt preserves ${JSON.stringify(state)} (mocked RPC contract)`, async () => {
    const h = harness({ installation: state });
    await h.cash.recordInstallationCash(installationId, receipt());
    for (const [key, value] of Object.entries(state)) assert.equal(h.state.installations[0][key], value);
  });
}
for (const table of ["installations", "installation_payments", "installation_adjustments"]) {
  test(`${table} read failure aborts actual cash operation and checkout`, async () => {
    const h = harness({ env: { INSTALLATION_ONLINE_PAYMENTS_ENABLED: "true" } }); h.fail(table, "select");
    await assert.rejects(h.cash.recordInstallationCash(installationId, receipt()));
    await assert.rejects(h.stripe.createInstallationCheckout(installationId, "balance"));
    assert.equal(h.calls.filter(c => c.table === "ids_record_installation_cash").length, 0); assert.equal(h.external.length, 0);
  });
  test(`${table} read failures are not silently empty admin/customer arrays`, async () => {
    const h = harness(); h.fail(table, "select");
    await assert.rejects(h.server.adminInstallations()); await assert.rejects(h.server.installationByToken(installationId));
  });
}
test("missing cash SQL, write error and incomplete RPC response never return success", async () => {
  for (const error of [{ code: "PGRST202", message: "missing function" }, { message: "synthetic audit write rollback" }]) {
    const h = harness(); h.fail("ids_record_installation_cash", "rpc", error);
    await assert.rejects(h.cash.recordInstallationCash(installationId, receipt()));
  }
  const h = harness(); h.incompleteRpc();
  await assert.rejects(h.cash.recordInstallationCash(installationId, receipt()), /response_incomplete/);
});
test("cash approval is distinct from money; legacy cash_paid bypass is removed", async () => {
  const h = harness({ payments: [] });
  await h.server.mutateInstallation(installationId, "cash", { status: "approved",operationKey:randomUUID(),reason:"Synthetic arrangement" });
  assert.equal(h.state.installation_payments.length, 0);
  await assert.rejects(h.operations.startAuthorizedWork(installationId, {operationKey:randomUUID()}), /required_payment_not_confirmed/);
  await assert.rejects(h.server.mutateInstallation(installationId, "session_start", {operationKey:randomUUID()}), /required_payment_not_confirmed/);
  await assert.rejects(h.server.mutateInstallation(installationId, "status", { status: "in_progress" }), /invalid_admin_operation/);
  await assert.rejects(h.server.mutateInstallation(installationId, "cash_paid", { amountCents: 75000 }), /authorized cash receipt endpoint/);
});
test("fully received funds permit work; protected lifecycle/safety states still reject", async () => {
  const full = [{ ...payment(100000), installation_id: installationId }];
  const h = harness({ payments: full }); await h.operations.startAuthorizedWork(installationId, {operationKey:randomUUID()});
  assert.equal(h.state.installations[0].status, "in_progress");
  for (const state of [{ status: "cancelled" }, { status: "terminated" }, { safety_status: "suspended" }, { safety_status: "remediation_approved",safety_reschedule_used:true }, { special_cash_failure_reschedule: true }]) {
    const h = harness({ payments: full, installation: state }); await assert.rejects(h.operations.startAuthorizedWork(installationId, {operationKey:randomUUID()}), /installation_closed|work_cannot_begin|remediation_opportunity_used/);
    assert.equal(h.calls.filter(c => c.verb === "insert").length, 0);
  }
});
test("new creation controls do not suppress actual payment/refund reconciliation", async () => {
  for (const state of [{ status: "suspended", safety_status: "suspended" }, { status: "cancelled" }, { status: "terminated" }, { status: "balance_due", special_cash_failure_reschedule: true }]) {
    const h = harness({ installation: state, payments: [processorFixture(100000).p] });
    assert.equal(await h.stripe.applyInstallationStripeSession(h.processor.session), true);
    h.processor.charge.amount_refunded=5000;h.processorRefunds.push(h.processor.refund(5000));
    assert.equal(await h.stripe.applyInstallationRefund("pi_synthetic", 999999), true);
    assert.equal(h.state.installations[0].status, state.status);
    assert.equal(h.state.installation_payments[0].refunded_cents, 5000);
  }
});
test("reconciliation read/write failures remain failures while creation is off", async () => {
  for (const [table, verb] of [["installation_payments", "select"], ["ids_installation_admin_state", "rpc"], ["ids_reconcile_installation_stripe", "rpc"]]) {
    const h = harness({ payments: [processorFixture().p] }); h.fail(table, verb);
    await assert.rejects(h.stripe.applyInstallationRefund("pi_synthetic", 5000));
  }
});
test("actual cash HTTP route rejects unauthorized/invalid requests and exposes controlled SQL errors", async () => {
  for (const authorized of [false, true]) {
    const h = harness({ authorized }); h.fail("ids_record_installation_cash", "rpc", { code: "PGRST202" });
    const route = load<typeof import("../app/api/admin/installations/[id]/cash/route")>("app/api/admin/installations/[id]/cash/route.ts", {
      "@/lib/reviews/admin-auth": h.auth, "@/lib/installations/cash": h.cash,
      "@/lib/installations/controls": h.controls, "@/lib/installations/cash-validation": cashValidation, "@/lib/installations/errors": errors,
    });
    const post = (body: unknown) => route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: installationId }) });
    const response = await post(receipt()); assert.equal(response.status, authorized ? 503 : 401);
    if (authorized) { assert.equal((await response.json()).code, "installation_not_initialized"); assert.equal((await post(receipt("1.001"))).status, 400); }
    else assert.equal(h.calls.length, 0);
  }
});
