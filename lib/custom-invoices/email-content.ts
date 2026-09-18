import { SITE_CONTACT } from "@/lib/site-contact";
import { formatUsd } from "./domain";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function customInvoiceEmailContent(detail: { invoice: Record<string, unknown>; items: Record<string, unknown>[] }, request: Record<string, unknown>) {
  const invoice = detail.invoice;
  const invoiceNumber = String(invoice.invoice_number);
  const total = Number(invoice.total_cents);
  const dueNow = Number(request.amount_cents);
  const paid = Number(invoice.amount_paid_cents);
  const remainingAfter = Math.max(0, total - paid - dueNow);
  const dueDate = String(invoice.due_date);
  const summary = detail.items.slice(0, 3).map((item) => String(item.description)).join(", ");
  const isDeposit = request.request_kind === "deposit";
  const text = [
    "Integrity Distribution Systems", `Invoice ${invoiceNumber}`, "", `Amount Due Now: ${formatUsd(dueNow)}`, `Total Invoice: ${formatUsd(total)}`,
    ...(isDeposit ? [`Remaining Balance After Deposit: ${formatUsd(remainingAfter)}`] : []), `Due Date: ${dueDate}`, summary ? `Invoice for: ${summary}` : "", "", "Secure payment link:", String(request.hosted_invoice_url), "", `Questions? ${SITE_CONTACT.email.display}`,
  ].filter(Boolean).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55"><p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#047857;font-weight:700">Integrity Distribution Systems</p><h1 style="font-size:28px">Invoice ${escapeHtml(invoiceNumber)}</h1><p><strong>Amount Due Now:</strong> ${escapeHtml(formatUsd(dueNow))}<br><strong>Total Invoice:</strong> ${escapeHtml(formatUsd(total))}${isDeposit ? `<br><strong>Remaining Balance After Deposit:</strong> ${escapeHtml(formatUsd(remainingAfter))}` : ""}<br><strong>Due Date:</strong> ${escapeHtml(dueDate)}</p>${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<p><a href="${escapeHtml(String(request.hosted_invoice_url))}" style="display:inline-block;background:#047857;color:white;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:700">Pay securely</a></p><p>Questions? <a href="mailto:${escapeHtml(SITE_CONTACT.email.display)}">${escapeHtml(SITE_CONTACT.email.display)}</a></p></div>`;
  return { subject: `IDS Invoice ${invoiceNumber} - ${formatUsd(dueNow)} due`, text, html };
}
