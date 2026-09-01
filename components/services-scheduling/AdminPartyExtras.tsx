"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

type Guest = { id: string; full_name: string; qualification_status: string };
type Party = { food_support_status?: string; food_notes?: string | null; food_budget_cents?: number | null; property_relationship?: string; property_type?: string; mowable_acreage?: number; purchase_timeframe?: string; equipment_budget?: string; actively_considering_purchase?: boolean; decision_maker?: boolean; property_authorization_certified?: boolean; guest_arrival_offset_minutes?: number };
type Referral = { id: string; demo_party_guest_id: string; status: string; purchase_date: string; return_period_ends_at: string; base_reward_cents: number; product_name_snapshot: string };
type Detail = { appointment?: { requested_start_at?: string; status?: string; payment_status?: string } | null; party: Party | null; guests: Guest[]; referrals?: Referral[] };
const label = (value: unknown) => String(value ?? "Not recorded").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function AdminPartyExtras({ appointmentId }: { appointmentId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/services-scheduling/appointments/${appointmentId}`, { cache: "no-store" });
    if (response.ok) setDetail(await response.json() as Detail);
  }, [appointmentId]);
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/services-scheduling/appointments/${appointmentId}`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as Detail : null)
      .then((data) => { if (active && data) setDetail(data); });
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ appointmentId?: string }>).detail?.appointmentId === appointmentId) void load();
    };
    window.addEventListener("ids:appointment-detail-updated", refresh);
    return () => { active = false; window.removeEventListener("ids:appointment-detail-updated", refresh); };
  }, [appointmentId, load]);
  async function saveFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dollars = String(form.get("budgetDollars") ?? "").trim();
    const response = await fetch(`/api/admin/services-scheduling/appointments/${appointmentId}/food-support`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: form.get("status"), notes: form.get("notes"), budgetCents: dollars ? Math.round(Number(dollars) * 100) : null }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Food support plan saved." : body.error ?? "Food support failed.");
    if (response.ok) await load();
  }
  async function linkReferral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const guestId = String(form.get("guestId") ?? "");
    const response = await fetch(`/api/admin/services-scheduling/guests/${guestId}/referral`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderReference: form.get("orderReference") }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Direct guest purchase linked to the existing referral ledger." : body.error ?? "Referral link failed.");
    if (response.ok) await load();
  }
  if (!detail?.party) return null;
  const referralAvailable = detail.appointment?.status === "approved" && ["paid", "partially_refunded", "refunded"].includes(detail.appointment.payment_status ?? "");
  const qualifying = referralAvailable ? detail.guests.filter((guest) => guest.qualification_status === "qualifying") : [];
  const arrival = detail.appointment?.requested_start_at ? new Date(Date.parse(detail.appointment.requested_start_at) + Number(detail.party.guest_arrival_offset_minutes ?? 120) * 60_000) : null;
  return <section className="mt-8 grid gap-6 lg:grid-cols-2">
    <article className="rounded-[2rem] bg-white p-6 shadow-sm lg:col-span-2"><h2 className="text-xl font-black">Host screening &amp; party timing</h2><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="font-bold text-slate-500">Property relationship</dt><dd className="mt-1 font-black">{label(detail.party.property_relationship)}</dd></div><div><dt className="font-bold text-slate-500">Property type</dt><dd className="mt-1 font-black">{label(detail.party.property_type)}</dd></div><div><dt className="font-bold text-slate-500">Mowable acreage</dt><dd className="mt-1 font-black">{detail.party.mowable_acreage ?? "Not recorded"}</dd></div><div><dt className="font-bold text-slate-500">Purchase timeframe</dt><dd className="mt-1 font-black">{label(detail.party.purchase_timeframe)}</dd></div><div><dt className="font-bold text-slate-500">Equipment budget</dt><dd className="mt-1 font-black">{label(detail.party.equipment_budget)}</dd></div><div><dt className="font-bold text-slate-500">Actively considering</dt><dd className="mt-1 font-black">{detail.party.actively_considering_purchase ? "Yes" : "No"}</dd></div><div><dt className="font-bold text-slate-500">Decision maker</dt><dd className="mt-1 font-black">{detail.party.decision_maker ? "Yes" : "No"}</dd></div><div><dt className="font-bold text-slate-500">Guest arrival (Hour 3)</dt><dd className="mt-1 font-black">{arrival ? arrival.toLocaleString() : "Not scheduled"}</dd></div></dl><p className="mt-4 text-sm font-bold text-slate-600">Property authorization certification: {detail.party.property_authorization_certified ? "Confirmed" : "Not confirmed"}</p></article>
    <form onSubmit={saveFood} className="rounded-[2rem] bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Food &amp; drinks support</h2><p className="mt-2 text-sm text-slate-600">Operational planning only; hard cap $150.</p><label className="mt-4 block font-bold">Status<select name="status" defaultValue={detail.party.food_support_status ?? "not_planned"} className="mt-2 min-h-12 w-full rounded-xl border p-3"><option value="not_planned">Not planned</option><option value="planned">Planned</option><option value="arranged">Arranged</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label className="mt-4 block font-bold">Planned budget (USD)<input name="budgetDollars" type="number" min="0" max="150" step="0.01" defaultValue={detail.party.food_budget_cents == null ? "" : detail.party.food_budget_cents / 100} className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="mt-4 block font-bold">Plan notes<textarea name="notes" maxLength={1000} rows={3} defaultValue={detail.party.food_notes ?? ""} className="mt-2 w-full rounded-xl border p-3" /></label><button className="mt-4 min-h-11 rounded-xl bg-slate-950 px-5 font-black text-white">Save food support</button></form>
    <form onSubmit={linkReferral} className="rounded-[2rem] bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Link direct guest purchase</h2><p className="mt-2 text-sm text-slate-600">Each of up to five qualifying guests can create one Demo Party Referral — Tier 1 with a 14-day direct purchase window and the existing 30-day return period. Tier 2 never applies.</p><label className="mt-4 block font-bold">Qualifying guest<select name="guestId" required className="mt-2 min-h-12 w-full rounded-xl border p-3"><option value="">Choose guest</option>{qualifying.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name}</option>)}</select></label><label className="mt-4 block font-bold">Paid IDS order reference<input name="orderReference" required maxLength={80} className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><button disabled={qualifying.length === 0} className="mt-4 min-h-11 rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-40">Link canonical order</button></form>
    <article className="rounded-[2rem] bg-white p-6 shadow-sm lg:col-span-2"><h2 className="text-xl font-black">Direct referral state ({(detail.referrals ?? []).length}/5)</h2>{(detail.referrals ?? []).length === 0 ? <p className="mt-3 text-sm text-slate-600">No direct Demo Party guest purchases are linked.</p> : <ul className="mt-4 space-y-3">{(detail.referrals ?? []).map((referral) => { const guest = detail.guests.find((item) => item.id === referral.demo_party_guest_id); return <li key={referral.id} className="rounded-xl bg-slate-50 p-4 text-sm"><p className="font-black">{guest?.full_name ?? "Unknown guest"} · {referral.product_name_snapshot}</p><p className="mt-1 text-slate-600">{label(referral.status)} · Purchased {new Date(referral.purchase_date).toLocaleDateString()} · Return period ends {new Date(referral.return_period_ends_at).toLocaleDateString()}</p><p className="mt-1 font-bold">Demo Party Referral — Tier 1: {money(Number(referral.base_reward_cents))} · Tier 2 never applies</p></li>; })}</ul>}</article>
    {message && <p role="status" className="rounded-xl bg-white p-4 font-bold lg:col-span-2">{message}</p>}
  </section>;
}
