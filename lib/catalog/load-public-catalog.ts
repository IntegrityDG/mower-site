import "server-only";

import type {
  CatalogOption,
  CatalogPrice,
  CatalogProduct,
  CatalogResponse,
  CatalogSpecificationCategory,
  CatalogSpecifications,
} from "@/lib/catalog/types";
import { salesModeForProductSlug } from "@/lib/catalog/sales-mode";
import { customerFacingOptions } from "@/lib/catalog/customer-facing-options";
import { getSupabaseCatalogClient } from "@/lib/supabase";
import type { ActivePriceSchedule, PriceScheduleTarget } from "@/lib/catalog/active-price-schedule";
import { scheduledPublicPrice, type PublicPriceRow } from "@/lib/catalog/public-price";
import {
  catalogAvailabilityFromPublicStatus,
  PUBLIC_CATALOG_STATUSES,
} from "@/lib/catalog/availability";

const fallbackImages: Record<string, string> = {
  "lymow-one-plus": "/products/lymow-one-plus-thumb.PNG",
  yarbo: "/products/yarbo-thumb.png",
  "pandag-g1": "/products/pandag-thumb.png",
};

const quoteOnlyPublicPrice: CatalogPrice = {
  displayMsrpPriceCents: null,
  regularPriceCents: null,
  salePriceCents: null,
  currentPriceCents: null,
  showPublicPrice: false,
  contactForPricing: true,
  promotionLabel: null,
  saleIsActive: false,
};

function ensureData<T>(
  label: string,
  result: { data: T[] | null; error: { message: string } | null }
) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result.data ?? [];
}

export async function loadPublicCatalog(
  productSlug?: string
): Promise<CatalogResponse> {
    const supabase = getSupabaseCatalogClient();
    let productsQuery = supabase
      .from("catalog_products")
      .select("*")
      .in("public_status", [...PUBLIC_CATALOG_STATUSES]);

    if (productSlug) {
      productsQuery = productsQuery.eq("slug", productSlug);
    }

    const productsResult = await productsQuery
      .order("sort_order")
      .order("name");
    const products = ensureData("Products", productsResult);

    if (!products.length) {
      return {
        products: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const productIds = products.map((product) => product.id);
    const now = Date.now();
    const [
      variantsResult,
      optionGroupsResult,
      optionsResult,
      packagesResult,
      pagesResult,
      mediaResult,
      schedulesResult,
    ] = await Promise.all([
      supabase
        .from("catalog_product_variants")
        .select("*")
        .in("product_id", productIds)
        .in("public_status", [...PUBLIC_CATALOG_STATUSES])
        .order("sort_order")
        .order("name"),
      supabase
        .from("catalog_option_groups")
        .select("*")
        .in("product_id", productIds)
        .order("sort_order")
        .order("group_name"),
      supabase
        .from("catalog_options")
        .select("*")
        .in("product_id", productIds)
        .in("public_status", [...PUBLIC_CATALOG_STATUSES])
        .order("sort_order")
        .order("name"),
      supabase
        .from("catalog_packages")
        .select("*")
        .in("product_id", productIds)
        .in("public_status", [...PUBLIC_CATALOG_STATUSES])
        .order("sort_order")
        .order("package_name"),
      supabase
        .from("catalog_product_pages")
        .select("*")
        .in("product_id", productIds)
        .eq("is_published", true),
      supabase
        .from("catalog_product_media")
        .select("*")
        .in("product_id", productIds)
        .eq("show_on_product_page", true)
        .order("sort_order"),
      supabase
        .from("catalog_price_schedules")
        .select("id, schedule_name, product_id, variant_id, option_id, package_id, service_id, product_service_id, starts_at, ends_at, regular_price_cents, sale_price_cents, promotion_label, show_public_price, contact_for_pricing, public_status")
        .eq("public_status", "active"),
    ]);

    const variants = ensureData("Variants", variantsResult);
    const optionGroups = ensureData("Option groups", optionGroupsResult);
    const options = ensureData("Options", optionsResult);
    const packages = ensureData("Packages", packagesResult);
    const pages = ensureData("Product pages", pagesResult);
    const media = ensureData("Product media", mediaResult);
    const schedules = ensureData("Price schedules", schedulesResult) as ActivePriceSchedule[];

    const variantIds = variants.map((variant) => variant.id);
    const packageIds = packages.map((catalogPackage) => catalogPackage.id);
    const pageIds = pages.map((page) => page.id);
    const emptyResult = Promise.resolve({ data: [], error: null });
    const [
      variantOptionsResult,
      packageItemsResult,
      sectionsResult,
      variantSpecificationValuesResult,
    ] = await Promise.all([
      variantIds.length
        ? supabase
            .from("catalog_variant_options")
            .select("*")
            .in("variant_id", variantIds)
        : emptyResult,
      packageIds.length
        ? supabase
            .from("catalog_package_items")
            .select("*")
            .in("package_id", packageIds)
        : emptyResult,
      pageIds.length
        ? supabase
            .from("catalog_product_page_sections")
            .select("*")
            .in("product_page_id", pageIds)
            .eq("is_published", true)
            .order("sort_order", { ascending: true })
        : emptyResult,
      variantIds.length
        ? supabase
            .from("catalog_variant_spec_values")
            .select(
              "id, variant_id, specification_definition_id, numeric_value, text_value, boolean_value, text_values, public_display_value, is_public"
            )
            .in("variant_id", variantIds)
            .eq("is_public", true)
        : emptyResult,
    ]);

    const variantOptions = ensureData("Variant options", variantOptionsResult);
    const packageItems = ensureData("Package items", packageItemsResult);
    const sections = ensureData("Product page sections", sectionsResult);
    const variantSpecificationValues = ensureData(
      "Variant specification values",
      variantSpecificationValuesResult
    );
    const definitionIds = [
      ...new Set(
        variantSpecificationValues.map(
          (value) => value.specification_definition_id
        )
      ),
    ];
    const specificationDefinitionsResult = definitionIds.length
      ? await supabase
          .from("catalog_spec_definitions")
          .select(
            "id, specification_slug, public_label, category, data_type, canonical_unit, sort_order, public_status"
          )
          .in("id", definitionIds)
          .eq("public_status", "active")
          .order("category")
          .order("sort_order")
      : { data: [], error: null };
    const specificationDefinitions = ensureData(
      "Specification definitions",
      specificationDefinitionsResult
    );

    const specificationCategory = (category: string): CatalogSpecificationCategory =>
      category === "cutting_height" ? "cuttingHeight" : category as CatalogSpecificationCategory;

    const specificationsForVariant = (variantId: string): CatalogSpecifications => {
      const grouped: CatalogSpecifications = {
        applications: [],
        power: [],
        performance: [],
        battery: [],
        cuttingHeight: [],
        physical: [],
      };

      variantSpecificationValues
        .filter((value) => value.variant_id === variantId)
        .forEach((value) => {
          const definition = specificationDefinitions.find(
            (candidate) => candidate.id === value.specification_definition_id
          );
          if (!definition) return;

          const category = specificationCategory(definition.category);
          grouped[category].push({
            slug: definition.specification_slug,
            label: definition.public_label,
            category,
            dataType: definition.data_type,
            canonicalUnit: definition.canonical_unit,
            numericValue: value.numeric_value,
            textValue: value.text_value,
            booleanValue: value.boolean_value,
            textValues: value.text_values,
            displayValue: value.public_display_value,
            sortOrder: definition.sort_order,
          });
        });

      return grouped;
    };

    const normalizedOptions: CatalogOption[] = options.map((option) => ({
      id: option.id,
      slug: option.option_slug,
      name: option.name,
      description: option.description,
      optionGroupId: option.option_group_id,
      isRequired: option.is_required,
      isIncluded: option.is_included,
      isRecommended: option.is_recommended,
      defaultQuantity: option.default_quantity,
      minimumQuantity: option.minimum_quantity,
      maximumQuantity: option.maximum_quantity,
      sortOrder: option.sort_order,
      accessoryListingEnabled: option.accessory_listing_enabled ?? false,
      accessoryTab: option.accessory_tab ?? null,
      accessoryImageUrl: option.accessory_image_url ?? null,
      accessoryImageAlt: option.accessory_image_alt ?? null,
      accessoryBadge: option.accessory_badge ?? null,
      idsExclusive: option.ids_exclusive ?? false,
      showInBuilder: option.show_in_builder ?? false,
      accessoryActionType: option.accessory_action_type ?? null,
      accessoryActionLabel: option.accessory_action_label ?? null,
      accessoryActionUrl: option.accessory_action_url ?? null,
      accessoryPriceText: option.accessory_price_text ?? null,
      manufacturerName: option.manufacturer_name ?? null,
      ...catalogAvailabilityFromPublicStatus(option.public_status),
      ...scheduledPublicPrice(option as PublicPriceRow, schedules, "option", option.id, now).price,
    }));

    const normalizedProducts: CatalogProduct[] = products.map((product) => {
      const salesMode = salesModeForProductSlug(product.slug);
      const publicPrice = (row: PublicPriceRow, target: PriceScheduleTarget, targetId: string) =>
        salesMode === "quote_only"
          ? quoteOnlyPublicPrice
          : scheduledPublicPrice(row, schedules, target, targetId, now).price;
      const productMedia = media
        .filter((item) => item.product_id === product.id)
        .map((item) => ({
          id: item.id,
          mediaType: item.media_type,
          url: item.url,
          altText: item.alt_text,
          caption: item.caption,
          isPrimary: item.is_primary,
        }));

      const primaryMedia =
        productMedia.find((item) => item.isPrimary && item.mediaType === "image") ??
        productMedia.find((item) => item.mediaType === "image");
      const page = pages.find((item) => item.product_id === product.id);
      const productOptionRows = normalizedOptions
        .filter(
          (option) =>
            options.find((row) => row.id === option.id)?.product_id === product.id
        )
        .map((option) => {
          if (salesMode !== "quote_only") return option;

          return { ...option, ...quoteOnlyPublicPrice };
        });

      const normalizedVariants = variants
        .filter((variant) => variant.product_id === product.id)
        .map((variant) => {
          const definingOptionIds = variantOptions
            .filter(
              (link) =>
                link.variant_id === variant.id &&
                link.relationship_type === "defines_variant"
            )
            .map((link) => link.option_id);
          const availability = catalogAvailabilityFromPublicStatus(variant.public_status);
          const definingOptionsAvailable = definingOptionIds.every(
            (optionId) => normalizedOptions.find((option) => option.id === optionId)?.isAvailable === true,
          );
          return {
            id: variant.id,
            slug: variant.variant_slug,
            sku: variant.sku,
            name: variant.name,
            description: variant.description,
            sortOrder: variant.sort_order,
            definingOptionIds,
            ...availability,
            isAvailable: availability.isAvailable && definingOptionsAvailable,
            ...(salesMode === "quote_only"
              ? { specifications: specificationsForVariant(variant.id) }
              : {}),
            ...publicPrice(variant, "variant", variant.id),
          };
        });

      const customerFacingProductOptionRows = customerFacingOptions(
        productOptionRows,
        normalizedVariants,
      );

      const normalizedGroups = optionGroups
        .filter((group) => group.product_id === product.id)
        .map((group) => ({
          id: group.id,
          slug: group.group_slug,
          name: group.group_name,
          description: group.group_description,
          selectionType: group.selection_type,
          isRequired: group.is_required,
          minimumSelections: group.minimum_selections,
          maximumSelections: group.maximum_selections,
          sortOrder: group.sort_order,
          options: customerFacingProductOptionRows.filter(
            (option) => option.optionGroupId === group.id
          ),
        }));

      const normalizedPackages = packages
        .filter((catalogPackage) => catalogPackage.product_id === product.id)
        .map((catalogPackage) => {
          const items = packageItems
            .filter((item) => item.package_id === catalogPackage.id)
            .map((item) => ({
              optionId: item.option_id,
              quantity: item.quantity,
              includedInPackagePrice: item.included_in_package_price,
              option:
                productOptionRows.find(
                  (option) => option.id === item.option_id
                ) ?? null,
            }));
          const availability = catalogAvailabilityFromPublicStatus(catalogPackage.public_status);
          return {
            id: catalogPackage.id,
            slug: catalogPackage.package_slug,
            name: catalogPackage.package_name,
            description: catalogPackage.description,
            sortOrder: catalogPackage.sort_order,
            items,
            ...availability,
            isAvailable: availability.isAvailable && items.every((item) => item.option?.isAvailable === true),
            ...publicPrice(catalogPackage, "package", catalogPackage.id),
          };
        });

      return {
        id: product.id,
        slug: product.slug,
        brand: product.brand,
        name: product.name,
        homepageSummary: product.homepage_summary,
        fullDescription: product.full_description,
        capabilityLevel: product.capability_level,
        propertyScale: product.property_scale,
        customerGuidance: product.customer_guidance,
        brochureUrl: product.brochure_url,
        videoUrl: product.video_url,
        imageUrl: primaryMedia?.url ?? fallbackImages[product.slug] ?? "/logo.png",
        imageAlt: primaryMedia?.altText ?? `${product.name} autonomous mower`,
        sortOrder: product.sort_order,
        salesMode,
        ...catalogAvailabilityFromPublicStatus(product.public_status),
        page: page
          ? {
              heroHeading: page.hero_heading,
              heroSubheading: page.hero_subheading,
              longFormContent: page.long_form_content,
              sections: sections
                .filter((section) => section.product_page_id === page.id)
                .map((section) => ({
                  id: section.id,
                  heading: section.heading,
                  bodyContent: section.body_content,
                  mediaUrl: section.media_url,
                  buttonLabel: section.button_label,
                  buttonUrl: section.button_url,
                  sortOrder: section.sort_order,
                })),
            }
          : null,
        media: productMedia,
        variants: normalizedVariants,
        optionGroups: normalizedGroups,
        ungroupedOptions: customerFacingProductOptionRows.filter(
          (option) => option.optionGroupId === null
        ),
        packages: normalizedPackages,
        ...publicPrice(product, "product", product.id),
      };
    });

    const response: CatalogResponse = {
      products: normalizedProducts,
      generatedAt: new Date().toISOString(),
    };

    return response;
}
