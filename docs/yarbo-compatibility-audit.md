# Yarbo Compatibility Audit

Review date: 2026-07-20
Phase: review only
Branch checkpoint: `catalog-backend` at `aac5bbda511905401892639dd3205d05f600f77c`

## Scope Controls

This audit reflects the revised IDS Yarbo merchandising decision: Yarbo should be sold through two straightforward customer sections, Complete Yarbo Packages and Individual Yarbo Equipment.

No SQL was executed. Supabase was not modified. No manufacturer candidates were approved or rejected. No images were downloaded. No frontend code, pricing, promotions, services, service-area logic, delivery eligibility, payment flow, financing, media, private monitoring tables, candidate statuses, RLS, grants, permissions, Lymow, Pandag, or unrelated product records were changed.

## Sources Used

- `docs/manufacturer-sync-review.md`
- `supabase/seeds/manufacturer-source-targets.sql`
- `supabase/migrations/20260715_seed_official_manufacturer_sources.sql`
- `.next/codex-yarbo-public-rest-summary.json`, a read-only active public catalog snapshot from the earlier review
- Catalog and purchase-flow code inspected during review: `app/api/catalog/route.ts`, `lib/catalog/selection.ts`, `components/customer-paths/purchase/ProductConfiguration.tsx`, `components/customer-paths/purchase/NationwidePurchaseFlow.tsx`, `components/customer-paths/purchase/PurchaseSummary.tsx`, and `app/equipment/[slug]/page.tsx`

Approved official Yarbo source records reviewed:

- Product: `yarbo` / Yarbo Core
- Packages: `yarbo-lawn-mower-pro`, `yarbo-snow-blower`
- Options: `yarbo-mower-module`, `yarbo-lawn-mower-pro-module`, `yarbo-snow-blower-module`, `yarbo-leaf-blower-module`, `yarbo-trimmer-module`, `yarbo-plow-module`, `yarbo-tow-hitch`

## Records Reviewed

Active public Yarbo catalog output reviewed:

- Active product: 1
- Active variants: 0
- Active option groups: 1
- Active options/modules: 5
- Active packages: 23
- Package-item relationships: 52
- Variant-option relationships: 0

Manufacturer-monitoring candidates in `docs/manufacturer-sync-review.md` remain pending. This review does not accept, reject, or apply those candidates.

## What Yarbo Core Is

Yarbo Core is the powered base robot for the Yarbo Y Series. It supplies the shared platform for the modular system: tracked mobility, app control, navigation references, battery and charging equipment, Data Center/positioning equipment, docking/charging foundation, and the base used by compatible modules.

In the IDS catalog, `catalog_products.slug='yarbo'` is the active Yarbo Core product. The 23 package records are complete systems under that Core product. Module records are individually purchasable equipment that require a Core to operate.

## Revised Customer-Facing Catalog Shape

Yarbo should not be presented as a guided custom configurator. The customer-facing structure should be:

1. Complete Yarbo Packages
   - all 23 valid active package records
   - grouped into understandable merchandising sections
   - each package clearly says it includes Yarbo Core, charging equipment, navigation/RTK-related Core equipment where applicable, and the listed modules
   - package price and savings should be displayed from the current catalog pricing only, without changing price values

2. Individual Yarbo Equipment
   - Yarbo Core
   - Standard Lawn Mower Module
   - Lawn Mower Pro Module
   - Snow Blower Module
   - Blower Module
   - Yarbo Trimmer Package
   - no Snow Plow Blade or Tow Hitch until IDS separately approves their compatibility, sales classification, package relationships, and customer-facing use cases

Every module-only card must prominently show this warning:

Module only — requires a Yarbo Core to operate.

## Active Product

| Slug | Current name | Recommended customer-facing name | Public status | Role |
| --- | --- | --- | --- | --- |
| `yarbo` | Yarbo Core | Yarbo Core | active | Individual equipment and base platform included in each complete package. |

## Active Individual Equipment Options

| Slug | Current name | Recommended customer-facing name | Public status | Current quantity limits | Recommended quantity limits | Visibility | Required warning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yarbo-mower-module` | Lawn Mower Module | Standard Lawn Mower Module | active | min 0, max 10, default 0 | min 0, max 1, default 0 | Customer-visible individual equipment | Module only — requires a Yarbo Core to operate. |
| `yarbo-lawn-mower-pro-module` | Lawn Mower Pro Module | Lawn Mower Pro Module | active | min 0, max 10, default 0 | min 0, max 1, default 0 | Customer-visible individual equipment | Module only — requires a Yarbo Core to operate. |
| `yarbo-snow-blower-module` | Snow Blower Module | Snow Blower Module | active | min 0, max 10, default 0 | min 0, max 1, default 0 | Customer-visible individual equipment | Module only — requires a Yarbo Core to operate. |
| `yarbo-leaf-blower-module` | Leaf Blower Module | Blower Module | active | min 0, max 10, default 0 | min 0, max 1, default 0 | Customer-visible individual equipment | Module only — requires a Yarbo Core to operate. |
| `yarbo-trimmer-module` | Trimmer Package | Yarbo Trimmer Package | active | min 0, max 10, default 0 | min 0, max 1, default 0 | Customer-visible individual equipment if IDS confirms availability | Module only — requires a Yarbo Core to operate. |

Individual equipment may be purchased by existing Yarbo owners, by customers manually assembling a custom system, or by customers adding another seasonal capability. The catalog should not automatically convert an individual selection into a package.

## Hidden Or Non-Selectable Equipment

| Slug or item | Current evidence | Recommended visibility |
| --- | --- | --- |
| `yarbo-plow-module` / Snow Plow Blade | Approved source target identifies an exact hidden catalog option match. | Keep hidden until IDS approves compatibility, sales classification, package relationships, and customer-facing use cases. |
| `yarbo-tow-hitch` / Tow Hitch | Approved source target identifies an exact hidden catalog option match. Official Core source says Tow Hitch is included with Core. | Keep hidden as standalone equipment unless IDS approves replacement/extra tow-hitch merchandising. |
| Docking Station | Included Core equipment from official source records; no active public option row found. | Mention as included Core/package equipment; do not show as extra optional selection. |
| Y Series Battery | Included Core equipment from official source records; no active public option row found. | Mention as included Core/package equipment; do not show as extra optional selection. |
| Wired Charger | Included Core equipment from official source records; no active public option row found. | Mention as included Core/package equipment; do not show as extra optional selection. |
| Data Center / RTK/navigation equipment | Included Core/navigation context from official source records; no active public option row found. | Mention as included Core/package equipment; do not show as extra optional selection. |
| Replacement blades, shear pins, spool, RTK accessories, cables, mounts, accessory kits | Not found as active IDS Yarbo public option records in this snapshot. | Do not add or expose without separate approved source records and IDS sales classification. |

## Complete Package Audit

All 23 packages are customer-valid as complete systems under product `yarbo`. In the current schema, Core is implicit through the parent product relationship; it is not a `catalog_package_items` row. Every package should therefore be merchandised as containing exactly one Yarbo Core. No package contains an explicit duplicate Core option row, and no active Yarbo package contains duplicate module package-item rows.

| Package slug | Current name | Recommended name | Group | Core included | Included modules | Duplicate modules? | Naming issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yarbo-lawn-mower` | Yarbo Lawn Mower | Yarbo Lawn Mower System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module | No | Add "System". |
| `yarbo-lawn-mower-trimmer` | Yarbo Lawn Mower + Trimmer Package | Yarbo Lawn Mower + Trimmer System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module, Yarbo Trimmer Package | No | Add "System". |
| `yarbo-lawn-leaf` | Yarbo Lawn Mower + Leaf Blower | Yarbo Lawn Mower + Blower System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module, Blower Module | No | Replace "Leaf Blower". |
| `yarbo-lawn-leaf-trimmer` | Yarbo Lawn Mower + Leaf Blower + Trimmer Package | Yarbo Lawn Mower + Blower + Trimmer System | Mowing Systems | 1 implicit Core | Standard Lawn Mower Module, Blower Module, Yarbo Trimmer Package | No | Replace "Leaf Blower"; add "System". |
| `yarbo-lawn-mower-pro` | Yarbo Lawn Mower Pro | Yarbo Lawn Mower Pro System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module | No | Add "System". |
| `yarbo-lawn-mower-pro-trimmer` | Yarbo Lawn Mower Pro + Trimmer Package | Yarbo Lawn Mower Pro + Trimmer System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module, Yarbo Trimmer Package | No | Add "System". |
| `yarbo-pro-leaf` | Yarbo Lawn Mower Pro + Leaf Blower | Yarbo Lawn Mower Pro + Blower System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module, Blower Module | No | Replace "Leaf Blower". |
| `yarbo-pro-leaf-trimmer` | Yarbo Lawn Mower Pro + Leaf Blower + Trimmer Package | Yarbo Lawn Mower Pro + Blower + Trimmer System | Mower Pro Systems | 1 implicit Core | Lawn Mower Pro Module, Blower Module, Yarbo Trimmer Package | No | Replace "Leaf Blower"; add "System". |
| `yarbo-snow-blower` | Yarbo Snow Blower | Yarbo Snow Blower System | Snow Systems | 1 implicit Core | Snow Blower Module | No | Add "System". |
| `yarbo-snow-blower-trimmer` | Yarbo Snow Blower + Trimmer Package | Yarbo Snow Blower + Trimmer System | Snow Systems | 1 implicit Core | Snow Blower Module, Yarbo Trimmer Package | No | Add "System". |
| `yarbo-snow-leaf` | Yarbo Snow Blower + Leaf Blower | Yarbo Snow Blower + Blower System | Snow Systems | 1 implicit Core | Snow Blower Module, Blower Module | No | Replace "Leaf Blower". |
| `yarbo-snow-leaf-trimmer` | Yarbo Snow Blower + Leaf Blower + Trimmer Package | Yarbo Snow Blower + Blower + Trimmer System | Snow Systems | 1 implicit Core | Snow Blower Module, Blower Module, Yarbo Trimmer Package | No | Replace "Leaf Blower"; add "System". |
| `yarbo-leaf-blower` | Yarbo Leaf Blower | Yarbo Blower System | Cleanup And Trimming Systems | 1 implicit Core | Blower Module | No | Replace "Leaf Blower"; add "System". |
| `yarbo-trimmer` | Yarbo Trimmer | Yarbo Trimmer System | Cleanup And Trimming Systems | 1 implicit Core | Yarbo Trimmer Package | No | Add "System". |
| `yarbo-leaf-blower-trimmer` | Yarbo Leaf Blower + Trimmer Package | Yarbo Blower + Trimmer System | Cleanup And Trimming Systems | 1 implicit Core | Blower Module, Yarbo Trimmer Package | No | Replace "Leaf Blower"; add "System". |
| `yarbo-snow-lawn` | Yarbo Snow Blower + Lawn Mower | Yarbo Snow Blower + Lawn Mower System | Multi-Season Systems | 1 implicit Core | Snow Blower Module, Standard Lawn Mower Module | No | Add "System". |
| `yarbo-snow-lawn-trimmer` | Yarbo Snow Blower + Lawn Mower + Trimmer Package | Yarbo Snow Blower + Lawn Mower + Trimmer System | Multi-Season Systems | 1 implicit Core | Snow Blower Module, Standard Lawn Mower Module, Yarbo Trimmer Package | No | Add "System". |
| `yarbo-pro-snow` | Yarbo Lawn Mower Pro + Snow Blower | Yarbo Lawn Mower Pro + Snow Blower System | Multi-Season Systems | 1 implicit Core | Lawn Mower Pro Module, Snow Blower Module | No | Add "System". |
| `yarbo-pro-snow-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Trimmer Package | Yarbo Lawn Mower Pro + Snow Blower + Trimmer System | Multi-Season Systems | 1 implicit Core | Lawn Mower Pro Module, Snow Blower Module, Yarbo Trimmer Package | No | Add "System". |
| `yarbo-lawn-snow-leaf` | Yarbo Lawn Mower + Snow Blower + Blower | Yarbo Lawn Mower + Snow Blower + Blower System | Multi-Season Systems | 1 implicit Core | Standard Lawn Mower Module, Snow Blower Module, Blower Module | No | Add "System". |
| `yarbo-pro-snow-leaf` | Yarbo Lawn Mower Pro + Snow Blower + Blower | Yarbo Lawn Mower Pro + Snow Blower + Blower System | Multi-Season Systems | 1 implicit Core | Lawn Mower Pro Module, Snow Blower Module, Blower Module | No | Add "System". |
| `yarbo-lawn-snow-leaf-trimmer` | Yarbo Lawn Mower + Snow Blower + Blower + Trimmer Package | Yarbo Lawn Mower + Snow Blower + Blower + Trimmer System | Full Property-Care Systems | 1 implicit Core | Standard Lawn Mower Module, Snow Blower Module, Blower Module, Yarbo Trimmer Package | No | Add "System". |
| `yarbo-pro-snow-leaf-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer Package | Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer System | Full Property-Care Systems | 1 implicit Core | Lawn Mower Pro Module, Snow Blower Module, Blower Module, Yarbo Trimmer Package | No | Add "System". |

## Compatibility Findings

- All active module options require Yarbo Core to operate.
- The catalog should state this dependency on each module-only item, not hide individual equipment behind an owner-identification step.
- Current package-item relationships correctly identify the modules included in each complete package.
- Current package rows do not include charging, docking, battery, cable, mounting, RTK, or Data Center equipment as selectable options. That is correct for this merchandising model because those items belong to the included Core/platform equipment explanation.
- No active package has duplicate module rows.
- No active package contains both the Standard Lawn Mower Module and Lawn Mower Pro Module. IDS does not need to add a customer-facing mutual-exclusion rule for individual purchases unless official compatibility information later requires it.
- "Leaf Blower" wording is misleading relative to the approved official source target and should become "Blower Module" in customer-facing copy.
- The cached public snapshot used for this review did not include price fields, so price and savings display must use the live/current catalog pricing fields during frontend presentation. This review does not calculate, overwrite, or validate savings.

## Quantity Handling Recommendations

- For active individual module records: `minimum_quantity=0`, `maximum_quantity=1`, `default_quantity=0`.
- Prevent accidental duplicate order lines for the same module.
- Prevent quantities greater than 1 for the same module in a single order line.
- Do not automatically prevent a customer from purchasing Standard Lawn Mower Module and Lawn Mower Pro Module together unless official compatibility information later requires that restriction.
- Keep package-item quantities at 1 for the 52 reviewed relationships unless IDS verifies a package-specific exception.

## Public Visibility Recommendations

Customer-visible:

- `yarbo` / Yarbo Core
- all 23 complete packages
- `yarbo-mower-module` as Standard Lawn Mower Module
- `yarbo-lawn-mower-pro-module` as Lawn Mower Pro Module
- `yarbo-snow-blower-module` as Snow Blower Module
- `yarbo-leaf-blower-module` as Blower Module
- `yarbo-trimmer-module` as Yarbo Trimmer Package, pending IDS availability confirmation

Hidden:

- `yarbo-plow-module`
- `yarbo-tow-hitch`
- any unapproved charging, battery, power, cable, mounting, RTK, navigation, accessory, or replacement equipment rows not active in the reviewed public snapshot

## Review-Only Result

- Yarbo records reviewed: 1 product, 5 active module options, 23 active packages, 52 package-item relationships, 2 hidden source-target accessories, and included Core equipment references.
- Manufacturer candidates accepted: 0
- Manufacturer candidates rejected: 0
- Candidates requiring manual verification: Trimmer availability, package price/savings display, Pro mower exact spec excerpts, snow blower temperature/runtime excerpts, and any future accessory/replacement equipment sales classification.
- SQL executed: no
- Supabase modified: no
