import type {
  DemoAreaAssignment,
  DemoAreaAssignmentInput,
  DemoServiceArea,
  DemoServiceAreaCity,
  DemoServiceAreaCityInput,
  DemoServiceAreaInput,
} from "./types";
import { CUSTOM_DEMO_AREA_ID } from "./public-area-planning";

export const DEMO_AREA_NAME_MAX_LENGTH = 120;
export const DEMO_AREA_DESCRIPTION_MAX_LENGTH = 500;
export const DEMO_AREA_CITY_MAX_LENGTH = 120;
export const DEMO_AREA_NOTE_MAX_LENGTH = 500;
export const DEMO_AREA_MAX_SORT_ORDER = 100000;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const optionalText = (value: unknown) => typeof value === "string" ? value.trim() || null : value === null || value === undefined ? null : undefined;

export function isDemoAreaIdentifier(value: string): boolean {
  return uuidPattern.test(value);
}

export function isDemoServiceDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1];
}

export function serviceDateParts(value: string): { year: number; month: number; day: number } | null {
  if (!isDemoServiceDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function validateDemoAreaAssignment(input: unknown): { ok: true; value: DemoAreaAssignmentInput } | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "Area assignment details are required." };
  const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";
  const regionId = typeof body.regionId === "string" ? body.regionId.trim() : "";
  const cityId = optionalText(body.cityId);
  const customCity = optionalText(body.customCity);
  const internalNote = optionalText(body.internalNote);
  if (!isDemoServiceDate(serviceDate)) return { ok: false, error: "Choose a valid service date." };
  if (!isDemoAreaIdentifier(regionId)) return { ok: false, error: "Choose a valid Area / Region." };
  if (cityId === undefined || cityId !== null && !isDemoAreaIdentifier(cityId)) return { ok: false, error: "Choose a valid Specific City or leave it blank." };
  if (customCity === undefined || customCity !== null && customCity.length > DEMO_AREA_CITY_MAX_LENGTH) return { ok: false, error: `Specific City must be ${DEMO_AREA_CITY_MAX_LENGTH} characters or fewer.` };
  if (regionId === CUSTOM_DEMO_AREA_ID && !customCity) return { ok: false, error: "Custom Location is required for Custom / Out-of-Area." };
  if (regionId === CUSTOM_DEMO_AREA_ID && cityId) return { ok: false, error: "Custom / Out-of-Area cannot use a saved city." };
  if (cityId && customCity) return { ok: false, error: "Choose a saved city or enter a custom city, not both." };
  if (internalNote === undefined || internalNote !== null && internalNote.length > DEMO_AREA_NOTE_MAX_LENGTH) return { ok: false, error: `Internal Note must be ${DEMO_AREA_NOTE_MAX_LENGTH} characters or fewer.` };
  return { ok: true, value: { serviceDate, regionId, cityId, customCity, internalNote } };
}

export function validateDemoServiceArea(input: unknown): { ok: true; value: DemoServiceAreaInput } | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "Area details are required." };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = optionalText(body.description);
  const active = body.active;
  const sortOrder = body.sortOrder;
  if (!name || name.length > DEMO_AREA_NAME_MAX_LENGTH) return { ok: false, error: `Region name is required and must be ${DEMO_AREA_NAME_MAX_LENGTH} characters or fewer.` };
  if (description === undefined || description !== null && description.length > DEMO_AREA_DESCRIPTION_MAX_LENGTH) return { ok: false, error: `Description must be ${DEMO_AREA_DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  if (typeof active !== "boolean") return { ok: false, error: "Active must be true or false." };
  if (!Number.isInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > DEMO_AREA_MAX_SORT_ORDER) return { ok: false, error: "Sort order is invalid." };
  return { ok: true, value: { name, description, active, sortOrder: Number(sortOrder) } };
}

export function validateDemoServiceAreaCity(input: unknown): { ok: true; value: DemoServiceAreaCityInput } | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "City details are required." };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawState = optionalText(body.stateAbbreviation);
  const stateAbbreviation = typeof rawState === "string" ? rawState.toUpperCase() : rawState;
  const active = body.active;
  const sortOrder = body.sortOrder;
  if (!name || name.length > DEMO_AREA_CITY_MAX_LENGTH) return { ok: false, error: `City name is required and must be ${DEMO_AREA_CITY_MAX_LENGTH} characters or fewer.` };
  if (stateAbbreviation === undefined || stateAbbreviation !== null && !/^[A-Z]{2}$/.test(stateAbbreviation)) return { ok: false, error: "State abbreviation must contain two letters or be blank." };
  if (typeof active !== "boolean") return { ok: false, error: "Active must be true or false." };
  if (!Number.isInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > DEMO_AREA_MAX_SORT_ORDER) return { ok: false, error: "Sort order is invalid." };
  return { ok: true, value: { name, stateAbbreviation, active, sortOrder: Number(sortOrder) } };
}

export function demoAreaAssignmentDisplay(
  assignment: DemoAreaAssignment | null | undefined,
  areas: DemoServiceArea[],
  cities: DemoServiceAreaCity[],
): { regionName: string; cityName: string | null } | null {
  if (!assignment) return null;
  const area = areas.find((item) => item.id === assignment.regionId);
  if (!area) return null;
  const city = assignment.customCity ?? cities.find((item) => item.id === assignment.cityId)?.name ?? null;
  return { regionName: area.name, cityName: city };
}
