# Yarbo Everyday Pricing 2026 Review

Date: 2026-07-21

Scope: review-ready Yarbo physical-product pricing proposal. No SQL was executed. Supabase was not modified. No catalog price value was permanently changed.

## Yarbo Core IDS Price Correction

IDS approved a follow-up Yarbo Core everyday-price correction on 2026-07-24:

- Yarbo Everyday Price remains $3,999 (`regular_price_cents = 399900`).
- IDS Everyday Price is now $3,749 (`sale_price_cents = 374900`).
- `sale_starts_at`, `sale_ends_at`, and `promotion_label` remain `NULL`.
- The correction targets only the active `public.catalog_products` row with slug `yarbo`, brand `Yarbo`, and name `Yarbo Core`.
- No option/module or complete-system package price changed.
- Review SQL: `supabase/seeds/yarbo-core-ids-price-2026.sql`.
- Hash-locked runner: `supabase/seeds/Invoke-YarboCoreIdsPrice2026Commit.ps1`.
- First permanent execution updated 1 row.
- Immediate second guarded execution updated 0 rows.
- Live local `/api/catalog` verification returned the corrected Core values and
  matched all 5 module and all 23 package prices to the previously approved
  schedule with 0 mismatches.

## Source Pricing

IDS approved the following Yarbo pricing policy:

- `regular_price_cents` is Yarbo Standard MSRP.
- `sale_price_cents` is IDS Everyday Price.
- The manufacturer sheet discount column is ignored.
- Dealer price is ignored.
- Prices are listed exactly from the IDS-approved schedule and converted to integer cents.
- `sale_starts_at`, `sale_ends_at`, and `promotion_label` should be `NULL`.
- The IDS price is permanent everyday pricing, not a dated sale.
- Existing stable slugs are preserved.
- Customer-facing "Blower" wording is preserved even where existing records still contain "Leaf Blower".

Review inputs:

- User-provided IDS pricing schedule dated 2026-07-21.
- Current local public catalog snapshot at `.next/public-pricing-audit-data.json`.
- Current package-item relationships in the same snapshot: 23 active Yarbo packages and 52 included package-item rows.
- Current frontend pricing helpers in `app/api/catalog/route.ts`, `lib/catalog/pricing.ts`, `lib/catalog/selection.ts`, and the Yarbo catalog/purchase components.

## Mapping Summary

- Expected targets: 29.
- Matched local targets: 29.
- Unmatched records: none found in the local snapshot.
- Ambiguous records: none found in the local snapshot.
- Product targets: 1.
- Option/module targets: 5.
- Package targets: 23.
- Records where Yarbo MSRP and IDS Everyday Price are identical: 10.
- Records where IDS Everyday Price is lower than Yarbo MSRP: 19.

The review-only SQL at `supabase/seeds/yarbo-everyday-pricing-2026.sql` revalidates the same mapping against live database state before any proposed update. It stops if a target is missing, duplicated, inactive, outside the Yarbo product, or if package-item module relationships no longer match the expected module set.

## Pricing Totals

| Total | Amount |
| --- | ---: |
| Old regular/MSRP total across 29 rows | $158,971 |
| Old current website-price total across 29 rows | $157,721 |
| Proposed Yarbo MSRP total across 29 rows | $158,971 |
| Proposed IDS Everyday Price total across 29 rows | $145,621 |
| Net change from old current total to proposed IDS total | -$12,100 |

## Full 29-Row Mapping

| Record type | Stable slug | Existing catalog name | Approved customer-facing source name | Package-item modules used for package validation | Old regular price | Old current price | New Yarbo MSRP | New IDS Everyday Price | Display rule |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| Product | `yarbo` | Yarbo Core | Yarbo Core | n/a | $3,999 | $3,999 | $3,999 | $3,749 | Comparison price |
| Option | `yarbo-snow-blower-module` | Snow Blower Module | Snow Blower Module | n/a | $1,299 | $1,199 | $1,299 | $1,299 | Single clean price |
| Option | `yarbo-mower-module` | Lawn Mower Module | Standard Lawn Mower Module | n/a | $1,299 | $899 | $1,299 | $999 | Comparison price |
| Option | `yarbo-lawn-mower-pro-module` | Lawn Mower Pro Module | Lawn Mower Pro Module | n/a | $2,299 | $1,799 | $2,299 | $2,099 | Comparison price |
| Option | `yarbo-leaf-blower-module` | Leaf Blower Module | Blower Module | n/a | $1,099 | $949 | $1,099 | $1,099 | Single clean price |
| Option | `yarbo-trimmer-module` | Trimmer Package | Yarbo Trimmer Package | n/a | $799 | $699 | $799 | $799 | Single clean price |
| Package | `yarbo-snow-blower` | Yarbo Snow Blower | Snow Blower System | Snow Blower Module | $4,999 | $4,999 | $4,999 | $4,999 | Single clean price |
| Package | `yarbo-lawn-mower` | Yarbo Lawn Mower | Lawn Mower System | Standard Lawn Mower Module | $4,999 | $4,999 | $4,999 | $4,199 | Comparison price |
| Package | `yarbo-lawn-mower-pro` | Yarbo Lawn Mower Pro | Lawn Mower Pro System | Lawn Mower Pro Module | $5,999 | $5,999 | $5,999 | $5,399 | Comparison price |
| Package | `yarbo-leaf-blower` | Yarbo Leaf Blower | Blower System | Blower Module | $4,799 | $4,799 | $4,799 | $4,799 | Single clean price |
| Package | `yarbo-trimmer` | Yarbo Trimmer | Trimmer System | Yarbo Trimmer Package | $4,549 | $4,549 | $4,549 | $4,549 | Single clean price |
| Package | `yarbo-leaf-blower-trimmer` | Yarbo Leaf Blower + Trimmer Package | Blower + Trimmer System | Blower Module; Yarbo Trimmer Package | $5,549 | $5,549 | $5,549 | $5,549 | Single clean price |
| Package | `yarbo-lawn-mower-trimmer` | Yarbo Lawn Mower + Trimmer Package | Lawn Mower + Trimmer System | Standard Lawn Mower Module; Yarbo Trimmer Package | $5,749 | $5,749 | $5,749 | $4,849 | Comparison price |
| Package | `yarbo-snow-blower-trimmer` | Yarbo Snow Blower + Trimmer Package | Snow Blower + Trimmer System | Snow Blower Module; Yarbo Trimmer Package | $5,749 | $5,749 | $5,749 | $5,749 | Single clean price |
| Package | `yarbo-lawn-mower-pro-trimmer` | Yarbo Lawn Mower Pro + Trimmer Package | Lawn Mower Pro + Trimmer System | Lawn Mower Pro Module; Yarbo Trimmer Package | $6,749 | $6,749 | $6,749 | $6,049 | Comparison price |
| Package | `yarbo-snow-lawn` | Yarbo Snow Blower + Lawn Mower | Snow Blower + Lawn Mower System | Snow Blower Module; Standard Lawn Mower Module | $6,199 | $6,199 | $6,199 | $5,299 | Comparison price |
| Package | `yarbo-snow-leaf` | Yarbo Snow Blower + Leaf Blower | Snow Blower + Blower System | Snow Blower Module; Blower Module | $5,999 | $5,999 | $5,999 | $5,999 | Single clean price |
| Package | `yarbo-lawn-leaf` | Yarbo Lawn Mower + Leaf Blower | Lawn Mower + Blower System | Standard Lawn Mower Module; Blower Module | $5,999 | $5,999 | $5,999 | $5,099 | Comparison price |
| Package | `yarbo-snow-lawn-trimmer` | Yarbo Snow Blower + Lawn Mower + Trimmer Package | Snow Blower + Lawn Mower + Trimmer System | Snow Blower Module; Standard Lawn Mower Module; Yarbo Trimmer Package | $6,749 | $6,749 | $6,749 | $5,849 | Comparison price |
| Package | `yarbo-snow-leaf-trimmer` | Yarbo Snow Blower + Leaf Blower + Trimmer Package | Snow Blower + Blower + Trimmer System | Snow Blower Module; Blower Module; Yarbo Trimmer Package | $6,549 | $6,549 | $6,549 | $6,549 | Single clean price |
| Package | `yarbo-lawn-leaf-trimmer` | Yarbo Lawn Mower + Leaf Blower + Trimmer Package | Lawn Mower + Blower + Trimmer System | Standard Lawn Mower Module; Blower Module; Yarbo Trimmer Package | $6,549 | $6,549 | $6,549 | $5,649 | Comparison price |
| Package | `yarbo-pro-snow` | Yarbo Lawn Mower Pro + Snow Blower | Lawn Mower Pro + Snow Blower System | Lawn Mower Pro Module; Snow Blower Module | $7,199 | $7,199 | $7,199 | $6,499 | Comparison price |
| Package | `yarbo-pro-leaf` | Yarbo Lawn Mower Pro + Leaf Blower | Lawn Mower Pro + Blower System | Lawn Mower Pro Module; Blower Module | $6,999 | $6,999 | $6,999 | $6,299 | Comparison price |
| Package | `yarbo-pro-snow-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Trimmer Package | Lawn Mower Pro + Snow Blower + Trimmer System | Lawn Mower Pro Module; Snow Blower Module; Yarbo Trimmer Package | $7,749 | $7,749 | $7,749 | $7,049 | Comparison price |
| Package | `yarbo-pro-leaf-trimmer` | Yarbo Lawn Mower Pro + Leaf Blower + Trimmer Package | Lawn Mower Pro + Blower + Trimmer System | Lawn Mower Pro Module; Blower Module; Yarbo Trimmer Package | $7,549 | $7,549 | $7,549 | $6,849 | Comparison price |
| Package | `yarbo-lawn-snow-leaf` | Yarbo Lawn Mower + Snow Blower + Blower | Lawn Mower + Snow Blower + Blower System | Standard Lawn Mower Module; Snow Blower Module; Blower Module | $6,999 | $6,999 | $6,999 | $6,099 | Comparison price |
| Package | `yarbo-pro-snow-leaf` | Yarbo Lawn Mower Pro + Snow Blower + Blower | Lawn Mower Pro + Snow Blower + Blower System | Lawn Mower Pro Module; Snow Blower Module; Blower Module | $7,999 | $7,999 | $7,999 | $7,299 | Comparison price |
| Package | `yarbo-lawn-snow-leaf-trimmer` | Yarbo Lawn Mower + Snow Blower + Blower + Trimmer Package | Lawn Mower + Snow Blower + Blower + Trimmer System | Standard Lawn Mower Module; Snow Blower Module; Blower Module; Yarbo Trimmer Package | $7,749 | $7,749 | $7,749 | $6,849 | Comparison price |
| Package | `yarbo-pro-snow-leaf-trimmer` | Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer Package | Lawn Mower Pro + Snow Blower + Blower + Trimmer System | Lawn Mower Pro Module; Snow Blower Module; Blower Module; Yarbo Trimmer Package | $8,749 | $8,749 | $8,749 | $8,049 | Comparison price |

## Equal Price Rows

These 10 rows have identical Yarbo MSRP and IDS Everyday Price, so the frontend should show one clean price and should not repeat the same value as a crossed-out comparison:

`yarbo-snow-blower-module`, `yarbo-leaf-blower-module`, `yarbo-trimmer-module`, `yarbo-snow-blower`, `yarbo-leaf-blower`, `yarbo-trimmer`, `yarbo-leaf-blower-trimmer`, `yarbo-snow-blower-trimmer`, `yarbo-snow-leaf`, `yarbo-snow-leaf-trimmer`.

## IDS-Lower Rows

These 19 rows have a lower IDS Everyday Price and should display:

- Yarbo Everyday Price: crossed-out MSRP.
- IDS Everyday Price: emphasized current price.

Rows: `yarbo`, `yarbo-mower-module`, `yarbo-lawn-mower-pro-module`, `yarbo-lawn-mower`, `yarbo-lawn-mower-pro`, `yarbo-lawn-mower-trimmer`, `yarbo-lawn-mower-pro-trimmer`, `yarbo-snow-lawn`, `yarbo-lawn-leaf`, `yarbo-snow-lawn-trimmer`, `yarbo-lawn-leaf-trimmer`, `yarbo-pro-snow`, `yarbo-pro-leaf`, `yarbo-pro-snow-trimmer`, `yarbo-pro-leaf-trimmer`, `yarbo-lawn-snow-leaf`, `yarbo-pro-snow-leaf`, `yarbo-lawn-snow-leaf-trimmer`, `yarbo-pro-snow-leaf-trimmer`.

## Exact Database Columns Affected

If later executed permanently, the SQL proposal would affect only these public table columns:

- `public.catalog_products`: `regular_price_cents`, `sale_price_cents`, `sale_starts_at`, `sale_ends_at`, `promotion_label`, `show_public_price`, `contact_for_pricing`, `updated_at`.
- `public.catalog_options`: `regular_price_cents`, `sale_price_cents`, `sale_starts_at`, `sale_ends_at`, `promotion_label`, `show_public_price`, `contact_for_pricing`, `updated_at`.
- `public.catalog_packages`: `regular_price_cents`, `sale_price_cents`, `sale_starts_at`, `sale_ends_at`, `promotion_label`, `show_public_price`, `contact_for_pricing`, `updated_at`.

No services, service payment options, package-item relationships, product relationships, quantities, descriptions, images, public statuses, sort orders, Lymow rows, Pandag rows, private monitoring tables, RLS, grants, or permissions are targeted.

## SQL Dry-Run Expectations

Against the current local snapshot, the first dry run should report:

| Table | Expected proposed update rows |
| --- | ---: |
| `public.catalog_products` | 1 |
| `public.catalog_options` | 5 |
| `public.catalog_packages` | 23 |
| Total | 29 |

The SQL is semantically guarded and idempotent. If it is run again after the same values already exist, expected proposed updates are 0 while validation should still verify all 29 targets.

The file ends with `ROLLBACK`, so the first review execution should leave 0 persistent database changes.

## Frontend Pricing Verification

Current catalog API behavior:

- `app/api/catalog/route.ts` treats `sale_price_cents` with null start/end dates as active because missing start dates resolve to negative infinity and missing end dates resolve to positive infinity.
- Therefore the proposed undated `sale_price_cents` values will resolve as `currentPriceCents`.
- `regularPriceCents` remains available in the API response for comparison display.
- `promotionLabel` is null, so no temporary promotion badge or countdown should be implied by the current catalog data.

Frontend adjustment made for this review:

- Added a Yarbo-only price display component for customer-facing Yarbo product, module, and package surfaces.
- When `regularPriceCents > currentPriceCents`, it shows `Yarbo Everyday Price` crossed out and `IDS Everyday Price` emphasized.
- When prices are equal, it shows one clean price.
- Generic `priceLabel` behavior remains unchanged for Lymow, Pandag, services, and non-Yarbo physical rows.
- Yarbo complete systems still charge only the selected package `currentPriceCents`.
- Yarbo Core uses the Yarbo product `currentPriceCents`.
- Individual modules use their own option `currentPriceCents`.
- Package-item module prices are not added separately.

## Permanent Application

Applied to the linked Supabase project on 2026-07-23 after a rollback-protected dry run.

- First permanent execution: 29 updates (`1` product, `5` options, `23` packages).
- Immediate verification: all 29 targets matched exactly once, were active Yarbo records, and contained the approved MSRP and IDS Everyday Price values.
- Missing targets: 0.
- Duplicate targets: 0.
- Unrelated or inactive matches: 0.
- Second guarded permanent execution: 0 updates and 29 already-correct/no-op rows.
- Live `/api/catalog` verification: passed for Yarbo Core, Standard Lawn Mower Module, Lawn Mower package, Snow Blower package, and Lawn Mower Pro + Snow Blower + Blower + Trimmer package.
- Package verification: the API returned 23 Yarbo packages and 5 modules; representative package-item counts remained 1, 1, and 4 with stored package prices used directly.
- Lint: passed with 0 errors and 3 existing `@next/next/no-img-element` warnings in `app/page.tsx`.
- TypeScript: `npx.cmd tsc --noEmit` passed.
- Production build: passed after allowing the build to fetch Geist and Geist Mono from Google Fonts.

The review seed remains rollback-protected and ends with `ROLLBACK`. The permanent runner is hash-guarded and derives the approved COMMIT statement from that reviewed seed without changing its 29 targets.
