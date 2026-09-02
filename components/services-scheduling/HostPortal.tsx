"use client";

import { type FormEvent, useState } from "react";
import { MAX_DEMO_PARTY_GUESTS } from "@/lib/demo-party/benefits";
import { DEMO_PARTY_DISCLAIMER } from "@/lib/demo-party/disclaimer";
import { demoPartyGuestFromRpc } from "@/lib/demo-party/portal-payload";
import type { DemoPartyPortal } from "@/lib/demo-party/types";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));

export default function HostPortal({ token, initial }: { token: string; initial: DemoPartyPortal }) {
  const [portal, setPortal] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = portal.status === "approved";
  const paid = ["paid", "partially_refunded", "refunded"].includes(portal.paymentStatus);
  const canManageGuests = active && portal.demoFormat === "party" && paid && !portal.guestListLocked;
  const canAddGuest = canManageGuests && portal.guests.length < MAX_DEMO_PARTY_GUESTS;

  async function beginPayment() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/services-scheduling/portal/${encodeURIComponent(token)}/checkout`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.state === "paid") { window.location.reload(); return; }
      if (typeof data.url === "string") window.location.assign(data.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment could not be started."); setBusy(false); }
  }

  async function addGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/services-scheduling/portal/${encodeURIComponent(token)}/guests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: form.get("fullName"), email: form.get("email"), phone: form.get("phone") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const guest = demoPartyGuestFromRpc(data.guest);
      setPortal((current) => ({ ...current, guests: [...current.guests, guest] }));
      formElement.reset();
      setMessage("Guest added.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Guest could not be added."); }
    finally { setBusy(false); }
  }

  async function removeGuest(guestId: string) {
    if (busy || !window.confirm("Remove this guest from the party list?")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/services-scheduling/portal/${encodeURIComponent(token)}/guests/${guestId}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error);
      setPortal((current) => ({ ...current, guests: current.guests.filter((guest) => guest.id !== guestId) }));
      setMessage("Guest removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Guest could not be removed."); }
    finally { setBusy(false); }
  }

  if (!active) return <div className="space-y-7"><section className="rounded-[2rem] border border-red-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"><p className="text-sm font-black uppercase tracking-[.15em] text-red-700">Secure appointment</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Cancelled {portal.demoFormat === "party" ? "Demo Party" : "Private Demo"}</h1><p className="mt-4 font-bold text-red-900">This appointment has been cancelled. Payment, guest-list, and benefit actions are no longer available from this link.</p><dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-bold text-slate-500">Appointment</dt><dd className="mt-1 font-black">{dateTime(portal.requestedStartAt)} CT</dd></div><div><dt className="font-bold text-slate-500">Payment record</dt><dd className="mt-1 font-black">{paid ? `${money(portal.amountPaidCents)} received` : "No verified payment"}{portal.amountRefundedCents ? ` · ${money(portal.amountRefundedCents)} refunded` : ""}</dd></div></dl></section>{portal.demoFormat === "party" && <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"><h2 className="text-2xl font-black">Demo Party program terms</h2><p className="mt-3 text-sm leading-7 text-slate-600">{DEMO_PARTY_DISCLAIMER}</p></section>}</div>;

  return <div className="space-y-7">
    <section className="rounded-[2rem] bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-[.15em] text-emerald-700">Secure appointment</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{portal.demoFormat === "party" ? "Demo Party" : "Private Demo"}</h1></div><span className={`rounded-full px-4 py-2 text-sm font-black ${paid ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{paid ? "Confirmed — Paid" : "Approved — Payment Required"}</span></div><dl className="mt-7 grid gap-5 sm:grid-cols-2"><div><dt className="text-sm font-bold text-slate-500">Host</dt><dd className="mt-1 font-black">{portal.customerName}</dd></div><div><dt className="text-sm font-bold text-slate-500">Appointment</dt><dd className="mt-1 font-black">{dateTime(portal.requestedStartAt)} CT</dd></div><div><dt className="text-sm font-bold text-slate-500">Property</dt><dd className="mt-1 font-black">{portal.propertyAddress}</dd></div><div><dt className="text-sm font-bold text-slate-500">Equipment</dt><dd className="mt-1 font-black">{portal.equipmentInterest ?? "IDS guidance requested"}</dd></div>{portal.guestArrivalAt && <div><dt className="text-sm font-bold text-slate-500">Guest arrival</dt><dd className="mt-1 font-black">{dateTime(portal.guestArrivalAt)} CT</dd></div>}</dl>{!paid && <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="text-xl font-black text-amber-950">Pay the fixed $100 reservation &amp; travel fee</h2><p className="mt-2 leading-6 text-amber-950">Stripe Checkout accepts card payment. The appointment is confirmed only after the server verifies Stripe’s signed payment event.</p><button type="button" disabled={busy} onClick={beginPayment} className="mt-5 min-h-12 rounded-xl bg-emerald-700 px-6 font-black text-white disabled:opacity-50">{busy ? "Opening secure payment…" : "Pay $100 securely"}</button></div>}{paid && <p className="mt-7 rounded-2xl bg-emerald-50 p-5 font-bold text-emerald-950">Payment received: {money(portal.amountPaidCents)}{portal.amountRefundedCents ? ` · Refunded: ${money(portal.amountRefundedCents)}` : ""}. Save this secure link to manage the appointment.</p>}</section>

    {portal.demoFormat === "party" && <><section className="rounded-[2rem] bg-slate-950 p-6 text-white sm:p-8"><h2 className="text-2xl font-black">Verified benefits</h2><p className="mt-2 text-sm leading-6 text-slate-300">Only IDS-verified guests with at least one continuous hour of attendance count. Benefits are capped at five qualifying guests.</p><dl className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-white/10 p-4"><dt className="text-sm text-slate-300">Qualifying guests</dt><dd className="mt-1 text-2xl font-black">{portal.benefits.qualifyingGuests}/5</dd></div><div className="rounded-2xl bg-white/10 p-4"><dt className="text-sm text-slate-300">Fee refund earned</dt><dd className="mt-1 text-2xl font-black">{money(portal.benefits.feeRefundCents)} / $100</dd></div><div className="rounded-2xl bg-white/10 p-4"><dt className="text-sm text-slate-300">Machine discount</dt><dd className="mt-1 text-2xl font-black">{money(portal.benefits.baseMachineDiscountCents)} / $100</dd></div></dl></section><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"><h2 className="text-2xl font-black">Demo Party program terms</h2><p className="mt-3 text-sm leading-7 text-slate-600">{DEMO_PARTY_DISCLAIMER}</p></section>

<section className="rounded-[2rem] bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Party guest list</h2><p className="mt-1 text-sm text-slate-600">Invite up to 5 friends to your Demo Party. Register each invitee so IDS can plan attendance. Guest contact details remain private to IDS and this host portal; registration is not marketing consent.</p></div><span className="rounded-full bg-slate-100 px-4 py-2 font-black">{portal.guests.length}/5 registered</span></div>{!paid && <p className="mt-5 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">Guest management opens after payment is confirmed.</p>}{portal.guestListLocked && <p className="mt-5 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">IDS has locked this guest list. Contact IDS to make a change.</p>}{canManageGuests && !canAddGuest && <p className="mt-5 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-950">Your Demo Party guest list is full at 5 invited guests.</p>}{canAddGuest && <form onSubmit={addGuest} className="mt-6 grid gap-3 sm:grid-cols-2"><label className="font-bold">Guest name<input name="fullName" required maxLength={160} autoComplete="name" className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="font-bold">Guest email<input name="email" type="email" required maxLength={320} autoComplete="email" className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="font-bold">Guest phone<input name="phone" type="tel" required maxLength={80} autoComplete="tel" className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><button disabled={busy} className="min-h-12 self-end rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50">Add registered guest</button></form>}<ul className="mt-6 divide-y divide-slate-200">{portal.guests.map((guest) => <li key={guest.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{guest.fullName}</p><p className="mt-1 text-sm text-slate-600">{guest.email} · {guest.phone}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Attendance: {guest.qualificationStatus === "qualifying" ? "Verified qualifying" : guest.qualificationStatus === "not_qualifying" ? "Not qualifying" : "Pending IDS verification"}</p></div>{canManageGuests && guest.qualificationStatus === "pending" && <button type="button" disabled={busy} onClick={() => removeGuest(guest.id)} className="min-h-11 rounded-xl border border-red-200 px-4 font-bold text-red-700">Remove</button>}</li>)}</ul>{portal.guests.length === 0 && paid && <p className="mt-5 text-slate-500">No guests have been registered yet.</p>}</section></>}
    {message && <p role="status" className="rounded-xl bg-white p-4 font-bold text-slate-800 shadow">{message}</p>}
  </div>;
}
