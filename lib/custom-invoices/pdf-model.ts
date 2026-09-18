type Detail = { invoice: Record<string, unknown>; items: Record<string, unknown>[] };

function addressLines(value: unknown) {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return [row.line1, row.line2, [row.city, row.state].filter(Boolean).join(", ") + (row.postalCode ? ` ${row.postalCode}` : "")].filter(Boolean).map(String);
}

export function customInvoicePdfModel(detail: Detail) {
  const invoice = detail.invoice;
  if (invoice.status === "draft" || !invoice.invoice_number || !invoice.finalized_at) throw new Error("Only finalized invoices can be rendered.");
  return {
    invoiceNumber: String(invoice.invoice_number), issueDate: String(invoice.finalized_at).slice(0, 10), dueDate: String(invoice.due_date),
    customer: [invoice.customer_name, invoice.company_name].filter(Boolean).map(String), billing: addressLines(invoice.billing_address), shipping: addressLines(invoice.shipping_address),
    items: detail.items.map((item) => ({ description: String(item.description), secondaryDescription: item.secondary_description ? String(item.secondary_description) : "", quantity: Number(item.quantity), unitPriceCents: Number(item.unit_price_cents), lineAmountCents: Number(item.line_amount_cents), lineType: String(item.line_type) })),
    subtotalCents: Number(invoice.subtotal_cents), discountCents: Number(invoice.discount_cents), creditCents: Number(invoice.credit_cents), feeCents: Number(invoice.fee_cents), taxCents: Number(invoice.tax_cents), totalCents: Number(invoice.total_cents), paidCents: Number(invoice.amount_paid_cents), balanceCents: Number(invoice.total_cents) - Number(invoice.amount_paid_cents),
    customerNotes: String(invoice.customer_notes ?? ""), fulfillmentNotes: String(invoice.fulfillment_notes ?? ""), status: String(invoice.status).replaceAll("_", " ").toUpperCase(),
  };
}
