import { catalogAvailabilityFromPublicStatus } from "../../lib/catalog/availability";
import { catalogVariantAvailability } from "../../lib/catalog/preorder";
import { priceFromRow } from "../../lib/catalog/public-price";
import type { CatalogProduct } from "../../lib/catalog/types";
import type { CheckoutCatalog } from "../../lib/checkout/eligibility";
import type { CheckoutRequest } from "../../lib/checkout/types";

export const start = "2026-09-15T05:00:00.000Z";
export const end = "2026-10-07T05:00:00.000Z";
export const during = Date.parse("2026-09-20T12:00:00Z");
export const mappings = [
  ["yarbo-snow-blower", "Snow Blower", 479900, 779900, 709900, ["snow"]],
  ["yarbo-lawn-mower-pro", "Lawn Mower Pro", 579900, 759900, 689900, ["mower"]],
  ["yarbo-leaf-blower", "Blower", 459900, 669900, 599900, ["blower"]],
  ["yarbo-snow-leaf", "Snow Blower + Blower", 579900, 889900, 809900, ["snow", "blower"]],
  ["yarbo-pro-snow", "Lawn Mower Pro + Snow Blower", 699900, 979900, 899900, ["mower", "snow"]],
  ["yarbo-pro-leaf", "Lawn Mower Pro + Blower", 679900, 869900, 789900, ["mower", "blower"]],
  ["yarbo-pro-snow-leaf", "Lawn Mower Pro + Snow Blower + Blower", 779900, 1089900, 999900, ["mower", "snow", "blower"]],
] as const;
export const priceRow = (regular: number | null, sale: number | null = null) => ({
  display_msrp_price_cents: null, regular_price_cents: regular, sale_price_cents: sale,
  sale_starts_at: sale === null ? null : start, sale_ends_at: sale === null ? null : end,
  promotion_label: sale === null ? null : "Early Access", show_public_price: true, contact_for_pricing: false,
});
const slugs = { mower: "yarbo-lawn-mower-pro-module", snow: "yarbo-snow-blower-module", blower: "yarbo-leaf-blower-module", trimmer: "yarbo-trimmer-module" };

export function checkoutCatalog(preorderEnabled = true): CheckoutCatalog {
  const options = Object.entries(slugs).map(([id, option_slug]) => ({
    id, product_id: "yarbo", option_slug, name: `${id} Module`, description: null,
    public_status: id === "trimmer" ? "unavailable" : "active",
    minimum_quantity: 0, maximum_quantity: 1, ...priceRow(100000),
  }));
  return {
    product: { id: "yarbo", slug: "yarbo", brand: "Yarbo", name: "Yarbo Core", public_status: "active", ...priceRow(374900) },
    variants: [
      { id: "y40", product_id: "yarbo", variant_slug: "yarbo-y40", name: "Y40 Core", description: null, sku: null, public_status: "active", preorder_enabled: false, ...priceRow(null) },
      { id: "y40p", product_id: "yarbo", variant_slug: "yarbo-y40p", name: "Y40P Core", description: null, sku: null, public_status: "coming_soon", preorder_enabled: preorderEnabled, ...priceRow(559900, 499900) },
    ], options,
    packages: mappings.map(([id, package_name, amount]) => ({ id, product_id: "yarbo", package_slug: id, package_name, description: null, public_status: "active", ...priceRow(amount) })),
    packageItems: mappings.flatMap(([id, , , , , parts]) => parts.map((option_id) => ({ id: `${id}-${option_id}`, package_id: id, option_id, quantity: 1, included_in_package_price: true }))),
    variantOptions: ["y40", "y40p"].flatMap((variant_id) => Object.keys(slugs).map((option_id) => ({ id: `${variant_id}-${option_id}`, variant_id, option_id, relationship_type: "compatible" }))),
    corePrices: mappings.flatMap(([package_id, , , msrp, sale]) => [
      { id: `${package_id}-y40`, product_id: "yarbo", package_id, core_variant_id: "y40", price_mode: "package" as const, public_status: "active", ...priceRow(null) },
      { id: `${package_id}-y40p`, product_id: "yarbo", package_id, core_variant_id: "y40p", price_mode: "core_specific" as const, public_status: "active", ...priceRow(msrp, sale) },
    ]),
  };
}

export function checkoutRequest(variantId = "y40p", packageId: string | null = "yarbo-pro-snow"): CheckoutRequest {
  return {
    requestId: "11111111-1111-4111-8111-111111111111", paymentMethod: "card",
    selection: { productId: "yarbo", variantId, purchaseMode: packageId ? "complete-system" : "individual-equipment", packageId, options: [], includeBaseProduct: !packageId },
    customer: { name: "Buyer", email: "buyer@example.com", phone: null },
    shippingAddress: { line1: "1 Main St", line2: null, city: "Columbia", state: "MO", postalCode: "65201", country: "US" },
  };
}

export function publicProduct(now = during, preorderEnabled = true): CatalogProduct {
  const catalog = checkoutCatalog(preorderEnabled);
  const options = catalog.options.map((row) => ({ id: row.id, slug: row.option_slug, name: row.name,
    description: null, optionGroupId: null, isRequired: false, isIncluded: false, isRecommended: false,
    defaultQuantity: 0, minimumQuantity: 0, maximumQuantity: 1, sortOrder: 1,
    ...catalogAvailabilityFromPublicStatus(row.public_status), ...priceFromRow({ ...priceRow(100000), ...row }, now),
  }));
  return {
    id: "yarbo", slug: "yarbo", brand: "Yarbo", name: "Yarbo Core", homepageSummary: null, fullDescription: null,
    capabilityLevel: null, propertyScale: null, customerGuidance: null, brochureUrl: null, videoUrl: null,
    imageUrl: "/yarbo.png", imageAlt: "Yarbo", sortOrder: 1, salesMode: "self_service", page: null, media: [],
    variants: catalog.variants.map((row) => ({ id: row.id, slug: row.variant_slug, name: row.name, sku: null,
      description: null, sortOrder: 1, definingOptionIds: [], ...catalogVariantAvailability(row, now),
      ...priceFromRow({ ...priceRow(null), ...row }, now),
    })), optionGroups: [], ungroupedOptions: options,
    packages: catalog.packages.map((row) => ({ id: row.id, slug: row.package_slug, name: row.package_name,
      description: null, sortOrder: 1, ...catalogAvailabilityFromPublicStatus(row.public_status),
      ...priceFromRow({ ...priceRow(null), ...row }, now),
      items: catalog.packageItems.filter((item) => item.package_id === row.id).map((item) => ({
        optionId: item.option_id, quantity: item.quantity, includedInPackagePrice: true, option: options.find((option) => option.id === item.option_id)!,
      })),
      corePrices: catalog.corePrices!.filter((price) => price.package_id === row.id).map((price) => ({
        id: price.id, coreVariantId: price.core_variant_id, priceMode: price.price_mode,
        ...catalogAvailabilityFromPublicStatus(price.public_status),
        ...priceFromRow({ ...priceRow(null), ...price,
          regular_price_cents: price.price_mode === "package" ? row.regular_price_cents : price.regular_price_cents }, now),
      })),
    })), ...catalogAvailabilityFromPublicStatus("active"), ...priceFromRow(priceRow(374900), now),
  };
}
