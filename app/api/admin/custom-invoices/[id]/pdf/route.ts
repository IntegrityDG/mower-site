import { NextResponse } from "next/server";
import { isUuid } from "@/lib/custom-invoices/domain";
import { InvoiceHttpError, invoiceApiError, requireInvoiceAdmin } from "@/lib/custom-invoices/http";
import { renderCustomInvoicePdf } from "@/lib/custom-invoices/pdf";
import { readInvoice } from "@/lib/custom-invoices/repository";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireInvoiceAdmin(); const { id } = await params; if (!isUuid(id)) throw new InvoiceHttpError(404, "Invoice not found.");
    const detail = await readInvoice(id); if (!detail) throw new InvoiceHttpError(404, "Invoice not found.");
    const bytes = await renderCustomInvoicePdf(detail); const name = String(detail.invoice.invoice_number).replace(/[^A-Za-z0-9-]/g, "-");
    return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"`, "cache-control": "private, no-store" } });
  } catch (error) { return invoiceApiError(error); }
}
