# IDS Supabase Catalog Schema Brief

## Purpose

This brief documents the approved architecture for moving IDS product, option, package, service, media, availability, and public pricing data into Supabase.

Supabase will become the master source for the public catalog. The homepage product cards, dedicated product pages, nationwide ordering flow, local service flow, and future service experiences should all read from the same catalog data.

This document is intentionally not a migration file. No SQL should be generated or applied until this brief is approved.

## General Rules

- Supabase is the master source for products, options, packages, services, media, availability, and public pricing.
- Homepage product cards, dedicated product pages, ordering flows, and service flows use the same Supabase catalog.
- All monetary values use integer cents in USD.
- Unknown prices are stored as `null`.
- Items with unavailable public pricing display `Contact for pricing.`
- Pricing is nationwide and not region-specific for the initial version.
- IDS will manage the catalog through the Supabase Table Editor initially.
- A private admin page may be added later.
- Final prices, packages, compatibility rules, specifications, and promotions are not defined by this brief.

## Public Status Rules

Catalog records that appear publicly should use these statuses:

- `active`: visible and selectable.
- `unavailable`: visible but not selectable.
- `coming_soon`: visible with a Coming Soon label and not selectable.
- `hidden`: not visible publicly.

## Security Rules

- Public anonymous and authenticated website users may read only published catalog information.
- Public website users may not insert, update, or delete catalog records.
- Supabase Dashboard users manage the catalog using their authorized Supabase account.
- Internal costs, margins, supplier notes, private notes, dealer pricing, and other private operating data must not be exposed publicly.
- The current `quote_requests` security settings are out of scope for this catalog task and should not be modified here.

## Recommended Tables

### 1. `catalog_products`

Controls the primary public product records used across the site.

Recommended fields:

- `id`
- `slug`
- `brand`
- `name`
- `homepage_summary`
- `full_description`
- `capability_level`
- `property_scale`
- `customer_guidance`
- `is_featured`
- `public_status`
- `sort_order`
- `brochure_url`
- `video_url`
- `regular_price_cents`
- `sale_price_cents`
- `sale_starts_at`
- `sale_ends_at`
- `promotion_label`
- `show_public_price`
- `contact_for_pricing`
- `created_at`
- `updated_at`

Notes:

- `slug` powers public product routes.
- `public_status` controls public visibility and selectability.
- `show_public_price` and `contact_for_pricing` control whether prices appear publicly.
- Product-level price fields support simple base-unit pricing. More detailed package or option pricing should live on package and option records.

### 2. `catalog_product_media`

Controls images and videos attached to products.

Recommended fields:

- `id`
- `product_id`
- `media_type`
- `url`
- `alt_text`
- `caption`
- `is_primary`
- `show_on_product_page`
- `sort_order`
- `created_at`
- `updated_at`

Notes:

- `media_type` should support values such as `image` and `video`.
- Homepage cards should use the primary product image.
- Product pages may use additional visible media sorted by `sort_order`.

### 3. `catalog_product_pages`

Controls dedicated product-page metadata and top-level content.

Recommended fields:

- `id`
- `product_id`
- `seo_title`
- `seo_description`
- `hero_heading`
- `hero_subheading`
- `long_form_content`
- `is_published`
- `created_at`
- `updated_at`

Notes:

- Each public product page belongs to one product.
- The Next.js route and layout remain application-controlled.
- Supabase supplies product page content, media, pricing, options, and availability.

### 4. `catalog_product_page_sections`

Controls editable sections within a product page.

Recommended fields:

- `id`
- `product_page_id`
- `section_type`
- `heading`
- `body_content`
- `media_url`
- `button_label`
- `button_url`
- `sort_order`
- `is_published`
- `created_at`
- `updated_at`

Notes:

- Product-page layouts can render known `section_type` values from application code.
- `sort_order` controls the public display order.
- This keeps dedicated product pages editable without making the whole page layout database-driven.

### 5. `catalog_option_groups`

Controls product configuration groups.

Recommended fields:

- `id`
- `product_id`
- `group_name`
- `group_description`
- `selection_type`
- `is_required`
- `minimum_selections`
- `maximum_selections`
- `sort_order`
- `created_at`
- `updated_at`

Selection types:

- `single`
- `multiple`
- `quantity`
- `included`

Notes:

- Required charger choices, optional modules, quantity accessories, and included equipment should all be represented as option groups.
- `minimum_selections` and `maximum_selections` support future validation without rebuilding the application flow.

### 6. `catalog_options`

Controls individual product options, accessories, modules, chargers, docks, and included equipment.

Recommended fields:

- `id`
- `product_id`
- `option_group_id`
- `option_slug`
- `name`
- `description`
- `public_status`
- `is_required`
- `is_included`
- `is_recommended`
- `default_quantity`
- `minimum_quantity`
- `maximum_quantity`
- `regular_price_cents`
- `sale_price_cents`
- `sale_starts_at`
- `sale_ends_at`
- `promotion_label`
- `show_public_price`
- `contact_for_pricing`
- `sort_order`
- `created_at`
- `updated_at`

Notes:

- Unknown option prices should be stored as `null`.
- Quantity-based accessories use `default_quantity`, `minimum_quantity`, and `maximum_quantity`.
- `maximum_quantity` should be `null` when no maximum has been supplied.
- Included equipment should use `is_included = true` and should not be treated as separately selectable.
- Coming-soon or unavailable options remain visible when their `public_status` allows it, but they are not selectable.

### 7. `catalog_packages`

Controls product packages.

Recommended fields:

- `id`
- `product_id`
- `package_name`
- `description`
- `public_status`
- `regular_price_cents`
- `sale_price_cents`
- `sale_starts_at`
- `sale_ends_at`
- `promotion_label`
- `show_public_price`
- `contact_for_pricing`
- `sort_order`
- `created_at`
- `updated_at`

Notes:

- Packages allow IDS to define product bundles without hardcoding package names in the UI.
- Yarbo Pro package details should remain placeholders until final IDS package information is supplied.

### 8. `catalog_package_items`

Defines the options included in each package.

Recommended fields:

- `id`
- `package_id`
- `option_id`
- `quantity`
- `included_in_package_price`
- `created_at`
- `updated_at`

Notes:

- This table allows packages to include chargers, docks, modules, accessories, or other product options.
- `included_in_package_price` distinguishes included package contents from separately priced add-ons.

### 9. `catalog_services`

Controls public service offerings.

Recommended fields:

- `id`
- `service_slug`
- `name`
- `description`
- `service_category`
- `billing_type`
- `requires_local_service`
- `requires_property_review`
- `estimated_hours`
- `maximum_visit_hours`
- `season_length`
- `public_status`
- `regular_price_cents`
- `sale_price_cents`
- `sale_starts_at`
- `sale_ends_at`
- `promotion_label`
- `show_public_price`
- `contact_for_pricing`
- `sort_order`
- `created_at`
- `updated_at`

Service categories:

- `installation`
- `remote_support`
- `ongoing_support`
- `property_management`
- `repair`
- `referral`

Billing types:

- `one_time`
- `hourly`
- `monthly`
- `seasonal`
- `included`
- `quote_required`

Initial services:

- Basic Operational Deployment
- Professional Integrated Deployment
- Remote Setup Guidance
- Dealer Referral Assistance
- Essential Care
- Performance Management
- Full Property Management
- Service and Repair Visit

### 10. `catalog_product_services`

Connects products and services.

Recommended fields:

- `id`
- `product_id`
- `service_id`
- `is_available`
- `is_recommended`
- `is_required`
- `override_regular_price_cents`
- `override_sale_price_cents`
- `override_sale_starts_at`
- `override_sale_ends_at`
- `override_promotion_label`
- `override_show_public_price`
- `override_contact_for_pricing`
- `sort_order`
- `created_at`
- `updated_at`

Notes:

- Services may have global pricing in `catalog_services`.
- Product-specific service pricing can be supplied here later when needed.
- Product-specific overrides should remain `null` when the global service price applies.

### 11. `catalog_service_regions`

Controls where local services are available.

Recommended fields:

- `id`
- `state`
- `region_name`
- `public_status`
- `local_services_available`
- `sort_order`
- `created_at`
- `updated_at`

Initial service regions:

- Southern Missouri - East
- Southern Missouri - West
- Northern Arkansas - East
- Northern Arkansas - West
- Western Kentucky
- Western Tennessee
- Southern Illinois

Notes:

- The initial version can map the existing application state and region labels into this table.
- Future versions may add more precise geographic boundaries.

## Product Rules

### Lymow One Plus

- Uses a required single-select configuration group.
- Includes a 5A Charger configuration option.
- Includes a 10A Charger configuration option.
- Final pricing and package details are not defined by this brief.

### Yarbo Pro

- Uses a flexible architecture for future modules and packages.
- Final package names are not defined yet.
- Final module compatibility rules are not defined yet.
- Final prices are not defined yet.
- Placeholder package or module records may be seeded later only if clearly marked as placeholders or coming soon.

### Pandag G1

- The standard charging cable is included equipment.
- The charging dock is optional and recommended.
- The charging dock uses quantity selection.
- Charging dock default quantity is `0`.
- Charging dock minimum quantity is `0`.
- Charging dock maximum quantity is `null` unless supplied later.
- Future modules may be visible as `coming_soon`.
- Coming-soon future modules are visible but disabled and cannot affect order summary or pricing.

## Product Pages

Each product page will use a dynamic Next.js route:

- `/products/lymow-one-plus`
- `/products/yarbo-pro`
- `/products/pandag-g1`

The route and page layout remain controlled by Next.js. Supabase supplies product content, media, pricing, options, packages, services, and availability.

## Recommendation Engine

Recommendation scoring should remain in application code during the initial catalog rollout.

The application can read products, options, public statuses, service availability, and prices from Supabase, then apply recommendation scoring locally.

Recommendation data could later move into Supabase through tables such as product scoring rules, property-condition rules, option compatibility rules, and regional availability rules. Those recommendation tables are intentionally excluded from the first catalog migration to keep the initial rollout smaller and safer.

## Relationship Diagram

```text
catalog_products
  |-- catalog_product_media
  |-- catalog_product_pages
  |     |-- catalog_product_page_sections
  |
  |-- catalog_option_groups
  |     |-- catalog_options
  |
  |-- catalog_packages
  |     |-- catalog_package_items
  |           |-- catalog_options
  |
  |-- catalog_product_services
        |-- catalog_services

catalog_service_regions
  controls local service availability by state and region
```

## How Catalog Data Powers the Website

### Homepage Product Cards

Homepage product cards should read from `catalog_products` and `catalog_product_media`.

Recommended filters:

- `is_featured = true`
- `public_status` is not `hidden`
- primary media from `catalog_product_media`

The homepage can display product name, brand, summary, public status, price display, promotion label, and primary image from Supabase.

### Dedicated Product Pages

Dedicated product pages should read from:

- `catalog_products`
- `catalog_product_media`
- `catalog_product_pages`
- `catalog_product_page_sections`
- `catalog_option_groups`
- `catalog_options`
- `catalog_packages`
- `catalog_package_items`
- `catalog_product_services`

The Next.js page controls layout and rendering. Supabase controls editable content and public catalog data.

### Nationwide Ordering

The nationwide purchase flow should read active products and valid public configuration groups from:

- `catalog_products`
- `catalog_option_groups`
- `catalog_options`
- `catalog_packages`
- `catalog_package_items`
- `catalog_services`
- `catalog_product_services`

The flow should use public status and selection rules to decide what can be selected.

### Local Service Ordering

The local service path should read services and region availability from:

- `catalog_services`
- `catalog_product_services`
- `catalog_service_regions`

The existing state and region selection can be mapped to `catalog_service_regions` before showing local service options.

### Recommendation Results

Recommendation results should read products, options, services, availability, and statuses from the catalog, then apply application-level scoring.

The result page can recommend only records that are publicly visible and currently available for the relevant flow.

## Implementation Phases

1. Approve schema brief.
2. Generate migration and seed files.
3. Review SQL.
4. Apply catalog migration.
5. Seed initial products, options, and services.
6. Verify RLS policies.
7. Connect homepage Products section.
8. Create dedicated product pages.
9. Connect Nationwide Purchase flow.
10. Connect local service flow.
11. Build private admin page later.

## Remaining IDS Decisions Needed Before Migration

- Confirm final public product names, brands, slugs, and homepage summaries.
- Confirm final product descriptions and product-page sales content.
- Confirm product images, video URLs, brochure URLs, captions, and alt text.
- Confirm product capability levels, property scale labels, and customer guidance copy.
- Confirm base-unit pricing for Lymow One Plus, Yarbo Pro, and Pandag G1.
- Confirm sale pricing rules, promotion labels, sale start dates, and sale end dates.
- Confirm whether products with unknown prices should show `Contact for pricing` or hide price areas.
- Confirm exact Lymow charger package language and whether each charger option affects price.
- Confirm Yarbo Pro package names, module options, compatibility rules, and pricing.
- Confirm Pandag G1 charging dock price when available.
- Confirm future Pandag module names, availability timing, and pricing.
- Confirm whether any products, options, or services should launch as `coming_soon` or `unavailable`.
- Confirm all IDS service descriptions, billing types, and price behavior.
- Confirm which services require local service coverage.
- Confirm which services require property review before quoting.
- Confirm service availability for each initial region.
- Confirm whether service region records should remain label-based at first or include more precise geography later.
- Confirm Supabase RLS policies for public catalog reads and catalog write restrictions.
- Confirm who will manage catalog records in the Supabase Dashboard.
- Confirm whether a private admin page is needed in the near term or later.
