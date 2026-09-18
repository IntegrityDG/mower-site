# IDS custom invoices

Custom invoices are an admin-only financial subsystem. The browser is an editor, not a calculation authority: money is submitted as requested integer cents, normalized by the server, recalculated in PostgreSQL, and frozen at finalization. Data lives in forced-RLS `checkout_private` tables. Browser roles have no grants; the server uses narrowly granted, fixed-search-path RPCs through the service role.

## Lifecycle

- A draft can hold customer snapshots, catalog-reference or arbitrary lines, manual sales tax, customer terms, fulfillment notes, and private IDS notes. Saves use optimistic `version` checks.
- Finalization atomically validates the customer, addresses, lines, special-availability acknowledgement, deposit terms, and totals; assigns a concurrency-safe `IDS-INV-YYYY-NNNNN` number; and freezes customer and financial content.
- Finalized/sent invoices are corrected by voiding an unpaid invoice and duplicating it to a new draft. Paid invoices cannot be voided or rewritten. `source_invoice_id` is the foundation for later quote/revision conversion.
- `overdue` is display-only when an open balance is past due.

## Prices and catalog snapshots

Catalog selection copies the identity, description, SKU, current public reference price, status, and purchase state. On every save, the server re-resolves that metadata from the authoritative catalog; only the negotiated unit price and quantity remain admin-editable. The finalized invoice price is independent and authoritative. Finalized invoices and PDFs never reread catalog pricing. No custom-invoice operation updates catalog, promotion, preorder, checkout, or payment-setting data.

## Payments and delivery

An internal invoice may use separate Stripe payment requests over its lifecycle for full payment, a deposit, and the remaining balance, but only one request can be active at a time. An atomic reservation derives each exact amount from the persisted invoice and prevents cumulative open requests or payments from exceeding the balance. Card and US-bank-account choices are narrowed by existing server switches. Custom invoices do not receive the public ACH discount; Hearth is intentionally outside V1.

Stripe Invoicing hosts the payment page. Stripe is not asked to email the customer: the existing IDS Resend sender is the single delivery authority. Delivery is claimed and completed idempotently, abandoned claims can be recovered after 15 minutes, and retries reuse both the payment request and the provider email idempotency key. Metadata contains only the invoice ID, payment-request ID, and invoice number.

The existing signed Stripe webhook validates mode before dispatch. Custom-invoice reconciliation also verifies the linked Stripe Invoice ID, metadata, USD currency, and exact reserved cents, then records an immutable payment and event through one database transaction. Cash, check, wire, and other offline payments use a separate atomic operation-key-protected ledger path. Before an offline payment is recorded, every outstanding hosted Stripe Invoice is voided and its database reservation is canceled; the database also rejects manual amounts that overlap an active reservation. A generic “mark paid” action does not exist.

Refund initiation and a manual-refund UI are deferred in V1. Stripe `charge.refunded` evidence is nevertheless reconciled into an immutable refund ledger and reduces recorded paid value, so a refunded invoice cannot remain displayed as fully paid.

## PDF and privacy

The admin-authenticated PDF route renders `pdf-lib` output only from the finalized database snapshot. It contains invoice/customer addresses, line math, totals, paid/balance amounts, customer terms, and fulfillment notes. It excludes internal notes, database UUIDs, catalog internal costs, Stripe IDs, and API metadata. There is no public IDS invoice endpoint; customers use the unguessable Stripe Hosted Invoice URL.

Use **Admin → Custom Invoices** to create/search invoices, add catalog or custom lines, finalize, download the PDF, send a full/deposit/balance request, record manual payment, void an unpaid invoice, or duplicate historical content into a new draft.
