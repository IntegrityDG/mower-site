"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_REGION_MARKER_CLASSES, publicDemoAreaAccessibleLabel, publicDemoAreaLabel, publicDemoAreaLegend } from "@/lib/demo-scheduling/public-area-planning";
import { DEMO_EQUIPMENT_INTERESTS, type DemoSlot, type DemoSource, type PublicDemoAreaPlan } from "@/lib/demo-scheduling/types";
import { DEMO_PARTY_DISCLAIMER } from "@/lib/demo-party/disclaimer";
import type { DemoFormat } from "@/lib/demo-party/types";

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function DemoRequestForm({ source }: { source: DemoSource }) {
  const [format, setFormat] = useState<DemoFormat>("private");
  const [slots, setSlots] = useState<DemoSlot[]>([]);
  const [areaPlanning, setAreaPlanning] = useState<PublicDemoAreaPlan[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStart, setSelectedStart] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const [range] = useState(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 42);
    return { start: isoDate(start), end: isoDate(end) };
  });

  useEffect(() => {
    let active = true;
    fetch(`/api/demo-scheduling/availability?start=${range.start}&end=${range.end}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => { if (active) { setSlots(payload.slots ?? []); setAreaPlanning(payload.areaPlanning ?? []); } })
      .catch(() => { if (active) setMessage("Availability could not be loaded. Please try again shortly."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  const byDate = useMemo(() => slots.reduce<Map<string, DemoSlot[]>>((map, slot) => {
    const group = map.get(slot.date) ?? [];
    group.push(slot);
    map.set(slot.date, group);
    return map;
  }, new Map()), [slots]);
  const planByDate = useMemo(() => new Map(areaPlanning.map((plan) => [plan.serviceDate, plan])), [areaPlanning]);
  const visibleAreaLegend = useMemo(() => publicDemoAreaLegend(areaPlanning), [areaPlanning]);
  const selectedAreaPlan = planByDate.get(selectedDate) ?? null;
  const calendarDates = useMemo(() => {
    const dates: string[] = [];
    const current = new Date(`${range.start}T12:00:00`);
    const last = new Date(`${range.end}T12:00:00`);
    while (current <= last) {
      dates.push(isoDate(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [range]);
  const firstDay = new Date(`${range.start}T12:00:00`).getDay();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!selectedStart) { setMessage("Choose an available date and time."); return; }
    const form = new FormData(event.currentTarget);
    const partyScreening = format === "party" ? {
      propertyRelationship: String(form.get("propertyRelationship") ?? ""),
      propertyType: String(form.get("propertyType") ?? ""),
      mowableAcreage: Number(form.get("mowableAcreage")),
      activelyConsideringPurchase: form.get("activelyConsideringPurchase") === "yes",
      purchaseTimeframe: String(form.get("purchaseTimeframe") ?? ""),
      equipmentBudget: String(form.get("equipmentBudget") ?? ""),
      decisionMaker: form.get("decisionMaker") === "yes",
      certification: form.get("certification") === "yes",
    } : null;
    const logical = {
      appointmentType: "demo",
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      propertyAddress: String(form.get("propertyAddress") ?? ""),
      requestedStartAt: selectedStart,
      source,
      equipmentInterest: String(form.get("equipmentInterest") ?? ""),
      notes: String(form.get("notes") ?? ""),
      demoFormat: format,
      partyScreening,
      company: String(form.get("company") ?? ""),
    };
    const fingerprint = JSON.stringify(logical);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/demo-scheduling/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...logical, idempotencyKey: attempt.current.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error ?? Object.values(payload.errors ?? {}).join(" ") ?? "Request could not be submitted.");
        return;
      }
      attempt.current = null;
      setComplete(true);
    } catch { setMessage("Request could not be submitted. Please try again."); }
    finally { setSending(false); }
  }

  if (complete) return <div role="status" className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-8 text-center"><h3 className="text-3xl font-black text-emerald-900">Request received.</h3><p className="mx-auto mt-3 max-w-2xl leading-7 text-emerald-950">IDS will review your request. It is pending until approved; approval will include a secure link to pay the fixed $100 reservation and travel fee.</p></div>;

  return (
    <form onSubmit={submit} className="space-y-8 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-8">
      <fieldset>
        <legend className="text-xl font-black">Choose your demo format</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="cursor-pointer rounded-2xl border p-5 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"><input type="radio" name="demoFormat" value="private" checked={format === "private"} onChange={() => setFormat("private")} className="mr-3 accent-emerald-700" /><strong>No — Private Demo</strong><span className="mt-2 block text-sm leading-6 text-slate-600">A focused four-hour appointment at your property.</span></label>
          <label className="cursor-pointer rounded-2xl border p-5 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"><input type="radio" name="demoFormat" value="party" checked={format === "party"} onChange={() => setFormat("party")} className="mr-3 accent-emerald-700" /><strong>YES — Make It a Demo Party &amp; Unlock Amazing Benefits!</strong><span className="mt-2 block text-sm leading-6 text-slate-600">Earn back the $100 fee, unlock up to $200 off regular MSRP plus up to $100 of non-cash Bonus Credit, receive up to $150 in food and drinks, and earn Tier 1-only direct referral rewards: Lymow $50, Yarbo $100, or Pandag $750 per qualifying purchase.</span></label>
        </div>
      </fieldset>

      <section aria-labelledby="appointment-time">
        <h3 id="appointment-time" className="text-xl font-black">Request an available four-hour appointment</h3>
        <p className="mt-1 text-sm text-slate-600">All times are Central Time and remain pending until IDS approval and payment.</p>
        {loading ? <p role="status" className="mt-4 font-bold">Loading availability…</p> : <div className="mt-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-black" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
            {calendarDates.map((date) => {
              const available = (byDate.get(date)?.length ?? 0) > 0;
              const selected = date === selectedDate;
              const areaPlan = planByDate.get(date);
              return <button key={date} type="button" disabled={!available} aria-label={`${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${available ? ", available" : ", unavailable"}${areaPlan ? `, ${publicDemoAreaAccessibleLabel(areaPlan)}` : ""}`} aria-pressed={selected} onClick={() => { setSelectedDate(date); setSelectedStart(""); }} className={`relative aspect-square min-h-12 min-w-0 rounded-lg border text-sm font-black ${selected ? "border-slate-950 bg-slate-950 text-white" : available ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-100 bg-slate-100 text-slate-400"}`}>{new Date(`${date}T12:00:00`).getDate()}{areaPlan && <span aria-hidden="true" className={`absolute inset-x-2 bottom-1 h-1 rounded-full ${DEMO_REGION_MARKER_CLASSES[areaPlan.color]}`} />}</button>;
            })}
          </div>
          {visibleAreaLegend.length > 0 && <div aria-label="Demo area color key" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-700">{visibleAreaLegend.map((plan) => <span key={plan.isCustom ? "custom" : `${plan.regionName}-${plan.color}`} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DEMO_REGION_MARKER_CLASSES[plan.color]}`} />{plan.isCustom ? "Custom / Out-of-Area" : plan.regionName}</span>)}</div>}
          {selectedDate && <div className="mt-5 rounded-2xl bg-slate-50 p-4">{selectedAreaPlan && <p className="mb-2 text-sm font-bold text-slate-700">{publicDemoAreaLabel(selectedAreaPlan)}</p>}<fieldset><legend className="font-bold">Available time</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{(byDate.get(selectedDate) ?? []).map((slot) => <button key={slot.startAt} type="button" aria-pressed={selectedStart === slot.startAt} onClick={() => setSelectedStart(slot.startAt)} className={`min-h-12 rounded-xl border px-3 py-2 font-black ${selectedStart === slot.startAt ? "bg-emerald-700 text-white" : "bg-white"}`}>{slot.timeLabel} CT</button>)}</div></fieldset></div>}
        </div>}
      </section>

      <fieldset><legend className="text-xl font-black">Machine interest</legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{DEMO_EQUIPMENT_INTERESTS.map((option) => <label key={option} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 font-bold has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"><input type="radio" name="equipmentInterest" value={option} required className="h-5 w-5 accent-emerald-700" />{option}</label>)}</div></fieldset>

      <section className="grid gap-4 sm:grid-cols-2"><label className="font-bold">Name<input name="name" required maxLength={160} autoComplete="name" className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="font-bold">Email<input name="email" type="email" required maxLength={320} autoComplete="email" className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="font-bold">Phone<input name="phone" type="tel" required maxLength={80} autoComplete="tel" className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="font-bold">Property address<input name="propertyAddress" required maxLength={500} autoComplete="street-address" className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="font-bold sm:col-span-2">Anything IDS should know?<textarea name="notes" maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border p-3" /></label><label className="sr-only" aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label></section>

        {format === "party" && <fieldset className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <legend className="px-2 text-xl font-black text-emerald-950">Demo Party eligibility</legend>
          <p className="text-sm leading-6 text-emerald-950">Demo Party requests are reviewed individually and are intended for property owners and authorized property managers who are genuinely evaluating autonomous lawn-care equipment for purchase. Submission of a request does not guarantee approval.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="font-bold">Relationship to property<select name="propertyRelationship" required className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3"><option value="">Choose one</option><option value="homeowner">Homeowner</option><option value="property_owner">Property owner</option><option value="authorized_property_manager">Authorized property manager</option></select></label>
            <label className="font-bold">Property type<select name="propertyType" required className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3"><option value="">Choose one</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="rental_property">Rental property</option><option value="hoa">HOA/community</option><option value="other">Other</option></select></label>
            <label className="font-bold">Approximate mowable acres<input name="mowableAcreage" type="number" min="0.01" max="100000" step="0.01" required className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3" /></label>
            <label className="font-bold">Purchase timeframe<select name="purchaseTimeframe" required className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3"><option value="">Choose one</option><option value="within_30_days">Within 30 days</option><option value="1_to_3_months">1–3 months</option><option value="3_to_6_months">3–6 months</option><option value="researching_later">Researching for later</option></select></label>
            <label className="font-bold">Estimated equipment budget<select name="equipmentBudget" required className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3"><option value="">Choose one</option><option value="under_3000">Under $3,000</option><option value="3000_to_5000">$3,000–$5,000</option><option value="5000_to_8000">$5,000–$8,000</option><option value="8000_to_12000">$8,000–$12,000</option><option value="12000_plus">$12,000+</option></select></label>
            <label className="font-bold">Actively considering a purchase?<select name="activelyConsideringPurchase" required className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3"><option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            <label className="font-bold">Part of the purchase decision?<select name="decisionMaker" required className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3"><option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-white p-4 font-bold"><input type="checkbox" name="certification" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" /><span>I confirm that I own this property or am authorized to make property-maintenance decisions for this location.</span></label>
          <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-4"><h4 className="font-black text-emerald-950">Demo Party program terms acknowledgment</h4><p className="mt-2 text-sm leading-6 text-slate-700">By submitting a Demo Party request, I acknowledge the following:</p><p className="mt-2 text-xs leading-6 text-slate-600">{DEMO_PARTY_DISCLAIMER}</p></div>
        </fieldset>}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong className="block text-base">Approval and $100 fee</strong>The reservation and travel fee is charged only after IDS approves the request. Payment through the secure approval link is required to confirm the appointment. Demo Party rewards are based only on guests whose attendance IDS verifies.</div>
      {message && <p role="alert" className="rounded-xl bg-red-50 p-4 font-bold text-red-800">{message}</p>}
      <button disabled={sending || !selectedStart} className="min-h-14 w-full rounded-xl bg-emerald-700 px-6 py-4 text-lg font-black text-white hover:bg-emerald-600 disabled:opacity-50">{sending ? "Submitting…" : `Request ${format === "party" ? "Demo Party" : "Private Demo"}`}</button>
    </form>
  );
}
