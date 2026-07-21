# Yarbo Package Pricing Audit

Date: 2026-07-20

Scope: read-only Yarbo package-pricing audit. No pricing was changed, no SQL was executed, Supabase was not modified, frontend code was not edited, and the existing Yarbo proposal files were not modified.

## 1. Pricing Data Sources Used

- Approved read-only Supabase REST fetch using `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `.env.local`. The command did not print secrets and saved a sanitized local pricing snapshot at `.next/codex-yarbo-pricing-audit.json`.
- Same-day catalog/API relationship snapshot at `.next/codex-yarbo-public-rest-summary.json`, used for the 23 active package records and 52 `catalog_package_items` relationships. The pricing fetch returned the package and option price rows but the saved `packageItems` array was empty because of a local PowerShell JSON-array filtering issue; the relationship matrix therefore relies on the earlier same-day catalog snapshot.
- Local code review:
  - `app/api/catalog/route.ts`
  - `lib/catalog/pricing.ts`
  - `lib/catalog/selection.ts`
  - `components/customer-paths/purchase/ProductConfiguration.tsx`
  - `components/customer-paths/purchase/NationwidePurchaseFlow.tsx`
  - `components/customer-paths/purchase/PurchaseSummary.tsx`
  - `supabase/seeds/yarbo-catalog-proposal.sql`
- Local source review:
  - `docs/manufacturer-sync-review.md`
  - `supabase/seeds/manufacturer-source-targets.sql`
  - `scripts/seed-manufacturer-sources.ts`
  - `scripts/import-catalog.ts`

Pricing limits:

- The only concrete Yarbo pricing values found in this approved read-only pass are the public catalog row values on `catalog_products`, `catalog_options`, and `catalog_packages`.
- No separate package savings field was found on current package rows. Package `sale_price_cents` and `promotion_label` are all null for the 23 active Yarbo packages.
- `catalog_price_schedules` exists in the schema, but the current catalog API route does not query it, so scheduled prices do not affect the current website price formula reviewed here.
- Internal/private pricing exists in the schema and import tooling as `catalog_private.catalog_internal_pricing`, but it was not available through the approved anon read-only method and was not queried.
- Manufacturer/source monitoring records list official Yarbo product pages and image/source metadata. They do not provide approved separate package price composition data in the local review artifacts.

## 2. Current Pricing Formula Used By The Frontend

The catalog API builds `currentPriceCents` from each row's price columns. A sale price is active when `sale_price_cents` is not null and the current time is between `sale_starts_at` and `sale_ends_at`; missing sale start/end dates make the sale open-ended.

The purchase resolver then uses:

```ts
baseItem = selectedPackage ?? selectedVariant ?? product
equipmentTotalCents =
  baseItem.currentPriceCents +
  sum(selected non-package option currentPriceCents * quantity)
```

Implications for Yarbo:

- Selecting a Yarbo package charges the selected package price once.
- The Yarbo Core product price is not separately added when a package is selected.
- Package-item option prices are not added when `included_in_package_price=true`.
- All 52 reviewed Yarbo `catalog_package_items` relationships are marked `included_in_package_price=true`.
- Therefore each package row must already be priced as the full system price, including one Core and the listed modules, for the current purchase estimate to be correct.
- `catalog_packages.product_id = yarbo` organizes the package under the Yarbo product, but it does not mechanically add Core price to the estimate.

Package/Core conclusion:

- Each active Yarbo package has one parent product relationship to `catalog_products.slug='yarbo'`, whose current stored name is Yarbo Core.
- The current package UI and summary render one base machine/core line for the selected package.
- There is no Core `catalog_package_items` row. Core is implicit in the selected package row and its price.
- The package price pattern is consistent with one Core plus modules and regular-retail bundle discounts, but it is not a structural proof that exactly one Core has been priced into each package.
- No package price pattern suggests zero Core or multiple Cores, but IDS pricing confirmation is still required before public "package savings" claims.

## 3. Individual Equipment Pricing Matrix

As of 2026-07-20, the Yarbo Core sale price is expired. The five module options have `sale_price_cents` with no sale window, so the current website formula treats those sale prices as active.

| Record | Current stored name | Regular retail | Current website price | Stored sale status | Current purchasing behavior | Price classification |
| --- | --- | ---: | ---: | --- | --- | --- |
| `yarbo` | Yarbo Core | $3,999 | $3,999 | $3,799 sale ended 2026-07-01 | Selectable as product, but Yarbo cannot complete the current purchase flow without selecting one active package. Core-alone purchase is not currently supported. | Product/base retail price; not added on top of selected package. |
| `yarbo-mower-module` | Lawn Mower Module | $1,299 | $899 | Sale price active because no dates are set | Selectable as an add-on after required package selection unless already included in the package. Not standalone module-only in current flow. | Option/add-on current price and package component retail value. |
| `yarbo-lawn-mower-pro-module` | Lawn Mower Pro Module | $2,299 | $1,799 | Sale price active because no dates are set | Selectable as an add-on after required package selection unless already included in the package. Not standalone module-only in current flow. | Option/add-on current price and package component retail value. |
| `yarbo-snow-blower-module` | Snow Blower Module | $1,299 | $1,199 | Sale price active because no dates are set | Selectable as an add-on after required package selection unless already included in the package. Not standalone module-only in current flow. | Option/add-on current price and package component retail value. |
| `yarbo-leaf-blower-module` | Leaf Blower Module | $1,099 | $949 | Sale price active because no dates are set | Selectable as an add-on after required package selection unless already included in the package. Not standalone module-only in current flow. | Option/add-on current price and package component retail value. Proposed copy should rename this to Blower Module. |
| `yarbo-trimmer-module` | Trimmer Package | $799 | $699 | Sale price active because no dates are set | Selectable as an add-on after required package selection unless already included in the package. Not standalone module-only in current flow. | Option/add-on current price and package component retail value. IDS has approved this staying active and customer-visible. |

Current quantity behavior:

- The stored active module maximum quantity is currently 10 for all five modules.
- The UI component clamps quantity against `maximumQuantity`, but the flow-level `handleOptionQuantityChange` only clamps to a non-negative integer.
- Normal card-toggle behavior for Yarbo modules is 0/1, but direct quantity state still depends on stored max values and future frontend guards.
- The review SQL proposes maximum quantity 1 for modules; it has not been executed.

## 4. Full 23-Package Pricing Matrix

Definitions:

- Package price is the current website price from `catalog_packages`.
- Core retail is Yarbo Core regular retail: $3,999.
- Module prices in the module column are regular retail values.
- Component retail total = Core regular retail + regular retail of every included module.
- Retail difference = component retail total minus package price. Positive values are implied savings versus regular component retail.
- Current add-on check compares package price against Core current price plus the modules' current website add-on prices. Negative values mean the package is more expensive than buying the same Core-plus-module set using current option sale prices.
- Stored savings means package-level sale/promotion fields; all are currently none.
- Core and module inclusion are pricing inferences only. The code still relies on the package row price and does not prove price composition.

| Package slug | Current package name | Package price | Core retail | Included modules and regular retail | Component retail total | Retail difference / implied savings | Current add-on check | Stored savings | Appears to include Core? | Every module appears priced? | Undercharge risk | Overcharge risk | IDS confirmation |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
| `yarbo-snow-blower` | Yarbo Snow Blower | $4,999 | $3,999 | Snow Blower $1,299 | $5,298 | $299 savings | $199 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-lawn-mower` | Yarbo Lawn Mower | $4,999 | $3,999 | Standard Mower $1,299 | $5,298 | $299 savings | $101 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-lawn-mower-pro` | Yarbo Lawn Mower Pro | $5,999 | $3,999 | Mower Pro $2,299 | $6,298 | $299 savings | $201 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-leaf-blower` | Yarbo Leaf Blower | $4,799 | $3,999 | Blower $1,099 | $5,098 | $299 savings | $149 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-trimmer` | Yarbo Trimmer | $4,549 | $3,999 | Trimmer Package $799 | $4,798 | $249 savings | $149 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-leaf-blower-trimmer` | Yarbo Leaf Blower + Trimmer Package | $5,549 | $3,999 | Blower $1,099; Trimmer $799 | $5,897 | $348 savings | $98 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-lawn-mower-trimmer` | Yarbo Lawn Mower + Trimmer Package | $5,749 | $3,999 | Standard Mower $1,299; Trimmer $799 | $6,097 | $348 savings | $152 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-snow-blower-trimmer` | Yarbo Snow Blower + Trimmer Package | $5,749 | $3,999 | Snow Blower $1,299; Trimmer $799 | $6,097 | $348 savings | $148 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-lawn-mower-pro-trimmer` | Yarbo Lawn Mower Pro + Trimmer Package | $6,749 | $3,999 | Mower Pro $2,299; Trimmer $799 | $7,097 | $348 savings | $252 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-snow-lawn` | Yarbo Snow Blower + Lawn Mower | $6,199 | $3,999 | Snow Blower $1,299; Standard Mower $1,299 | $6,597 | $398 savings | $102 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-snow-leaf` | Yarbo Snow Blower + Leaf Blower | $5,999 | $3,999 | Snow Blower $1,299; Blower $1,099 | $6,397 | $398 savings | $148 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-lawn-leaf` | Yarbo Lawn Mower + Leaf Blower | $5,999 | $3,999 | Standard Mower $1,299; Blower $1,099 | $6,397 | $398 savings | $152 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-snow-lawn-trimmer` | Yarbo Snow Blower + Lawn Mower + Trimmer Package | $6,749 | $3,999 | Snow Blower $1,299; Standard Mower $1,299; Trimmer $799 | $7,396 | $647 savings | $47 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-snow-leaf-trimmer` | Yarbo Snow Blower + Leaf Blower + Trimmer Package | $6,549 | $3,999 | Snow Blower $1,299; Blower $1,099; Trimmer $799 | $7,196 | $647 savings | $297 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-lawn-leaf-trimmer` | Yarbo Lawn Mower + Leaf Blower + Trimmer Package | $6,549 | $3,999 | Standard Mower $1,299; Blower $1,099; Trimmer $799 | $7,196 | $647 savings | $3 more than current add-ons | None | Likely | Likely | Low vs retail | Minor current sale mismatch | Yes |
| `yarbo-pro-snow` | Yarbo Lawn Mower Pro + Snow Blower | $7,199 | $3,999 | Mower Pro $2,299; Snow Blower $1,299 | $7,597 | $398 savings | $202 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-pro-leaf` | Yarbo Lawn Mower Pro + Leaf Blower | $6,999 | $3,999 | Mower Pro $2,299; Blower $1,099 | $7,397 | $398 savings | $252 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-pro-snow-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Trimmer Package | $7,749 | $3,999 | Mower Pro $2,299; Snow Blower $1,299; Trimmer $799 | $8,396 | $647 savings | $53 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes |
| `yarbo-pro-leaf-trimmer` | Yarbo Lawn Mower Pro + Leaf Blower + Trimmer Package | $7,549 | $3,999 | Mower Pro $2,299; Blower $1,099; Trimmer $799 | $8,196 | $647 savings | $103 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |
| `yarbo-lawn-snow-leaf` | Yarbo Lawn Mower + Snow Blower + Blower | $6,999 | $3,999 | Standard Mower $1,299; Snow Blower $1,299; Blower $1,099 | $7,696 | $697 savings | $47 savings vs current add-ons | None | Likely | Likely | Low if discount intended | No | Yes |
| `yarbo-pro-snow-leaf` | Yarbo Lawn Mower Pro + Snow Blower + Blower | $7,999 | $3,999 | Mower Pro $2,299; Snow Blower $1,299; Blower $1,099 | $8,696 | $697 savings | $53 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes |
| `yarbo-lawn-snow-leaf-trimmer` | Yarbo Lawn Mower + Snow Blower + Blower + Trimmer Package | $7,749 | $3,999 | Standard Mower $1,299; Snow Blower $1,299; Blower $1,099; Trimmer $799 | $8,495 | $746 savings | $4 more than current add-ons | None | Likely | Likely | Low vs retail | Minor current sale mismatch | Yes |
| `yarbo-pro-snow-leaf-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer Package | $8,749 | $3,999 | Mower Pro $2,299; Snow Blower $1,299; Blower $1,099; Trimmer $799 | $9,495 | $746 savings | $104 more than current add-ons | None | Likely | Likely | Low vs retail | Yes, current sale mismatch | Yes - high priority |

## 5. Suspected Underpricing

No package appears underpriced when compared to regular retail component totals. Every package price is lower than Core regular retail plus included module regular retail, and none of the packages is lower than its module-only subtotal. This makes Core inclusion likely from the price pattern.

Potential underpricing still requires IDS review in these cases:

- Package descriptions and proposal copy say Core charging/navigation/RTK-related equipment is included, but those items are not separately represented in the active package-item rows used by the current package price calculation.
- If IDS expects charging, Data Center, RTK/navigation, battery, cables, or mounting equipment to carry separate retail value outside the Core/package price, current package prices would need manual confirmation.
- If the current package discounts were not intended, all 23 packages are priced below regular retail component totals.

## 6. Suspected Overpricing

No package is above regular retail component value.

However, 14 packages are above the current Core-plus-module add-on subtotal because the module option rows have active open-ended sale prices while package rows do not have active sale prices. This may be intentional package pricing, a temporary module promotion, or stale sale data. It should be confirmed before frontend implementation promotes package savings.

Packages above the current Core-plus-module add-on subtotal:

| Package slug | Amount package is higher than current add-on subtotal |
| --- | ---: |
| `yarbo-lawn-mower` | $101 |
| `yarbo-lawn-mower-pro` | $201 |
| `yarbo-lawn-mower-trimmer` | $152 |
| `yarbo-lawn-mower-pro-trimmer` | $252 |
| `yarbo-snow-lawn` | $102 |
| `yarbo-lawn-leaf` | $152 |
| `yarbo-lawn-leaf-trimmer` | $3 |
| `yarbo-pro-snow` | $202 |
| `yarbo-pro-leaf` | $252 |
| `yarbo-pro-snow-trimmer` | $53 |
| `yarbo-pro-leaf-trimmer` | $103 |
| `yarbo-pro-snow-leaf` | $53 |
| `yarbo-lawn-snow-leaf-trimmer` | $4 |
| `yarbo-pro-snow-leaf-trimmer` | $104 |

## 7. Packages With Intentional-Looking Discounts

All 23 package prices look intentionally discounted against regular component retail. The discounts follow a consistent pattern:

- Single non-trimmer system packages: $299 savings.
- Trimmer-only system package: $249 savings.
- Two-module systems without trimmer: $398 savings.
- Two-module systems with trimmer: $348 savings.
- Three-module systems with trimmer: $647 savings.
- Three-module systems without trimmer: $697 savings.
- Four-module systems: $746 savings.

This pattern supports the interpretation that the package prices were entered as full Core-plus-module system prices with bundle discounts. It does not prove that charging/RTK equipment value was considered, because those components are not structured package-item rows.

## 8. Packages Requiring IDS Confirmation

IDS should confirm all 23 package prices before a frontend package-merchandising release because:

- The purchase flow charges package price only.
- The package rows do not store a dedicated savings amount.
- Current option sale prices create conflicts with several package price/savings messages.
- Included charging/navigation/RTK equipment is currently copy/merchandising logic, not structured price composition.

Highest priority confirmations are the 14 current-sale mismatch packages listed in Section 6.

IDS should answer these pricing questions:

- Are package prices intended to be compared against regular component retail, current sale component prices, or manufacturer-listed package MSRP?
- Are module option sale prices intended to remain active without sale date windows?
- Should package rows receive matching sale prices if the module sale prices remain active?
- Should package savings be displayed at all without a stored package savings field?
- Is all Core charging/navigation/RTK equipment included in the Core/package price with no separate retail value?

## 9. Recommendation On Frontend Pricing Safety

Not fully safe for frontend implementation until IDS confirms package pricing intent.

Safe findings:

- The frontend will not double-charge Yarbo Core when a package is selected.
- Package-included modules are not added as extra priced options.
- Every package price is high enough to plausibly include Core plus listed modules when judged against regular retail and the package naming/descriptions.
- Every package has a regular-retail discount pattern that looks intentional.

Blocking pricing concerns:

- The current frontend cannot prove Core is included in package price; it only trusts `catalog_packages.currentPriceCents`.
- Several package prices are higher than the current Core-plus-module add-on subtotal because modules have active sale prices and packages do not.
- Package savings should not be shown as "current savings" until IDS confirms whether savings should be calculated from regular retail, current active add-on prices, or an explicit stored savings value.
- Core charging/navigation/RTK equipment is not represented as priced package items, so inclusion is a merchandising assumption rather than a priced relationship.

Execution recommendation:

- Needs IDS pricing confirmation before customer-facing "savings" claims.
- Needs frontend work before a true Individual Yarbo Equipment section can support Core-alone or module-only purchase requests.
- SQL proposal should not be approved as pricing-ready solely from this audit, even though it does not change pricing.
- No database relationship revision is strictly required to prevent Core double-charge under current package flow, but IDS may want explicit structured included-equipment records if package price composition must be auditable beyond copy.

## 10. Confirmation That No Pricing Was Changed

No pricing was changed. No files containing pricing data were modified.

## 11. Confirmation That SQL Was Not Executed

No SQL was executed. `supabase/seeds/yarbo-catalog-proposal.sql` was inspected only, and it still ends with `ROLLBACK`.

## 12. Confirmation That Supabase Was Not Modified

Supabase was not modified. The only Supabase access in this audit was the approved read-only REST fetch for public Yarbo catalog pricing rows.
