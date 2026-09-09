import { calculateInvoice, MAX_CASE_IMAGE_BYTES } from "./policy";
import type { EquipmentDetails, ServicePricing, WorkSheet } from "./types";

export class ServiceError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "ServiceError"; }
}
export const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ServiceError("A valid object is required.");
  return value as Record<string, unknown>;
};
export function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new ServiceError("Unknown request fields.");
}
export function text(value: unknown, label: string, max = 8000, required = false): string {
  if (value === undefined || value === null) { if (!required) return ""; }
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ServiceError(`Enter a valid ${label}.`);
  return value.trim();
}
export function uuid(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ServiceError("Invalid reference.");
  return value;
}
export function email(value: unknown) {
  const result = text(value, "email", 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ServiceError("Enter a valid email.");
  return result;
}
export function phone(value: unknown) {
  let result = text(value, "phone", 50, true).replace(/\D/g, "");
  if (result.length === 11 && result.startsWith("1")) result = result.slice(1);
  if (result.length !== 10) throw new ServiceError("Enter a ten-digit US phone number.");
  return result;
}
export function integer(value: unknown, label: string, min = 0, max = 1_000_000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new ServiceError(`Invalid ${label}.`);
  return value;
}
export function date(value: unknown) {
  const result = text(value, "date", 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new ServiceError("Invalid date.");
  return result;
}
export function timestamp(value: unknown) {
  const result = text(value, "appointment time", 40, true);
  if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(result) || !Number.isFinite(Date.parse(result))) throw new ServiceError("Use a timestamp with a time zone.");
  return new Date(result).toISOString();
}
export function boolean(value: unknown) {
  if (typeof value !== "boolean") throw new ServiceError("A true/false choice is required.");
  return value;
}
export function equipment(value: unknown, required = false): EquipmentDetails {
  const input = object(value ?? {});
  exact(input, ["manufacturer", "model", "serial", "purchaseDate", "purchasedFrom"]);
  return { manufacturer: text(input.manufacturer, "manufacturer", 150, required), model: text(input.model, "model", 150, required), serial: text(input.serial, "serial number", 150, required), purchaseDate: text(input.purchaseDate, "approximate purchase date", 100, required), purchasedFrom: text(input.purchasedFrom, "purchasing dealer", 200, required) };
}
export function parseIntake(value: unknown) {
  const input = object(value);
  const kind = input.kind;
  if (!["included_support", "remote_service", "onsite_service"].includes(String(kind))) throw new ServiceError("Choose a support or Service type.");
  exact(input, kind === "included_support" ? ["key", "kind", "name", "phone", "issue"] : ["key", "kind", "name", "phone", "email", "issue", "warranty", "equipment", "address"]);
  const warranty = kind === "included_support" ? "no" : input.warranty;
  if (!["yes", "no", "unsure"].includes(String(warranty))) throw new ServiceError("Answer the warranty question first.");
  return { key: uuid(input.key), kind: kind as "included_support" | "remote_service" | "onsite_service", name: text(input.name, "name", 200, true), phone: phone(input.phone), issue: text(input.issue, "brief issue", 8000, true), email: kind === "included_support" ? null : email(input.email), warranty: warranty as "yes" | "no" | "unsure", equipment: equipment(input.equipment, warranty !== "no"), address: text(input.address, "service address", 600, kind === "onsite_service" && warranty === "no") };
}
export function parseSupportPurchase(value: unknown) {
  const input = object(value); exact(input, ["key", "name", "email", "phone", "acceptedTerms"]);
  if (input.acceptedTerms !== true) throw new ServiceError("Accept the monthly subscription terms to continue.");
  return { key: uuid(input.key), name: text(input.name, "name", 200, true), email: email(input.email), phone: phone(input.phone) };
}
function lines(value: unknown, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new ServiceError("Too many work-sheet lines.");
  const ids = new Set<string>();
  return value.map(item => { const line = object(item); const id = uuid(line.id); if (ids.has(id)) throw new ServiceError("Duplicate work-sheet line."); ids.add(id); return line; });
}
export function parseWorkSheet(value: unknown): WorkSheet {
  const input = object(value);
  exact(input, ["diagnosis", "workPerformed", "testing", "resolution", "labor", "travel", "supplies", "holdNotes", "authorizationNotes", "manufacturerReimbursementCents"]);
  const result: WorkSheet = {
    diagnosis: text(input.diagnosis, "diagnosis"), workPerformed: text(input.workPerformed, "work performed"), testing: text(input.testing, "testing"), resolution: text(input.resolution, "resolution"), holdNotes: text(input.holdNotes, "hold notes"), authorizationNotes: text(input.authorizationNotes, "authorization notes"), manufacturerReimbursementCents: integer(input.manufacturerReimbursementCents, "manufacturer reimbursement", 0, 99_999_999),
    labor: lines(input.labor, 200).map(line => {
      exact(line, ["id", "date", "minutes", "description", "technicianId"]);
      return { id: uuid(line.id), date: date(line.date), minutes: integer(line.minutes, "active minutes", 1, 525_600), description: text(line.description, "active work description", 2000, true), technicianId: line.technicianId === null ? null : uuid(line.technicianId) };
    }),
    travel: lines(input.travel, 100).map(line => {
      exact(line, ["id", "date", "category", "outboundMinutes", "returnMinutes", "mappedRoute", "reason"]);
      if (!["initial", "legitimate_return", "hazard_return"].includes(String(line.category))) throw new ServiceError("Select a valid trip category.");
      return { id: uuid(line.id), date: date(line.date), category: line.category as "initial" | "legitimate_return" | "hazard_return", outboundMinutes: integer(line.outboundMinutes, "mapped outbound minutes", 0, 10_080), returnMinutes: integer(line.returnMinutes, "mapped return minutes", 0, 10_080), mappedRoute: text(line.mappedRoute, "mapped driving route", 1000, true), reason: text(line.reason, "trip reason", 2000, true) };
    }),
    supplies: lines(input.supplies, 200).map(line => {
      exact(line, ["id", "kind", "description", "partNumber", "quantity", "unitCents", "authorization"]);
      if (!["part", "material", "consumable"].includes(String(line.kind)) || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 10_000 || Math.abs(line.quantity * 1000 - Math.round(line.quantity * 1000)) > 1e-7) throw new ServiceError("Invalid supply category or quantity.");
      return { id: uuid(line.id), kind: line.kind as "part" | "material" | "consumable", description: text(line.description, "item description", 2000, true), partNumber: text(line.partNumber, "part number", 200), quantity: line.quantity, unitCents: integer(line.unitCents, "unit price", 0, 10_000_000), authorization: text(line.authorization, "expense authorization", 2000, true) };
    }),
  };
  calculateInvoice(result, { remote: false, warranty: false, subscriberEligible: false });
  return result;
}
export function parseServiceAction(value: unknown) {
  const input = object(value); exact(input, ["key", "version", "action", "data"]);
  const action = text(input.action, "action", 60, true); const data = object(input.data ?? {});
  const fields: Record<string, string[]> = {
    assign: ["staffId"], note: ["notes"], start_session: [], resolve: ["notes"], schedule: ["startsAt", "endsAt"],
    cancel_appointment: ["appointmentId", "notes"], no_show: ["appointmentId", "notes"], begin_service: ["notes"],
    hold: ["reason", "notes"], resume: ["notes"], warranty_review: ["equipmentCovered", "serviceCovered", "arrangement", "notes"],
    save_invoice: ["sheet"], submit_invoice: ["sheet"], return_invoice: ["notes"], finalize_invoice: [],
  };
  if (!Object.hasOwn(fields, action)) throw new ServiceError("Unknown Service action.");
  exact(data, fields[action]);
  const parsed: Record<string, unknown> = {};
  for (const field of fields[action]) {
    const value = data[field];
    parsed[field] = field === "sheet" ? parseWorkSheet(value) : ["staffId", "appointmentId"].includes(field) ? uuid(value) : ["startsAt", "endsAt"].includes(field) ? timestamp(value) : ["equipmentCovered", "serviceCovered"].includes(field) ? boolean(value) : text(value, field, 8000, true);
  }
  return { key: uuid(input.key), version: integer(input.version, "record version", 1), action, data: parsed };
}
export function parseAttachment(value: unknown) {
  const input = object(value); exact(input, ["id", "name", "type", "size"]);
  if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(String(input.type))) throw new ServiceError("Use a JPEG, PNG, WebP or HEIC image.");
  return { id: uuid(input.id), name: text(input.name, "file name", 200, true), type: input.type as "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif", size: integer(input.size, "image size (maximum 15 MB)", 1, MAX_CASE_IMAGE_BYTES) };
}
export function parsePricing(value: unknown): ServicePricing {
  const input = object(value); exact(input, ["firstHourCents", "additionalHalfHourCents", "initialTravelHalfHourCents", "returnTravelHalfHourCents", "hazardTravelHalfHourCents", "warrantyHourlyCents"]);
  if (Object.keys(input).length !== 6) throw new ServiceError("All six Service rates are required.");
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, integer(value, key, 0, 1_000_000)])) as ServicePricing;
}
