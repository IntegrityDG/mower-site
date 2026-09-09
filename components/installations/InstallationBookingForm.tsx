"use client";
import SetupTerms from "./SetupTerms";
import { SETUP_DESCRIPTION } from "@/lib/installations/setup";
import InstallationRefundNotice from "./InstallationRefundNotice";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { humanDemoTime } from "@/lib/demo-scheduling/time";
import type { DemoSlot } from "@/lib/demo-scheduling/types";
import { loadInstallationAvailability } from "@/lib/installations/availability-client";

type AvailabilityState = { status: "loading" } | { status: "failed" } | { status: "ready"; slots: DemoSlot[] };
const Field = ({ name, label, required = true }: { name: string; label: string; required?: boolean }) =>
  <label className="font-bold">{label}<input name={name} required={required} className="mt-2 w-full rounded-xl border p-3" /></label>;

export default function InstallationBookingForm({ setupAvailability = { available: true, message: "" } }: { setupAvailability?: { available: boolean; message: string } }) {
  const router = useRouter();
  const [availability, setAvailability] = useState<AvailabilityState>({ status: "loading" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [selectedStart, setSelectedStart] = useState("");
  const [message, setMessage] = useState("");
  const inFlight=useRef(false);
  const [pending,setPending]=useState<Record<string,unknown>|null>(null);
  const [sending, setSending] = useState(false);
  const [setup,setSetup]=useState(false);
  const [underground, setUnderground] = useState(false);
  const slots = availability.status === "ready" ? availability.slots : [];
  const validSelection = slots.some(slot => slot.startAt === selectedStart && Date.parse(slot.startAt) > Date.now());

  useEffect(() => {
    try {const saved=sessionStorage.getItem("ids-installation-request");if(saved){const value=JSON.parse(saved);setPending(value);setSetup(value.setupSelected===true);}} catch {setMessage("Saved request could not be read. Check your previous confirmation before starting another request.");}
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadInstallationAvailability(controller.signal)
      .then(slots => { if (!controller.signal.aborted) setAvailability({ status: "ready", slots }); })
      .catch(() => { if (!controller.signal.aborted) setAvailability({ status: "failed" }); });
    return () => controller.abort();
  }, [requestVersion]);

  function retryAvailability() {
    setSelectedStart("");
    setAvailability({ status: "loading" });
    setRequestVersion(version => version + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if(pending){await send(pending);return;}
    if (!validSelection || Date.parse(selectedStart) <= Date.now()) {
      setMessage("Choose a currently available appointment before submitting.");
      return;
    }
    if (!event.currentTarget.reportValidity()) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      ...Object.fromEntries(form), startAt: selectedStart,
      undergroundRequested: underground, estimatedUndergroundFeet: Number(form.get("estimatedUndergroundFeet") || 0),
      groundingAcknowledged: form.has("groundingAcknowledged"), responsibilitiesAcknowledged: form.has("responsibilitiesAcknowledged"),
      termsAcknowledged: form.has("termsAcknowledged"), undergroundAcknowledged: form.has("undergroundAcknowledged"),
      setupSelected: setup, cashRequested: form.has("cashRequested"), idempotencyKey: crypto.randomUUID(),
    };
    try {sessionStorage.setItem("ids-installation-request",JSON.stringify(body));setPending(body);}catch{setMessage("Request could not be saved for a safe retry.");return;}
    await send(body);
  }
  async function send(body:Record<string,unknown>) {
    if(inFlight.current)return;inFlight.current=true;setSending(true);
    try {
      const response = await fetch("/api/installations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (response.ok && typeof result?.token === "string" && /^[0-9a-f-]{36}$/i.test(result.token)) {
        sessionStorage.removeItem("ids-installation-request");setPending(null);
        router.push(`/professional-installation/${result.token}`);
      } else {
        if(["slot_unavailable","invalid_intake","currently_unavailable"].includes(result?.code)||response.status===400){sessionStorage.removeItem("ids-installation-request");setPending(null);retryAvailability();}
        const error = typeof result?.error === "string" ? result.error : Object.values(result?.errors ?? {}).find(value => typeof value === "string");
        setMessage(typeof error === "string" ? error : "Request could not be confirmed. Retry this same saved request.");
      }
    } catch {
      setMessage("Could not submit. Please try again.");
    } finally {
      inFlight.current=false;setSending(false);
    }
  }
return <section className="mx-auto max-w-4xl px-5 py-10"><form onSubmit={submit} className="space-y-6 rounded-[2rem] bg-white p-6 shadow-sm md:p-9"><h2 className="text-2xl font-black">Request an installation appointment</h2>{pending&&<p role="status">A request is awaiting confirmation. Retry the same saved details before creating another appointment.</p>}<p className="text-sm text-slate-600">IDS reviews every request before collecting payment. Internet concerns are reviewed, not automatically rejected.</p><div className="grid gap-4 sm:grid-cols-2"><Field name="name" label="Name"/><Field name="email" label="Email"/><Field name="phone" label="Phone"/><Field name="address" label="Installation property address"/><Field name="equipment" label="Equipment/model (optional)" required={false}/><Field name="preferredLocation" label="Preferred equipment location (optional)" required={false}/></div><label className="block font-bold">Will reliable internet/Wi-Fi be available at the installation property?<select name="internetAvailability" required defaultValue="" className="mt-2 w-full rounded-xl border p-3"><option value="" disabled>Choose one</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></label><div aria-busy={availability.status === "loading"}>
  <label className="block font-bold">Requested appointment
    <select name="startAt" required value={selectedStart} onChange={event => setSelectedStart(event.target.value)}
      disabled={availability.status !== "ready" || slots.length === 0 || sending}
      aria-describedby="installation-availability-status" className="mt-2 w-full rounded-xl border p-3 disabled:bg-slate-100">
      <option value="" disabled>Choose an available four-hour window</option>
      {slots.map(slot => <option key={slot.startAt} value={slot.startAt}>{humanDemoTime(slot.startAt, slot.endAt)}</option>)}
    </select>
  </label>
  <div id="installation-availability-status" className="mt-3 text-sm">
    {availability.status === "loading" && <p role="status">Loading available appointments…</p>}
    {availability.status === "failed" && <p role="alert">Availability could not be loaded. Please try again.</p>}
    {availability.status === "ready" && slots.length === 0 && <p role="status">No installation appointments are available in the next 42 days. Please check again later.</p>}
    {(availability.status === "failed" || (availability.status === "ready" && slots.length === 0)) &&
      <button type="button" onClick={retryAvailability} className="mt-2 rounded-lg border border-emerald-700 px-4 py-2 font-bold text-emerald-800">Retry availability</button>}
  </div>
</div><section aria-label="Initial pricing summary" className="rounded-xl border border-emerald-300 bg-emerald-50 p-5"><label className="flex gap-3 font-bold"><input type="checkbox" name="setupSelected" checked={setup} disabled={!!pending||sending||!setupAvailability.available} onChange={e=>setSetup(e.target.checked)}/>Add Professional Setup &amp; Optimization — $500</label>{!setupAvailability.available&&<p className="mt-3 font-black text-amber-900">CURRENTLY UNAVAILABLE{setupAvailability.message?`: ${setupAvailability.message}`:""}</p>}<p className="mt-3 text-sm">{SETUP_DESCRIPTION}</p><p className="mt-3 font-bold">{setup?"Installation $1,000 + Setup $500 = $1,500 initial amount. One $250 deposit; $1,250 remains before approved travel and other charges.":"Installation $1,000 initial amount. One $250 deposit; $750 remains before approved travel and other charges."}</p><p className="mt-2 text-sm">Separate four-hour labor buckets. Setup parts/materials are extra; unused Setup time does not roll over.</p></section><label className="flex gap-3 rounded-xl border p-4 font-bold"><input type="checkbox" checked={underground} onChange={e=>setUnderground(e.target.checked)}/> Request underground/buried charger power routing</label>{underground&&<div className="rounded-xl bg-amber-50 p-4"><Field name="estimatedUndergroundFeet" label="Estimated underground feet"/><label className="mt-4 flex gap-3"><input name="undergroundAcknowledged" type="checkbox" required/><span>I will contact 811 and disclose public and private underground infrastructure. Underground labor is $50 per started 10 feet plus materials.</span></label></div>}<div className="space-y-4 rounded-xl bg-slate-50 p-5 text-sm"><label className="flex gap-3"><input name="groundingAcknowledged" type="checkbox" required/><span><b>Grounding is mandatory and cannot be waived.</b> Grounding labor is included; materials are reconciled separately.</span></label><label className="flex gap-3"><input name="responsibilitiesAcknowledged" type="checkbox" required/><span>I will provide an authorized adult, secure animals, safe access, required permissions, utility markings, and disclosure of hazards. I understand locations are preferences and extra materials, underground work, labor, and approved travel can affect final cost.</span></label><label className="flex gap-3"><input name="termsAcknowledged" type="checkbox" required/><span>I accept the Installation and selected Setup terms, including technician authority to suspend or terminate unsafe work. Customer-controlled safety termination may have no labor refund; unused materials remain subject to reconciliation.</span></label><label className="flex gap-3"><input name="cashRequested" type="checkbox"/><span>I request IDS permission to pay the remaining balance in cash on arrival. This is not approved unless IDS confirms it.</span></label></div><details className="rounded-xl border p-4 text-sm"><summary className="cursor-pointer font-black">Safety and travel terms</summary><p className="mt-3">Unsafe animals, hostile behavior, electrical or underground hazards, dangerous terrain or structures, inaccessible work areas, severe weather, lightning, or interference may stop work. One remediation opportunity may be allowed; proof may be required. IDS weather postponements are not customer cancellations.</p><p className="mt-3">Installation-only includes up to two hours of one-way drive time from Williamsville, Missouri and charges excess time at $35 per started hour per direction. When Installation + Setup share a trip, the two-hour one-way allowance applies once and excess travel is $35 per started additional hour total, with no separate return-direction charge. IDS approves one travel charge before payment; no mileage fee.</p></details><SetupTerms/><InstallationRefundNotice/><p className="text-sm text-slate-600">The approved remaining balance is due more than 72 hours before the appointment. Requests approved within 72 hours require the full initial amount unless IDS approves another arrangement.</p><button disabled={(!validSelection&&!pending) || sending} className="w-full rounded-xl bg-emerald-700 px-5 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Submitting…" : pending ? "Retry saved installation request" : "Submit installation request"}</button>{message&&<p role="status" className="font-bold">{message}</p>}</form></section>}
