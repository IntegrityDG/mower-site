# Manufacturer catalog sync

Run `npm.cmd run sync-manufacturer-catalog` to check explicitly approved Lymow, Yarbo, and Pandag manufacturer sources. The command is always review-only: it saves private snapshots and pending suggestions but never updates public catalog records, publishes specifications, or downloads images.

## Environment

The server-side command loads `.env.local` through Next.js and requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) plus `SUPABASE_SERVICE_ROLE_KEY`. Never use or expose the service-role key in a client component or a `NEXT_PUBLIC_` variable.

Apply `supabase/migrations/20260715_manufacturer_sync_controls.sql` before the first run. It adds explicit opt-in controls and the private `catalog_sync_runs` audit table.

## Private tables

- `catalog_private.catalog_source_targets`: approved source configuration and latest status.
- `catalog_private.catalog_source_snapshots`: one record per attempted source check.
- `catalog_private.catalog_change_suggestions`: deduplicated pending review candidates.
- `catalog_private.catalog_sync_runs`: run totals and completion status.

Public catalog tables are read for comparison only.

## Adding an approved source

Insert a target linked to exactly one existing catalog record. Use only an official HTTPS URL supplied or approved by IDS. Set `source_brand` to `Lymow`, `Yarbo`, or `Pandag`, select the correct `source_kind`, and configure `fields_to_monitor` as either `{ "fields": ["cutting_width", "weight"] }` or field-name booleans.

New sources default to `allow_automated_fetch=false`. Review terms, robots rules, and access restrictions before explicitly changing it to true. `allow_image_download` is separate and defaults to false; the first version detects image URLs but never downloads them regardless of this setting. Do not add guessed URLs. No source URLs were seeded by this implementation because none were safely mapped in the existing importer.

## Extraction and review

Manufacturer-specific adapters conservatively inspect page metadata, labeled specification text, official-page PDF links, and `og:image` URLs. Confidence scores indicate extraction confidence, not factual approval. Metadata descriptions must be rewritten into IDS language before publication. PDF contents are not parsed in this first version.

Pandag uses four isolated review scopes: shared G1 platform, M1500 SD, M1500 RD, and PRO M3000. These targets are manual-only and automated fetching is disabled. The Pandag adapter rejects protected pricing, identity, and owner-approved specification fields as well as ambiguous, mixed-model, noisy, or unscoped values. Re-enabling a Pandag fetch requires a separate owner-approved workflow and must not bypass these guards.

Review `catalog_change_suggestions` records with `review_status='pending'`. Approval does not automatically publish anything; a separate, future reviewed publishing process is required.

## Troubleshooting

- Missing-key errors: add the server-only service-role key to `.env.local` or the secure job environment.
- Missing-column/table errors: apply the manufacturer sync migration.
- Permission/schema errors: expose `catalog_private` to the Data API for `service_role` only and retain revoked `anon`/`authenticated` access.
- HTTP, timeout, or access errors: confirm the approved URL, manufacturer access policy, and robots/terms requirements. A single source failure is recorded and does not stop other sources.
- No sources found: add and explicitly approve official URLs. The command intentionally does not discover URLs from search results.
