# Fixed Service Pricing Correction

Review date: 2026-07-21

Scope: read-only review of the remaining fixed-service pricing gaps from `docs/public-pricing-completeness-audit.md`. No SQL was executed. Supabase was not modified. No physical-product pricing was changed.

## IDS Approval

IDS approved these standard monthly service-plan prices:

| Service | Approved monthly price | Standard season |
| --- | ---: | --- |
| Essential Care | $79/month | 9 months |
| Performance Management | $99/month | 9 months |
| Full Property Management | $149/month | 9 months |

Do not invent an annual or seasonal discount. The only approved non-monthly discounts found in the catalog snapshot are the existing service payment option rows listed below.

Service Repair Visit remains the separate approved variable-price exception: display `Please call for pricing`; do not add a numeric price.

## Data Sources Inspected

- `.next/public-pricing-audit-data.json`: ignored local snapshot from the prior read-only Supabase Data API catalog audit.
- `app/api/catalog/route.ts`: public catalog API normalization and product-service inheritance.
- `lib/catalog/pricing.ts`: customer-facing price label fallback.
- `lib/catalog/selection.ts`: service selection price resolution and total calculation.
- `components/customer-paths/purchase/ServiceSelection.tsx`: recurring service plan display and payment option selection.
- `components/customer-paths/purchase/PurchaseSummary.tsx`: selected service summary and subtotal display.
- `components/customer-paths/purchase/NationwidePurchaseFlow.tsx`: eligible-service filtering and submitted service payload construction.
- `scripts/import-catalog.ts`: import mapping for service, payment option, and product-service price fields.
- `docs/CATALOG-SCHEMA-BRIEF.md`: intended catalog service override behavior.

The importer references `catalog-data/IDS_Master_Catalog_Product_Pages_Ready.xlsx`, but that workbook is not present in this checkout, so the original spreadsheet rows could not be inspected locally. The local dev server was not responding on `localhost:3000`, so the live API endpoint could not be sampled during this documentation pass; route code and the current read-only snapshot were inspected instead.

## Root Cause

The remaining 11 rows all trace to three base `catalog_services` rows with `regular_price_cents = null`.

The six recurring service payment options are already priced and available. However, the base service records for `essential-care`, `performance-management`, and `full-property-management` are active, public, fixed-price services with `show_public_price = true` and `contact_for_pricing = false`, so the base rows still need visible monthly prices.

The eight product-service rows do not have intentional overrides. The catalog API already resolves product-service prices with this inheritance pattern:

```ts
link.override_regular_price_cents ?? service.regular_price_cents
```

That means those relationship rows should safely inherit the corrected base service price after the three base service rows are updated. They should not receive duplicated override prices unless IDS later approves a product-specific service price.

## Existing Payment Options

| Base service | Payment option slug | Current price | Billing type | Term | Savings label | Review |
| --- | --- | ---: | --- | ---: | --- | --- |
| `essential-care` | `essential-care-monthly` | $79.00 | monthly | 1 month | $0 savings | Matches approved monthly price. |
| `essential-care` | `essential-care-9-month-prepay` | $632.00 | seasonal_prepay | 9 months | $79 savings | Existing approved discount; preserve. |
| `performance-management` | `performance-management-monthly` | $99.00 | monthly | 1 month | $0 savings | Matches approved monthly price. |
| `performance-management` | `performance-management-9-month-prepay` | $792.00 | seasonal_prepay | 9 months | $99 savings | Existing approved discount; preserve. |
| `full-property-management` | `full-property-management-monthly` | $149.00 | monthly | 1 month | $0 savings | Matches approved monthly price. |
| `full-property-management` | `full-property-management-9-month-prepay` | $1,192.00 | seasonal_prepay | 9 months | $149 savings | Existing approved discount; preserve. |

## Row-by-Row Correction Matrix

| Stable slug / relationship | Record type | Current regular price | Current sale price | Public-price visibility | Contact-for-pricing | Connected base service | Available payment options | Should inherit base price? | Intentional override exists? | Exact change required | Numeric DB update needed? |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| `essential-care` | Service | Missing | None | show=true | false | `essential-care` | Monthly $79; 9-month prepay $632, `$79 savings` | No | N/A | Set `catalog_services.regular_price_cents = 7900`; keep public price visible and contact-for-pricing false. | Yes - base service only. |
| `performance-management` | Service | Missing | None | show=true | false | `performance-management` | Monthly $99; 9-month prepay $792, `$99 savings` | No | N/A | Set `catalog_services.regular_price_cents = 9900`; keep public price visible and contact-for-pricing false. | Yes - base service only. |
| `full-property-management` | Service | Missing | None | show=true | false | `full-property-management` | Monthly $149; 9-month prepay $1,192, `$149 savings` | No | N/A | Set `catalog_services.regular_price_cents = 14900`; keep public price visible and contact-for-pricing false. | Yes - base service only. |
| `lymow-one-plus:essential-care` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `essential-care` | Monthly $79; 9-month prepay $632, `$79 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Essential Care. | No - resolved by base service update. |
| `yarbo:essential-care` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `essential-care` | Monthly $79; 9-month prepay $632, `$79 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Essential Care. | No - resolved by base service update. |
| `lymow-one-plus:performance-management` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `performance-management` | Monthly $99; 9-month prepay $792, `$99 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Performance Management. | No - resolved by base service update. |
| `yarbo:performance-management` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `performance-management` | Monthly $99; 9-month prepay $792, `$99 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Performance Management. | No - resolved by base service update. |
| `pandag-g1:performance-management` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `performance-management` | Monthly $99; 9-month prepay $792, `$99 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Performance Management. | No - resolved by base service update. |
| `lymow-one-plus:full-property-management` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `full-property-management` | Monthly $149; 9-month prepay $1,192, `$149 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Full Property Management. | No - resolved by base service update. |
| `yarbo:full-property-management` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `full-property-management` | Monthly $149; 9-month prepay $1,192, `$149 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Full Property Management. | No - resolved by base service update. |
| `pandag-g1:full-property-management` | Product service offering | Missing by inheritance | None | override null; effective show=true | override null; effective false | `full-property-management` | Monthly $149; 9-month prepay $1,192, `$149 savings` | Yes | No | No relationship update. Keep override fields null so the row inherits Full Property Management. | No - resolved by base service update. |

Pandag does not currently have an active `pandag-g1:essential-care` product-service offering in the snapshot, so it is not part of the 11-row correction.

## Catalog API Behavior

`app/api/catalog/route.ts` already builds product services by combining the `catalog_product_services` link row with the connected `catalog_services` row. Override columns win when present; otherwise the base service fields are used.

After the proposed three-row base service update:

- `product.services[].currentPriceCents` for these plan services will resolve to the approved monthly price.
- `product.services[].paymentOptions[]` will continue to expose the existing monthly and 9-month prepay option prices.
- No product-service override is needed for the eight relationship rows.
- Service Repair Visit will continue to inherit null pricing and call-for-pricing behavior from its base service row.

## Frontend Review

`resolveServiceSelections` already uses the selected payment option as the price source when a recurring plan has payment options. That means selected services should total correctly today for monthly and 9-month prepay choices because those option rows already have numeric prices.

`PurchaseSummary` already displays the selected recurring plan amount from `resolveServiceSelections`. After the base service update, selected fixed-price plans should not show `Contact for pricing` unless a payment option is unexpectedly missing or unpriced.

`ServiceSelection` currently shows payment option prices only after a recurring service card is selected. To satisfy the visible-pricing requirement fully, future frontend work should show these prices on the unselected plan card as well:

- Monthly plan price, such as `$79/month`.
- Approved 9-month season-prepay price when available.
- Exact season length from `seasonLengthMonths`, especially `9 months`.
- Approved savings label when present and non-zero, such as `$79 savings`.

Do not display `Contact for pricing` on Essential Care, Performance Management, or Full Property Management after the approved base service prices are applied.

`lib/catalog/pricing.ts` still contains a generic `Contact for pricing` fallback for missing, hidden, or contact-priced records. That is acceptable as a safety fallback, but the fixed service plan rows should not rely on it after correction.

## Required Changes

Database changes are genuinely required for the three base service rows:

- `catalog_services.regular_price_cents = 7900` for `essential-care`.
- `catalog_services.regular_price_cents = 9900` for `performance-management`.
- `catalog_services.regular_price_cents = 14900` for `full-property-management`.

No database change is required for these eight product-service rows because they have no intentional overrides and should inherit:

- `lymow-one-plus:essential-care`
- `yarbo:essential-care`
- `lymow-one-plus:performance-management`
- `yarbo:performance-management`
- `pandag-g1:performance-management`
- `lymow-one-plus:full-property-management`
- `yarbo:full-property-management`
- `pandag-g1:full-property-management`

Frontend changes are required later to make all recurring plan price options visible before selection. Make an Offer frontend implementation should not begin until these public pricing rules are resolved.

## Recommendation

Create a review-only SQL proposal that updates only the three approved base `catalog_services` rows. Keep product-service override fields null, preserve all service payment option prices and savings labels, preserve Service Repair Visit as call-for-pricing, and do not touch physical-product pricing.

No SQL was executed. Supabase was not modified.
