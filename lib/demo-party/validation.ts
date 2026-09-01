import { DEMO_EQUIPMENT_INTERESTS, DEMO_REQUEST_BOT_TRAP_FIELD, DEMO_SOURCES, type DemoEquipmentInterest, type DemoSource } from "@/lib/demo-scheduling/types";
import {
  DEMO_FORMATS,
  EQUIPMENT_BUDGETS,
  PROPERTY_RELATIONSHIPS,
  PROPERTY_TYPES,
  PURCHASE_TIMEFRAMES,
  type DemoFormat,
  type DemoPartyScreening,
  type EquipmentBudget,
  type PropertyRelationship,
  type PropertyType,
  type PurchaseTimeframe,
} from "./types";

const requestKeys = new Set([
  "appointmentType",
  "name",
  "email",
  "phone",
  "propertyAddress",
  "requestedStartAt",
  "source",
  "equipmentInterest",
  "notes",
  "demoFormat",
  "partyScreening",
  "idempotencyKey",
  DEMO_REQUEST_BOT_TRAP_FIELD,
]);
const screeningKeys = new Set([
  "propertyRelationship",
  "propertyType",
  "mowableAcreage",
  "activelyConsideringPurchase",
  "purchaseTimeframe",
  "equipmentBudget",
  "certification",
]);

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max + 1) : "";
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const containsOnly = (value: Record<string, unknown>, keys: Set<string>) => Object.keys(value).every((key) => keys.has(key));

export type ValidDemoAppointmentRequest = {
  appointmentType: "demo";
  name: string;
  email: string;
  phone: string;
  address: string;
  startAt: string;
  source: DemoSource;
  equipmentInterest: DemoEquipmentInterest;
  notes: string | null;
  demoFormat: DemoFormat;
  partyScreening: DemoPartyScreening | null;
  idempotencyKey: string;
};

function validatePartyScreening(input: unknown, errors: Record<string, string>): DemoPartyScreening | null {
  if (!isRecord(input) || !containsOnly(input, screeningKeys)) {
    errors.partyScreening = "Complete the Demo Party eligibility questions.";
    return null;
  }
  const propertyRelationship = clean(input.propertyRelationship, 40) as PropertyRelationship;
  const propertyType = clean(input.propertyType, 40) as PropertyType;
  const purchaseTimeframe = clean(input.purchaseTimeframe, 40) as PurchaseTimeframe;
  const equipmentBudget = clean(input.equipmentBudget, 40) as EquipmentBudget;
  const mowableAcreage = typeof input.mowableAcreage === "number" ? input.mowableAcreage : Number.NaN;
  if (!PROPERTY_RELATIONSHIPS.includes(propertyRelationship)) errors.propertyRelationship = "Choose your relationship to the property.";
  if (!PROPERTY_TYPES.includes(propertyType)) errors.propertyType = "Choose the property type.";
  if (!Number.isFinite(mowableAcreage) || mowableAcreage <= 0 || mowableAcreage > 100_000) errors.mowableAcreage = "Enter the approximate mowable acreage.";
  if (typeof input.activelyConsideringPurchase !== "boolean") errors.activelyConsideringPurchase = "Choose whether you are actively considering a purchase.";
  if (!PURCHASE_TIMEFRAMES.includes(purchaseTimeframe)) errors.purchaseTimeframe = "Choose an expected purchase timeframe.";
  if (!EQUIPMENT_BUDGETS.includes(equipmentBudget)) errors.equipmentBudget = "Choose an estimated equipment budget.";
  if (input.certification !== true) errors.certification = "The property authorization certification is required for a Demo Party.";
  if (Object.keys(errors).some((key) => screeningKeys.has(key) || key === "partyScreening")) return null;
  return {
    propertyRelationship,
    propertyType,
    mowableAcreage,
    activelyConsideringPurchase: input.activelyConsideringPurchase as boolean,
    purchaseTimeframe,
    equipmentBudget,
    certification: true,
  };
}

export function validateDemoAppointmentRequest(input: unknown) {
  const errors: Record<string, string> = {};
  const body = isRecord(input) ? input : {};
  if (!containsOnly(body, requestKeys)) errors.form = "Unsupported request fields were provided.";
  const appointmentType = clean(body.appointmentType, 20) || "demo";
  const name = clean(body.name, 160);
  const email = clean(body.email, 320).toLowerCase();
  const phone = clean(body.phone, 80);
  const address = clean(body.propertyAddress, 500);
  const startAt = clean(body.requestedStartAt, 40);
  const source = clean(body.source, 40) as DemoSource;
  const equipmentInterest = clean(body.equipmentInterest, 80) as DemoEquipmentInterest;
  const notesValue = clean(body.notes, 2_000);
  const notes = notesValue || null;
  const demoFormat = clean(body.demoFormat, 20) as DemoFormat;
  const idempotencyKey = clean(body.idempotencyKey, 36);
  const honeypot = clean(body[DEMO_REQUEST_BOT_TRAP_FIELD], 100);

  if (honeypot) errors.form = "Request could not be submitted.";
  if (appointmentType !== "demo") errors.appointmentType = "This appointment type is not available yet.";
  if (!name || name.length > 160) errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) errors.email = "Enter a valid email address.";
  if (phone.length < 7 || phone.length > 80) errors.phone = "Enter a valid phone number.";
  if (address.length < 5 || address.length > 500) errors.propertyAddress = "Enter the property address.";
  if (!DEMO_SOURCES.includes(source)) errors.source = "Invalid request source.";
  if (!DEMO_EQUIPMENT_INTERESTS.includes(equipmentInterest)) errors.equipmentInterest = "Choose which machine you would like to see.";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(startAt) || !Number.isFinite(Date.parse(startAt))) errors.requestedStartAt = "Choose an available time.";
  if (notesValue.length > 2_000) errors.notes = "Notes must be 2,000 characters or fewer.";
  if (!DEMO_FORMATS.includes(demoFormat)) errors.demoFormat = "Choose a Private Demo or Demo Party.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) errors.idempotencyKey = "Invalid submission token.";

  const partyScreening = demoFormat === "party" ? validatePartyScreening(body.partyScreening, errors) : null;
  if (demoFormat === "private" && body.partyScreening !== null && body.partyScreening !== undefined) errors.partyScreening = "Private Demo requests cannot include Demo Party screening fields.";
  if (Object.keys(errors).length) return { ok: false as const, errors };
  return {
    ok: true as const,
    value: {
      appointmentType: "demo" as const,
      name,
      email,
      phone,
      address,
      startAt,
      source,
      equipmentInterest,
      notes,
      demoFormat,
      partyScreening,
      idempotencyKey,
    } satisfies ValidDemoAppointmentRequest,
  };
}

export function validateGuest(input: unknown) {
  if (!isRecord(input) || !containsOnly(input, new Set(["fullName", "email", "phone"]))) return { ok: false as const, error: "Invalid guest details." };
  const fullName = clean(input.fullName, 160);
  const email = clean(input.email, 320).toLowerCase();
  const phone = clean(input.phone, 80);
  if (!fullName || fullName.length > 160) return { ok: false as const, error: "Enter the guest's full name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return { ok: false as const, error: "Enter a valid guest email address." };
  if (phone.length < 7 || phone.length > 80) return { ok: false as const, error: "Enter a valid guest phone number." };
  return { ok: true as const, value: { fullName, email, phone } };
}

export function validateDateRange(start: string | null, end: string | null) {
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return days >= 0 && days <= 42 ? { start, end } : null;
}
