import { SALES_SPECIALS_SLOTS } from "@/lib/promotions/config";
import { readSalesSpecialsSlots } from "@/lib/promotions/server";

export async function GET() {
  try {
    const slots = await readSalesSpecialsSlots();
    const promotions = slots
      ? SALES_SPECIALS_SLOTS.map((slot) => slots[slot]).filter((promotion) => promotion.enabled)
      : [];
    return Response.json({ promotions });
  } catch {
    return Response.json({ promotions: [] });
  }
}
