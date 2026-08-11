import { NextResponse } from "next/server";
import { paymentMethodIsServerEnabled } from "@/lib/checkout/payment-method-availability";
import { readPaymentMethodSettingsFailSafe } from "@/lib/payment-method-settings/server";
import { toPublicPaymentMethodAvailability } from "@/lib/payment-method-settings/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readPaymentMethodSettingsFailSafe();
  return NextResponse.json(toPublicPaymentMethodAvailability(settings, paymentMethodIsServerEnabled("ach_debit")), { headers:{ "Cache-Control":"no-store" } });
}
