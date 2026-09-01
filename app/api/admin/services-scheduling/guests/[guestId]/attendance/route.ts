import { adminUpdateGuestAttendance } from "@/lib/demo-party/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { isSchedulingId } from "@/lib/scheduling/validation";

const actions = new Set(["check_in", "check_out", "qualify", "not_qualifying", "consent"]);
export async function POST(request: Request, context: { params: Promise<{ guestId: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { guestId } = await context.params;
  if (!isSchedulingId(guestId)) return Response.json({ error: "Invalid guest." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  const consent = typeof body?.consent === "boolean" ? body.consent : null;
  if (!actions.has(action) || (action === "consent" && consent === null)) return Response.json({ error: "Invalid attendance action." }, { status: 400 });
  try { return Response.json(await adminUpdateGuestAttendance(guestId, action, note, consent)); }
  catch (error) {
    const code=String((error as{message?:string})?.message??"");
    const message = /guest_check_in_not_open/i.test(code)
      ? "Guest check-in opens at Hour 3, two hours after the host appointment begins."
      : /guest_check_in_too_late/i.test(code)
        ? "There is less than one hour left in the four-hour demo, so this guest cannot begin a qualifying attendance period."
      : /one_hour_requirement/i.test(code)
        ? "A guest must have at least one verified hour before qualification."
        : /consumed_benefit_conflict/i.test(code)
          ? "This change would reduce earned value below an existing refund or reserved/redeemed order benefit. Review the linked ledger activity before making a protected correction."
        : /guest_has_linked_referral/i.test(code)
          ? "This guest has a linked Demo Party referral. Review that referral before changing the guest to not qualifying."
        : /attendance_unavailable/i.test(code)
          ? "Attendance can be recorded only for an approved, paid Demo Party appointment."
        : "Attendance could not be updated.";
    return Response.json({ error: message }, { status: 409 });
  }
}
