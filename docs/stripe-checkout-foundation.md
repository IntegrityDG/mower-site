# Stripe checkout foundation (Phase 4B1)

Phase 4B1 adds an applied private checkout migration, a lazy server-only Stripe client, strict request parsing, database-backed eligibility rules, an authoritative pricing resolver, repository contracts, status-transition guards, and local validation fixtures. It does not add an API route or change the public quote/request flow.

## Architecture

Future browser requests may submit UUIDs, quantities, contact information, and a structured US shipping address only. The server reloads catalog rows from Supabase, applies centralized sales-mode and brand/product ownership checks, resolves current integer-cent prices, and creates a customer-safe immutable snapshot. Browser prices, totals, names, status, services, Hearth data, and Stripe object IDs are rejected.

The migration was applied successfully to production Supabase project `zyualbcbjchuhajyrpvw` and metadata-verified. Supabase recorded version `20260727034240` with migration name `create_private_checkout_foundation`; the matching local file is `supabase/migrations/20260727034240_create_private_checkout_foundation.sql`. The `checkout_private` schema contains the five reviewed private tables and six reviewed indexes. All five tables enable and force RLS, have no browser policies, and revoke access from `PUBLIC`, `anon`, and `authenticated`. The service role receives table-specific `SELECT`, `INSERT`, and `UPDATE` only; it receives no deletion or sequence privileges.

Orders reference private customer profiles with preservation-first foreign keys. Order items use a composite `(order_id, parent_order_item_id)` foreign key, so a package component cannot reference an item from another order. Abandoned-draft cleanup requires a separately reviewed internal archival or deletion workflow.

## Catalog rules

- Lymow permits exactly the active 5A or 10A variant. Its single matching defining charger is included and never charged separately. The current catalog and customer flow expose no Lymow package records, so any submitted Lymow package identifier is rejected rather than ignored.
- Yarbo complete systems charge one package price and snapshot included components at zero. Core and components cannot be resubmitted.
- Yarbo individual equipment may include Core, modules, or both. Module-only snapshots preserve the Core-required warning. Standard Mower and Mower PRO may coexist. Snow Plow Blade and Tow Hitch are rejected. Blower customer wording is normalized to `Blower Module`.
- Pandag, quote-only products, inactive/hidden records, cross-product substitutions, services, and unknown records are rejected.

## Deferred work

No Stripe objects or live payment routes exist yet. Phase 4B2 must implement order writes, card-only Checkout Session creation, raw-body signed webhooks, idempotency, safe success/cancel pages, and transactional notifications before any payment can be collected.

Shipping, tax, card fees, ACH discounts, ACH enablement, wire payment, inventory, services, and Hearth-in-Stripe are not implemented. Phase 4B1 freezes discount, fee, shipping, and tax amounts at zero. No payments are enabled.

Future server environments will require `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a trusted application base URL. No publishable Stripe key is required for a hosted URL redirect flow.

## Stripe customer profiles and payment security

The centralized customer-facing notice is exported as `PAYMENT_SECURITY_NOTICE` from `lib/checkout/payment-security-policy.ts`. Phase 4B2 must pass that constant without duplicating or paraphrasing it:

```ts
custom_text: {
  submit: {
    message: PAYMENT_SECURITY_NOTICE,
  },
}
```

For a new or unverified customer, Phase 4B2 must use `customer_creation: "always"`. A verified returning customer may reuse a stored Stripe Customer ID only after verified authentication or verified email access through a future login, email OTP, or signed magic link. A typed email is only a possible-duplicate signal and never authorizes reuse. Automatic merging by email is prohibited; unresolved duplicates remain separate until verified or manually reviewed.

Checkout may let the customer optionally save a payment method through `saved_payment_method_options: { payment_method_save: "enabled" }`. Saving remains customer-controlled, and Stripe stores the voluntarily saved method. Phase 4B2 must not automatically set `payment_intent_data.setup_future_usage` without separate approval. Stripe Link may remain available as a separate Stripe-controlled option.

IDS stores private customer contact/address information, internal and Stripe Customer IDs, order history, purchased equipment, amounts, statuses, refund/dispute status, and required Session/PaymentIntent references. IDS does not store payment-instrument details or complete Stripe webhook payloads; the prohibited-field list is centralized beside the notice.
