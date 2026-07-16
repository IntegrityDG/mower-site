# Revised Lymow Catalog Final Safety Audit

Audit date: 2026-07-15
Status: **review only; SQL not executed; Supabase not modified**

Audited files:

- `supabase/seeds/lymow-catalog-proposal.sql`
- `docs/lymow-catalog-proposal.md`
- `docs/lymow-page-preview.md`

## Verdict

**The revised SQL is safe to execute against the audited current catalog state after IDS approves the customer content.** It is semantically idempotent, serializes overlapping executions, protects unexpected page sections, uses stable catalog identifiers, and remains within the authorized public Lymow scope.

An immediate second execution is expected to perform:

- **0 updates**
- **0 inserts**
- **0 `updated_at` changes**

No SQL was executed as part of this audit.

## Current schema findings

`public.catalog_product_page_sections` currently has:

- UUID primary key `id`
- required `product_page_id`
- `section_type`, `heading`, `body_content`, media/button fields, `sort_order`, `is_published`, and timestamps
- a nonunique index on `(product_page_id, is_published, sort_order)`
- no section slug
- no unique constraint on `(product_page_id, sort_order)`
- no unique constraint on `(product_page_id, section_type, heading)`

The seed therefore does not use a nonexistent `ON CONFLICT` target for page sections. It combines stable identity matching with explicit locking.

The remaining relevant constraints support the proposal directly:

- `catalog_products.slug` is unique.
- Product pages are unique by `product_id`.
- Variants are unique by `(product_id, variant_slug)`.
- Options are unique by `(product_id, option_slug)`.
- Variant-option links are unique by `(variant_id, option_id, relationship_type)`.

No UUID literal appears in the SQL.

## Idempotence proof

Every ordinary `UPDATE` has an `IS DISTINCT FROM` predicate covering all semantic columns assigned by that statement:

| Table | Semantic comparison |
| --- | --- |
| `catalog_products` | `homepage_summary`, `full_description`, `capability_level`, `property_scale`, `customer_guidance` |
| `catalog_product_pages` | `hero_heading`, `hero_subheading` |
| `catalog_product_page_sections` | `section_type`, `heading`, `body_content`, `is_published` |
| `catalog_product_variants` | `description` |
| `catalog_options` | final calculated `name`, `description`, `public_status` |

Each statement assigns `updated_at=now()` only after its semantic difference predicate passes. Identical values therefore skip the update completely.

The two variant-option inserts use the existing unique constraint. Their conflict branch contains:

```sql
where existing.quantity is distinct from excluded.quantity
```

An already-correct `defines_variant`, quantity-1 relationship makes the conflict branch a no-op, including no timestamp change.

The section statement uses one shared proposal CTE. Existing intended sections are identified before any update; missing sections are inserted once. On run two, all eight identities exist, the missing set is empty, and every semantic comparison is equal.

## Concurrency safety

The transaction acquires locks in this order:

1. A two-key transaction-level advisory lock for `ids.catalog-proposal` and `lymow-one-plus`.
2. Row locks on the exact stable product, page, variants, and options.
3. A short `SHARE ROW EXCLUSIVE` lock on `catalog_product_page_sections`.
4. A short `SHARE ROW EXCLUSIVE` lock on `catalog_variant_options` immediately before relationship validation and upsert.

The advisory lock serializes overlapping executions of this seed and releases automatically on commit or rollback. The section-table lock also blocks noncooperating concurrent section DML during identity checking and insertion. The relationship-table lock closes the equivalent gap between conflict review and link upsert. Reads remain available.

The transaction performs no network call or user interaction while locks are held. A local 10-second lock timeout makes contention fail safely instead of waiting indefinitely.

## Unexpected page-section protection

The seed never updates a page section merely because it occupies sort positions 1–8.

An intended section must match all of:

- the unique product page resolved from product slug `lymow-one-plus` and brand `Lymow`;
- `section_type='content'`;
- one exact known legacy, prior-proposal, or final heading for that logical section.

Known legacy headings allow the three current sections to be deliberately revised. Prior-proposal aliases allow a partially applied older review version to converge safely. If more than one row matches the same logical identity, the transaction raises an exception before DML.

When an unrelated row occupies a desired sort position:

- it is not selected for update;
- it is not moved or deleted;
- PostgreSQL emits a notice naming the preserved sort position and heading;
- any missing reviewed Lymow sections are inserted after the page's current highest `sort_order`;
- the table lock prevents another writer from racing that maximum/order assignment.

This preserves unexpected content and reports the layout collision for manual review without sacrificing the reviewed Lymow content.

## Customer-content corrections

### Coverage

The revised public copy consistently states:

- 5A: manufacturer-stated estimated daily mowing coverage up to 1.1 acres per day
- 10A: manufacturer-stated estimated daily mowing coverage up to 1.73 acres per day

Both are explicitly described as daily operating estimates rather than maximum lawn size, maximum supported property size, or whole-property acreage recommendations. The 15-acre value is identified only as map-storage capacity.

### Footnotes

- The 45° slope specification has no asterisk.
- The 1.73-acre figure has no laboratory-measurement asterisk and is associated directly with the 10A configuration.
- The detailed specification footnote remains only for the values the official table stars: obstacle crossing, blade speed, and charge-cycle life.

### Finished customer language

No proposed product, page, section, variant, or option value contains internal review flags, source-gap comments, developer warnings, approval instructions, or “verify/confirm” directions.

The active `lymow-straight-blade-2` description is deliberately normalized from two paragraphs to `Replacement straight blade for Lymow One Plus.` This removes the preexisting internal quantity-confirmation sentence that otherwise would remain customer-visible.

### Included versus optional equipment

The shared included-equipment section lists one generic charging-station adapter and the shared RTK equipment without inventing an adapter-amperage mapping.

Separately sold charging adapters, charging cables, battery, track, and RTK products are labeled replacement/additional/optional. No separately sold row is changed to `is_included` or `is_required`, and no included item is presented as another required purchase.

## Charging flow

The active mower variants remain the customer decision:

- `lymow-one-plus-5a`
- `lymow-one-plus-10a`

The two legacy configuration-mirror options become hidden. The SQL does not insert or update an option group. The application already suppresses `lymow-charger-config` for Lymow, treats the group as complete through the selected variant, and filters `defines_variant` option IDs from selectable add-ons and pricing.

No separate charger-selection question is created or restored.

## Public-status changes

Exactly two semantic `public_status` changes are proposed:

| Option slug | Current | Proposed |
| --- | --- | --- |
| `lymow-5a-charger` | `active` | `hidden` |
| `lymow-10a-charger` | `active` | `hidden` |

No other `public_status` changes.

`lymow-tracks-pair` preserves its current `active` status. Its public name becomes `Replacement Lymow Track`, which makes the existing name-based equipment classifier place it in Replacement Parts while avoiding an unverified pack-quantity claim. It remains visible on the product page and in the builder.

## Variant-option relationship changes

Exactly two rows are inserted on the first run if absent:

| Variant slug | Option slug | `relationship_type` | `quantity` |
| --- | --- | --- | ---: |
| `lymow-one-plus-5a` | `lymow-5a-charger` | `defines_variant` | 1 |
| `lymow-one-plus-10a` | `lymow-10a-charger` | `defines_variant` | 1 |

The seed rejects crossed 5A/10A links or an intended pair carrying another relationship type rather than layering conflicting meanings. Existing unrelated relationships remain untouched.

## Exact first-run mutation count

Counts are based on the read-only current catalog snapshot used by the prior final audit and the revised semantic values in this seed.

| Table | Updates | Inserts | Reason |
| --- | ---: | ---: | --- |
| `public.catalog_products` | 1 | 0 | Five proposed product-content fields differ. |
| `public.catalog_product_pages` | 1 | 0 | Hero heading and subheading differ. |
| `public.catalog_product_page_sections` | 3 | 5 | Three known legacy sections update; five reviewed identities are absent. |
| `public.catalog_product_variants` | 2 | 0 | Both descriptions differ. |
| `public.catalog_options` | 11 | 0 | Ten reviewed configuration/accessory rows plus Straight Blade 2.0 cleanup differ. |
| `public.catalog_variant_options` | 0 | 2 | Both intended relationships are absent. |
| **Total** | **18** | **7** | **25 first-run row mutations.** |

If a semantic value is independently changed to the exact proposal before execution, its guarded first-run update count will correctly decrease. The table above is exact for the audited snapshot.

## Expected second-run mutation count

| Table | Updates | Inserts | `updated_at` changes |
| --- | ---: | ---: | ---: |
| `public.catalog_products` | 0 | 0 | 0 |
| `public.catalog_product_pages` | 0 | 0 | 0 |
| `public.catalog_product_page_sections` | 0 | 0 | 0 |
| `public.catalog_product_variants` | 0 | 0 | 0 |
| `public.catalog_options` | 0 | 0 | 0 |
| `public.catalog_variant_options` | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** |

## Mutation scope

The revised seed contains DML only for:

- `public.catalog_products`
- `public.catalog_product_pages`
- `public.catalog_product_page_sections`
- `public.catalog_product_variants`
- `public.catalog_options`
- `public.catalog_variant_options`

Columns modified or inserted:

| Table | Columns |
| --- | --- |
| `catalog_products` | `homepage_summary`, `full_description`, `capability_level`, `property_scale`, `customer_guidance`, `updated_at` |
| `catalog_product_pages` | `hero_heading`, `hero_subheading`, `updated_at` |
| `catalog_product_page_sections` | `section_type`, `heading`, `body_content`, `is_published`, `updated_at`; inserts also resolve `product_page_id` and assign safe `sort_order` |
| `catalog_product_variants` | `description`, `updated_at` |
| `catalog_options` | `name`, `description`, `public_status`, `updated_at` |
| `catalog_variant_options` | `variant_id`, `option_id`, `relationship_type`, `quantity`, `updated_at` |

The SQL contains no `DELETE`, schema DDL, RLS statement, `GRANT`, `REVOKE`, media mutation, private-schema DML, or UUID literal.

## Preserved systems

Confirmed untouched:

- pricing, promotions, and financing
- services and service-area logic
- delivery eligibility
- payment flow and payment options
- packages
- media, image URLs, and Storage
- manufacturer monitoring and private catalog tables
- candidate approval/status
- RLS, grants, and permissions
- other brands
- excluded-brand records and wording

## Final confirmation

- Revised SQL safe to execute after content approval: **Yes**.
- First run: **18 updates, 7 inserts** against the audited snapshot.
- Second run: **0 updates, 0 inserts, 0 timestamp changes**.
- `public_status` changes: exactly the two charger mirrors, `active` → `hidden`.
- Relationship changes: exactly two `defines_variant`, quantity-1 links.
- Unexpected page content: positively excluded from updates, preserved in place, and reported by notice.
- Concurrent section duplicates and conflicting charger links: prevented by transaction advisory locking plus short section/link-table DML locks.
- Internal notes in customer fields: **none**.
- `lymow-tracks-pair`: remains active and customer-visible.
- Separate charging-selection question: **not created**.
