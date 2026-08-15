"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demoRequestFingerprint } from "@/lib/demo-scheduling/client";
import {
  DEMO_EQUIPMENT_INTERESTS,
  type DemoEquipmentInterest,
  type DemoSlot,
  type DemoSource,
} from "@/lib/demo-scheduling/types";

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function ScheduleDemoModal({
  source,
  triggerClassName = "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-700 px-4 py-3 text-center font-black text-emerald-800 hover:bg-emerald-50",
}: {
  source: DemoSource;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [today] = useState(() => isoDate(new Date()));
  const [slots, setSlots] = useState<DemoSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStart, setSelectedStart] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const idempotencyKey = useRef<string | null>(null);
  const attemptedFingerprint = useRef<string | null>(null);
  const titleId = useId();
  const monthStart = `${monthKey(month)}-01`;
  const monthEnd = isoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setMessage("");
    fetch(`/api/demo-scheduling/availability?start=${monthStart}&end=${monthEnd}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => { if (active) setSlots(payload.slots ?? []); })
      .catch(() => { if (active) setMessage("Availability could not be loaded. Please try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, monthStart, monthEnd]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const origin = trigger.current;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]):not([tabindex="-1"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      origin?.focus();
    };
  }, [open]);

  const byDate = useMemo(() => slots.reduce<Map<string, DemoSlot[]>>((map, slot) => {
    const group = map.get(slot.date) ?? [];
    group.push(slot);
    map.set(slot.date, group);
    return map;
  }, new Map()), [slots]);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!selectedStart) return setMessage("Choose an available date and time.");
    const form = new FormData(event.currentTarget);
    const logicalPayload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      propertyAddress: String(form.get("propertyAddress") ?? ""),
      requestedStartAt: selectedStart,
      source,
      equipmentInterest: String(form.get("equipmentInterest") ?? "") as DemoEquipmentInterest,
    };
    const fingerprint = demoRequestFingerprint(logicalPayload);
    if (!idempotencyKey.current || attemptedFingerprint.current !== fingerprint) {
      idempotencyKey.current = crypto.randomUUID();
    }
    attemptedFingerprint.current = fingerprint;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/demo-scheduling/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...logicalPayload,
          company: String(form.get("company") ?? ""),
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errors = Object.values(payload.errors ?? {}).join(" ");
        setMessage(payload.error ?? (errors || "Request could not be submitted."));
        return;
      }
      idempotencyKey.current = null;
      attemptedFingerprint.current = null;
      setSubmitted(true);
    } catch {
      setMessage("Request could not be submitted. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const overlay = open ? (
    <div
      data-demo-scheduling-portal="body"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-slate-950/75 p-2 backdrop-blur-sm sm:p-3"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-1rem)] min-w-0 w-full max-w-3xl overflow-y-auto overflow-x-hidden overscroll-contain rounded-[2rem] bg-white shadow-2xl sm:max-h-[calc(100dvh-1.5rem)]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white px-4 py-4 sm:gap-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Pending IDS Approval</p>
            <h2 id={titleId} className="mt-1 text-2xl font-black">Schedule a Demo</h2>
          </div>
          <button ref={close} type="button" onClick={() => setOpen(false)} aria-label="Close demo scheduling" className="min-h-11 shrink-0 rounded-xl border px-4 py-2 font-black">Close</button>
        </div>
        {submitted ? (
          <div className="p-7 text-center">
            <h3 className="text-3xl font-black text-emerald-800">Demo request received.</h3>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-600">Your requested date and time are pending IDS approval. Your appointment is not confirmed until IDS approves the request.</p>
            <button type="button" onClick={() => setOpen(false)} className="mt-6 min-h-11 rounded-xl bg-slate-950 px-6 py-3 font-black text-white">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-7 p-4 sm:p-7">
            <section aria-label="Choose requested date and time">
              <div className="flex items-center justify-between gap-2">
                <button type="button" disabled={monthKey(month) <= monthKey(new Date())} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="min-h-11 rounded-xl border px-2 font-black disabled:opacity-40 sm:px-3">Previous</button>
                <h3 className="min-w-0 text-center font-black">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
                <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="min-h-11 rounded-xl border px-3 font-black">Next</button>
              </div>
              <p className="mt-2 text-center text-sm font-bold text-slate-600">Available appointments are shown in Central Time.</p>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-black" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
                {Array.from({ length: days }, (_, index) => {
                  const date = `${monthKey(month)}-${String(index + 1).padStart(2, "0")}`;
                  const available = (byDate.get(date)?.length ?? 0) > 0;
                  const selected = date === selectedDate;
                  return <button key={date} type="button" disabled={!available || date < today} aria-label={`${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${available ? ", available" : ", unavailable"}`} aria-pressed={selected} onClick={() => { setSelectedDate(date); setSelectedStart(""); }} className={`aspect-square min-h-11 min-w-0 rounded-lg border text-sm font-black ${selected ? "border-slate-950 bg-slate-950 text-white" : available ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-100 bg-slate-100 text-slate-400"}`}>{index + 1}<span className="sr-only"> {available ? "Available" : "Unavailable"}</span></button>;
                })}
              </div>
              {loading && <p role="status" className="mt-4 text-center">Loading available timesâ€¦</p>}
              {selectedDate && <div className="mt-5"><h4 className="font-black">Available times</h4><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(byDate.get(selectedDate) ?? []).map((slot) => <button key={slot.startAt} type="button" aria-pressed={selectedStart === slot.startAt} onClick={() => setSelectedStart(slot.startAt)} className={`min-h-11 rounded-xl border px-3 py-2 font-black ${selectedStart === slot.startAt ? "bg-emerald-700 text-white" : "bg-white"}`}>{slot.timeLabel} CT</button>)}</div></div>}
            </section>
            <fieldset>
              <legend className="font-black">Which machine would you like to see?</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {DEMO_EQUIPMENT_INTERESTS.map((option) => (
                  <label key={option} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 font-bold has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50">
                    <input type="radio" name="equipmentInterest" value={option} required className="h-5 w-5 shrink-0 accent-emerald-600" />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <section className="grid gap-4 sm:grid-cols-2">
              <label className="font-bold">Name<input name="name" required maxLength={160} autoComplete="name" className="mt-2 w-full rounded-xl border p-3" /></label>
              <label className="font-bold">Email<input name="email" type="email" required maxLength={320} autoComplete="email" className="mt-2 w-full rounded-xl border p-3" /></label>
              <label className="font-bold">Phone Number<input name="phone" type="tel" required maxLength={80} autoComplete="tel" className="mt-2 w-full rounded-xl border p-3" /></label>
              <label className="font-bold">Property Address<input name="propertyAddress" required maxLength={500} autoComplete="street-address" className="mt-2 w-full rounded-xl border p-3" /></label>
              <label className="sr-only" aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
            </section>
            <section aria-labelledby={`${titleId}-travel-notice`} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
              <h4 id={`${titleId}-travel-notice`} className="text-lg font-black">Travel &amp; Fuel Notice</h4>
              <p className="mt-2 text-sm font-medium leading-6">Because IDS covers a large service area, some demo requests may require a reasonable travel or fuel charge depending on distance. If a charge applies, IDS will contact you before approving the appointment so there are no surprises. We appreciate your understanding as we work to provide on-site demos across a wide region.</p>
            </section>
            <p className="rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-950">Submitting this request does not confirm an appointment. IDS must approve the requested time.</p>
            {message && <p role="alert" className="font-bold text-red-700">{message}</p>}
            <button disabled={sending || !selectedStart} className="min-h-12 w-full rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-50">{sending ? "Submittingâ€¦" : "Request Demo Time"}</button>
          </form>
        )}
      </div>
    </div>
  ) : null;

  return <>
    <button ref={trigger} type="button" onClick={() => { idempotencyKey.current = null; attemptedFingerprint.current = null; setOpen(true); setSubmitted(false); setMessage(""); }} aria-haspopup="dialog" className={triggerClassName}>Schedule a Demo</button>
    {open && typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
  </>;
}
