# Lymow exact configuration purchase pages

Implemented November 4, 2026 after IDS authorized the reviewed Lymow-only scope.
Baseline: `7358a4f7ba335a4fdd9809b53b22f4e7ab45d933`.

## Published scope

- `/equipment/lymow-one-plus/5a`
- `/equipment/lymow-one-plus/10a`

The existing three family pages retain their supported schema and metadata. The
Lymow comparison cards gain discovery links. Yarbo's package/Core combinations
and Pandag's quote-only flow do not receive Product/Offer markup.

The explicit route registry maps these two URLs to existing catalog variants;
catalog additions cannot silently publish extra pages. Each page has its own
canonical, specific heading, variant description, charging/coverage comparison,
included equipment, and purchase panel. Sibling configuration links navigate
between pages. Query parameters cannot override the panel's base configuration.

## Pricing and purchasing

One request-scoped public catalog read provides metadata, visible pricing,
Product/Offer JSON-LD, and the initial purchase selection. Pages render on request
and use `currentPriceCents`, including existing price schedules and pricing-program
rules. The purchase flow refreshes the catalog, retains the URL's base variant,
and uses the existing server eligibility and pricing resolver at checkout.
No prices, payment policies, database records, or checkout endpoints are changed.

A fresh production catalog read at `2026-11-04T17:29:18.507Z` resolved 5A to
$2,649 and 10A to $2,849, with both sellable. These are observations, never code
constants. MSRP, expired raw sale amounts, and conditional bank-payment discounts
are not substituted for the current equipment Offer price. Accessories and IDS
services remain separately priced, optional choices.

## Availability and structured data

`isAvailable` establishes sellability, not physical stock. Normal pages display
"Available to order" and ask customers to confirm fulfillment timing. Their
Offers deliberately omit `availability`, which Google's merchant-listing
documentation lists as recommended, not required. An explicitly authorized
preorder may emit `PreOrder`. Do not add `InStock`, `OutOfStock`, `OnlineOnly`,
shipping promises, or return policies without supporting public operational data.
Missing public price, quote-only sales, or unavailable configurations suppress
both Product markup and the purchase panel. Transient catalog failures propagate
as errors; missing/unknown route identities return 404.

The variant SKU fields were null at verification. Pages display stable IDS
merchant product codes (`IDS-LYMOW-ONE-PLUS-5A` / `...-10A`), used as `sku` only
when no catalog SKU is provided. These are not manufacturer GTINs or MPNs.
There are no fabricated reviews/ratings or AggregateOffer/ProductGroup entities.
Google's documented variant axes do not clearly model charger amperage.

## Verification and rollout

Rendered-route tests cover exact price/schema agreement, canonical URLs, selected
purchase configuration, indexable discovery, missing/hidden prices, unavailable
equipment, catalog outages, escaping, and real server checkout-price resolution.
Sale-boundary tests use the existing public price resolver. Existing family-page
tests continue to prohibit Product/Offer markup on family URLs.

Run the suite in `America/Chicago`: an existing admin-pricing test interprets a
Central datetime-local value using the process timezone. In environments blocking
the tsx CLI's IPC socket, the equivalent runner is:

```sh
TZ=America/Chicago node --import tsx --test tests/*.test.ts tests/*.test.tsx lib/checkout/payment-methods.test.ts
```

Also run TypeScript, lint, and production build. Inspect deployed raw HTML,
canonicals, links, sitemap, and live price parity before reporting completion.
No real payment or customer order is needed for verification.

The existing Search Console validation must not be cancelled or restarted.
Google indexing and rich-result display remain separate from code correctness;
neither is guaranteed by passing local tests. Rich Results Test and URL Inspection
results must be reported only when actually observed.

References:
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- https://developers.google.com/search/docs/appearance/structured-data/product-variants

Verification on November 4, 2026: all 1,735 tests passed (including nine new
configuration-page tests), TypeScript passed, production build passed, and lint
reported zero errors with ten pre-existing image warnings. The raw live catalog
also resolved both new page projections as purchasable.

The original patch was prepared without publishing after the connected GitHub
integration rejected its tree write and local Git authentication was unavailable.
Release verification must be performed again against the actual deployment.
