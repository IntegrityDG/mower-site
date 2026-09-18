import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/custom-invoices/domain";
import { deliverCustomInvoice } from "@/lib/custom-invoices/email";
import { InvoiceHttpError, invoiceApiError, operationKey, readInvoiceJson, requireInvoiceAdmin, requireSameOrigin } from "@/lib/custom-invoices/http";
import { createHostedPaymentRequest } from "@/lib/custom-invoices/stripe";

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireInvoiceAdmin(); requireSameOrigin(request); const { id } = await params; if (!isUuid(id)) throw new InvoiceHttpError(404, "Invoice not found.");
    const body = await readInvoiceJson(request) as Record<string, unknown>; const key = operationKey(body.operationKey);
    const hosted = await createHostedPaymentRequest({ invoiceId: id, kind: String(body.kind ?? ""), requestedMethods: body.paymentMethods, operationKey: key });
    const delivered = await deliverCustomInvoice(hosted.detail, String(hosted.request.id), key);
    return NextResponse.json({ paymentRequest: delivered });
  } catch (error) { return invoiceApiError(error); }
}
