# IDS Product snippets correction

Audit date: October 30, 2026 (America/Chicago).
Baseline production commit: `c6e7b578d63a729e6d64237519cff800a128ed1a`.

## Decision

Remove Product JSON-LD from all three existing family detail pages. Their previous
identity-only Product entities lacked `offers`, `review`, and `aggregateRating`.
No qualifying product-specific review or rating is displayed on these pages.

| Page | Current public catalog | Why no exact Offer is emitted |
| --- | --- | --- |
| `/equipment/lymow-one-plus` | Self-service family; available 5A ($2,649) and 10A ($2,849) configurations; no packages. The page displays a starting price. | The page represents both configurations, with no selected purchasable variant. The lowest variant amount is not the price of every configuration. |
| `/equipment/yarbo` | Self-service family; Y40 and Y40P Core choices and 15 packages with configuration-specific prices. The page displays a starting price of $3,799; the Y40P Core currently resolves to $5,349. | A Core-only price or one package/Core price cannot describe the entire family. Package contents and Core choice affect the exact purchase price. |
| `/equipment/pandag-g1` | Quote-only commercial family; no public numeric price; three model variants. | There is no public purchasable Offer. Model selection and the commercial proposal require a project quote. |

These are observed public prices at audit time, not new price sources. No price,
availability, sales mode, promotion, configuration, or checkout code was changed.

The audit used the live public `/api/catalog` response and current production
source: `lib/catalog/types.ts`, `load-public-catalog.ts`, `starting-price.ts`,
`availability.ts`, `preorder.ts`, `sales-mode.ts`, price resolution, and detail-page
components. Availability was assessed independently of price. In particular,
Y40P's public status can remain `coming_soon` while explicit preorder authorization
makes it available; Pandag's parent availability does not make its variants
available. Neither was converted into an inventory claim.

The existing product pages link into the home configurator for Lymow/Yarbo;
they do not select and sell one exact configuration on the detail URL. Pandag
continues through its quote flow. No new variant URLs or pages were created.

## Scope

- Remove the Product JSON-LD import and script from the shared detail route.
- Delete the unused identity-only `components/seo/ProductJsonLd.tsx` emitter.
- Replace tests that required invalid Product entities with rendered-page
  regression coverage.
- Keep BreadcrumbList, Organization, WebSite, Service, canonicals, and metadata.
- Retain no Product entities, so there is no retained Product JSON-LD to report
  or validate as an Offer.

Google requires at least one of `offers`, `review`, or `aggregateRating` for Product
snippets and says AggregateOffer must not represent product variants. Removing
unsupported Product markup follows the [official Product snippet guidance](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).

## Checks

- Focused rendered Product-page and BreadcrumbList tests: 21 passed.
- Full `npm test`: 1,726 passed, zero failures or skips.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- `npm run lint`: zero errors; ten existing `no-img-element` warnings.
- `npm run build`: Next.js 16.3.5 production Turbopack build passed.
- Independent source review confirmed that only Product scripts were removed
  from public output; visible JSX and all other schema emitters are unchanged.

Raw production HTML and catalog evidence are saved in the isolated checkout's
ignored `.vercel/product-snippets-audit/` directory. Final production commit,
deployment status, and post-deployment HTML results are recorded in the completion
report.
