"use client";

import { type FormEvent, useState } from "react";
import type { DemoPartyPortal } from "@/lib/demo-party/types";

export default function HostGuestEditor({ token, portal }: { token: string; portal: DemoPartyPortal }) {
  const [message, setMessage] = useState("");
  const [busyGuestId, setBusyGuestId] = useState<string | null>(null);
  const paid = ["paid", "partially_refunded", "refunded"].includes(portal.paymentStatus);
  if (portal.status !== "approved" || portal.demoFormat !== "party" || !paid || portal.guestListLocked || portal.guests.length === 0) return null;
  async function edit(event: FormEvent<HTMLFormElement>, guestId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyGuestId(guestId);
    setMessage("");
    try {
      const response = await fetch(`/api/services-scheduling/portal/${encodeURIComponent(token)}/guests/${guestId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: form.get("fullName"), email: form.get("email"), phone: form.get("phone") }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) window.location.reload();
      else setMessage(body.error ?? "Guest details could not be updated.");
    } catch { setMessage("Guest details could not be updated."); }
    finally { setBusyGuestId(null); }
  }
  return <section className="mt-7 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"><h2 className="text-xl font-black">Edit registered guest details</h2><p className="mt-2 text-sm text-slate-600">Attendance and qualification remain IDS-only fields.</p><div className="mt-5 space-y-4">{portal.guests.filter((guest) => guest.qualificationStatus === "pending").map((guest) => <form key={guest.id} onSubmit={(event) => void edit(event, guest.id)} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2"><h3 className="font-black sm:col-span-2">{guest.fullName}</h3><label className="text-sm font-bold">Full name<input name="fullName" required maxLength={160} defaultValue={guest.fullName} autoComplete="name" className="mt-1 min-h-11 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Email<input name="email" type="email" required maxLength={320} defaultValue={guest.email} autoComplete="email" className="mt-1 min-h-11 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Phone<input name="phone" type="tel" required maxLength={80} defaultValue={guest.phone} autoComplete="tel" className="mt-1 min-h-11 w-full rounded-xl border p-3" /></label><button disabled={busyGuestId !== null} className="min-h-11 self-end rounded-xl border border-emerald-700 px-4 font-black text-emerald-800 disabled:opacity-40">{busyGuestId === guest.id ? "Saving…" : "Save guest"}</button></form>)}</div>{message && <p role="alert" className="mt-4 font-bold text-red-700">{message}</p>}</section>;
}
