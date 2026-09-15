import { US_STATES } from "./validation";

export type MemberGeocodeAddress = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
};

const clean = (value: unknown) => typeof value === "string"
  ? value.replace(/\s+/g, " ").replace(/(?:\s*,\s*)+/g, ", ").replace(/^,\s*|,\s*$/g, "").trim()
  : "";
const placeholder = (value: string) => /^(null|undefined)$/i.test(value);

/** Query normalization only. Never replaces the member's stored profile address. */
export function inspectMemberGeocodeAddress(member: MemberGeocodeAddress) {
  const street = clean(member.addressLine1);
  const suite = clean(member.addressLine2);
  const city = clean(member.city);
  const state = clean(member.state).toUpperCase();
  const zip = clean(member.zipCode).replace(/\s*-\s*/g, "-");
  const country = member.country === undefined ? "United States" : clean(member.country);
  if ([street, suite, city, state, zip, country].some(placeholder))
    return { quality: "MALFORMED" as const, query: null };
  if (![street, city, state, zip, country].every(Boolean))
    return { quality: "INCOMPLETE" as const, query: null };
  if (street.length < 2 || city.length < 2 || street.length > 180 || suite.length > 180 ||
      city.length > 120 || !(US_STATES as readonly string[]).includes(state) ||
      !/^\d{5}(?:-\d{4})?$/.test(zip) || !/^(United States|US|USA)$/i.test(country))
    return { quality: "MALFORMED" as const, query: null };
  return { quality: "COMPLETE" as const,
    query: [street, suite, city, state, zip, "United States"].filter(Boolean).join(", ") };
}

export function memberAddressQuery(member: MemberGeocodeAddress) {
  return inspectMemberGeocodeAddress(member).query;
}

/** Private RPC argument: reject a result computed for an outdated address. */
export function storedGeocodeAddress(member: MemberGeocodeAddress) {
  return {
    address_line_1: member.addressLine1 ?? null, address_line_2: member.addressLine2 ?? null,
    city: member.city ?? null, state: member.state ?? null, zip_code: member.zipCode ?? null,
    country: member.country === undefined ? "United States" : member.country,
  };
}
