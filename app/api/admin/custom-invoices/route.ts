import { NextRequest, NextResponse } from "next/server";
import { normalizeDraft } from "@/lib/custom-invoices/domain";
import { snapshotInvoiceCatalog } from "@/lib/custom-invoices/catalog";
import { invoiceApiError, operationKey, readInvoiceJson, requireInvoiceAdmin, requireSameOrigin } from "@/lib/custom-invoices/http";
import { listInvoices, saveDraft } from "@/lib/custom-invoices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInvoiceAdmin();
    const search = request.nextUrl.searchParams.get("search") ?? "";
    const status = request.nextUrl.searchParams.get("status") ?? "all";
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1) || 1);
    return NextResponse.json(await listInvoices(search, status, page), { headers: { "cache-control": "no-store" } });
  } catch (error) { return invoiceApiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireInvoiceAdmin(); requireSameOrigin(request);
    const body = await readInvoiceJson(request) as Record<string, unknown>;
    const draft = await snapshotInvoiceCatalog(normalizeDraft(body.invoice));
    const invoice = await saveDraft(null, 0, draft, operationKey(body.operationKey));
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) { return invoiceApiError(error); }
}
