import { NextResponse } from "next/server";

import type {
  CatalogOption,
  CatalogPrice,
  CatalogProduct,
  CatalogResponse,
  CatalogService,
} from "@/lib/catalog/types";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const fallbackImages: Record<string, string> = {
  "lymow-one-plus": "/products/lymow-one-plus-thumb.PNG",
  yarbo: "/products/yarbo-thumb.png",
  "pandag-g1": "/products/pandag-thumb.png",
};

type PriceRow = {
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  promotion_label: string | null;
  show_public_price: boolean;
  contact_for_pricing: boolean;
};

function priceFromRow(row: PriceRow): CatalogPrice {
  const now = Date.now();
  const startsAt = row.sale_starts_at
    ? new Date(row.sale_starts_at).getTime()
    : Number.NEGATIVE_INFINITY;
  const endsAt = row.sale_ends_at
    ? new Date(row.sale_ends_at).getTime()
    : Number.POSITIVE_INFINITY;
  const saleIsActive =
    row.sale_price_cents !== null && now >= startsAt && now <= endsAt;

  return {
    regularPriceCents: row.regular_price_cents,
    salePriceCents: row.sale_price_cents,
    currentPriceCents: saleIsActive
      ? row.sale_price_cents
      : row.regular_price_cents,
    showPublicPrice: row.show_public_price,
    contactForPricing: row.contact_for_pricing,
    promotionLabel: saleIsActive ? row.promotion_label : null,
    saleIsActive,
  };
}

function ensureData<T>(
  label: string,
  result: { data: T[] | null; error: { message: string } | null }
) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result.data ?? [];
}

export async function GET() {
  try {
    const [
      productsResult,
      variantsResult,
      variantOptionsResult,
      optionGroupsResult,
      optionsResult,
      packagesResult,
      packageItemsResult,
      pagesResult,
      sectionsResult,
      mediaResult,
      servicesResult,
      productServicesResult,
      paymentOptionsResult,
    ] = await Promise.all([
      supabase
        .from("catalog_products")
        .select("*")
        .eq("public_status", "active")
        .order("sort_order")
        .order("name"),
      supabase
        .from("catalog_product_variants")
        .select("*")
        .eq("public_status", "active")
        .order("sort_order")
        .order("name"),
      supabase.from("catalog_variant_options").select("*"),
      supabase
        .from("catalog_option_groups")
        .select("*")
        .order("sort_order")
        .order("group_name"),
      supabase
        .from("catalog_options")
        .select("*")
        .eq("public_status", "active")
        .order("sort_order")
        .order("name"),
      supabase
        .from("catalog_packages")
        .select("*")
        .eq("public_status", "active")
        .order("sort_order")
        .order("package_name"),
      supabase.from("catalog_package_items").select("*"),
      supabase
        .from("catalog_product_pages")
        .select("*")
        .eq("is_published", true),
      supabase
        .from("catalog_product_page_sections")
        .select("*")
        .eq("is_published", true)
        .order("sort_order"),
      supabase
        .from("catalog_product_media")
        .select("*")
        .eq("show_on_product_page", true)
        .order("sort_order"),
      supabase
        .from("catalog_services")
        .select("*")
        .eq("public_status", "active")
        .order("sort_order")
        .order("name"),
      supabase
        .from("catalog_product_services")
        .select("*")
        .eq("is_available", true)
        .order("sort_order"),
      supabase
        .from("catalog_service_payment_options")
        .select("*")
        .eq("is_available", true)
        .order("sort_order")
        .order("payment_option_name"),
    ]);

    const products = ensureData("Products", productsResult);
    const variants = ensureData("Variants", variantsResult);
    const variantOptions = ensureData("Variant options", variantOptionsResult);
    const optionGroups = ensureData("Option groups", optionGroupsResult);
    const options = ensureData("Options", optionsResult);
    const packages = ensureData("Packages", packagesResult);
    const packageItems = ensureData("Package items", packageItemsResult);
    const pages = ensureData("Product pages", pagesResult);
    const sections = ensureData("Product page sections", sectionsResult);
    const media = ensureData("Product media", mediaResult);
    const services = ensureData("Services", servicesResult);
    const productServices = ensureData(
      "Product services",
      productServicesResult
    );
    const paymentOptions = ensureData(
      "Service payment options",
      paymentOptionsResult
    );

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
      ...priceFromRow(option),
    }));

    const normalizedProducts: CatalogProduct[] = products.map((product) => {
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
      const productOptionRows = normalizedOptions.filter(
        (option) => options.find((row) => row.id === option.id)?.product_id === product.id
      );

      const normalizedVariants = variants
        .filter((variant) => variant.product_id === product.id)
        .map((variant) => ({
          id: variant.id,
          slug: variant.variant_slug,
          sku: variant.sku,
          name: variant.name,
          description: variant.description,
          sortOrder: variant.sort_order,
          definingOptionIds: variantOptions
            .filter(
              (link) =>
                link.variant_id === variant.id &&
                link.relationship_type === "defines_variant"
            )
            .map((link) => link.option_id),
          ...priceFromRow(variant),
        }));

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
          options: productOptionRows.filter(
            (option) => option.optionGroupId === group.id
          ),
        }));

      const normalizedPackages = packages
        .filter((catalogPackage) => catalogPackage.product_id === product.id)
        .map((catalogPackage) => ({
          id: catalogPackage.id,
          slug: catalogPackage.package_slug,
          name: catalogPackage.package_name,
          description: catalogPackage.description,
          sortOrder: catalogPackage.sort_order,
          items: packageItems
            .filter((item) => item.package_id === catalogPackage.id)
            .map((item) => ({
              optionId: item.option_id,
              quantity: item.quantity,
              includedInPackagePrice: item.included_in_package_price,
              option:
                productOptionRows.find(
                  (option) => option.id === item.option_id
                ) ?? null,
            })),
          ...priceFromRow(catalogPackage),
        }));

      const normalizedServices: CatalogService[] = productServices
        .filter((link) => link.product_id === product.id)
        .flatMap((link) => {
          const service = services.find((item) => item.id === link.service_id);
          if (!service) return [];

          const priceRow: PriceRow = {
            regular_price_cents:
              link.override_regular_price_cents ?? service.regular_price_cents,
            sale_price_cents:
              link.override_sale_price_cents ?? service.sale_price_cents,
            sale_starts_at:
              link.override_sale_starts_at ?? service.sale_starts_at,
            sale_ends_at: link.override_sale_ends_at ?? service.sale_ends_at,
            promotion_label:
              link.override_promotion_label ?? service.promotion_label,
            show_public_price:
              link.override_show_public_price ?? service.show_public_price,
            contact_for_pricing:
              link.override_contact_for_pricing ?? service.contact_for_pricing,
          };

          return [
            {
              id: service.id,
              slug: service.service_slug,
              name: service.name,
              description: service.description,
              category: service.service_category,
              billingType: service.billing_type,
              requiresLocalService: service.requires_local_service,
              requiresPropertyReview: service.requires_property_review,
              estimatedHours: service.estimated_hours,
              maximumVisitHours: service.maximum_visit_hours,
              seasonLength: service.season_length,
              isRecommended: link.is_recommended,
              isRequired: link.is_required,
              sortOrder: link.sort_order || service.sort_order,
              paymentOptions: paymentOptions
                .filter((option) => option.service_id === service.id)
                .map((option) => ({
                  id: option.id,
                  slug: option.payment_option_slug,
                  name: option.payment_option_name,
                  billingType: option.billing_type,
                  seasonLengthMonths: option.season_length_months,
                  savingsLabel: option.savings_label,
                  notes: option.notes,
                  sortOrder: option.sort_order,
                  ...priceFromRow({
                    ...option,
                    sale_starts_at: null,
                    sale_ends_at: null,
                    promotion_label: null,
                    show_public_price: true,
                    contact_for_pricing: false,
                  }),
                })),
              ...priceFromRow(priceRow),
            },
          ];
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

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
        ungroupedOptions: productOptionRows.filter(
          (option) => option.optionGroupId === null
        ),
        packages: normalizedPackages,
        services: normalizedServices,
        ...priceFromRow(product),
      };
    });

    const response: CatalogResponse = {
      products: normalizedProducts,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Catalog API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the product catalog.",
      },
      { status: 500 }
    );
  }
}
