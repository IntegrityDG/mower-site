import type { CheckoutRequest } from "./types";

export const MAX_CHECKOUT_REQUEST_BYTES = 16_384;
export const MAX_CHECKOUT_OPTIONS = 20;
export const MAX_CHECKOUT_ITEM_QUANTITY = 10;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === "string";

export function parseCheckoutRequest(value: unknown): CheckoutRequest {
  if (!record(value) || !allowed(value, ["requestId", "paymentMethod", "selection", "customer", "shippingAddress"])) throw new Error("Invalid or unknown checkout request properties.");
  if (typeof value.requestId !== "string" || !uuid.test(value.requestId)) throw new Error("Invalid request UUID.");
  if (value.paymentMethod !== "card" && value.paymentMethod !== "ach") throw new Error("Unsupported payment method.");
  if (!record(value.selection) || !allowed(value.selection, ["productId", "variantId", "purchaseMode", "packageId", "options", "includeBaseProduct"])) throw new Error("Invalid or unknown selection properties.");
  const selection = value.selection;
  if (typeof selection.productId !== "string" || !uuid.test(selection.productId)) throw new Error("Invalid product ID.");
  if (!nullableString(selection.variantId) || (typeof selection.variantId === "string" && !uuid.test(selection.variantId))) throw new Error("Invalid variant ID.");
  if (!nullableString(selection.packageId) || (typeof selection.packageId === "string" && !uuid.test(selection.packageId))) throw new Error("Invalid package ID.");
  if (!["standard", "complete-system", "individual-equipment"].includes(String(selection.purchaseMode))) throw new Error("Invalid purchase mode.");
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
  if (!record(value.shippingAddress) || !allowed(value.shippingAddress, ["line1", "line2", "city", "state", "postalCode", "country"])) throw new Error("Invalid shipping address properties.");
  const address = value.shippingAddress;
  if ([address.line1, address.city, address.state, address.postalCode].some((part) => typeof part !== "string") || !nullableString(address.line2) || address.country !== "US") throw new Error("Only structured US shipping addresses are supported.");
  return { requestId: value.requestId, paymentMethod: value.paymentMethod, selection: { productId: selection.productId, variantId: selection.variantId as string | null, purchaseMode: selection.purchaseMode as CheckoutRequest["selection"]["purchaseMode"], packageId: selection.packageId as string | null, options, includeBaseProduct: selection.includeBaseProduct }, customer: { name: value.customer.name, email: value.customer.email as string | null, phone: value.customer.phone as string | null }, shippingAddress: { line1: address.line1 as string, line2: address.line2 as string | null, city: address.city as string, state: address.state as string, postalCode: address.postalCode as string, country: "US" } };
}
