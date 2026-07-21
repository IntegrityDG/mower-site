# Yarbo Catalog Proposal

Review date: 2026-07-20
Phase: review only

This proposal reflects the final IDS merchandising decision: remove the proposed Yarbo guided module workflow and present Yarbo through two customer-facing catalog sections.

1. Complete Yarbo Packages
2. Individual Yarbo Equipment

This proposal does not approve manufacturer-monitoring candidates and does not change the database.

## Positioning

Yarbo is a modular, year-round outdoor equipment platform. Yarbo Core is the powered base robot. Complete packages include Core plus one or more task modules. Individual equipment gives customers a straightforward way to buy Core or module-only equipment manually.

Do not present Yarbo as an automatic package-matching experience. Do not require customers to identify themselves as new or existing owners. Do not convert module choices into a package. Do not add a Yarbo-specific Build Your Own workflow.

## Page-Level Copy

### Yarbo Core

- Customer-facing name: Yarbo Core
- Hero headline: Yarbo Core powers modular outdoor care across seasons.
- Catalog-card description: The Yarbo Core is the powered platform for mowing, Pro mowing, snow clearing, blowing, trimming, and towing-capable yard work.
- Full overview: Yarbo Core is the base robot for the Yarbo Y Series. It supplies the tracked drive platform, app control, autonomous navigation hardware, battery system, charging equipment, Data Center, and platform foundation used by Yarbo modules. Customers can choose a complete package or purchase individual equipment manually.
- Best-fit guidance: Best for properties that need one expandable outdoor platform rather than a single-purpose mower or snow machine.
- Key strengths: modular Y Series platform; tracked drive; app control; RTK/GPS and camera/sensor navigation references; auto recharging; tow/haul support where approved.
- Property and operating considerations: plan the Docking Station and Data Center locations; verify mowing, snow, blowing, trimming, slopes, routes, debris, and safe operating zones before purchase.
- Verified specifications: official Core page excerpts support 500 lb towing capacity, up to 31 acres max coverage, 0.6 m/s max moving speed, 70% / 35 deg applicable slope, up to 4 hr per charge, IPX5 reference, and all-weather durability from -13 F to 113 F.
- Included equipment: official Core page lists Core x1, Docking Station x1, Y Series Battery x1, Wired Charger x1, Data Center x1, Installation and Tool Kit x1, Tow Hitch x1, 2-Year Warranty, 30-Day Hassle-Free Returns, and 24/7 Support.
- Compatible modules: Standard Lawn Mower Module, Lawn Mower Pro Module, Snow Blower Module, Blower Module, Yarbo Trimmer Package.
- Replacement parts: none active in the reviewed IDS Yarbo public output.
- Warranty summary: official Yarbo pages consistently show 2-Year Warranty, 30-Day Hassle-Free Returns, and 24/7 Support. IDS should verify dealer-specific handling before publication.
- CTA wording: Contact IDS About Yarbo

## Complete Yarbo Packages

All 23 active package records may remain active and customer-visible. Package grouping is a presentation concern; keep stable database slugs.

Every package card should show:

- customer-facing package name
- package category/group
- package price from current catalog pricing
- no calculated package savings claim
- "Yarbo Core included"
- primary module
- additional modules
- charging equipment included
- RTK/navigation equipment included through Core
- best-use guidance
- Standard Mower versus Mower Pro wording where applicable

Do not change price values or promotions in this proposal.

| Group | Package slug | Proposed customer-facing name | Primary module | Additional modules | Best-use guidance |
| --- | --- | --- | --- | --- | --- |
| Mowing Systems | `yarbo-lawn-mower` | Yarbo Lawn Mower System | Standard Lawn Mower Module | None | Autonomous mowing with the standard mower module. |
| Mowing Systems | `yarbo-lawn-mower-trimmer` | Yarbo Lawn Mower + Trimmer System | Standard Lawn Mower Module | Yarbo Trimmer Package | Mowing plus edge/detail trimming. |
| Mowing Systems | `yarbo-lawn-leaf` | Yarbo Lawn Mower + Blower System | Standard Lawn Mower Module | Blower Module | Mowing plus leaf/light-debris cleanup. |
| Mowing Systems | `yarbo-lawn-leaf-trimmer` | Yarbo Lawn Mower + Blower + Trimmer System | Standard Lawn Mower Module | Blower Module, Yarbo Trimmer Package | Warm-season lawn care and cleanup. |
| Mower Pro Systems | `yarbo-lawn-mower-pro` | Yarbo Lawn Mower Pro System | Lawn Mower Pro Module | None | Higher-output mowing for tougher grass and lower cut-height goals. |
| Mower Pro Systems | `yarbo-lawn-mower-pro-trimmer` | Yarbo Lawn Mower Pro + Trimmer System | Lawn Mower Pro Module | Yarbo Trimmer Package | Pro mowing plus trimming support. |
| Mower Pro Systems | `yarbo-pro-leaf` | Yarbo Lawn Mower Pro + Blower System | Lawn Mower Pro Module | Blower Module | Pro mowing plus cleanup. |
| Mower Pro Systems | `yarbo-pro-leaf-trimmer` | Yarbo Lawn Mower Pro + Blower + Trimmer System | Lawn Mower Pro Module | Blower Module, Yarbo Trimmer Package | Pro mowing, cleanup, and trimming. |
| Snow Systems | `yarbo-snow-blower` | Yarbo Snow Blower System | Snow Blower Module | None | Autonomous winter clearing routes. |
| Snow Systems | `yarbo-snow-blower-trimmer` | Yarbo Snow Blower + Trimmer System | Snow Blower Module | Yarbo Trimmer Package | Snow clearing plus trimming capability for other seasons. |
| Snow Systems | `yarbo-snow-leaf` | Yarbo Snow Blower + Blower System | Snow Blower Module | Blower Module | Winter snow clearing plus cleanup. |
| Snow Systems | `yarbo-snow-leaf-trimmer` | Yarbo Snow Blower + Blower + Trimmer System | Snow Blower Module | Blower Module, Yarbo Trimmer Package | Snow, cleanup, and trimming without a mower module. |
| Cleanup And Trimming Systems | `yarbo-leaf-blower` | Yarbo Blower System | Blower Module | None | Leaf and light-debris cleanup. |
| Cleanup And Trimming Systems | `yarbo-trimmer` | Yarbo Trimmer System | Yarbo Trimmer Package | None | Edge and detail trimming. |
| Cleanup And Trimming Systems | `yarbo-leaf-blower-trimmer` | Yarbo Blower + Trimmer System | Blower Module | Yarbo Trimmer Package | Cleanup plus trimming. |
| Multi-Season Systems | `yarbo-snow-lawn` | Yarbo Snow Blower + Lawn Mower System | Snow Blower Module | Standard Lawn Mower Module | Winter snow plus standard mowing. |
| Multi-Season Systems | `yarbo-snow-lawn-trimmer` | Yarbo Snow Blower + Lawn Mower + Trimmer System | Snow Blower Module | Standard Lawn Mower Module, Yarbo Trimmer Package | Snow, mow, and trim. |
| Multi-Season Systems | `yarbo-pro-snow` | Yarbo Lawn Mower Pro + Snow Blower System | Lawn Mower Pro Module | Snow Blower Module | Pro mowing plus snow clearing. |
| Multi-Season Systems | `yarbo-pro-snow-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Trimmer System | Lawn Mower Pro Module | Snow Blower Module, Yarbo Trimmer Package | Pro mowing, snow clearing, and trimming. |
| Multi-Season Systems | `yarbo-lawn-snow-leaf` | Yarbo Lawn Mower + Snow Blower + Blower System | Standard Lawn Mower Module | Snow Blower Module, Blower Module | Year-round outdoor care without trimmer. |
| Multi-Season Systems | `yarbo-pro-snow-leaf` | Yarbo Lawn Mower Pro + Snow Blower + Blower System | Lawn Mower Pro Module | Snow Blower Module, Blower Module | High-demand year-round care without trimmer. |
| Full Property-Care Systems | `yarbo-lawn-snow-leaf-trimmer` | Yarbo Lawn Mower + Snow Blower + Blower + Trimmer System | Standard Lawn Mower Module | Snow Blower Module, Blower Module, Yarbo Trimmer Package | Broad year-round coverage with standard mowing. |
| Full Property-Care Systems | `yarbo-pro-snow-leaf-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer System | Lawn Mower Pro Module | Snow Blower Module, Blower Module, Yarbo Trimmer Package | Broad year-round coverage with Pro mowing. |

Package copy pattern:

"Includes Yarbo Core, Core charging and navigation equipment, and [module list]. Package price is shown from IDS catalog pricing."

## Individual Yarbo Equipment

### Yarbo Core

- Customer-facing name: Yarbo Core
- Catalog-card description: Powered base robot and platform equipment for modular Yarbo systems.
- Required notice: none; Core is the base platform.
- Best-fit guidance: customers starting from the base platform or replacing/expanding Core hardware through IDS review.
- Included equipment: Docking Station, Y Series Battery, Wired Charger, Data Center, Installation and Tool Kit, Tow Hitch where included by official Core source.

### Standard Lawn Mower Module

- Customer-facing name: Standard Lawn Mower Module
- Required notice: Module only — requires a Yarbo Core to operate.
- Catalog-card description: Standard Yarbo mowing module for Core-based autonomous lawn care.
- Best-fit guidance: broad-fit autonomous mowing for large residential lawns.
- Verified specifications: official source supports up to 6 acres, 20 in cutting width, 1.2 to 4.0 in cutting height, 360-degree smart object detection, and up to 35 deg slope capability.
- Quantity rule: one per order line.

### Lawn Mower Pro Module

- Customer-facing name: Lawn Mower Pro Module
- Required notice: Module only — requires a Yarbo Core to operate.
- Catalog-card description: Higher-output mowing module for tougher grass, lower cut-height goals, and demanding lawn conditions.
- Best-fit guidance: dense, wet, lower-cut, or more demanding lawns where the Pro motor/blade feature set is desired.
- Verified specifications: official Pro sources support dual 300 W motors, up to 2500 W peak power, standard discs or straight blades, up to 6 acres, RTK plus multi-sensor navigation language, 70% / 35 deg slope handling, and 0.8 to 4.0 in cutting height.
- Quantity rule: one per order line.

### Snow Blower Module

- Customer-facing name: Snow Blower Module
- Required notice: Module only — requires a Yarbo Core to operate.
- Catalog-card description: Two-stage Yarbo snow-clearing module for Core-based winter routes.
- Best-fit guidance: driveways, walkways, and multi-zone snow-clearing routes.
- Verified specifications: official module/full-system sources support 12 in intake, 24 in clearing width, 1.5 hr fast charging time, 38.4 Ah battery capacity, adjustable throw language, and snow clearing up to 12 in on the full-system page.
- Quantity rule: one per order line.

### Blower Module

- Customer-facing name: Blower Module
- Required notice: Module only — requires a Yarbo Core to operate.
- Catalog-card description: Blower module for leaves, light debris, and seasonal cleanup routes.
- Best-fit guidance: properties with recurring leaf, debris, and light cleanup needs across mapped zones.
- Verified specifications: official Blower Module source supports 21 N blowing force, leaf/debris clearing, slopes up to 35 deg / 70%, RTK-GPS/stereo vision/ODOM navigation language, and Blower Module x1 included on the module page.
- Quantity rule: one per order line.

### Yarbo Trimmer Package

- Customer-facing name: Yarbo Trimmer Package
- Required notice: Module only — requires a Yarbo Core to operate.
- Catalog-card description: Trimmer package with Back Brace Mount connection for edge and detail trimming.
- Best-fit guidance: edges, beds, obstacles, and detail zones.
- Verified specifications: official source says the package includes Yarbo Trimmer and Back Brace Mount, says the trimmer can only connect via BBM, and lists Spare Trimmer Line Spool x1.
- Manual verification: availability/timing must be confirmed before publication.
- Quantity rule: one per order line.

## Hidden Equipment

Keep hidden until IDS separately approves compatibility, sales classification, package relationships, and customer-facing use cases:

- `yarbo-plow-module` / Yarbo Snow Plow Blade
- `yarbo-tow-hitch` / Yarbo Tow Hitch

Do not expose included Core charging, battery, power, cable, mounting, RTK, or navigation equipment as optional add-ons.

## Quantity Handling

For all module-only records:

- `minimum_quantity=0`
- `maximum_quantity=1`
- `default_quantity=0`
- prevent duplicate order lines for the same module
- prevent quantity greater than one for the same module
- do not automatically block Standard Lawn Mower Module and Lawn Mower Pro Module from being purchased together unless official compatibility information later requires that restriction

## SQL Proposal Summary

The companion review-only SQL proposal at `supabase/seeds/yarbo-catalog-proposal.sql` would affect only these public tables and columns if later converted from `ROLLBACK` to `COMMIT` after review:

- `catalog_products`: `name`, `homepage_summary`, `full_description`, `capability_level`, `property_scale`, `customer_guidance`, `updated_at`
- `catalog_product_pages`: `seo_title`, `seo_description`, `hero_heading`, `hero_subheading`, `long_form_content`, `is_published`, `updated_at`
- `catalog_product_page_sections`: `section_type`, `heading`, `body_content`, `button_label`, `button_url`, `sort_order`, `is_published`, `updated_at`
- `catalog_option_groups`: `group_name`, `group_description`, `selection_type`, `is_required`, `minimum_selections`, `maximum_selections`, `updated_at`
- `catalog_options`: `name`, `description`, `public_status`, `is_required`, `is_included`, `is_recommended`, `default_quantity`, `minimum_quantity`, `maximum_quantity`, `updated_at`
- `catalog_packages`: `package_name`, `description`, `updated_at`

The proposal does not update pricing, promotions, services, media, package-item relationships, variant-option relationships, private monitoring tables, RLS, grants, permissions, or unrelated products.

No SQL was executed.
