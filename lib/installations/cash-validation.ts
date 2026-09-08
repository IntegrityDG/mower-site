import { BUSINESS_TIME_ZONE } from "./policy";

export type CashReceiptInput = {
  operationKey: string; amountDollars: string; receivedAt: string;
  reference: string; notes: string; confirmOverpayment: boolean;
};
export function dollarsToCents(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value)) throw new Error("Enter a dollar amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) throw new Error("Cash amount must be positive and within the supported range.");
  return amount;
}
export function validateCashReceipt(body: Record<string, unknown>) {
  rejectExtraFields(body, ["operationKey", "amountDollars", "receivedAt", "reference", "notes", "confirmOverpayment"]);
  if (typeof body.operationKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationKey)) throw new Error("A stable receipt operation key is required.");
  const amountCents = dollarsToCents(body.amountDollars);
  if (typeof body.receivedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.receivedAt) || !Number.isFinite(Date.parse(body.receivedAt)) || new Date(body.receivedAt).toISOString() !== body.receivedAt) throw new Error("An unambiguous received date/time is required.");
  if (Date.parse(body.receivedAt) > Date.now() + 60_000) throw new Error("Received time cannot be in the future.");
  for (const [key, max] of [["reference", 200], ["notes", 2000]] as const) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || (body[key] as string).length > max)) throw new Error(`Invalid receipt ${key}.`);
  }
  if (body.confirmOverpayment !== undefined && typeof body.confirmOverpayment !== "boolean") throw new Error("Invalid overpayment confirmation.");
  return { operationKey: body.operationKey.toLowerCase(), amountCents, receivedAt: body.receivedAt,
    reference: (body.reference as string | undefined)?.trim() || null,
    notes: (body.notes as string | undefined)?.trim() || null, confirmOverpayment: body.confirmOverpayment === true };
}

export type CashCorrectionInput = { operationKey: string; originalPaymentId: string; amountDollars: string; reason: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function rejectExtraFields(body: Record<string, unknown>, allowed: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw new Error("Unexpected cash entry fields.");
}
export function validateCashCorrection(body: Record<string, unknown>) {
  rejectExtraFields(body, ["operationKey", "originalPaymentId", "amountDollars", "reason"]);
  if (typeof body.operationKey !== "string" || !uuid.test(body.operationKey)) throw new Error("A stable correction operation key is required.");
  if (typeof body.originalPaymentId !== "string" || !uuid.test(body.originalPaymentId)) throw new Error("An original cash receipt is required.");
  if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 2000) throw new Error("A correction reason of at most 2000 characters is required.");
  return { operationKey: body.operationKey.toLowerCase(), originalPaymentId: body.originalPaymentId.toLowerCase(), amountCents: dollarsToCents(body.amountDollars), reason: body.reason.trim() };
}

export type CashRefundInput = CashCorrectionInput & { returnedAt: string; reference: string; confirmMoneyReturned: boolean };
export function validateCashRefund(body: Record<string, unknown>) {
  rejectExtraFields(body, ["operationKey", "originalPaymentId", "amountDollars", "reason", "returnedAt", "reference", "confirmMoneyReturned"]);
  const correction = validateCashCorrection({ operationKey: body.operationKey, originalPaymentId: body.originalPaymentId, amountDollars: body.amountDollars, reason: body.reason });
  const receipt = validateCashReceipt({ operationKey: body.operationKey, amountDollars: body.amountDollars, receivedAt: body.returnedAt, reference: body.reference });
  if (body.confirmMoneyReturned !== true) throw new Error("Confirm that IDS actually returned this cash to the customer.");
  return { ...correction, returnedAt: receipt.receivedAt, reference: receipt.reference, confirmMoneyReturned: true as const };
}

export function formatInstallationTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " CT";
}
export function chicagoInputTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
// Reject spring DST gaps and require an explicit choice for the repeated fall hour.
export function chicagoTimeToUtc(value: string, repeatedHour: "earlier" | "later" | "" = "") {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a received date/time in America/Chicago.");
  const base = Date.parse(value + ":00.000Z");
  const candidates = [5, 6].map(hours => new Date(base + hours * 3600000)).filter(date => Number.isFinite(date.getTime()) && chicagoInputTime(date) === value);
  if (!candidates.length) throw new Error("That Chicago time does not exist. Check the date and daylight saving time.");
  if (candidates.length === 2 && !repeatedHour) throw new Error("This time occurs twice. Choose the earlier or later occurrence.");
  return candidates[repeatedHour === "later" ? candidates.length - 1 : 0].toISOString();
}
