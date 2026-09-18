import { NextResponse } from "next/server";
import { readInvoiceCatalogReferences } from "@/lib/custom-invoices/catalog";
import { readPaymentMethodSettings } from "@/lib/payment-method-settings/server";
import { allowedCustomInvoiceMethods } from "@/lib/custom-invoices/payment-policy";
import { invoiceApiError, requireInvoiceAdmin } from "@/lib/custom-invoices/http";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireInvoiceAdmin();
    const [items, settings] = await Promise.all([readInvoiceCatalogReferences(), readPaymentMethodSettings()]);
    return NextResponse.json({ items, paymentMethods: allowedCustomInvoiceMethods(settings) }, { headers: { "cache-control": "no-store" } });
  }
  catch (error) { return invoiceApiError(error); }
}
