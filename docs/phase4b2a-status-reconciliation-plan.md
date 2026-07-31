# Phase 4B2A controlled-order status reconciliation plan

This is a documentation-only plan. It contains no executable reconciliation SQL and authorizes no database or Stripe change.

## Scope and prerequisites

The only candidate is the completed Phase 4B2A controlled order identified by public reference `IDS-B843E8271C51`. Reconciliation must wait until the `checkout_apply_card_event_v2` migration is separately reviewed, applied, and verified. Before any write, a new read-only check must prove that exactly one order and exactly one linked payment attempt match the public reference; the order is still `confirmed` / `paid`, `paid_at` remains populated, the attempt is still `succeeded` with `completed_at` populated, and its diagnostic snapshot alone remains `open` / `unpaid`. Exactly one linked, processed `checkout.session.completed` receipt must exist with `livemode=false`; any other matching receipt state or count stops the procedure.

The operator must independently retrieve the original signed test-mode `checkout.session.completed` event or the corresponding test-mode Checkout Session from Stripe and verify that its IDs match the already-linked attempt without printing customer data or a complete payload. Its Session fields must be exactly `status=complete` and `payment_status=paid`. Any missing, duplicate, crossed, live-mode, or changed state stops the procedure.

## Separately reviewed correction

A future one-off change must be narrowly keyed by both the internal attempt ID and its existing Stripe Checkout Session ID, include predicates for the complete precondition snapshot above, and update only `stripe_session_status` to `complete`, `stripe_payment_status` to `paid`, and `updated_at`. It must not replay the webhook, call the v2 transition RPC, alter authoritative order or attempt status, change timestamps such as `paid_at` or `completed_at`, create a receipt, or modify customer, item, pricing, fulfillment, or Stripe data.

The statement and transaction must be prepared and approved separately. It must require exactly one affected attempt row and roll back otherwise. Post-write read-only verification must confirm the same order and attempt authority, unchanged item and amount data, the corrected diagnostic pair, and no changes to private-table row counts. Record the authorization and result without storing customer information or Stripe secrets.
