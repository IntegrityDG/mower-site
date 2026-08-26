import { countiesdata, statesdata } from "@nickgraffis/us-counties";

export type ServiceArea = { stateCode: string; countyName: string | null; statewide: boolean };

// USDA NRCS-derived state/county data, bundled locally by @nickgraffis/us-counties.
export const US_STATES = (statesdata as [string, string][]).map(([code, name]) => ({ code, name }));
const rawCounties = countiesdata as [string, { n: string; s: string }][];

function displayCounty(name: string, state: string) {
  if (/\b(County|Parish|Borough|Census Area|Municipality|city and borough|District)$/.test(name)) return name;
  if (state === "LA") return `${name} Parish`;
  if (state === "DC") return name;
  return `${name} County`;
}

export const COUNTIES_BY_STATE = Object.fromEntries(US_STATES.map(({ code }) => [
  code,
  rawCounties.filter(([, county]) => county.s === code).map(([, county]) => displayCounty(county.n, code)).sort(),
])) as Record<string, string[]>;

export function isStateCode(value: string) { return Object.hasOwn(COUNTIES_BY_STATE, value.toUpperCase()); }
export function countiesForState(stateCode: string) { return COUNTIES_BY_STATE[stateCode.toUpperCase()] ?? []; }
export function isCountyForState(stateCode: string, countyName: string) { return countiesForState(stateCode).includes(countyName); }

export function normalizeServiceAreas(areas: ServiceArea[], primary?: { stateCode: string; countyName: string }) {
  const source = [...areas];
  if (primary && !source.some((area) => area.stateCode === primary.stateCode && area.statewide)) source.unshift({ ...primary, statewide: false });
  const normalized = new Map<string, ServiceArea>();
  for (const area of source) {
    const stateCode = area.stateCode.trim().toUpperCase();
    const statewide = area.statewide === true;
    const countyName = statewide ? null : area.countyName?.trim() || null;
    if (!isStateCode(stateCode) || (!statewide && (!countyName || !isCountyForState(stateCode, countyName)))) continue;
    if (statewide) {
      for (const key of normalized.keys()) if (key.startsWith(`${stateCode}|`)) normalized.delete(key);
      normalized.set(`${stateCode}|STATEWIDE`, { stateCode, countyName: null, statewide: true });
    } else if (!normalized.has(`${stateCode}|STATEWIDE`)) normalized.set(`${stateCode}|${countyName}`, { stateCode, countyName, statewide: false });
  }
  return [...normalized.values()];
}

export function derivePhoneAreaCode(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  const areaCode = national.slice(0, 3);
  return /^[2-9]\d{2}$/.test(areaCode) ? areaCode : null;
}

export function serviceAreaLabel(area: ServiceArea) {
  return area.statewide ? `Statewide ${US_STATES.find((state) => state.code === area.stateCode)?.name ?? area.stateCode}` : `${area.countyName}, ${area.stateCode}`;
}
