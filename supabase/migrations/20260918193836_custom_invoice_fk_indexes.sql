begin;

create index custom_invoices_source_invoice_idx
  on checkout_private.custom_invoices (source_invoice_id)
  where source_invoice_id is not null;

create index custom_invoice_payments_request_invoice_idx
  on checkout_private.custom_invoice_payments (payment_request_id, invoice_id)
  where payment_request_id is not null;

create index custom_invoice_refunds_payment_invoice_idx
  on checkout_private.custom_invoice_refunds (payment_id, invoice_id);

commit;
