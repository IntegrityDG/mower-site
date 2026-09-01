import { linkDemoPartyReferral } from "@/lib/demo-party/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { isSchedulingId } from "@/lib/scheduling/validation";

export async function POST(request: Request, context: { params: Promise<{ guestId: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { guestId } = await context.params;
  if (!isSchedulingId(guestId)) return Response.json({ error: "Invalid guest." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const orderReference = typeof body?.orderReference === "string" ? body.orderReference.trim() : "";
  if (!/^[A-Za-z0-9-]{4,80}$/.test(orderReference)) return Response.json({ error: "Enter a valid IDS order reference." }, { status: 400 });
  try { return Response.json({ referralId: await linkDemoPartyReferral(guestId, orderReference) }, { status: 201 }); }
  catch (error) { const code=String((error as{message?:string})?.message??""); return Response.json({ error: /outside_direct_purchase_window/i.test(code) ? "The paid order is outside the direct 14-day Demo Party purchase window." : /guest_outside_qualifying_cap/i.test(code) ? "A Demo Party supports no more than five IDS-verified direct-purchase referral opportunities." : /referral_guest_order_mismatch/i.test(code) ? "The paid order customer email must match the qualifying guest email." : /accessory/i.test(code) ? "Accessory-only orders do not qualify for the existing referral program." : "The guest and paid order could not be linked." }, { status: 409 }); }
}
