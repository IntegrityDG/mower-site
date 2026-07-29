# Stripe checkout foundation (Phase 4B1)

## Phase 4B2A — private card Checkout backend (test mode)

Phase 4B2A adds an unconnected server-side Stripe-hosted Checkout foundation for cards only. The public Lymow/Yarbo purchase and quote-request experiences are unchanged, so no real or test payment can yet be initiated from the site UI. ACH, wire transfer, discount-price presentation, fees, shipping, tax, services, and Phase 4B3 public-flow wiring remain deferred.

Checkout creates a new Stripe Customer for each new or unverified purchaser (`customer_creation: always`); typed email never authorizes reuse or merging. Stripe may offer customer-controlled payment-method saving, but IDS does not request automatic saving and stores no payment-instrument data. The centralized `PAYMENT_SECURITY_NOTICE` is passed verbatim as Checkout submit custom text.

Runtime configuration is lazy and requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL`, and `CHECKOUT_SIGNING_SECRET`. Only `sk_test_` secret keys are accepted. Non-local base URLs require HTTPS, and localhost HTTP is development-only. No publishable key or Stripe.js dependency is required.

The signed webhook endpoint records only safe event metadata and handles card Checkout completion/expiration, refunds, and disputes idempotently. Live-mode events are rejected; asynchronous payment events are recorded as ignored until ACH is separately approved. Success is a read-only server-rendered verification page and never changes payment state; cancel state is short-lived, signed, and restricted to local equipment routes.

Because `checkout_private` must not be exposed through the Data API, `supabase/migrations/20260729010607_add_private_checkout_runtime_functions.sql` adds narrowly scoped service-role-only RPCs for atomic draft creation, linkage, event receipt, lookup, and guarded state transitions. The migration was successfully applied and metadata-verified on production project `zyualbcbjchuhajyrpvw`; Supabase recorded version `20260729010607` with migration name `add_private_checkout_runtime_functions`. Its SQL-content SHA-256 is `2d4692c69754a9fbdf353b4503f7076b3bbac8dbfe1fc98b722f61ea4b788962`. All six service-role-only RPC functions are live, RLS and FORCE RLS remain enabled on all five private checkout tables, and no browser policies or grants were added.

No Stripe secrets are configured yet, and no Stripe objects, Checkout Sessions, or payments have been created. Public purchase behavior remains unchanged, and database-backed plus Stripe test-mode integration testing remains pending. The three legacy `20260715` migration-history discrepancies remain separate technical debt; they were neither applied nor repaired as part of the runtime migration.

The local `validate:stripe-card-checkout` command contains pure request, Session-parameter, signed-state, Stripe-signature, reconciliation, and transition-guard tests plus static migration privilege and safety assertions. It does not claim to exercise PostgreSQL transactions, concurrent webhook claims, PostgREST RPC permissions, or applied RLS behavior. Those require a separately approved migration application followed by database-backed test-mode integration testing.

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

The Phase 4B2A server routes are intentionally not connected to public purchase controls. The runtime migration is applied, but test-mode environment configuration must be completed before controlled integration testing; transactional notifications remain deferred.

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
