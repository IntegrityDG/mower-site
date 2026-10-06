import { isUuid } from "@/lib/admin-pricing/validation";
import type { ComponentKind, ManagedKind, PackageComponent } from "./types";

export class CatalogManagementError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
const pricingFields = ["display_msrp_price_cents", "regular_price_cents", "sale_price_cents", "sale_starts_at", "sale_ends_at", "promotion_label", "show_public_price", "contact_for_pricing", "public_status", "dealer_cost_cents"];
const metadataFields: Record<ManagedKind | "package-core-prices", string[]> = {
  products: ["name", "slug", "brand", "category", "description", "image_url", "compatibility"],
  variants: ["name", "description", "image_url", "compatibility", "preorder_enabled", "category"],
  options: ["name", "description", "image_url", "compatibility", "category"],
  packages: ["package_name", "package_slug", "description", "image_url", "isYarboCoreSelectable"],
  "package-core-prices": [],
};
export function objectBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CatalogManagementError("A JSON object is required.");
  return input as Record<string, unknown>;
}
export function managedKind(input: string): ManagedKind {
  if (!["products", "variants", "options", "packages"].includes(input)) throw new CatalogManagementError("Unknown catalog kind.", 400);
  return input as ManagedKind;
}
export function currentVersion(input: unknown): string {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))) throw new CatalogManagementError("A current catalog version is required. Reload the catalog.", 409);
  return input;
}
export function catalogId(input: unknown): string {
  if (typeof input !== "string" || !isUuid(input)) throw new CatalogManagementError("Invalid catalog id.", 400);
  return input;
}
export function validateComponents(input: unknown): PackageComponent[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new CatalogManagementError("Select 1 to 100 package components.");
  const seen = new Set<string>();
  return input.map(raw => {
    const value = objectBody(raw);
    if (Object.keys(value).some(key => !["kind", "id", "quantity"].includes(key))) throw new CatalogManagementError("Unknown package component property.");
    if (!["products", "variants", "options"].includes(String(value.kind))) throw new CatalogManagementError("Packages cannot contain another package.");
    const kind = value.kind as ComponentKind;
    const id = catalogId(value.id);
    if (!Number.isSafeInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > 100) throw new CatalogManagementError("Component quantity must be 1 to 100.");
    const key = `${kind}:${id}`;
    if (seen.has(key)) throw new CatalogManagementError("Each component can be selected once; change its quantity instead.");
    seen.add(key);
    return { kind, id, quantity: Number(value.quantity) };
  });
}
export function validateCatalogValues(kind: ManagedKind | "package-core-prices", input: unknown, creating = false) {
  const body = objectBody(input);
  if (!creating && ("slug" in body || "package_slug" in body)) throw new CatalogManagementError("Existing catalog URLs are preserved. Create a replacement offering to use a new slug.");
  const allowed = new Set([...pricingFields, ...metadataFields[kind]]);
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body)) {
    if (!allowed.has(key)) throw new CatalogManagementError(`Unknown catalog property: ${key}.`);
    if (key.endsWith("_cents")) {
      if (raw !== null && (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > 2147483647)) throw new CatalogManagementError(`${key} must be null or a non-negative integer number of cents.`);
      result[key] = raw;
    } else if (key === "sale_starts_at" || key === "sale_ends_at") {
      if (raw === null || raw === "") result[key] = null;
      else if (typeof raw !== "string" || !Number.isFinite(Date.parse(raw))) throw new CatalogManagementError("Sale dates must be valid dates.");
      else result[key] = new Date(raw).toISOString();
    } else if (["show_public_price", "contact_for_pricing", "preorder_enabled", "isYarboCoreSelectable"].includes(key)) {
      if (typeof raw !== "boolean") throw new CatalogManagementError(`${key} must be a boolean.`);
      result[key === "isYarboCoreSelectable" ? "core_selectable" : key] = raw;
    } else if (key === "public_status") {
      if (!["active", "unavailable", "coming_soon", "hidden"].includes(String(raw))) throw new CatalogManagementError("Invalid availability state.");
      result[key] = raw;
    } else if (key === "compatibility") {
      if (!Array.isArray(raw) || raw.length > 30 || raw.some(item => typeof item !== "string" || item.length > 120)) throw new CatalogManagementError("Compatibility must contain up to 30 short labels.");
      result[key] = [...new Set(raw.map(item => item.trim()).filter(Boolean))];
    } else {
      const required = ["name", "brand", "slug", "package_name", "package_slug", "category"].includes(key);
      if (raw === null && !required) { result[key] = null; continue; }
      if (typeof raw !== "string" || (required && !raw.trim()) || raw.length > (key === "description" ? 6000 : key === "image_url" ? 2000 : 160)) throw new CatalogManagementError(`${key} has an invalid length.`);
      const value = raw.trim();
      if (key === "slug" || key === "package_slug") {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new CatalogManagementError("Slug must use lowercase words separated by hyphens.");
      }
      if (key === "image_url" && value.startsWith("//")) throw new CatalogManagementError("Image must be a site media path or HTTPS URL.");
      if (key === "image_url" && value && !value.startsWith("/")) {
        let url: URL;
        try { url = new URL(value); } catch { throw new CatalogManagementError("Image must be a site media path or HTTPS URL."); }
        if (url.protocol !== "https:") throw new CatalogManagementError("Image must be a site media path or HTTPS URL.");
      }
      const column = key === "category" ? "catalog_category" : key === "description" && kind === "products" ? "full_description" : key === "image_url" && kind === "options" ? "accessory_image_url" : key;
      result[column] = value || null;
    }
  }
  if (creating) {
    const required = kind === "products" ? ["name", "slug", "brand", "catalog_category"] : kind === "packages" ? ["package_name", "package_slug"] : ["name"];
    if (required.some(key => !result[key])) throw new CatalogManagementError("Name, identity, brand and category are required.");
  }
  const start = result.sale_starts_at, end = result.sale_ends_at;
  if (typeof start === "string" && typeof end === "string" && Date.parse(start) >= Date.parse(end)) throw new CatalogManagementError("Sale start must be before sale end.");
  return result;
}
