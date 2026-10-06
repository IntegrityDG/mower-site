import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { scheduledPublicPrice, type PublicPriceRow } from "@/lib/catalog/public-price";
import { readPricingProgramSettingsFailSafe } from "@/lib/pricing-program/server";
import type { ActivePriceSchedule } from "@/lib/catalog/active-price-schedule";
import type { CatalogDependencies, ManagedCatalog, ManagedCatalogItem, ManagedKind, ManagedPackage, PackageComponent } from "./types";
import { CatalogManagementError, catalogId, currentVersion, objectBody, validateCatalogValues, validateComponents } from "./validation";
import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";
import { managedCustomerPrice } from "./public-result";
import { assertSelfServicePackageComponents, packageComponentIsSelectable, packageProductIsQuoteOnly } from "./package-policy";

const tables = { products: "catalog_products", variants: "catalog_product_variants", options: "catalog_options", packages: "catalog_packages", "package-core-prices": "catalog_package_core_prices" } as const;
type Row = Record<string, unknown>;
function failure(error: { code?: string; message: string }): never {
  if (error.code === "40001") throw new CatalogManagementError(error.message, 409);
  if (error.code === "P0002") throw new CatalogManagementError("Catalog record not found.", 404);
  if (error.code === "23505") throw new CatalogManagementError("This catalog slug already exists.", 409);
  if (["23503", "23514", "P0001"].includes(error.code ?? "")) throw new CatalogManagementError(error.message, error.code === "23503" ? 409 : 422);
  throw new CatalogManagementError("Catalog update failed.", 500);
}
function ensure<T>(value: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (value.error) failure(value.error);
  return value.data as T;
}
export async function readManagedCatalog(archived = false): Promise<ManagedCatalog> {
  const client = getSupabaseServiceClient();
  const entries = await Promise.all(Object.entries(tables).filter(([kind]) => kind !== "package-core-prices").map(async ([kind, table]) => {
    const result = await client.from(table).select("*").order("sort_order");
    return [kind, ensure(result) ?? []] as [ManagedKind, Row[]];
  }));
  const rows = Object.fromEntries(entries) as Record<ManagedKind, Row[]>;
  const [componentResult, costResult, scheduleResult, settings] = await Promise.all([
    client.from("catalog_package_items").select("package_id,option_id,component_product_id,component_variant_id,quantity"),
    client.schema("catalog_private").from("catalog_internal_pricing").select("product_id,variant_id,option_id,package_id,dealer_cost_cents,updated_at").order("updated_at"),
    client.from("catalog_price_schedules").select("*").eq("public_status", "active"),
    readPricingProgramSettingsFailSafe(),
  ]);
  const components = ensure(componentResult) ?? [];
  const costs = ensure(costResult) ?? [];
  const schedules = (ensure(scheduleResult) ?? []) as ActivePriceSchedule[];
  const products = new Map(rows.products.map(row => [String(row.id), row]));
  const logicalYarboCoreExists = rows.products.some(row => row.slug === "yarbo" && !row.retired_at);
  const costMap = new Map<string, number | null>();
  for (const row of costs) for (const [kind, column] of [["products", "product_id"], ["variants", "variant_id"], ["options", "option_id"], ["packages", "package_id"]] as const) if (row[column]) costMap.set(`${kind}:${row[column]}`, row.dealer_cost_cents);
  function normalize(kind: ManagedKind, row: Row): ManagedCatalogItem | ManagedPackage {
    const productId = String(kind === "products" ? row.id : row.product_id);
    const product = products.get(productId);
    const target = ({ products: "product", variants: "variant", options: "option", packages: "package" } as const)[kind];
    const price = scheduledPublicPrice(row as PublicPriceRow, schedules, target, String(row.id), Date.now(), settings.everydayLowPriceEnabled).price;
    const base = {
      id: String(row.id), name: String(row.name ?? row.package_name), slug: String(row.slug ?? row.variant_slug ?? row.option_slug ?? row.package_slug),
      brand: String(kind === "products" ? row.brand : product?.brand ?? ""), category: String(row.catalog_category ?? (kind === "packages" ? "package" : kind)),
      description: (row.description ?? row.full_description ?? null) as string | null, imageUrl: (row.image_url ?? row.accessory_image_url ?? null) as string | null,
      compatibility: Array.isArray(row.compatibility) ? row.compatibility as string[] : [], publicStatus: String(row.public_status),
      retiredAt: (row.retired_at ?? null) as string | null, updatedAt: String(row.updated_at), productId, productSlug: String(product?.slug ?? ""),
      effectivePriceCents: row.show_public_price && !row.contact_for_pricing && String(product?.brand).toLowerCase() !== "pandag" ? price.currentPriceCents : null,
      dealerCostCents: costMap.get(`${kind}:${row.id}`) ?? null,
      packageSelectable: kind !== "packages" && packageComponentIsSelectable({
        kind, slug: String(row.slug ?? row.variant_slug ?? row.option_slug), productSlug: String(product?.slug ?? ""),
        brand: String(product?.brand ?? ""), category: String(row.catalog_category ?? ""),
        retiredAt: row.retired_at as string | null, parentRetiredAt: product?.retired_at as string | null,
      }, logicalYarboCoreExists),
      values: Object.fromEntries(Object.entries(row).filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))) as ManagedCatalogItem["values"],
    };
    if (kind === "packages") return { ...base, kind, isYarboCoreSelectable: row.core_selectable === true, components: [
      ...(row.core_selectable === true ? [{ kind: "products" as const, id: productId, quantity: 1 }] : []),
      ...components.filter(item => item.package_id === row.id).map(item => ({ kind: (item.option_id ? "options" : item.component_product_id ? "products" : "variants") as PackageComponent["kind"], id: String(item.option_id ?? item.component_product_id ?? item.component_variant_id), quantity: item.quantity })),
    ] };
    return { ...base, kind };
  }
  return {
    items: (["products", "variants", "options"] as const).flatMap(kind => rows[kind].filter(row => Boolean(row.retired_at) === archived && row.catalog_category !== "catalog_family").map(row => normalize(kind, row) as ManagedCatalogItem)),
    packages: rows.packages.filter(row => Boolean(row.retired_at) === archived).map(row => normalize("packages", row) as ManagedPackage),
  };
}
async function mutate(kind: ManagedKind | "package-core-prices" | "yarbo-y40-core" | "yarbo-y40-package", id: string | null, values: Row, expected: string | null, components?: PackageComponent[], allowInactiveComponents = false) {
  const result = await getSupabaseServiceClient().rpc("admin_manage_catalog", {
    p_kind: kind, p_id: id, p_expected_updated_at: expected, p_values: values,
    p_components: components ?? null, p_allow_inactive_components: allowInactiveComponents,
  });
  return ensure(result) as Row;
}
/** Pricing editor supplies its validated partial fields, with a mandatory version. */
export async function updateCatalogPricing(kind: ManagedKind | "package-core-prices" | "yarbo-y40-core" | "yarbo-y40-package", id: string, values: Row, expectedUpdatedAt?: string) {
  return mutate(kind, catalogId(id), values, currentVersion(expectedUpdatedAt));
}
export async function createManagedProduct(input: unknown) {
  const values = validateCatalogValues("products", input, true);
  return catalogWriteResult("products", await mutate("products", null, { public_status: "hidden", show_public_price: false, contact_for_pricing: true, ...values, admin_managed: true }, null));
}
async function catalogWriteResult(kind: ManagedKind, row: Row) {
  return { ...row, effectivePriceCents: managedCustomerPrice(kind, String(row.id), await loadPublicCatalog()) };
}
async function resolvePackageInput(input: Row, creating: boolean) {
  const { components: rawComponents, product_id: rawProductId, corePrices, allowInactiveComponents, ...metadataInput } = input;
  const metadata = { ...metadataInput };
  delete metadata.brand;
  const values = validateCatalogValues("packages", metadata, creating);
  let components = rawComponents === undefined ? undefined : validateComponents(rawComponents);
  if (creating && !components) throw new CatalogManagementError("Select package components.");
  const client = getSupabaseServiceClient();
  let preferredMachineAnchor: string | null = null;
  if (components) {
    const records = await Promise.all(components.map(async component => ({ component, row: ensure(await client.from(tables[component.kind]).select("*").eq("id", component.id).single()) as Row })));
    const parentIds = [...new Set(records.filter(({ component }) => component.kind !== "products").map(({ row }) => String(row.product_id)))];
    const parentRows = parentIds.length
      ? ensure(await client.from("catalog_products").select("id,slug,brand,retired_at").in("id", parentIds)) as Row[]
      : [];
    const parents = new Map(parentRows.map(row => [String(row.id), row]));
    assertSelfServicePackageComponents(records, parents);
    if (records.some(({ row }) => row.retired_at)) throw new CatalogManagementError("Retired components cannot be added to a package.");
    if (records.some(({ row }) => row.catalog_category === "catalog_family")) throw new CatalogManagementError("A catalog family is not a sellable component.");
    for (const { component, row } of records) {
      if (component.kind === "variants" && records.some(candidate => candidate.component.kind === "products" && candidate.row.id === row.product_id)) throw new CatalogManagementError("Select a machine or its configuration, not both.");
    }
    const machineRecord = records.find(({ component, row }) => component.kind === "variants" || (component.kind === "products" && ["machine", "core", "configuration"].includes(String(row.catalog_category).toLowerCase())));
    if (machineRecord) preferredMachineAnchor = String(machineRecord.row.product_id ?? machineRecord.row.id);
    if (records.some(({ row }) => row.public_status !== "active") && allowInactiveComponents !== true) throw new CatalogManagementError("Inactive components require an explicit override.");
    const logicalCores = records.filter(({ component, row }) => (component.kind === "products" && row.slug === "yarbo") || (component.kind === "variants" && ["yarbo-y40", "yarbo-y40p"].includes(String(row.variant_slug))));
    if (logicalCores.length > 1 || logicalCores.some(({ component }) => component.quantity !== 1)) throw new CatalogManagementError("Select one logical Yarbo Core with quantity one.");
    if (logicalCores.length) {
      const yarbo = ensure(await client.from("catalog_products").select("id").eq("slug", "yarbo").single()) as Row;
      values.core_selectable = true;
      const selected = logicalCores[0].component;
      components = components.map(component => component === selected ? { kind: "products", id: String(yarbo.id), quantity: 1 } : component);
    }
  }
  if (creating) {
    let productId = rawProductId ? catalogId(rawProductId) : preferredMachineAnchor;
    if (rawProductId && values.core_selectable !== true) {
      const anchor = ensure(await client.from("catalog_products").select("id,slug,brand,retired_at").eq("id", productId).single()) as Row;
      if (anchor.retired_at) throw new CatalogManagementError("A retired product cannot anchor a new package.");
      if (packageProductIsQuoteOnly({ slug: String(anchor.slug), brand: String(anchor.brand) })) throw new CatalogManagementError("A quote-only product cannot anchor a self-service package. Use the existing quote or Custom Invoice workflow.");
    }
    if (!productId && values.core_selectable !== true) values.use_catalog_bundle_family = true;
    if (!productId && components?.length) {
      const first = components[0];
      const row = ensure(await client.from(tables[first.kind]).select(first.kind === "products" ? "id" : "product_id").eq("id", first.id).single()) as Row;
      productId = String(row.product_id ?? row.id);
    }
    if (!productId) throw new CatalogManagementError("Choose a package parent product.");
    values.product_id = productId;
    values.admin_managed = true;
  }
  if (values.core_selectable === true && creating) {
    const yarbo = ensure(await client.from("catalog_products").select("id").eq("slug", "yarbo").single()) as Row;
    values.product_id = yarbo.id;
  }
  if (corePrices !== undefined) {
    const core = objectBody(corePrices);
    if (!creating) throw new CatalogManagementError("Edit Core-specific pricing using its own pricing card.");
    if (Object.keys(core).some(key => key !== "y40p")) throw new CatalogManagementError("Only the Y40P package override may be provided here.");
    values.core_prices = { y40p: validateCatalogValues("package-core-prices", core.y40p) };
  }
  if (allowInactiveComponents !== undefined && typeof allowInactiveComponents !== "boolean") throw new CatalogManagementError("Inactive component override must be explicit.");
  return { values, components, allowInactiveComponents: allowInactiveComponents === true };
}
export async function createManagedPackage(input: unknown) {
  const parsed = await resolvePackageInput(objectBody(input), true);
  return catalogWriteResult("packages", await mutate("packages", null, { public_status: "hidden", show_public_price: false, contact_for_pricing: true, ...parsed.values }, null, parsed.components, parsed.allowInactiveComponents));
}
export async function updateManagedRecord(kind: ManagedKind, id: string, input: unknown) {
  const body = objectBody(input);
  if (Object.keys(body).some(key => !["expectedUpdatedAt", "values", "components", "allowInactiveComponents", "corePrices"].includes(key))) throw new CatalogManagementError("Unknown catalog update property.");
  const expected = currentVersion(body.expectedUpdatedAt);
  if (kind === "packages") {
    const parsed = await resolvePackageInput({ ...objectBody(body.values), ...(body.components === undefined ? {} : { components: body.components }), ...(body.corePrices === undefined ? {} : { corePrices: body.corePrices }), allowInactiveComponents: body.allowInactiveComponents }, false);
    return catalogWriteResult(kind, await mutate(kind, catalogId(id), parsed.values, expected, parsed.components, parsed.allowInactiveComponents));
  }
  return catalogWriteResult(kind, await mutate(kind, catalogId(id), validateCatalogValues(kind, body.values), expected));
}
export async function readCatalogDependencies(kind: ManagedKind, id: string): Promise<CatalogDependencies> {
  return ensure(await getSupabaseServiceClient().rpc("admin_catalog_dependencies", { p_kind: kind, p_id: catalogId(id) })) as CatalogDependencies;
}
export async function retireManagedRecord(kind: ManagedKind, id: string, input: unknown) {
  const body = objectBody(input);
  if (Object.keys(body).some(key => !["expectedUpdatedAt", "retireDependentPackages"].includes(key))) throw new CatalogManagementError("Unknown catalog deletion property.");
  if (body.retireDependentPackages !== undefined && typeof body.retireDependentPackages !== "boolean") throw new CatalogManagementError("Confirm dependent package retirement explicitly.");
  return ensure(await getSupabaseServiceClient().rpc("admin_retire_catalog", { p_kind: kind, p_id: catalogId(id), p_expected_updated_at: currentVersion(body.expectedUpdatedAt), p_retire_dependencies: body.retireDependentPackages === true }));
}
