# Yarbo Execution Readiness Check

Review date: 2026-07-20
Phase: final execution-readiness review

Scope: review only. No SQL was executed, Supabase was not modified, existing Yarbo proposal files were not edited, and frontend code was not changed.

IDS update captured in this review: Yarbo Trimmer Package is approved to remain active and customer-visible.

Frontend implementation update captured after this review: the approved Yarbo two-path frontend structure has been implemented locally without executing SQL, without modifying Supabase, and without changing catalog pricing or package-item relationships. See "10. Frontend Implementation Update" below.

## Files Inspected

- `app/api/catalog/route.ts`
- `app/equipment/[slug]/page.tsx`
- `components/equipment/EquipmentCatalog.tsx`
- `components/customer-paths/purchase/NationwidePurchaseFlow.tsx`
- `components/customer-paths/purchase/ProductSelection.tsx`
- `components/customer-paths/purchase/ProductConfiguration.tsx`
- `components/customer-paths/purchase/PurchaseSummary.tsx`
- `components/customer-paths/purchase/ProductDetailsModal.tsx`
- `app/api/quote-request/route.ts`
- `lib/catalog/types.ts`
- `lib/catalog/selection.ts`
- `lib/catalog/pricing.ts`
- `supabase/seeds/yarbo-catalog-proposal.sql`
- `.next/codex-yarbo-public-rest-summary.json`

## 1. Package/Core Pricing Behavior

The current code does not add the parent product price on top of a selected package. In `lib/catalog/selection.ts`, `baseItem = selectedPackage ?? selectedVariant ?? product`, and the first price line uses `baseItem.currentPriceCents`. Therefore:

- If a Yarbo package is selected, the configured equipment estimate uses the package price only.
- The Yarbo Core product price is not separately added when a package is selected.
- Package-item option prices are not added when those option IDs are included in the selected package.
- Added non-package options are priced separately.
- Core cannot be double-charged by the current resolver when a package is selected.
- Core can be omitted from the price if the package row price itself does not already include Core. The code does not prove package price composition.

This is the key finding: `catalog_packages.product_id = yarbo` makes the package belong to Yarbo Core for API/UI organization, but it does not mechanically add the Core product price. The package row must already be priced as the complete Core-plus-module system for the current pricing behavior to be correct.

Current package-item data check:

- Package-item rows reviewed: 52.
- `included_in_package_price=true`: 52.
- `included_in_package_price!=true`: 0.
- Duplicate module rows within packages: 0.

## 2. Package Selection Behavior

The current flow can request a Yarbo package.

- Product selection chooses `selectedProduct`, which for Yarbo is `catalog_products.slug='yarbo'` / Yarbo Core.
- Because Yarbo has active packages, `productBuildIsComplete` requires `selection.packageId`.
- `ProductConfiguration` renders a required package section and says package pricing includes the base machine and listed modules.
- Package cards hardcode an included `Yarbo Core` line and then list package items.
- Selecting a package removes any currently selected option IDs that are included in that package.
- `resolveBuildSelection` excludes package-included option IDs from added/priced options.
- `PurchaseSummary` shows Machine = Yarbo Core, Main Configuration = selected package, and Included in Package = Base machine/core plus package items.
- The quote request payload includes selected product name, package name, package-included module names, added module names, and the configured estimate as text/arrays.

Per-package behavior is identical except for the included module set:

| Package slug | Included module rows | Parent Yarbo product selected? | Price basis | Core double-charge risk | Core omission risk | Included modules in summary? | Current duplicate add-on behavior | Requestable today? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yarbo-lawn-mower` | Standard Lawn Mower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included module disabled/removed | Yes |
| `yarbo-lawn-mower-trimmer` | Standard Lawn Mower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-lawn-leaf` | Standard Lawn Mower Module, Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-lawn-leaf-trimmer` | Standard Lawn Mower Module, Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-lawn-mower-pro` | Lawn Mower Pro Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included module disabled/removed | Yes |
| `yarbo-lawn-mower-pro-trimmer` | Lawn Mower Pro Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-pro-leaf` | Lawn Mower Pro Module, Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-pro-leaf-trimmer` | Lawn Mower Pro Module, Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-snow-blower` | Snow Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included module disabled/removed | Yes |
| `yarbo-snow-blower-trimmer` | Snow Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-snow-leaf` | Snow Blower Module, Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-snow-leaf-trimmer` | Snow Blower Module, Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-leaf-blower` | Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included module disabled/removed | Yes |
| `yarbo-trimmer` | Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included module disabled/removed | Yes |
| `yarbo-leaf-blower-trimmer` | Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-snow-lawn` | Snow Blower Module, Standard Lawn Mower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-snow-lawn-trimmer` | Snow Blower Module, Standard Lawn Mower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-pro-snow` | Lawn Mower Pro Module, Snow Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-pro-snow-trimmer` | Lawn Mower Pro Module, Snow Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-lawn-snow-leaf` | Standard Lawn Mower Module, Snow Blower Module, Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-pro-snow-leaf` | Lawn Mower Pro Module, Snow Blower Module, Blower Module | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-lawn-snow-leaf-trimmer` | Standard Lawn Mower Module, Snow Blower Module, Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |
| `yarbo-pro-snow-leaf-trimmer` | Lawn Mower Pro Module, Snow Blower Module, Blower Module, Yarbo Trimmer Package | Yes | Package price only | No | Yes, if package price excludes Core | Yes | Included modules disabled/removed | Yes |

Included charging and RTK/navigation equipment:

- They are not active optional purchase records in the reviewed API-equivalent snapshot.
- They do not appear as selectable add-ons.
- The current package card only hardcodes `Yarbo Core` plus module rows; it does not separately render charging or RTK/navigation equipment as structured included equipment.
- The SQL proposal would add copy saying Core charging/navigation equipment is included, but frontend work is needed if IDS wants those as consistent package-card fields.

## 3. Individual-Equipment Behavior

Current customers can see Yarbo Core as a product. They can also see active module options in catalog/product-detail compatible-equipment surfaces. They cannot complete a pure individual Yarbo Core or module-only request through the current purchase flow without selecting a package, because Yarbo has active packages and `productBuildIsComplete` requires `packageId`.

| Item | Visible today? | Separately requestable today without package? | Notes |
| --- | --- | --- | --- |
| Yarbo Core | Yes, as product `yarbo` | No | Product selection alone cannot complete configuration while packages exist. |
| Standard Lawn Mower Module | Yes, as option | No | Can be added only after a package is selected and only if not included in that package. |
| Lawn Mower Pro Module | Yes, as option | No | Can be added only after a package is selected and only if not included in that package. |
| Snow Blower Module | Yes, as option | No | Can be added only after a package is selected and only if not included in that package. |
| Blower Module | Yes, currently named Leaf Blower Module until SQL | No | Can be added only after a package is selected and only if not included in that package. |
| Yarbo Trimmer Package | Yes | No | IDS has approved it remaining active/customer-visible; current SQL still contains a stale manual-verification caveat in its description. |

Core-required warning placement:

| Surface | Can show warning with current SQL only? | Frontend work needed? |
| --- | --- | --- |
| Catalog module cards | Mostly yes | `EquipmentCatalog` displays option descriptions, so SQL description text can surface the warning. A dedicated warning badge would need frontend work. |
| Product detail compatible-equipment cards | Mostly yes | `app/equipment/[slug]/page.tsx` displays option descriptions. A dedicated warning badge/notice needs frontend work. |
| Configuration option cards | Yes for add-on options | `ProductConfiguration` displays option descriptions. Current flow still requires package-first. |
| Order/request lines | No | Quote payload and visible summary use option names, not warning text. |
| Purchase summary | No | `PurchaseSummary` shows selected option name and price only, not the Core-required warning. |

## 4. Duplicate-Selection Risks

Current normal UI behavior:

- Package-included modules are removed from option quantities when a package is selected.
- Package-included modules are disabled in the option card UI.
- Package-included modules are filtered out of priced selected options.
- The active Yarbo option group is `selection_type='multiple'`, so normal clicks toggle 0/1 selection.

Remaining risks:

- Current live option data has `maximum_quantity=10`; the SQL proposal would set active modules to max 1.
- `NationwidePurchaseFlow.handleOptionQuantityChange` does not clamp against `maximumQuantity`; it only applies `Math.max(0, Math.trunc(quantity))`.
- There is no server-side validation in `/api/quote-request` to reject duplicate module quantities or stale option IDs.
- Individual-equipment order lines do not exist yet, so duplicate order-line prevention requires frontend/request-shaping work.

## 5. Package Grouping Feasibility

The six approved groups can be inferred for the current 23 packages from package-item relationships plus package slugs, but this would be a Yarbo-specific merchandising rule in frontend code. It is not a general catalog feature today.

Grouping feasibility:

| Group | Reliable inference from current items? | Notes |
| --- | --- | --- |
| Mowing Systems | Yes with Yarbo-specific rules | Standard mower packages without snow and without Pro. |
| Mower Pro Systems | Yes with Yarbo-specific rules | Pro mower packages without snow. |
| Snow Systems | Yes with Yarbo-specific rules | Snow packages without mower. |
| Cleanup And Trimming Systems | Yes with Yarbo-specific rules | Blower/trimmer-only packages. |
| Multi-Season Systems | Yes with Yarbo-specific rules | Snow plus mower or Pro, with or without blower, except full four-module systems. |
| Full Property-Care Systems | Yes with Yarbo-specific rules | Four-module packages. |

Recommendation: frontend can infer grouping for the first implementation, but a database field such as package merchandising group/category would eventually be better if IDS wants stable admin-controlled ordering, labels, or non-Yarbo package grouping. Do not add that field in this review.

## 6. SQL Safety Findings

Review target: `supabase/seeds/yarbo-catalog-proposal.sql`.

Passes:

- Targets Yarbo records by stable slugs and joins to `catalog_products.slug='yarbo'`.
- Does not use hard-coded UUIDs.
- Does not update pricing columns.
- Does not update package-item relationships.
- Does not update variant-option relationships.
- Does not modify Lymow or Pandag except scope comments saying they are excluded.
- Product, product page, option group, option, and package updates use `IS DISTINCT FROM` guards.
- Product page upsert is keyed by `product_id`.
- Package updates include 23 package tuples.
- Option updates include 7 Yarbo option/accessory tuples.
- Snow Plow Blade and Tow Hitch are set to `hidden`.
- Trimmer is set to `active`.
- Active module `maximum_quantity` values are proposed as `1`.
- Customer-facing `yarbo-leaf-blower-module` name becomes `Blower Module`.
- Ends with `ROLLBACK;`.
- Contains no `COMMIT;`.

Concerns:

- The page-section block deletes all Yarbo page sections and reinserts them. It is semantically repeatable, but it is not a no-op/idempotent update in the same sense as the guarded `UPDATE`s; it churns section row IDs if ever converted to `COMMIT`.
- The Trimmer option description still says availability should be manually verified before publication. IDS has now approved Trimmer remaining active and customer-visible, so the SQL should be revised before approval.
- The SQL copy says package descriptions include Yarbo Core and Core charging/navigation equipment. That is merchandising copy only; it does not create a database relationship proving Core is included or that package prices include Core.

## 7. Blocking Issues

1. Do not approve the existing SQL without modification.
   - Reason: stale Trimmer availability caveat remains in SQL.
   - Reason: page-section DML is delete/reinsert rather than guarded idempotent updates/upserts.

2. Do not execute Yarbo merchandising SQL before frontend work if the public experience must support Individual Yarbo Equipment.
   - Current purchase flow requires a package for Yarbo.
   - Core-only and module-only requests cannot be completed through the current flow.
   - The Core-required warning cannot appear in purchase summary/order-line text yet.

3. Do not treat `catalog_packages.product_id` as proof that Core price is included.
   - Current code charges the selected package row once.
   - IDS must verify package prices are already full-system prices including Core.

## 8. Non-Blocking Frontend Work

- Replace the current package filter set with the approved package groups.
- Rename the current "Leaf" filter to Blower if filters remain.
- Render package cards with structured fields for Core included, primary module, additional modules, charging included, navigation/RTK included, best-use guidance, price, and savings.
- Add a separate Individual Yarbo Equipment section.
- Add a way to request Yarbo Core alone or module-only equipment without requiring a package.
- Add dedicated warning badges for: Module only — requires a Yarbo Core to operate.
- Show that warning in request summary and quote payload/order-line text.
- Clamp module quantities to one in state updates and validate before submit.
- Prevent duplicate order lines for the same module.
- Keep hidden Snow Plow Blade and Tow Hitch out of public UI.

## 9. Exact Recommendation

- Safe to execute SQL: No, not without modification.
- Needs SQL revision: Yes.
  - Remove the stale Trimmer availability/manual-verification caveat.
  - Replace page-section delete/reinsert with stable, guarded upserts if this will become an executable seed.
- Needs database relationship revision: Conditional.
  - Not required if IDS confirms package rows are intentionally priced as complete Core-plus-module systems and accepts Core inclusion as merchandising copy.
  - Required if IDS needs machine-enforced proof that every package contains exactly one Core or wants package grouping/admin ordering stored in the catalog.
- Needs frontend work before execution: Yes, if executing the SQL means publishing the revised Yarbo merchandising experience.
  - Current frontend can request complete packages, but it cannot support true individual Core/module-only purchasing without a package.

Existing SQL approval verdict: the existing SQL should not be approved without modification.

## Original Review-Only Confirmation

- SQL executed during the original readiness review: no.
- Supabase modified during the original readiness review: no.
- Existing Yarbo proposal files modified during the original readiness review: no.
- Frontend code edited during the original readiness review: no.

## 10. Frontend Implementation Update

Implementation date: 2026-07-20

Scope: local frontend and documentation changes only. The Yarbo SQL proposal was not executed or modified. Supabase was not modified. Catalog pricing and package-item relationships were not changed.

Implemented files:

- `lib/catalog/yarbo.ts`
- `lib/catalog/types.ts`
- `lib/catalog/selection.ts`
- `components/customer-paths/purchase/NationwidePurchaseFlow.tsx`
- `components/customer-paths/purchase/ProductConfiguration.tsx`
- `components/customer-paths/purchase/PurchaseSummary.tsx`
- `components/equipment/EquipmentCatalog.tsx`
- `app/equipment/[slug]/page.tsx`

Implemented customer paths:

- Complete Yarbo Systems: customer selects one active Yarbo package. The selected package price is the complete system price. Yarbo Core, Core charging equipment, Core navigation/RTK equipment, and included modules are displayed as included equipment. Package-item prices are not added separately.
- Individual Yarbo Equipment: customer can select Yarbo Core only, one or more modules only, Yarbo Core plus one or more modules, or multiple different modules together. No package is required. Manual combinations are not converted into packages.

Pricing behavior now implemented:

- Complete system formula: selected package current price only, plus any selected service/plan prices. No separate Core charge and no separate package-item module charges.
- Individual equipment formula: selected Yarbo Core product current price when Core is selected, plus selected module option current prices, plus any selected service/plan prices.
- Module quantities are clamped to one in the flow state for Yarbo module options.
- Duplicate order lines for the same module are prevented by the `optionQuantities` map and 0/1 toggle UI.

Core-required warning placement:

- Yarbo module cards in the purchase flow.
- Yarbo module-only lines in purchase summary.
- Warning when modules are selected without Core in the purchase flow.
- Warning when modules are selected without Core in the purchase summary.
- Yarbo module cards in the public equipment catalog option tabs.
- Yarbo module cards on the Yarbo equipment detail page.

Package grouping implementation:

- Package groups are inferred in frontend code from stable Yarbo package slugs, package-item module relationships, and fallback name/module checks.
- Groups rendered: Mowing Systems, Mower Pro Systems, Snow Systems, Cleanup and Trimming Systems, Multi-Season Systems, and Full Property-Care Systems.
- No database merchandising-group field was added.

Remaining SQL work:

- Existing Yarbo SQL remains review-only and unexecuted.
- SQL still needs separate approval/revision before any database copy/name/status updates are applied.
- The frontend implementation uses display helpers so customer-facing Blower Module and package "System" wording can render before SQL changes.

Remaining package-price confirmation work:

- IDS still needs to confirm package prices are intentional complete-system prices that include exactly one Core, all listed modules, Core charging equipment, and Core navigation/RTK equipment.
- Savings claims remain disabled because package rows do not store an approved savings amount, and active standalone module sale prices can conflict with package-versus-add-on comparisons.

Updated readiness recommendation:

- Frontend work before execution: implemented locally.
- Safe to execute SQL: still requires separate IDS approval and any desired SQL revision.
- Needs package-price confirmation before customer-facing savings claims: yes.
