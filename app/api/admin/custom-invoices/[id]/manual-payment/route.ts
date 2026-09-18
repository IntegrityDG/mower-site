import { NextRequest, NextResponse } from "next/server";
import { assertCents, isUuid, text } from "@/lib/custom-invoices/domain";
import { InvoiceHttpError, invoiceApiError, operationKey, readInvoiceJson, requireInvoiceAdmin, requireSameOrigin } from "@/lib/custom-invoices/http";
import { readInvoice, recordManualPayment } from "@/lib/custom-invoices/repository";
import { cancelHostedPaymentRequests } from "@/lib/custom-invoices/stripe";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireInvoiceAdmin(); requireSameOrigin(request); const { id } = await params; if (!isUuid(id)) throw new InvoiceHttpError(404, "Invoice not found.");
    const body = await readInvoiceJson(request) as Record<string, unknown>; const amount = Number(body.amountCents); assertCents(amount, "Payment amount", false);
    const method = String(body.method ?? ""); if (!['cash','check','wire','other'].includes(method)) throw new InvoiceHttpError(400, "Payment method is invalid.");
    const receivedAt = String(body.receivedAt ?? ""); if (!Number.isFinite(Date.parse(receivedAt))) throw new InvoiceHttpError(400, "Payment date is invalid.");
    const key = operationKey(body.operationKey);
    const detail = await readInvoice(id);
    if (!detail) throw new InvoiceHttpError(404, "Invoice not found.");
    const invoice = detail.invoice;
    const balance = Number(invoice.total_cents) - Number(invoice.amount_paid_cents);
    if (!["finalized", "sent", "partially_paid"].includes(String(invoice.status)) || amount > balance) throw new InvoiceHttpError(400, "Invalid or excessive payment.");
    await cancelHostedPaymentRequests(id, `cancel:${key}`);
    const payment = await recordManualPayment({ invoiceId: id, amountCents: amount, method, reference: text(body.reference ?? "", 200, "Reference"), note: text(body.note ?? "", 1000, "Payment note"), receivedAt, operationKey: key });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) { return invoiceApiError(error); }
}
