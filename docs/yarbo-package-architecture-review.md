# Yarbo Package Architecture Review

Review date: 2026-07-20

Scope: review only. No SQL was executed, no Supabase data was modified, and no pricing, package, option, public-status, relationship, frontend, checkout, financing, intake, service-area, media, Lymow, Pandag, or unrelated product change is approved by this document.

## Final Merchandising Decision

IDS has rejected the guided Yarbo configuration concept. The recommended Yarbo architecture is now a simple catalog merchandising model with two sections:

1. Complete Yarbo Packages
2. Individual Yarbo Equipment

The catalog should not require a new-owner/existing-owner entry choice. It should not automatically convert module selections into a package. It should not add a Yarbo-specific custom build workflow. Package grouping and individual equipment presentation are the key future frontend changes.

## Current Catalog Facts

- Active Yarbo product: `yarbo` / Yarbo Core
- Active variants: 0
- Active option group: `yarbo-modules` / Optional Modules
- Active module options: 5
- Active packages: 23
- Package-item relationships: 52
- Active variant-option relationships: 0

The current schema represents Core as the parent product for packages. Core is not an option row inside `catalog_package_items`. For merchandising, each active package should be treated as including exactly one Yarbo Core via its `product_id` relationship to `yarbo`.

## Recommended Page Architecture

1. Yarbo platform introduction
2. Complete Yarbo Packages
3. Package category filters or grouped sections
4. Individual Yarbo Equipment
5. Core-required notices on module-only items
6. Included charging and RTK/navigation equipment explanation
7. Warranty and ownership guidance
8. Contact or purchase CTA

## Package Grouping

| Group | Packages |
| --- | --- |
| Mowing Systems | `yarbo-lawn-mower`, `yarbo-lawn-mower-trimmer`, `yarbo-lawn-leaf`, `yarbo-lawn-leaf-trimmer` |
| Mower Pro Systems | `yarbo-lawn-mower-pro`, `yarbo-lawn-mower-pro-trimmer`, `yarbo-pro-leaf`, `yarbo-pro-leaf-trimmer` |
| Snow Systems | `yarbo-snow-blower`, `yarbo-snow-blower-trimmer`, `yarbo-snow-leaf`, `yarbo-snow-leaf-trimmer` |
| Cleanup And Trimming Systems | `yarbo-leaf-blower`, `yarbo-trimmer`, `yarbo-leaf-blower-trimmer` |
| Multi-Season Systems | `yarbo-snow-lawn`, `yarbo-snow-lawn-trimmer`, `yarbo-pro-snow`, `yarbo-pro-snow-trimmer`, `yarbo-lawn-snow-leaf`, `yarbo-pro-snow-leaf` |
| Full Property-Care Systems | `yarbo-lawn-snow-leaf-trimmer`, `yarbo-pro-snow-leaf-trimmer` |

## Full 23-Package Matrix

| Package slug | Current name | Recommended name | Group | Core count | Primary module | Additional modules | Customer-valid? | Duplicate contents? | Status recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yarbo-lawn-mower` | Yarbo Lawn Mower | Yarbo Lawn Mower System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module | None | Yes | No | Remain active |
| `yarbo-lawn-mower-trimmer` | Yarbo Lawn Mower + Trimmer Package | Yarbo Lawn Mower + Trimmer System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module | Yarbo Trimmer Package | Yes | No | Remain active |
| `yarbo-lawn-leaf` | Yarbo Lawn Mower + Leaf Blower | Yarbo Lawn Mower + Blower System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module | Blower Module | Yes | No | Remain active |
| `yarbo-lawn-leaf-trimmer` | Yarbo Lawn Mower + Leaf Blower + Trimmer Package | Yarbo Lawn Mower + Blower + Trimmer System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module | Blower Module, Yarbo Trimmer Package | Yes | No | Remain active |
| `yarbo-lawn-mower-pro` | Yarbo Lawn Mower Pro | Yarbo Lawn Mower Pro System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module | None | Yes | No | Remain active |
| `yarbo-lawn-mower-pro-trimmer` | Yarbo Lawn Mower Pro + Trimmer Package | Yarbo Lawn Mower Pro + Trimmer System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module | Yarbo Trimmer Package | Yes | No | Remain active |
| `yarbo-pro-leaf` | Yarbo Lawn Mower Pro + Leaf Blower | Yarbo Lawn Mower Pro + Blower System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module | Blower Module | Yes | No | Remain active |
| `yarbo-pro-leaf-trimmer` | Yarbo Lawn Mower Pro + Leaf Blower + Trimmer Package | Yarbo Lawn Mower Pro + Blower + Trimmer System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module | Blower Module, Yarbo Trimmer Package | Yes | No | Remain active |
| `yarbo-snow-blower` | Yarbo Snow Blower | Yarbo Snow Blower System | Snow Systems | 1 implicit Core | Snow Blower Module | None | Yes | No | Remain active |
| `yarbo-snow-blower-trimmer` | Yarbo Snow Blower + Trimmer Package | Yarbo Snow Blower + Trimmer System | Snow Systems | 1 implicit Core | Snow Blower Module | Yarbo Trimmer Package | Yes | No | Remain active |
| `yarbo-snow-leaf` | Yarbo Snow Blower + Leaf Blower | Yarbo Snow Blower + Blower System | Snow Systems | 1 implicit Core | Snow Blower Module | Blower Module | Yes | No | Remain active |
| `yarbo-snow-leaf-trimmer` | Yarbo Snow Blower + Leaf Blower + Trimmer Package | Yarbo Snow Blower + Blower + Trimmer System | Snow Systems | 1 implicit Core | Snow Blower Module | Blower Module, Yarbo Trimmer Package | Yes | No | Remain active |
| `yarbo-leaf-blower` | Yarbo Leaf Blower | Yarbo Blower System | Cleanup And Trimming Systems | 1 implicit Core | Blower Module | None | Yes | No | Remain active |
| `yarbo-trimmer` | Yarbo Trimmer | Yarbo Trimmer System | Cleanup And Trimming Systems | 1 implicit Core | Yarbo Trimmer Package | None | Yes, if availability is confirmed | No | Remain active pending IDS availability confirmation |
| `yarbo-leaf-blower-trimmer` | Yarbo Leaf Blower + Trimmer Package | Yarbo Blower + Trimmer System | Cleanup And Trimming Systems | 1 implicit Core | Blower Module | Yarbo Trimmer Package | Yes, if availability is confirmed | No | Remain active pending IDS availability confirmation |
| `yarbo-snow-lawn` | Yarbo Snow Blower + Lawn Mower | Yarbo Snow Blower + Lawn Mower System | Multi-Season Systems | 1 implicit Core | Snow Blower Module | Standard Lawn Mower Module | Yes | No | Remain active |
| `yarbo-snow-lawn-trimmer` | Yarbo Snow Blower + Lawn Mower + Trimmer Package | Yarbo Snow Blower + Lawn Mower + Trimmer System | Multi-Season Systems | 1 implicit Core | Snow Blower Module | Standard Lawn Mower Module, Yarbo Trimmer Package | Yes, if availability is confirmed | No | Remain active pending IDS availability confirmation |
| `yarbo-pro-snow` | Yarbo Lawn Mower Pro + Snow Blower | Yarbo Lawn Mower Pro + Snow Blower System | Multi-Season Systems | 1 implicit Core | Lawn Mower Pro Module | Snow Blower Module | Yes | No | Remain active |
| `yarbo-pro-snow-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Trimmer Package | Yarbo Lawn Mower Pro + Snow Blower + Trimmer System | Multi-Season Systems | 1 implicit Core | Lawn Mower Pro Module | Snow Blower Module, Yarbo Trimmer Package | Yes, if availability is confirmed | No | Remain active pending IDS availability confirmation |
| `yarbo-lawn-snow-leaf` | Yarbo Lawn Mower + Snow Blower + Blower | Yarbo Lawn Mower + Snow Blower + Blower System | Multi-Season Systems | 1 implicit Core | Standard Lawn Mower Module | Snow Blower Module, Blower Module | Yes | No | Remain active |
| `yarbo-pro-snow-leaf` | Yarbo Lawn Mower Pro + Snow Blower + Blower | Yarbo Lawn Mower Pro + Snow Blower + Blower System | Multi-Season Systems | 1 implicit Core | Lawn Mower Pro Module | Snow Blower Module, Blower Module | Yes | No | Remain active |
| `yarbo-lawn-snow-leaf-trimmer` | Yarbo Lawn Mower + Snow Blower + Blower + Trimmer Package | Yarbo Lawn Mower + Snow Blower + Blower + Trimmer System | Full Property-Care Systems | 1 implicit Core | Standard Lawn Mower Module | Snow Blower Module, Blower Module, Yarbo Trimmer Package | Yes, if availability is confirmed | No | Remain active pending IDS availability confirmation |
| `yarbo-pro-snow-leaf-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer Package | Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer System | Full Property-Care Systems | 1 implicit Core | Lawn Mower Pro Module | Snow Blower Module, Blower Module, Yarbo Trimmer Package | Yes, if availability is confirmed | No | Remain active pending IDS availability confirmation |

## Individual Equipment Matrix

| Equipment slug | Recommended name | Public status recommendation | Quantity recommendation | Customer notice | Notes |
| --- | --- | --- | --- | --- | --- |
| `yarbo` | Yarbo Core | active | product quantity handled as normal product line | None | Base platform and included equipment. |
| `yarbo-mower-module` | Standard Lawn Mower Module | active | min 0, max 1, default 0 | Module only — requires a Yarbo Core to operate. | Do not name as Pro. |
| `yarbo-lawn-mower-pro-module` | Lawn Mower Pro Module | active | min 0, max 1, default 0 | Module only — requires a Yarbo Core to operate. | Keep clearly separate from Standard Lawn Mower Module. |
| `yarbo-snow-blower-module` | Snow Blower Module | active | min 0, max 1, default 0 | Module only — requires a Yarbo Core to operate. | Snow Plow Blade remains hidden. |
| `yarbo-leaf-blower-module` | Blower Module | active | min 0, max 1, default 0 | Module only — requires a Yarbo Core to operate. | Replace "Leaf Blower" customer-facing wording. |
| `yarbo-trimmer-module` | Yarbo Trimmer Package | active if IDS confirms availability | min 0, max 1, default 0 | Module only — requires a Yarbo Core to operate. | Keep "Package" wording because official source presents it as a package. |
| `yarbo-plow-module` | Yarbo Snow Plow Blade | hidden | max 1 only if later approved | Not public | Requires separate IDS approval. |
| `yarbo-tow-hitch` | Yarbo Tow Hitch | hidden | max 1 only if later approved | Not public | Core already includes Tow Hitch per official source. |

## Duplicate And Error Findings

- Core count: all 23 packages pass the customer-facing one-Core rule through the package parent product `yarbo`.
- Explicit Core package item rows: 0, by current design. This is not an error because Core is the package product, not an option.
- Multiple Core rows: none found.
- Duplicate module rows inside a package: none found.
- Exact duplicate package module sets: none found.
- Misleading naming: all current "Leaf Blower" package/option wording should become "Blower Module" or "Blower System" in customer-facing copy.
- Unclear contents: current package descriptions are terse. Package cards should explicitly list Core included, primary module, additional modules, charging included, and navigation/RTK equipment included.
- Pricing concern: the reviewed snapshot did not include package price fields. Future presentation must use current live catalog price fields and must not alter pricing.

## Quantity Rules

- Individual modules should be one per order line.
- Prevent duplicate order lines for the same module.
- Prevent module quantity greater than 1.
- Do not automatically block Standard Lawn Mower Module and Lawn Mower Pro Module together unless official compatibility information later requires that restriction.
- Package relationships should remain as-is unless IDS later verifies a package-item correction.

## Future Database Changes If Approved

Review-only SQL should propose only:

- `public.catalog_products`: update Yarbo Core copy.
- `public.catalog_product_pages`: update Yarbo page metadata and page copy.
- `public.catalog_product_page_sections`: replace Yarbo sections with platform intro, complete packages, grouped packages, individual equipment, Core-required notice, included equipment, warranty/ownership, and CTA sections.
- `public.catalog_option_groups`: rename/descriptively frame the active group as Individual Yarbo Equipment, while keeping `selection_type='multiple'` and not making it required.
- `public.catalog_options`: update customer-facing names/descriptions/statuses/quantity limits for Yarbo options only.
- `public.catalog_packages`: update customer-facing package names and descriptions only.

No proposed SQL should update pricing, promotions, services, media, package-item rows, variant-option rows, private monitoring tables, RLS, grants, permissions, Lymow, Pandag, or unrelated products.

## Future Frontend Presentation Changes

- Add a Complete Yarbo Packages section.
- Group or filter all 23 packages by the six merchandising groups above.
- Package cards should show Core included, primary module, additional modules, charging included, RTK/navigation equipment included, current package price, no calculated savings claim, and best-use guidance.
- Add an Individual Yarbo Equipment section separate from package cards.
- Show the Core-required module warning on every module-only card, detail view, and request summary line.
- Clamp module quantities to one and prevent duplicate order lines for the same module.
- Keep Snow Plow Blade and Tow Hitch hidden in the public Yarbo page until IDS separately approves them.
- Do not add automatic package matching or a Yarbo-specific module configurator.

## Decisions Still Requiring IDS Approval

- Final package group names.
- Final package price/savings presentation rules.
- Trimmer Package availability and whether trimmer-containing packages remain active.
- Whether any future replacement equipment should be public.
- Whether Snow Plow Blade or Tow Hitch should ever be public, and under what sales classification.
- Dealer-specific warranty handling.

## Review-Only Confirmation

- SQL executed: no.
- Supabase modified: no.
- Frontend code edited: no.
