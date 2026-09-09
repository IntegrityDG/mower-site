import assert from "node:assert/strict";
import test from "node:test";
import { activationDate, calculateInvoice, cancellationConsumesSession, EMPTY_WORK_SHEET, failureDeadline, finalWarrantyReportAllowed, laborAmount, nextBillingDate, paymentRecoveryAllowed, subscriptionEligible, travelAmount, WARRANTY_REPORT_RECIPIENT } from "../lib/service/policy";
import type { Subscription, WorkSheet } from "../lib/service/types";

test("paid activation dates and full monthly first cycle, including month ends", () => {
  assert.equal(activationDate("2026-01-21T12:00:00Z", "standalone"), "2026-01-21T12:00:00.000Z");
  const machine = activationDate("2026-01-21T12:00:00Z", "machine");
  assert.equal(machine, "2026-01-31T12:00:00.000Z");
  assert.equal(nextBillingDate(machine), "2026-02-28T12:00:00.000Z");
});
test("cancellation uses elapsed timestamps across DST and includes exactly 24 hours", () => {
  const appointment = "2026-11-01T12:00:00-06:00";
  assert.equal(cancellationConsumesSession(appointment, "2026-10-31T12:59:59-05:00"), false);
  assert.equal(cancellationConsumesSession(appointment, "2026-10-31T13:00:00-05:00"), false);
  assert.equal(cancellationConsumesSession(appointment, "2026-10-31T13:00:01-05:00"), true);
});
test("eligibility depends on paid active dates, never remaining session count", () => {
  const subscription: Pick<Subscription, "status" | "activation_at" | "paid_through" | "failed_at"> = { status: "active", activation_at: "2026-01-01T00:00:00Z", paid_through: "2026-02-01T00:00:00Z", failed_at: null };
  assert.equal(subscriptionEligible(subscription, Date.parse("2026-01-15Z")), true);
  assert.equal(subscriptionEligible(subscription, Date.parse("2026-02-01Z")), false);
  assert.equal(subscriptionEligible(subscription, Date.parse("2025-12-31Z")), false);
  assert.equal(subscriptionEligible({ ...subscription, status: "suspended" }, Date.parse("2026-01-15Z")), false);
  assert.equal(subscriptionEligible({ ...subscription, failed_at: "2026-01-14Z" }, Date.parse("2026-01-15Z")), false);
  assert.equal(subscriptionEligible({ ...subscription, status: "cancelled" }, Date.parse("2026-01-15Z")), false);
  assert.equal(subscriptionEligible(null), false);
});
test("failed payment deadline and recovery boundary are fourteen elapsed days", () => {
  assert.equal(failureDeadline("2026-03-01T12:00:00Z"), "2026-03-15T12:00:00.000Z");
  assert.equal(paymentRecoveryAllowed("2026-03-01T12:00:00Z", "2026-03-15T11:59:59Z"), true);
  assert.equal(paymentRecoveryAllowed("2026-03-01T12:00:00Z", "2026-03-15T12:00:00Z"), false);
  assert.equal(paymentRecoveryAllowed("2026-03-01T12:00:00Z", "2026-03-15T12:00:01Z"), false);
});
for (const [minutes, expected] of [[0, 0], [1, 8000], [59, 8000], [60, 8000], [61, 12000], [90, 12000], [91, 16000], [120, 16000], [121, 20000], [180, 24000]]) {
  test(`Service labor ${minutes} active minutes = ${expected} cents`, () => assert.equal(laborAmount(minutes), expected));
}
for (const [outbound, returning, expected] of [[30, 30, 0], [60, 60, 0], [61, 60, 1750], [75, 75, 1750], [90, 90, 3500], [120, 120, 7000], [180, 180, 14000], [90, 30, 1750]]) {
  test(`initial mapped travel ${outbound}/${returning} = ${expected}`, () => assert.equal(travelAmount("initial", outbound, returning).amountCents, expected));
}
test("return trips never receive initial allowance", () => {
  assert.equal(travelAmount("legitimate_return", 30, 30).amountCents, 1000);
  assert.equal(travelAmount("legitimate_return", 31, 30).amountCents, 1500);
  assert.equal(travelAmount("hazard_return", 30, 30).amountCents, 3500);
  assert.equal(travelAmount("hazard_return", 31, 30).amountCents, 5250);
});
const work = (minutes: number[]): WorkSheet => ({ ...structuredClone(EMPTY_WORK_SHEET), labor: minutes.map((value, index) => ({ id: String(index), date: "2026-09-08", minutes: value, description: "Technical assistance", technicianId: null })) });
test("hold and technician handoff retain cumulative active labor with no new minimum", () => {
  const sheet = work([45, 30]);
  assert.equal(calculateInvoice(sheet, { remote: true, warranty: false, subscriberEligible: false }).customerDueCents, 12000);
  assert.equal(calculateInvoice(sheet, { remote: true, warranty: false, subscriberEligible: true }).customerDueCents, 9000);
});
test("discount covers labor/travel but excludes all parts, materials and consumables", () => {
  const sheet = work([60]);
  sheet.travel = [{ id: "trip", date: "2026-09-08", category: "initial", outboundMinutes: 75, returnMinutes: 75, mappedRoute: "Williamsville MO route", reason: "Initial call" }];
  sheet.supplies = ["part", "material", "consumable"].map(kind => ({ id: kind, kind: kind as "part" | "material" | "consumable", description: "Item", partNumber: "", quantity: 2, unitCents: 1000, authorization: "Approved" }));
  const totals = calculateInvoice(sheet, { remote: false, warranty: false, subscriberEligible: true });
  assert.equal(totals.discountCents, 2438);
  assert.equal(totals.customerDueCents, 13312);
  assert.equal(totals.serviceValueCents, 15750);
});
test("warranty tracks $80 hourly full value with zero due and no subscriber discount", () => {
  const sheet = work([120]);
  sheet.supplies = [{ id: "material", kind: "material", description: "Material", partNumber: "", quantity: 1, unitCents: 1800, authorization: "Covered" }];
  const totals = calculateInvoice(sheet, { remote: false, warranty: true, subscriberEligible: true });
  assert.equal(totals.serviceValueCents, 17800);
  assert.equal(totals.customerDueCents, 0);
  assert.equal(totals.discountCents, 0);
  assert.equal(laborAmount(90, undefined, true), 12000);
});
test("invalid quantities, duplicate initial travel and Remote Service travel reject", () => {
  assert.throws(() => laborAmount(-1));
  assert.throws(() => laborAmount(0.5));
  const sheet = work([60]);
  const trip = { id: "trip", date: "2026-09-08", category: "initial" as const, outboundMinutes: 10, returnMinutes: 10, mappedRoute: "route", reason: "initial" };
  sheet.travel = [trip];
  assert.throws(() => calculateInvoice(sheet, { remote: true, warranty: false, subscriberEligible: false }));
  sheet.travel.push({ ...trip, id: "second" });
  assert.throws(() => calculateInvoice(sheet, { remote: false, warranty: false, subscriberEligible: false }));
});
test("only resolved and finalized verified warranty is eligible for automatic PDF email", () => {
  assert.equal(finalWarrantyReportAllowed("resolved", "verified", "finalized"), true);
  for (const [status, warranty, invoice] of [["active", "verified", "finalized"], ["resolved", "verified", "draft"], ["resolved", "verification", "finalized"]]) assert.equal(finalWarrantyReportAllowed(status, warranty, invoice), false);
  assert.equal(WARRANTY_REPORT_RECIPIENT, "Service.IDS@proton.me");
});
