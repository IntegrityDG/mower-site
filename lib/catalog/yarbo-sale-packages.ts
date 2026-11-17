import type { CatalogPackage, CatalogPackageItem, CatalogPrice, CatalogProduct } from "./types";
import { isWithinPriceWindow } from "../pricing-program/window";
import { isYarboModuleSlug } from "./yarbo";
import { yarboCoreCanBeSelected, yarboCorePrice, yarboCoreVariants } from "./yarbo-core";

function scheduledSaleOnly(price: CatalogPrice | null | undefined) {
  if (!price || price.regularPriceCents !== null || price.salePriceCents === null) return false;
  const start = Date.parse(price.saleStartsAt ?? "");
  const end = Date.parse(price.saleEndsAt ?? "");
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

/** Pricing semantics, not a year, holiday name, or slug convention. A regular
 * package running its own sale remains a regular package. */
function promotionOnly(item: CatalogPackage) {
  const rows = [item, ...(item.corePrices ?? []).filter(price => price.priceMode === "core_specific")];
  return rows.every(price => price.regularPriceCents === null) && rows.some(scheduledSaleOnly);
}

const slug = (item: CatalogPackageItem) => item.component?.slug ?? item.option?.slug ?? "";
const moduleItem = (item: CatalogPackageItem) => isYarboModuleSlug(slug(item)) || item.option?.catalogCategory === "module";

function moduleSignature(item: CatalogPackage) {
  const quantities = new Map<string, number>();
  for (const part of item.items.filter(moduleItem)) {
    if (!part.includedInPackagePrice || part.quantity <= 0) return null;
    quantities.set(slug(part), (quantities.get(slug(part)) ?? 0) + part.quantity);
  }
  return quantities.size ? JSON.stringify([...quantities].sort(([a], [b]) => a.localeCompare(b))) : null;
}

function coversRegularEquipment(regular: CatalogPackage, sale: CatalogPackage) {
  const signature = moduleSignature(regular);
  if (!signature || signature !== moduleSignature(sale)) return false;
  // Gifts and platform hardware in a sale do not make its task modules different.
  // But never discard a unique extra already included in the regular package.
  return regular.items.filter(item => !moduleItem(item)).every(item => {
    if (!item.includedInPackagePrice || !slug(item)) return false;
    return sale.items.filter(part => slug(part) === slug(item) && part.includedInPackagePrice)
      .reduce((sum, part) => sum + part.quantity, 0) >= item.quantity;
  });
}

/** The original card owns presentation; the matching offer owns the actual order. */
export function yarboSaleForCore(product: CatalogProduct, regular: CatalogPackage, coreId: string, now = Date.now()) {
  const core = yarboCoreVariants(product).find(item => item.id === coreId);
  if (!core || promotionOnly(regular) || !yarboCoreCanBeSelected(product, core, regular)) return null;
  return product.packages.find(sale => {
    if (!promotionOnly(sale) || !coversRegularEquipment(regular, sale) || !yarboCoreCanBeSelected(product, core, sale)) return false;
    const price = yarboCorePrice(product, core, sale);
    return Boolean(scheduledSaleOnly(price) && price?.saleIsActive && price.salePriceCents !== null &&
      isWithinPriceWindow({ startsAt: price.saleStartsAt, endsAt: price.saleEndsAt }, now));
  }) ?? null;
}

/** Keep unmatched offers; never merge different task modules or quantities. */
export function yarboPackagesDuringSale(product: CatalogProduct, now = Date.now()) {
  if (product.slug !== "yarbo") return product.packages;
  return product.packages.filter(item => {
    if (!promotionOnly(item)) return true;
    // Resolve scheduled Core relationships even after public current prices expire.
    const offeredCores = yarboCoreVariants(product).filter(core =>
      scheduledSaleOnly(yarboCorePrice(product, core, item)));
    const representedByOriginal = offeredCores.length > 0 && offeredCores.every(core =>
      product.packages.some(regular => !promotionOnly(regular) &&
        coversRegularEquipment(regular, item) && yarboCoreCanBeSelected(product, core, regular)));
    if (representedByOriginal) return false;
    // Distinct/new base setups retain their card while their offer is upcoming or
    // active; sale-only cards with no remaining price disappear after all cutoffs.
    const schedules = [item, ...(item.corePrices ?? [])].filter(scheduledSaleOnly);
    return !schedules.length || schedules.some(price => Date.parse(price.saleEndsAt!) > now);
  });
}

/** Resolve a selected sale back to its original presentation card, even after expiry. */
export function yarboPackageCard(product: CatalogProduct, packageId: string) {
  const selected = product.packages.find(item => item.id === packageId);
  if (!selected || !promotionOnly(selected)) return selected ?? null;
  return product.packages.find(item => !promotionOnly(item) && coversRegularEquipment(item, selected)) ?? selected;
}

export function yarboPackageForCore(product: CatalogProduct, card: CatalogPackage, coreId: string, now = Date.now()) {
  return yarboSaleForCore(product, card, coreId, now) ?? card;
}

export function yarboSaleExtraNames(regular: CatalogPackage, sale: CatalogPackage) {
  return sale.items.filter(item => item.includedInPackagePrice && !moduleItem(item)).flatMap(item => {
    const prior = regular.items.filter(part => slug(part) === slug(item)).reduce((sum, part) => sum + part.quantity, 0);
    const quantity = item.quantity - prior;
    const name = item.component?.name ?? item.option?.name;
    return name && quantity > 0 ? [quantity > 1 ? `${name} × ${quantity}` : name] : [];
  });
}

/** Refresh the public snapshot at sale boundaries, including an already-open builder. */
export function nextPackageSaleBoundaryDelay(product: CatalogProduct, now: number) {
  const times = [product, ...product.variants, ...product.packages.flatMap(item => [item, ...(item.corePrices ?? [])])]
    .flatMap(price => [price.saleStartsAt, price.saleEndsAt])
    .map(value => value ? Date.parse(value) : NaN)
    .filter(time => Number.isFinite(time) && time > now);
  return times.length ? Math.min(Math.min(...times) - now + 50, 2_147_483_647) : null;
}


export function yarboSaleLabel(product: CatalogProduct, sale: CatalogPackage, coreId: string) {
  const core = yarboCoreVariants(product).find(item => item.id === coreId);
  const price = core ? yarboCorePrice(product, core, sale) : null;
  return price?.promotionLabel ?? price?.scheduledSaleLabel ??
    (/black friday/i.test(sale.name) ? "Black Friday sale" : "Limited-time sale");
}
