import { NextRequest, NextResponse } from "next/server";
import { isUuid, normalizeDraft, text } from "@/lib/custom-invoices/domain";
import { snapshotInvoiceCatalog } from "@/lib/custom-invoices/catalog";
import { InvoiceHttpError, invoiceApiError, operationKey, readInvoiceJson, requireInvoiceAdmin, requireSameOrigin } from "@/lib/custom-invoices/http";
import { deleteDraft, duplicateInvoice, finalizeInvoice, readInvoice, saveDraft, voidInvoice } from "@/lib/custom-invoices/repository";
import { cancelHostedPaymentRequests } from "@/lib/custom-invoices/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function idFrom(context: Context) { const { id } = await context.params; if (!isUuid(id)) throw new InvoiceHttpError(404, "Invoice not found."); return id; }

export async function GET(_request: NextRequest, context: Context) {
  try { await requireInvoiceAdmin(); const result = await readInvoice(await idFrom(context)); if (!result) throw new InvoiceHttpError(404, "Invoice not found."); return NextResponse.json(result, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return invoiceApiError(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await requireInvoiceAdmin(); requireSameOrigin(request); const id = await idFrom(context);
    const body = await readInvoiceJson(request) as Record<string, unknown>; const key = operationKey(body.operationKey);
    if (body.action === "save") return NextResponse.json({ invoice: await saveDraft(id, Number(body.expectedVersion), await snapshotInvoiceCatalog(normalizeDraft(body.invoice)), key) });
    if (body.action === "finalize") return NextResponse.json({ invoice: await finalizeInvoice(id, Number(body.expectedVersion), key) });
    if (body.action === "void") {
      const reason = text(body.reason ?? "", 1000, "Void reason", true);
      const detail = await readInvoice(id);
      if (!detail) throw new InvoiceHttpError(404, "Invoice not found.");
      if (!["finalized", "sent"].includes(String(detail.invoice.status)) || Number(detail.invoice.amount_paid_cents) !== 0) throw new InvoiceHttpError(400, "Only an unpaid invoice may be voided.");
      await cancelHostedPaymentRequests(id, `cancel:${key}`);
      return NextResponse.json({ invoice: await voidInvoice(id, reason, key) });
    }
    if (body.action === "duplicate") return NextResponse.json({ invoiceId: await duplicateInvoice(id, key) }, { status: 201 });
    throw new InvoiceHttpError(400, "Unsupported invoice action.");
  } catch (error) { return invoiceApiError(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  try { await requireInvoiceAdmin(); requireSameOrigin(request); const id = await idFrom(context); const body = await readInvoiceJson(request) as Record<string, unknown>; await deleteDraft(id, Number(body.expectedVersion), operationKey(body.operationKey)); return new NextResponse(null, { status: 204 }); }
  catch (error) { return invoiceApiError(error); }
}
