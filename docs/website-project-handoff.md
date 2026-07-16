# Mower Site Shutdown Handoff

Checkpoint captured: **2026-07-15 23:12:00 CDT (UTC-05:00, America/Chicago)**
Project root: `C:\Users\Danie\mower-site`
Git branch: `catalog-backend`
Configured upstream: `origin/catalog-backend`

## Shutdown status

The equipment-catalog, purchasing-flow, and manufacturer-monitoring work is saved locally. This handoff is a shutdown checkpoint, not authorization to publish catalog changes.

The revised Lymow proposal is complete and review-only:

- `supabase/seeds/lymow-catalog-proposal.sql` has **not** been executed.
- Supabase has **not** been modified by the Lymow proposal.
- No Lymow candidate has been approved, published, or applied.
- No manufacturer image has been downloaded or published.
- The proposal is safe to execute only after final IDS content approval.
- Reviewed SQL SHA-256: `43C6D34085AA94FE3C825609630CBB84488C9B10AC424D728056C601AF9431D7`.

At handoff creation, the pre-checkpoint Git state was:

- HEAD before the checkpoint commit: `7808702`
- 9 modified tracked files
- 32 untracked project files
- 0 staged files
- tracked diff: 1,803 insertions and 832 deletions
- `git diff --check`: clean
- no ahead/behind count reported relative to the existing upstream

The changed paths comprise the equipment catalog UI/API, quote-oriented purchasing flow, catalog importer/types, manufacturer-sync implementation, Supabase migrations, reviewed SQL seeds, and review documentation. Ignored local environments and build/import artifacts are excluded.

## Secret and local-artifact protection

`.gitignore` contains `.env*`, so `.env.local` is ignored. Git ignore checks also confirm the following local paths are excluded and untracked:

- `.env.local`
- `node_modules/`
- `.next/`
- `catalog-data/`
- `catalog-assets/`
- `supabase/.temp/`
- `*.tsbuildinfo`
- npm, Yarn, and pnpm debug logs

Do not print, commit, archive, upload, or move any value from `.env.local`. In particular, never expose `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, an API key, a password, or any other environment-variable value. The server credential must never be renamed to a `NEXT_PUBLIC_` variable.

A filename-only and literal-pattern scan of the checkpoint candidates found no likely embedded key, JWT, password, or secret value. Repeat this check before any future commit or backup.

## Current product lineup

The intended active IDS equipment lineup is:

- Lymow
- Yarbo
- Pandag

Luba has been removed from the lineup. The current application/source scan contains no Luba or Mammotion wording in `app`, `components`, `lib`, or `supabase`, and the official-source seed covers only Lymow, Yarbo, and Pandag.

Runtime catalog cards are data-driven. `/api/catalog` returns every database product whose `public_status` is `active`; therefore production database status remains the final runtime authority even though the code, assets, and reviewed source definitions contain only the intended three brands.

## Equipment browsing architecture

The public equipment experience is backed by the dynamic catalog API and Supabase public catalog tables.

```text
Supabase public catalog tables
        |
        v
GET /api/catalog (server-only service client)
        |
        +--> /equipment catalog
        +--> /equipment/[slug] detail page
        +--> Nationwide Build Your System flow
```

### `/api/catalog`

`app/api/catalog/route.ts` is force-dynamic and reads the catalog using the server-only client from `lib/supabase.ts`. It loads products, variants, option groups/options, variant-option links, packages, services, media, product pages, and published page sections in parallel.

Public filtering is performed before the response is composed:

- products, variants, options, packages, and services require `public_status='active'`;
- product pages and page sections require `is_published=true`;
- `defines_variant` relationships are returned as variant `definingOptionIds`;
- one failed parallel catalog query currently causes the whole endpoint to return an error.

The browser never receives the server secret. `lib/supabase.ts` rejects missing server configuration and must remain server-only.

### `/equipment`

`app/equipment/page.tsx` provides page metadata and the catalog heading, then mounts `components/equipment/EquipmentCatalog.tsx`.

`EquipmentCatalog`:

- fetches the complete `/api/catalog` response in the browser;
- renders one card per returned active product;
- links product cards to `/equipment/{product.slug}`;
- flattens active options into catalog tabs;
- sends an option compatibility link to the owning product's `#compatible-equipment` section;
- classifies accessories by words in the option name rather than a dedicated category column.

The name-based category behavior is why the proposed visible Lymow track is renamed `Replacement Lymow Track`: the word “Replacement” places it in Replacement Parts without asserting an unverified pack quantity.

### `/equipment/[slug]`

`app/equipment/[slug]/page.tsx` is currently client-rendered. It fetches the full catalog, finds the requested product slug locally, and renders:

- hero, price, and media;
- best-fit, capability, and customer guidance;
- published product-page sections;
- included equipment;
- active optional/replacement equipment;
- links back to the system builder.

An unknown slug currently produces a client error state rather than a server `notFound()` response. Product-specific server metadata and product-specific API fetching are not yet implemented.

### Equipment catalog components

Important equipment and purchasing components:

- `components/equipment/CatalogHeader.tsx` — catalog introduction and builder CTA.
- `components/equipment/EquipmentCatalog.tsx` — product cards and name-classified equipment tabs.
- `components/customer-paths/purchase/NationwidePurchaseFlow.tsx` — seven-stage quote-oriented system builder.
- `components/customer-paths/purchase/ProductSelection.tsx` — mower selection.
- `components/customer-paths/purchase/ProductConfiguration.tsx` — required variant plus compatible option selection.
- `components/customer-paths/purchase/ProductDetailsModal.tsx` — in-builder catalog details.
- `components/customer-paths/purchase/ServiceSelection.tsx` — eligible service selection.
- `components/customer-paths/purchase/PurchaseSummary.tsx` — selected system and pricing summary.
- `lib/catalog/types.ts` — normalized catalog response and selection types.
- `lib/catalog/pricing.ts` — client pricing calculations for the quote summary.
- `lib/catalog/selection.ts` — selection completeness and Lymow charger-group behavior.

### “Build Your System” CTA behavior

Catalog header, product-card, product-detail, “Ask a Question,” and compatible-equipment CTAs all point to:

`/#location-and-customer-path`

That anchor returns the customer to the homepage location/path gate. It does not preserve the originating product or accessory, so the customer must select the machine again.

Only the Nationwide path currently launches the working builder. Local Services and Guided Recommendation end at a disabled “Continue — Next Section Coming” placeholder.

The Nationwide flow has seven stages:

1. Introduction
2. Machine Info
3. Packages & Options
4. Services & Plans
5. Purchase
6. Customer
7. Summary

It submits a quote request through `/api/quote-request`; it does not take online payment. The related security migration is `supabase/migrations/20260715_secure_quote_requests.sql` and must be applied before public deployment of the quote-request flow.

For Lymow, the customer chooses the 5A or 10A mower variant. The application suppresses the legacy `lymow-charger-config` group, treats it as satisfied by the selected variant, and filters `defines_variant` options from selectable/priced add-ons. No second charger question is intended.

## Manufacturer sync architecture

The manufacturer sync is a review-only server command:

`npm.cmd run sync-manufacturer-catalog`

Relevant implementation:

- `scripts/sync-manufacturer-catalog.ts` creates a private run record, loads active explicitly approved targets, records private snapshots, and performs best-effort exact duplicate checks before creating pending suggestions. Its `dry_run: true` label means zero public catalog writes, not zero private audit writes.
- `lib/manufacturer-sync/fetch-source.ts` requires explicit automated-fetch approval and HTTPS.
- `lib/manufacturer-sync/adapters/shared.ts` extracts conservative metadata, labeled values, official PDF links, and image URLs.
- `lib/manufacturer-sync/adapters/lymow.ts`, `yarbo.ts`, and `pandag.ts` provide manufacturer-specific normalization.
- `lib/manufacturer-sync/compare-values.ts` compares normalized detected and approved values.
- `catalog_private.catalog_source_targets` stores approved monitoring targets and permissions.
- `catalog_private.catalog_source_snapshots` stores each fetch snapshot.
- `catalog_private.catalog_change_suggestions` stores deduplicated review candidates.
- `catalog_private.catalog_sync_runs` stores run totals/status.

The sync reads public catalog rows only for comparison. It never publishes to public catalog tables, approves candidates, or downloads images.

The current implementation is suitable as a reviewed/manual monitoring prototype, not an unattended fetch service. Before unattended operation, constrain hosts to the approved manufacturer domain, validate redirects, block private/reserved-network destinations, add a robots-request timeout, add database uniqueness for concurrent deduplication, and add parser/comparison tests.

`allow_automated_fetch` is explicit per source. `allow_image_download` remains false for all current source records. Image URL detection does not grant dealer-use permission.

### Registered official manufacturer sources

The reviewed source definition contains **24 official source records covering 22 distinct catalog targets**:

| Manufacturer | Source records | Distinct targets |
| --- | ---: | ---: |
| Lymow | 13 | 11 |
| Yarbo | 10 | 10 |
| Pandag | 1 | 1 |
| **Total** | **24** | **22** |

Lymow records:

- Lymow One Plus product page — `https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower`
- Lymow accessories collection — `https://www.lymow.com/collections/accessories`
- Lymow warranty policy — `https://www.lymow.com/pages/warranty-policy`
- 5A configuration on the One Plus product page
- 10A configuration on the One Plus product page
- 10A Charging Station Adapter — `https://www.lymow.com/products/10a-adapter-with-extension-cable-for-lymow-one-plus-charging-station`
- 5A Charging Station Adapter — `https://www.lymow.com/products/5a-adapter-with-extension-cable-for-lymow-one-plus-charging-station`
- Lymow One Plus battery — `https://www.lymow.com/products/528wh-lifepo4-battery-for-lymow-one-plus`
- Battery Direct Charging Cable — `https://www.lymow.com/products/battery-direct-charging-cable-for-lymow-one-plus-528wh-battery`
- RTK Reference Station — `https://www.lymow.com/products/rtk-set`
- RTK Power Adapter — `https://www.lymow.com/products/rtk-power-supply`
- RTK Station Extension Cable — `https://www.lymow.com/products/rtk-station-extension-cable`
- Lymow One Plus Replacement Track — `https://www.lymow.com/products/replacement-track-for-lymow-one-plus`

Yarbo records:

- Yarbo Core — `https://www.yarbo.com/products/yarbo-core`
- Yarbo Lawn Mower Pro package — `https://www.yarbo.com/products/yarbo-lawn-mower-pro`
- Yarbo Snow Blower package — `https://www.yarbo.com/products/yarbo-snow-blower`
- Lawn Mower Module — `https://www.yarbo.com/products/lawn-mower-module`
- Lawn Mower Pro Module — `https://www.yarbo.com/products/yarbo-lawn-mower-pro-module`
- Snow Blower Module — `https://www.yarbo.com/products/snow-blower-module`
- Blower Module — `https://www.yarbo.com/products/blower-module`
- Trimmer Module — `https://www.yarbo.com/products/trimmer-back-brace-mount`
- Snow Plow Blade — `https://www.yarbo.com/products/plow-blade`
- Tow Hitch — `https://www.yarbo.com/products/tow-hitch`

Pandag record:

- Pandag G1 M1500 SD/RD and G1 PRO M3000 specifications — `https://www.pandag.com/product/pandag-g1-mower`

These mappings are present in both:

- `supabase/seeds/manufacturer-source-targets.sql` — reusable reviewed seed;
- `supabase/migrations/20260715_seed_official_manufacturer_sources.sql` — migration copy.

Both are intentionally part of the checkpoint, but they are near-duplicates and must be kept synchronized if source mappings change.

`scripts/seed-manufacturer-sources.ts` is a third independently maintained definition and already differs in several Yarbo/Pandag monitored-field lists. Treat `supabase/seeds/manufacturer-source-targets.sql` and its reviewed SHA-256 as the current canonical approved artifact until a future task consolidates the executable seeder and migration around one definition.

Known documentation caveat: `docs/manufacturer-catalog-sync.md` still contains an earlier statement that no URLs were seeded. The later reviewed seed, applied source registration, successful sync, and this handoff supersede that sentence. Correct it as documentation maintenance in a future explicitly scoped task.

## Pending manufacturer review queue

Latest review report source check: `2026-07-16T02:00:15.045998+00:00`.

| Measure | Count |
| --- | ---: |
| Pending candidates | 90 |
| Non-image candidates | 71 |
| Image candidates | 19 |
| Distinct catalog targets | 22 |
| Likely valid specification flags | 27 |
| Likely duplicate flags | 0 |
| Conflicting-value flags | 0 |
| Low-confidence extraction flags | 71 |
| Missing current catalog values | 67 |

Manufacturer breakdown:

| Manufacturer | Text candidates | Image candidates | Total |
| --- | ---: | ---: | ---: |
| Lymow | 15 | 9 | 24 |
| Yarbo | 47 | 10 | 57 |
| Pandag | 9 | 0 | 9 |

All 90 remain pending. None has been approved, rejected, ignored, applied, or published. No image has confirmed dealer-use permission.

## Lymow proposal checkpoint

Proposal files:

- `docs/lymow-catalog-proposal.md`
- `docs/lymow-page-preview.md`
- `docs/lymow-catalog-final-audit.md`
- `supabase/seeds/lymow-catalog-proposal.sql`

Candidate disposition in the proposal:

- accepted for proposed normalized content: 8
- rejected from customer-facing claims: 6
- manual verification: 10, consisting of the battery label/capacity candidate plus all 9 Lymow image candidates

The SQL uses stable slugs, semantic `IS DISTINCT FROM` guards, transaction/advisory locking, table locks for page-section and relationship races, and conflict-safe variant-option insertion.

Expected first execution against the audited catalog snapshot:

| Public table | Updates | Inserts |
| --- | ---: | ---: |
| `catalog_products` | 1 | 0 |
| `catalog_product_pages` | 1 | 0 |
| `catalog_product_page_sections` | 3 | 5 |
| `catalog_product_variants` | 2 | 0 |
| `catalog_options` | 11 | 0 |
| `catalog_variant_options` | 0 | 2 |
| **Total** | **18** | **7** |

Expected immediate second execution:

- 0 updates
- 0 inserts
- 0 timestamp-only writes

Proposed `public_status` changes:

- `lymow-5a-charger`: `active` to `hidden`
- `lymow-10a-charger`: `active` to `hidden`
- `lymow-tracks-pair`: remains `active` and customer-visible

Proposed variant-option relationships:

- `lymow-one-plus-5a` to `lymow-5a-charger`: `relationship_type='defines_variant'`, `quantity=1`
- `lymow-one-plus-10a` to `lymow-10a-charger`: `relationship_type='defines_variant'`, `quantity=1`

No option group or separate charging-selection question is inserted or restored. Included charging hardware stays associated with the selected mower configuration; separately sold adapters and cables remain replacement/optional equipment.

### Remaining manual verification

Before any customer publication, verify or retain the existing exclusion for:

- dealer image-use permission for all 19 manufacturer image candidates, including all 9 Lymow images;
- the 71 low-confidence text extractions and especially the 67 missing-current-value comparisons;
- the amperage mapping of the charging-station adapter included with each Lymow configuration;
- Lymow `Battery 2.0` labeling and accessory battery capacity;
- Lymow replacement-track pack quantity;
- standalone Lymow RTK extension-cable length and quantity;
- any whole-property acreage recommendation for Lymow;
- Lymow Straight Blade 2.0 replacement quantity;
- all 47 Yarbo text candidates and 10 Yarbo image candidates;
- all 9 Pandag text candidates;
- ongoing consistency between the manufacturer-source seed and migration copies.

The finished Lymow customer proposal intentionally excludes every unresolved internal note and does not invent these values.

## Verification completed for this checkpoint

Commands run on 2026-07-15:

- `npm.cmd run lint` — passed with 0 errors and 3 warnings.
- `npx.cmd tsc --noEmit` — passed with no diagnostics.
- `npm.cmd run build` — passed after allowing the existing Geist/Geist Mono Google Fonts request once.

Pre-existing lint warnings:

- `app/page.tsx:52` — `@next/next/no-img-element`
- `app/page.tsx:113` — `@next/next/no-img-element`
- `app/page.tsx:138` — `@next/next/no-img-element`

The first sandboxed build attempt failed only because Google Fonts could not be reached. The permitted network-enabled retry compiled successfully, type-checked, generated static pages, and produced these routes:

- static: `/`, `/_not-found`, `/equipment`
- dynamic: `/api/catalog`, `/api/quote-request`, `/equipment/[slug]`

## Known limitations and warnings

- This checkpoint is a coherent work-in-progress snapshot, **not a public-release approval**.
- `lib/catalog/pricing.ts` formats currency with zero fractional digits, so cent-priced items such as `$29.99` display rounded. Preserve cents before public release.
- `/api/catalog` currently returns raw Supabase query error messages to the client. Log detailed failures server-side and return a generic public error before release.
- The shared server-only Supabase client uses the privileged server credential for both catalog reads and quote writes. The key is not exposed, but RLS is bypassed inside those routes; route validation is therefore the trust boundary.
- `/api/quote-request` has no CAPTCHA/rate limit, and free-form notes/selection arrays need explicit abuse-size review before deployment.
- Required service/option flags and option-group maximum selections are not fully enforced. Current code can treat an empty service set as complete and labels services optional.
- Package cards contain a hardcoded “Yarbo Core” included-item label, which becomes incorrect if another brand gains packages.
- Package items can fall back to a generic “Catalog option” label when they reference an option excluded from the active API normalization.
- A contact-priced-only build can display `$0 + items requiring a quote`, which should be replaced with clearer contact-pricing language before release.
- Equipment CTAs do not preserve the product/accessory selection when returning to the homepage builder gate.
- “Ask a Question” and “Add when building your system” currently use the same builder anchor.
- Local Services and Guided Recommendation are placeholder paths; only Nationwide is operational.
- `/equipment/[slug]` is client-only and does not return a server 404 for an unknown slug.
- Catalog and detail views refetch the full dynamic catalog without pagination or caching.
- Option category placement is inferred from the option name.
- Multi-line section bodies preserve line breaks on the dedicated equipment page, but the builder details modal currently collapses them into a plain paragraph.
- Product detail pages do not render variant cards; configuration differences must appear in page sections or be viewed in the builder.
- `lib/products/product-options.ts` contains an older hardcoded Lymow charger-question model, but no current import/consumer was found. The active path is `/api/catalog` plus `lib/catalog`.
- `docs/manufacturer-catalog-sync.md` has one stale no-sources sentence as noted above.
- The source seed and migration intentionally duplicate the same 24 mappings and can drift if only one is edited.
- `scripts/seed-manufacturer-sources.ts` already differs from the reviewed SQL mappings; do not run it until the definitions are reconciled.
- All three new migration filenames share the `20260715` version prefix. Reconcile Supabase migration history and assign safe unique versions before treating them as deployable migrations; the already-applied controls migration must remain ordered before source registration.
- `20260715_secure_quote_requests.sql` assumes both `public.quote_requests` and `public.quote_requests_id_seq` already exist. Verify the live table/identity sequence name before applying it.
- `scripts/import-catalog.ts` is privileged, non-transactional operational tooling. It writes many public tables and private pricing; a mid-run failure can leave partial data, and its workbook is intentionally excluded from Git.
- Manufacturer source/suggestion creation uses read-then-insert checks without a matching unique identity constraint, so overlapping seed/sync runs can still create duplicates.
- Structured field comparison currently maps only a small subset of fields to approved public columns. Many “missing current value” results mean no comparison mapping exists rather than a newly absent database value.
- Manufacturer extraction is intentionally conservative but untested; flattened page text can capture scripts, navigation, testimonials, or adjacent fields. All candidates still require source-page review.
- Manufacturer terminal counts have caveats: `products_checked` includes variants/options/packages, image counts can precede duplicate filtering, and failed status/snapshot writes are not independently surfaced.
- Git reports LF-to-CRLF conversion warnings because `core.autocrlf=true` and the repository has no `.gitattributes`.
- The production build depends on fetching Geist font CSS unless fonts are later self-hosted or otherwise cached.
- The quote-request security posture must be resolved before public deployment. First verify the live table/sequence assumptions, then apply a reviewed uniquely versioned migration.

Local ZIP-extraction notes `INSTALL.txt` and `UPDATE-INSTRUCTIONS.txt` are developer-specific, stale once their files are present, and intentionally excluded from the checkpoint commit and backup. If their guidance remains useful, rewrite it generically under `docs/` in a future scoped documentation task.

## Exact recommended next task

**Perform final human content approval of `docs/lymow-page-preview.md` against the linked official Lymow product, accessory, and warranty pages. Do not change the database during that review.**

Only after explicit IDS approval should a separate execution task:

1. verify that `supabase/seeds/lymow-catalog-proposal.sql` still has SHA-256 `43C6D34085AA94FE3C825609630CBB84488C9B10AC424D728056C601AF9431D7`;
2. confirm the current catalog still matches the audited preconditions;
3. execute the reviewed SQL once;
4. verify the expected 18 updates and 7 inserts;
5. confirm the two public-status changes and two `defines_variant` relationships;
6. execute the same SQL a second time only as an explicit idempotence verification;
7. confirm zero second-run inserts, updates, and timestamp-only writes;
8. verify the customer flow has one 5A/10A mower choice and no separate charger question.

Do not begin Yarbo review, Pandag review, checkout, payment, financing, or another product phase before that approval decision.

## Important commands

Run from `C:\Users\Danie\mower-site`:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run dev
npm.cmd run import:catalog
npm.cmd run seed:manufacturer-sources
npm.cmd run sync-manufacturer-catalog
Get-FileHash -Algorithm SHA256 supabase\seeds\lymow-catalog-proposal.sql
git status --short
git diff --stat
```

Safety notes:

- `sync-manufacturer-catalog` is review-only but writes private snapshots, run records, and pending suggestions.
- `seed:manufacturer-sources` changes private source-target configuration and should run only in an explicitly authorized task.
- `import:catalog` changes catalog data and should not be run casually.
- There is intentionally no generic handoff command for executing the Lymow SQL. Verify and obtain approval first.
- Never echo or inspect `.env.local` while recording terminal output.

## Important files

Equipment browsing and API:

- `app/api/catalog/route.ts`
- `app/equipment/page.tsx`
- `app/equipment/[slug]/page.tsx`
- `components/equipment/CatalogHeader.tsx`
- `components/equipment/EquipmentCatalog.tsx`
- `lib/supabase.ts`
- `lib/catalog/types.ts`

Builder and quote flow:

- `components/customer-paths/purchase/NationwidePurchaseFlow.tsx`
- `components/customer-paths/purchase/ProductSelection.tsx`
- `components/customer-paths/purchase/ProductConfiguration.tsx`
- `components/customer-paths/purchase/ProductDetailsModal.tsx`
- `components/customer-paths/purchase/ServiceSelection.tsx`
- `components/customer-paths/purchase/PurchaseSummary.tsx`
- `lib/catalog/pricing.ts`
- `lib/catalog/selection.ts`
- `supabase/migrations/20260715_secure_quote_requests.sql`

Manufacturer sync:

- `scripts/sync-manufacturer-catalog.ts`
- `scripts/seed-manufacturer-sources.ts`
- `lib/manufacturer-sync/`
- `supabase/migrations/20260715_manufacturer_sync_controls.sql`
- `supabase/migrations/20260715_seed_official_manufacturer_sources.sql`
- `supabase/seeds/manufacturer-source-targets.sql`
- `docs/manufacturer-catalog-sync.md`
- `docs/manufacturer-sync-review.md`

Lymow review proposal:

- `supabase/seeds/lymow-catalog-proposal.sql`
- `docs/lymow-catalog-proposal.md`
- `docs/lymow-page-preview.md`
- `docs/lymow-catalog-final-audit.md`

Catalog import and schema baseline:

- `scripts/import-catalog.ts`
- `supabase/migrations/20260610_create_catalog_tables.sql`
- `package.json`
- `package-lock.json`

Local-only secret/configuration file:

- `.env.local` — ignored; never commit or archive.
