export type GeneralQuoteRequest = {
  name: string;
  phone: string | null;
  email: string | null;
  preferredContactMethod: string | null;
  propertyType: string | null;
  propertySize: string | null;
  obstacleLevel: string | null;
  weedEating: string | null;
  purchaseType: string | null;
  extraNotes: string | null;
  productSlug: string;
  interests: string[];
  terrain: string[];
  priorities: string[];
  productInterest: string[];
  autoSuggestion: string[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedKeys = new Set([
  "name", "phone", "email", "preferredContactMethod", "propertyType",
  "propertySize", "obstacleLevel", "weedEating", "purchaseType", "extraNotes",
  "productSlug", "interests", "terrain", "priorities", "productInterest", "autoSuggestion",
]);

function text(body: Record<string, unknown>, key: string, maximum: number) {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid field type.");
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (normalized.length > maximum) throw new Error("A field is too long.");
  return normalized || null;
}

function multilineText(body: Record<string, unknown>, key: string, maximum: number) {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid field type.");
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .trim();
  if (normalized.length > maximum) throw new Error("A field is too long.");
  return normalized || null;
}

function list(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error("Invalid list.");
  return value.map((item) => {
    if (typeof item !== "string") throw new Error("Invalid list item.");
    const normalized = item.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!normalized || normalized.length > 200) throw new Error("Invalid list item.");
    return normalized;
  });
}

export function validateGeneralQuoteRequest(input: unknown): GeneralQuoteRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid request.");
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) throw new Error("Unknown request field.");
  const name = text(body, "name", 200);
  const phone = text(body, "phone", 50);
  const email = text(body, "email", 254)?.toLowerCase() ?? null;
  if (!name || (!phone && !email) || (email && !emailPattern.test(email))) throw new Error("Valid contact information is required.");
  return {
    name,
    phone,
    email,
    preferredContactMethod: text(body, "preferredContactMethod", 50),
    propertyType: text(body, "propertyType", 160),
    propertySize: text(body, "propertySize", 300),
    obstacleLevel: text(body, "obstacleLevel", 500),
    weedEating: text(body, "weedEating", 500),
    purchaseType: text(body, "purchaseType", 100),
    extraNotes: multilineText(body, "extraNotes", 8_000),
    productSlug: text(body, "productSlug", 120) ?? "",
    interests: list(body, "interests"),
    terrain: list(body, "terrain"),
    priorities: list(body, "priorities"),
    productInterest: list(body, "productInterest"),
    autoSuggestion: list(body, "autoSuggestion"),
  };
}
