"use client";

import { useEffect, useState } from "react";

type Row = Record<string, unknown>;
type Detail = { appointment?: Row | null; party: Row | null; payment: Row | null; guests: Row[]; benefits: Row[]; redemptions?: Row[]; auditEvents: Row[] };
const money = (value: unknown) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0) / 100);
const paymentLabels: Record<string, string> = { not_started: "Not started", creating: "Opening checkout", checkout_open: "Payment link open", paid: "Confirmed — Paid", partially_refunded: "Partially refunded", refunded: "Refunded" };
const qualificationLabels: Record<string, string> = { pending: "Pending IDS verification", qualifying: "Verified qualifying", not_qualifying: "Not qualifying" };

export default function AdminAppointmentOperations({ appointmentId, isParty }: { appointmentId: string; isParty: boolean }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch(`/api/admin/services-scheduling/appointments/${appointmentId}`, { cache: "no-store" });
    if (response.ok) setDetail(await response.json());
  }
  async function loadAndNotify() {
    await load();
    window.dispatchEvent(new CustomEvent("ids:appointment-detail-updated", { detail: { appointmentId } }));
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/services-scheduling/appointments/${appointmentId}`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as Detail : null)
      .then((value) => { if (active && value) setDetail(value); });
    return () => { active = false; };
  }, [appointmentId]);

  async function attendance(guestId: string, action: string, consent?: boolean) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/services-scheduling/guests/${guestId}/attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, consent: consent ?? null }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Attendance updated and benefits recalculated." : body.error ?? "Attendance update failed.");
    if (response.ok) await loadAndNotify();
    setBusy(false);
  }
  async function toggleLock() {
    if (!detail?.party) return;
    const locked = !Boolean(detail.party.guest_list_locked);
    const reason = locked ? window.prompt("Reason for locking this guest list:")?.trim() : null;
    if (locked && !reason) return;
    setBusy(true);
    const response = await fetch(`/api/admin/services-scheduling/appointments/${appointmentId}/guest-list-lock`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ locked, reason }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Guest list ${locked ? "locked" : "unlocked"}.` : body.error ?? "Guest-list change failed.");
    if (response.ok) await loadAndNotify();
    setBusy(false);
  }
  async function refund() {
    const confirmation = window.prompt("Type REFUND EARNED DEMO FEE to issue only the verified earned amount:");
    if (!confirmation) return;
    setBusy(true);
    const response = await fetch(`/api/admin/services-scheduling/appointments/${appointmentId}/refund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Verified Demo Party fee refund reconciled." : body.error ?? "Refund failed.");
    if (response.ok) await loadAndNotify();
    setBusy(false);
  }

  if (!detail) return <p className="mt-5 text-sm text-slate-500">Loading payment and party operations…</p>;
  const feeBenefit = detail.benefits.find((row) => row.benefit_type === "demo_fee_refund");
  const baseBenefit = detail.benefits.find((row) => row.benefit_type === "base_machine_discount");
  const redemptions = detail.redemptions ?? [];
  const paymentStatus = String(detail.payment?.status ?? "not_started");
  const attendanceAvailable = detail.appointment?.status === "approved" && ["paid", "partially_refunded", "refunded"].includes(paymentStatus);
  return <section className="mt-6 border-t border-slate-200 pt-6">
    <h3 className="text-lg font-black">Payment &amp; operations</h3>
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">Payment</dt><dd className="mt-1 font-black">{paymentLabels[paymentStatus] ?? "Needs review"} · {money(detail.payment?.paid_cents)}</dd></div>
      <div className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">Refunded</dt><dd className="mt-1 font-black">{money(detail.payment?.refunded_cents)}</dd></div>
      <div className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">Stripe Checkout</dt><dd className="mt-1 break-all font-mono text-xs">{String(detail.payment?.stripe_checkout_session_id ?? "Not created")}</dd></div>
      <div className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">Stripe PaymentIntent</dt><dd className="mt-1 break-all font-mono text-xs">{String(detail.payment?.stripe_payment_intent_id ?? "Not paid")}</dd></div>
    </dl>
    {isParty && detail.party && <>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-xl bg-emerald-50 p-3"><p className="font-bold text-emerald-800">Machine discount</p><p className="mt-1 font-black">{money(baseBenefit?.earned_cents)} earned · {money(baseBenefit?.consumed_cents)} consumed</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="font-bold text-emerald-800">Available now</p><p className="mt-1 font-black">{money(Number(baseBenefit?.earned_cents ?? 0) - Number(baseBenefit?.consumed_cents ?? 0))} machine discount</p></div></div>
      <div className="mt-5"><h4 className="font-black">Benefit redemption state</h4>{redemptions.length === 0 ? <p className="mt-2 text-sm text-slate-600">No order benefit has been reserved.</p> : <ul className="mt-3 space-y-2">{redemptions.map((redemption) => <li key={String(redemption.id)} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-black">{String(redemption.benefit_type).replaceAll("_", " ")} · {money(redemption.amount_cents)} · {String(redemption.state)}</p><p className="mt-1 break-all font-mono text-xs">Order {String(redemption.order_id)} · Attempt {String(redemption.checkout_attempt_id ?? "not linked")}</p><p className="mt-1 break-all font-mono text-xs">Stripe Checkout {String(redemption.stripe_checkout_session_id ?? "not created")}</p></li>)}</ul>}</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><h4 className="font-black">Registered guests ({detail.guests.length}/5) · benefits capped at 5 qualifying</h4><button disabled={busy} onClick={() => void toggleLock()} className="min-h-11 rounded-xl border px-4 font-bold">{detail.party.guest_list_locked ? "Unlock list" : "Lock list"}</button></div>
      {!attendanceAvailable && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">Attendance actions are available only while this Demo Party is approved and paid.</p>}<fieldset disabled={!attendanceAvailable} className="disabled:opacity-60"><div className="mt-3 space-y-3">{detail.guests.map((guest) => {
        const status = String(guest.qualification_status);
        const partyStart = detail.appointment?.requested_start_at ? new Date(String(detail.appointment.requested_start_at)) : null;
        const purchaseWindowEnd = partyStart ? new Date(partyStart.getTime() + 14 * 24 * 60 * 60 * 1000) : null;
        const checkedIn = guest.checked_in_at ? new Date(String(guest.checked_in_at)) : null;
        const checkedOut = guest.checked_out_at ? new Date(String(guest.checked_out_at)) : null;
        const earliestQualification = checkedIn ? new Date(checkedIn.getTime() + 60 * 60 * 1000) : null;
        const checkedOutEarly = Boolean(checkedIn && checkedOut && checkedOut.getTime() < earliestQualification!.getTime());
        return <article key={String(guest.id)} className="rounded-xl border p-4"><p className="font-black">{String(guest.full_name)}</p><p className="mt-1 text-sm text-slate-600">{String(guest.email)} · {String(guest.phone)}</p><p className="mt-1 text-xs text-slate-500">Registered: {guest.registered_at ? new Date(String(guest.registered_at)).toLocaleString() : "Unknown"} · Referral ID: <span className="font-mono">{String(guest.referral_identifier)}</span></p><p className="mt-1 text-xs text-slate-500">Direct purchase window: {partyStart ? partyStart.toLocaleDateString() : "Unknown"} through {purchaseWindowEnd ? purchaseWindowEnd.toLocaleDateString() : "Unknown"}</p><p className="mt-1 text-xs font-bold uppercase text-slate-500">{qualificationLabels[status] ?? "Needs review"} · In: {checkedIn ? checkedIn.toLocaleString() : "—"} · Out: {checkedOut ? checkedOut.toLocaleString() : "—"}</p><p className="mt-1 text-xs text-slate-500">Earliest IDS qualification: {earliestQualification ? earliestQualification.toLocaleString() : "Check-in required"}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || Boolean(checkedIn)} onClick={() => void attendance(String(guest.id), "check_in")} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">Check in</button><button disabled={busy || !checkedIn || Boolean(checkedOut)} onClick={() => void attendance(String(guest.id), "check_out")} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">Check out</button><button disabled={busy || status === "qualifying" || !checkedIn || checkedOutEarly} onClick={() => void attendance(String(guest.id), "qualify")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Verify qualifying</button><button disabled={busy} onClick={() => void attendance(String(guest.id), "not_qualifying")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Not qualifying</button><button disabled={busy} onClick={() => void attendance(String(guest.id), "consent", !guest.follow_up_consent)} className="rounded-lg border px-3 py-2 text-sm font-bold">Follow-up consent: {guest.follow_up_consent ? "Yes" : "No"}</button></div></article>;
      })}</div></fieldset>
      <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-black">Refund entitlement: {money(feeBenefit?.earned_cents)}</p><p className="mt-1">Consumed: {money(feeBenefit?.consumed_cents)}. Qualification never auto-refunds; use the explicit action below after review.</p><button disabled={busy || !detail.payment || Number(feeBenefit?.earned_cents ?? 0) <= Number(detail.payment.refunded_cents ?? 0)} onClick={() => void refund()} className="mt-3 min-h-11 rounded-xl bg-slate-950 px-4 font-black text-white disabled:opacity-40">Refund verified earned amount</button></div>
    </>}
    {message && <p role="status" className="mt-4 rounded-xl bg-slate-100 p-3 font-bold">{message}</p>}
    <details className="mt-5"><summary className="cursor-pointer font-black">Audit history ({detail.auditEvents.length})</summary><ul className="mt-3 space-y-2 text-xs">{detail.auditEvents.map((event, index) => <li key={`${String(event.created_at)}-${index}`} className="rounded bg-slate-50 p-2">{new Date(String(event.created_at)).toLocaleString()} · {String(event.actor_type).replaceAll("_", " ")} · {String(event.event_type).replaceAll("_", " ")}</li>)}</ul></details>
  </section>;
}
