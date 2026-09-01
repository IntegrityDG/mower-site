"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { displayReferralStatus, isReadyForReview, type AdminReferral } from "@/lib/referrals/admin";

const money = (cents: number | null) => cents === null ? "Not determined" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleDateString();

export default function ReferralAdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [rows, setRows] = useState<AdminReferral[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [brand, setBrand] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/referrals");
    if (response.status === 401) { setAuthed(false); return; }
    const payload = await response.json();
    if (response.ok) { setRows(payload.referrals); setAuthed(true); setError(""); }
    else setError(payload.error ?? "Referral records are unavailable.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/reviews/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) { setAuthed(true); setError(""); await load(); }
    else setError("Invalid password.");
  }

  async function action(row: AdminReferral, name: "qualify" | "paid" | "disqualify" | "restore") {
    let body: Record<string, unknown> = { action: name };
    if (name === "qualify") {
      const confirmed = window.confirm("Confirm all three requirements: the 30-day return period has passed; the order remains completed and was not returned, canceled, or refunded; and I have verified the qualifying equipment was purchased at the IDS Everyday Low Price and was not discounted below the qualifying IDS price by an additional promotional, negotiated, or special equipment discount.");
      if (!confirmed) return;
      body.confirmations = { returnPeriodPassed: true, orderCompleted: true, everydayLowPrice: true };
    }
    if (name === "disqualify") {
      const reason = window.prompt("Reason required. Examples: Customer returned equipment; Order canceled/refunded; Purchase discounted below IDS Everyday Low Price; Duplicate/ineligible referral; Other.");
      if (!reason?.trim()) return;
      body = { ...body, reason: reason.trim() };
    }
    const response = await fetch(`/api/admin/referrals/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error ?? "Referral update failed."); return; }
    await load();
  }

  const counts = useMemo(() => ({
    pending: rows.filter((row) => row.status === "pending" && !isReadyForReview(row)).length,
    ready: rows.filter((row) => isReadyForReview(row)).length,
    qualified: rows.filter((row) => row.status === "qualified").length,
    paid: rows.filter((row) => row.status === "paid").length,
    disqualified: rows.filter((row) => row.status === "disqualified").length,
  }), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const shownStatus = displayReferralStatus(row);
    const statusMatch = status === "all" || shownStatus === status;
    const brandMatch = brand === "all" || row.brand.toLowerCase() === brand;
    const query = search.trim().toLowerCase();
    const searchMatch = !query || [row.referrerName, row.referrerEmail, row.orderIdentifier].some((value) => value.toLowerCase().includes(query));
    return statusMatch && brandMatch && searchMatch;
  }), [rows, status, brand, search]);

  if (!authed) return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><form onSubmit={login} className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl"><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="mt-2 text-3xl font-black">Referral Administration</h1><p className="mt-3 text-slate-600">Use the existing IDS administrator password.</p><label className="mt-6 block font-bold">Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" required /></label>{error && <p role="alert" className="mt-3 text-red-700">{error}</p>}<button className="mt-5 w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign In</button></form></main>;

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-10"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="text-4xl font-black">Referrals</h1></div><button onClick={async () => { await fetch("/api/admin/reviews/login", { method: "DELETE" }); setAuthed(false); }} className="rounded-xl border px-4 py-2 font-bold">Sign Out</button></div>
    <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Pending", counts.pending], ["Ready for Review", counts.ready], ["Qualified / Awaiting Payment", counts.qualified], ["Paid", counts.paid], ["Disqualified", counts.disqualified]].map(([label, count]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm font-bold text-slate-600">{label}</p><p className="mt-1 text-3xl font-black">{count}</p></div>)}</div>
    <div className="mt-6 grid gap-4 rounded-2xl bg-white p-5 md:grid-cols-3"><label className="font-bold">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="all">All</option><option value="pending">Pending</option><option value="ready">Ready for Review</option><option value="qualified">Qualified</option><option value="paid">Paid</option><option value="disqualified">Disqualified</option></select></label><label className="font-bold">Brand<select value={brand} onChange={(event) => setBrand(event.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="all">All</option><option value="lymow">Lymow</option><option value="yarbo">Yarbo</option><option value="pandag">Pandag</option></select></label><label className="font-bold">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or order" className="mt-2 w-full rounded-xl border p-3" /></label></div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 font-bold text-red-800">{error}</p>}
    {/* Eligibility is intentionally evaluated at render time for the admin countdown. */}
    {/* eslint-disable-next-line react-hooks/purity */}
    <p className="mt-5 font-bold">{filtered.length} referrals</p><div className="mt-4 space-y-5">{filtered.map((row) => { const ready = isReadyForReview(row); const days = Math.max(1, Math.ceil((new Date(row.eligibleDate).getTime() - Date.now()) / 86400000)); return <article key={row.id} className={`rounded-[2rem] border bg-white p-6 shadow-sm ${ready ? "border-amber-400" : "border-slate-200"}`}><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-xl font-black">{row.referrerName}</h2><p className="text-sm text-slate-600">{row.referrerEmail} · {row.orderIdentifier}</p><p className="mt-1 text-sm font-bold">{row.brand} · {row.productName}</p>{row.isDemoParty && <p className="mt-1 text-xs font-black uppercase tracking-wide text-emerald-700">Demo Party Referral — Tier 1</p>}</div><span className={`h-fit rounded-full px-3 py-1 text-sm font-black ${ready ? "bg-amber-100 text-amber-950" : "bg-slate-100"}`}>{ready ? "Ready for Review" : row.status}</span></div><div className="mt-5 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><p>Purchased: <b>{date(row.purchaseDate)}</b></p><p>{row.status === "pending" && !ready ? <><b>{days}</b> days remaining</> : <>Eligible: <b>{date(row.eligibleDate)}</b></>}</p><p>Order: <b>{row.orderStatus}</b></p><p>Payment: <b>{row.paymentStatus}</b></p>{row.isDemoParty ? <><p>Demo Party Referral — Tier 1: <b>{money(row.baseRewardCents)}</b></p><p>Tier 2: <b>Never applies</b></p></> : <><p>Tier 1: <b>{money(row.baseRewardCents)}</b></p><p>Tier 2: <b>{money(row.higherTierRewardCents)}</b></p></>}<p>Final reward: <b>{money(row.finalRewardCents)}</b></p><p>Tier: <b>{row.isDemoParty ? "Demo Party Referral — Tier 1 (fixed)" : row.tierApplied ?? "Not determined"}</b></p></div>{row.disqualificationReason && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm"><b>Reason:</b> {row.disqualificationReason}</p>}<div className="mt-5 flex flex-wrap gap-2">{ready && <button onClick={() => void action(row, "qualify")} className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white">Mark Qualified</button>}{row.status === "qualified" && <button onClick={() => void action(row, "paid")} className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white">Mark Paid</button>}{["pending", "qualified"].includes(row.status) && <button onClick={() => void action(row, "disqualify")} className="rounded-xl bg-red-700 px-4 py-2 font-black text-white">Disqualify</button>}{row.status === "disqualified" && <button onClick={() => void action(row, "restore")} className="rounded-xl border px-4 py-2 font-black">Restore to Pending</button>}</div></article>; })}</div>
  </div></main>;
}
