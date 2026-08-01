# Phase 4B2B ACH and wire foundation

This phase adds code and an unapplied additive migration for three canonical methods: `card`, `ach_debit`, and `wire_transfer`.

## Availability

Card behavior is unchanged. ACH and wire have dedicated endpoints and are disabled unless the server-only `ACH_CHECKOUT_ENABLED` or `WIRE_CHECKOUT_ENABLED` value is exactly `true`. No public component links to either endpoint.

## Pricing

`BANK_PAYMENT_DISCOUNT_BPS` is 275 and `BASIS_POINTS_DENOMINATOR` is 10000. Card receives no discount. ACH and wire receive `Math.round(subtotalCents * 275 / 10000)`. All fees, shipping, and tax remain zero in this phase. Catalog prices remain authoritative and unchanged.

## Stripe contracts

- Card: explicit `payment_method_types: ["card"]` through the existing builder.
- ACH: explicit `payment_method_types: ["us_bank_account"]` through Stripe Checkout.
- Wire: explicit `payment_method_types: ["customer_balance"]`, bank-transfer funding, US bank transfer, and an explicit Stripe Customer.

No builder enables automatic payment methods or combines methods. PaymentIntent metadata carries the order, attempt, and canonical method identifiers needed for webhook reconciliation. IDS does not receive or persist bank account or funding-instruction details.

## Reconciliation

The existing card v1/v2 RPC signatures remain unchanged. New ACH and wire RPCs use `SECURITY INVOKER`, fixed search paths, row locks, exact identity/amount/currency checks, legal monotonic transitions, and affected-row checks. Execution is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`.

ACH submission and processing never mark an order paid or release fulfillment. Wire instructions and partial funding likewise keep fulfillment `not_ready`. Only an authoritatively reconciled success moves an order to confirmed/paid with fulfillment pending.

The private wire review table records only operational exception amounts and references. It never stores bank coordinates or funding-instruction payloads.

## Deployment boundary

The migration file must not be applied, and the feature flags must not be enabled, without separate review and approval. Controlled Stripe and Supabase tests belong to a later phase.
