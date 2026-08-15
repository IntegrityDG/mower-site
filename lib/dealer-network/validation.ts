import type {
  BusinessType,
  CertificationInput,
  DealerApplicationInput,
  MemberRole,
  SuggestionCategory,
} from "./types";

export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
] as const;
const stateSet = new Set<string>(US_STATES);
const roles = new Set<MemberRole>(["dealer", "repair_tech", "both"]);
const businessTypes = new Set<BusinessType>([
  "robotic_mower_dealer",
  "robotic_mower_repair",
  "general_repair_shop",
  "small_engine_repair_shop",
  "other",
]);
const suggestionCategories = new Set<SuggestionCategory>([
  "new_brand",
  "database_correction",
  "member_information",
  "search_improvement",
  "portal_improvement",
  "inaccurate_information",
  "other",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const record = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
const text = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
const optionalText = (value: unknown, maximum: number) =>
  text(value, maximum) || null;
const stringList = (value: unknown) => {
  if (value === undefined || value === null)
    return { values: [] as string[], valid: true };
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some((item) => typeof item !== "string" || !uuidPattern.test(item))
  )
    return { values: [] as string[], valid: false };
  return { values: [...new Set(value)], valid: true };
};

const validDate = (value: string) => {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

export function normalizeUsPhone(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `1${digits}`;
  if (
    digits.length === 11 &&
    digits.startsWith("1") &&
    /^[2-9]/.test(digits.slice(1))
  )
    return digits;
  return null;
}

export function normalizeEmail(value: unknown) {
  const email = text(value, 254).toLowerCase();
  return emailPattern.test(email) ? email : null;
}

export function normalizeCompanyName(value: unknown) {
  return text(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function safeHttpUrl(value: unknown) {
  const candidate = text(value, 2000);
  if (!candidate || candidate.length > 2000) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function certification(value: unknown): CertificationInput | null {
  const input = record(value);
  const certificationName = text(input.certificationName, 200);
  const brandOrManufacturer = text(input.brandOrManufacturer, 160);
  const issuingOrganization = text(input.issuingOrganization, 200);
  const dateEarned = optionalText(input.dateEarned, 10);
  const expirationDate = optionalText(input.expirationDate, 10);
  if (!certificationName || !brandOrManufacturer || !issuingOrganization)
    return null;
  if (
    (dateEarned && !validDate(dateEarned)) ||
    (expirationDate && !validDate(expirationDate))
  )
    return null;
  if (dateEarned && expirationDate && expirationDate < dateEarned) return null;
  return {
    certificationName,
    brandOrManufacturer,
    issuingOrganization,
    dateEarned,
    expirationDate,
  };
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

export function validateDealerApplication(
  input: unknown,
): ValidationResult<DealerApplicationInput> {
  const body = record(input);
  const errors: Record<string, string> = {};
  const applicantName = text(body.applicantName, 160);
  const companyName = text(body.companyName, 180);
  const phone = text(body.phone, 30);
  const normalizedPhone = normalizeUsPhone(phone);
  const email = text(body.email, 254);
  const normalizedEmail = normalizeEmail(email);
  const addressLine1 = text(body.addressLine1, 180);
  const addressLine2 = optionalText(body.addressLine2, 180);
  const city = text(body.city, 120);
  const state = text(body.state, 2).toUpperCase();
  const zipCode = text(body.zipCode, 10);
  const websiteUrl = safeHttpUrl(body.websiteUrl);
  const role = body.role as MemberRole;
  const experience = text(body.experience, 1000);
  const serviceRegion = text(body.serviceRegion, 500);
  const introduction = text(body.introduction, 3000);
  const businessType = body.businessType as BusinessType;
  const otherBusinessType = optionalText(body.otherBusinessType, 160);
  const repairShop =
    businessType === "general_repair_shop" ||
    businessType === "small_engine_repair_shop";
  const certificationAnswer =
    repairShop && typeof body.certificationAnswer === "boolean"
      ? body.certificationAnswer
      : null;
  const rawCertifications = Array.isArray(body.certifications)
    ? body.certifications
    : [];
  const certifications =
    repairShop && certificationAnswer
      ? rawCertifications
          .map(certification)
          .filter((item): item is CertificationInput => Boolean(item))
          .slice(0, 20)
      : [];
  const sold = stringList(body.brandsSold);
  const serviced = stringList(body.brandsServiced);
  const brandsSold = sold.values;
  const brandsServiced = serviced.values;
  const normalizedCompanyName = normalizeCompanyName(companyName);
  if (applicantName.length < 2 || applicantName.length > 160)
    errors.applicantName = "Applicant name is required.";
  if (companyName.length < 2 || companyName.length > 180)
    errors.companyName = "Company name is required.";
  if (normalizedCompanyName.length < 2)
    errors.companyName = "Enter a company name containing letters or numbers.";
  if (!normalizedPhone || phone.length > 30)
    errors.phone = "Enter a valid U.S. phone number.";
  if (!normalizedEmail || email.length > 254)
    errors.email = "Enter a valid email address.";
  if (addressLine1.length < 2 || addressLine1.length > 180)
    errors.addressLine1 = "Business address is required.";
  if (addressLine2 && addressLine2.length > 180)
    errors.addressLine2 = "Address line 2 is too long.";
  if (city.length < 2 || city.length > 120) errors.city = "City is required.";
  if (!stateSet.has(state)) errors.state = "Choose a valid U.S. state.";
  if (!/^\d{5}(-\d{4})?$/.test(zipCode))
    errors.zipCode = "Enter a valid U.S. ZIP code.";
  if (body.websiteUrl && !websiteUrl)
    errors.websiteUrl = "Enter a valid HTTP or HTTPS URL.";
  if (!roles.has(role)) errors.role = "Choose a member role.";
  if (!sold.valid)
    errors.brandsSold = "Brands sold contains an invalid selection.";
  if (!serviced.valid)
    errors.brandsServiced = "Brands serviced contains an invalid selection.";
  if ((role === "dealer" || role === "both") && brandsSold.length === 0)
    errors.brandsSold = "Select at least one brand sold.";
  if (
    (role === "repair_tech" || role === "both") &&
    brandsServiced.length === 0
  )
    errors.brandsServiced = "Select at least one brand serviced or repaired.";
  if (!experience || experience.length > 1000)
    errors.experience = "Describe your experience.";
  if (!serviceRegion || serviceRegion.length > 500)
    errors.serviceRegion = "Describe your service region.";
  if (!introduction || introduction.length > 3000)
    errors.introduction = "Add a brief introduction.";
  if (!businessTypes.has(businessType))
    errors.businessType = "Choose a business type.";
  if (businessType === "other" && !otherBusinessType)
    errors.otherBusinessType = "Describe the professional business type.";
  if (repairShop && certificationAnswer === null)
    errors.certificationAnswer =
      "Answer the certification and training question.";
  if (otherBusinessType && otherBusinessType.length > 160)
    errors.otherBusinessType = "Business type description is too long.";
  if (repairShop && certificationAnswer && certifications.length === 0)
    errors.certifications =
      "Add at least one certification or training record.";
  if (
    repairShop &&
    certificationAnswer &&
    certifications.length !== rawCertifications.length
  )
    errors.certifications =
      "Complete each certification record and use valid dates.";
  if (body.consent !== true)
    errors.consent = "Consent is required before submitting.";
  if (
    Object.keys(errors).length ||
    !normalizedPhone ||
    !normalizedEmail ||
    !roles.has(role) ||
    !businessTypes.has(businessType)
  )
    return { ok: false, errors };
  return {
    ok: true,
    value: {
      applicantName,
      companyName,
      phone,
      normalizedPhone,
      email,
      normalizedEmail,
      normalizedCompanyName,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      websiteUrl,
      role,
      experience,
      serviceRegion,
      introduction,
      businessType,
      otherBusinessType,
      certificationAnswer,
      brandsSold,
      brandsServiced,
      certifications,
      consent: true,
    },
  };
}

export function validatePin(value: unknown) {
  return typeof value === "string" && /^\d{6}$/.test(value) ? value : null;
}

export function validateUuid(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

export function validateSuggestion(input: unknown) {
  const body = record(input);
  const category = body.category as SuggestionCategory;
  const subject = text(body.subject, 180);
  const message = text(body.message, 3000);
  const errors: Record<string, string> = {};
  if (!suggestionCategories.has(category))
    errors.category = "Choose a suggestion type.";
  if (subject.length < 2 || subject.length > 180)
    errors.subject = "Subject is required and must be 180 characters or fewer.";
  if (message.length < 5 || message.length > 3000)
    errors.message = "Please provide between 5 and 3,000 characters.";
  return Object.keys(errors).length
    ? { ok: false as const, errors }
    : { ok: true as const, value: { category, subject, message } };
}

export function validateMemberProfile(input: unknown) {
  const body = record(input);
  const errors: Record<string, string> = {};
  const memberName = text(body.memberName, 160);
  const companyName = text(body.companyName, 180);
  const phone = text(body.phone, 30);
  const normalizedPhone = normalizeUsPhone(phone);
  const email = text(body.email, 254);
  const normalizedEmail = normalizeEmail(email);
  const addressLine1 = text(body.addressLine1, 180);
  const addressLine2 = optionalText(body.addressLine2, 180);
  const city = text(body.city, 120);
  const state = text(body.state, 2).toUpperCase();
  const zipCode = text(body.zipCode, 10);
  const websiteUrl = safeHttpUrl(body.websiteUrl);
  const role = body.role as MemberRole;
  const experience = text(body.experience, 1000);
  const serviceRegion = text(body.serviceRegion, 500);
  const introduction = text(body.introduction, 3000);
  const currentPin = typeof body.currentPin === "string" ? body.currentPin : "";
  const normalizedCompanyName = normalizeCompanyName(companyName);
  if (memberName.length < 2 || memberName.length > 160)
    errors.memberName = "Member name is required.";
  if (
    companyName.length < 2 ||
    companyName.length > 180 ||
    normalizedCompanyName.length < 2
  )
    errors.companyName = "Enter a valid company name.";
  if (!normalizedPhone || phone.length > 30)
    errors.phone = "Enter a valid U.S. phone number.";
  if (!normalizedEmail || email.length > 254)
    errors.email = "Enter a valid email address.";
  if (addressLine1.length < 2 || addressLine1.length > 180)
    errors.addressLine1 = "Business address is required.";
  if (addressLine2 && addressLine2.length > 180)
    errors.addressLine2 = "Address line 2 is too long.";
  if (city.length < 2 || city.length > 120) errors.city = "City is required.";
  if (!stateSet.has(state)) errors.state = "Choose a valid U.S. state.";
  if (!/^\d{5}(-\d{4})?$/.test(zipCode))
    errors.zipCode = "Enter a valid U.S. ZIP code.";
  if (body.websiteUrl && !websiteUrl)
    errors.websiteUrl = "Enter a valid HTTP or HTTPS URL.";
  if (!roles.has(role)) errors.role = "Choose a valid member role.";
  if (
    !experience ||
    experience.length > 1000 ||
    !serviceRegion ||
    serviceRegion.length > 500 ||
    !introduction ||
    introduction.length > 3000
  )
    errors.profile =
      "Experience, service region, and introduction are required and must fit the stated limits.";
  if (
    Object.keys(errors).length ||
    !normalizedPhone ||
    !normalizedEmail ||
    !roles.has(role)
  )
    return { ok: false as const, errors };
  return {
    ok: true as const,
    value: {
      memberName,
      companyName,
      normalizedCompanyName,
      phone,
      normalizedPhone,
      email,
      normalizedEmail,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      websiteUrl,
      role,
      experience,
      serviceRegion,
      introduction,
      currentPin,
    },
  };
}

export function readBoundedText(input: unknown, maximum: number) {
  return text(input, maximum);
}
