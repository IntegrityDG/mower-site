import type { CheckoutRequest } from "./types";

export const MAX_CHECKOUT_REQUEST_BYTES = 16_384;
export const MAX_CHECKOUT_OPTIONS = 60;
export const MAX_CHECKOUT_ITEM_QUANTITY = 10;

export async function readLimitedCheckoutBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_CHECKOUT_REQUEST_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === "string";

export function parseCheckoutRequest(value: unknown): CheckoutRequest {
  if (!record(value) || !allowed(value, ["requestId", "paymentMethod", "selection", "customer", "referral", "shippingAddress"])) throw new Error("Invalid or unknown checkout request properties.");
  if (typeof value.requestId !== "string" || !uuid.test(value.requestId)) throw new Error("Invalid request UUID.");
  if (value.paymentMethod !== "card" && value.paymentMethod !== "ach_debit" && value.paymentMethod !== "wire_transfer") throw new Error("Unsupported payment method.");
  if (!record(value.selection) || !allowed(value.selection, ["productId", "variantId", "purchaseMode", "packageId", "options", "includeBaseProduct"])) throw new Error("Invalid or unknown selection properties.");
  const selection = value.selection;
  if (typeof selection.productId !== "string" || !uuid.test(selection.productId)) throw new Error("Invalid product ID.");
  if (!nullableString(selection.variantId) || (typeof selection.variantId === "string" && !uuid.test(selection.variantId))) throw new Error("Invalid variant ID.");
  if (!nullableString(selection.packageId) || (typeof selection.packageId === "string" && !uuid.test(selection.packageId))) throw new Error("Invalid package ID.");
  if (!["standard", "complete-system", "individual-equipment", "accessories"].includes(String(selection.purchaseMode))) throw new Error("Invalid purchase mode.");
  if (typeof selection.includeBaseProduct !== "boolean" || !Array.isArray(selection.options) || selection.options.length > MAX_CHECKOUT_OPTIONS) throw new Error("Invalid selection.");
  const seen = new Set<string>();
  const options = selection.options.map((item) => {
    if (!record(item) || !allowed(item, ["optionId", "quantity"]) || typeof item.optionId !== "string" || !uuid.test(item.optionId)) throw new Error("Invalid option selection.");
    if (seen.has(item.optionId)) throw new Error("Duplicate option ID.");
    seen.add(item.optionId);
    if (typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_CHECKOUT_ITEM_QUANTITY) throw new Error("Invalid option quantity.");
    return { optionId: item.optionId, quantity: item.quantity };
  });
  if (!record(value.customer) || !allowed(value.customer, ["name", "email", "phone"]) || typeof value.customer.name !== "string" || !nullableString(value.customer.email) || !nullableString(value.customer.phone)) throw new Error("Invalid customer properties.");
  const customerName = value.customer.name.trim();
  const customerEmail = typeof value.customer.email === "string" ? value.customer.email.trim() : null;
  const customerPhone = typeof value.customer.phone === "string" ? value.customer.phone.trim() : null;
  if (!customerName || customerName.length > 200 || (customerEmail?.length ?? 0) > 254 || (customerPhone?.length ?? 0) > 50 || (!customerEmail && !customerPhone)) throw new Error("Valid customer contact information is required.");
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Invalid customer email.");
  let referral: CheckoutRequest["referral"] = null;
  if (value.referral !== null && value.referral !== undefined) {
    if (!record(value.referral) || !allowed(value.referral, ["referrerName", "referrerEmail"])) throw new Error("Invalid referral properties.");
    const referrerName = typeof value.referral.referrerName === "string" ? value.referral.referrerName.trim() : "";
    const referrerEmail = typeof value.referral.referrerEmail === "string" ? value.referral.referrerEmail.trim().toLowerCase() : "";
    if (!referrerName || referrerName.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(referrerEmail) || referrerEmail.length > 254) throw new Error("A valid referrer name and email are required together.");
    referral = { referrerName, referrerEmail };
  }
  if (!record(value.shippingAddress) || !allowed(value.shippingAddress, ["line1", "line2", "city", "state", "postalCode", "country"])) throw new Error("Invalid shipping address properties.");
  const address = value.shippingAddress;
  if ([address.line1, address.city, address.state, address.postalCode].some((part) => typeof part !== "string") || !nullableString(address.line2) || address.country !== "US") throw new Error("Only structured US shipping addresses are supported.");
  const shipping = { line1: (address.line1 as string).trim(), line2: typeof address.line2 === "string" ? address.line2.trim() || null : null, city: (address.city as string).trim(), state: (address.state as string).trim().toUpperCase(), postalCode: (address.postalCode as string).trim(), country: "US" as const };
  if (!shipping.line1 || !shipping.city || !shipping.state || !shipping.postalCode || shipping.line1.length > 200 || (shipping.line2?.length ?? 0) > 200 || shipping.city.length > 100 || shipping.state.length > 50 || shipping.postalCode.length > 20) throw new Error("Invalid shipping address.");
  return { requestId: value.requestId, paymentMethod: value.paymentMethod, selection: { productId: selection.productId, variantId: selection.variantId as string | null, purchaseMode: selection.purchaseMode as CheckoutRequest["selection"]["purchaseMode"], packageId: selection.packageId as string | null, options, includeBaseProduct: selection.includeBaseProduct }, customer: { name: customerName, email: customerEmail, phone: customerPhone }, referral, shippingAddress: shipping };
}
