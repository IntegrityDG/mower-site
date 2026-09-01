"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { addressHref, phoneHref } from "@/lib/featured-businesses/validation";
import {
  DEMO_REQUEST_FILTERS,
  DemoSchedulingAdminRequestState,
  demoCalendarOccupancyCount,
  reconcileSelectedDemoRequest,
  requestMatchesDemoFilter,
  selectDemoRequestForCalendarDate,
  type DemoRequestFilter,
} from "@/lib/demo-scheduling/admin-state";
import { demoAreaAssignmentDisplay, serviceDateParts } from "@/lib/demo-scheduling/area-planning";
import { CUSTOM_DEMO_AREA_ID } from "@/lib/demo-scheduling/public-area-planning";
import type { AvailabilityException, AvailabilityRule, DemoAreaAssignment, DemoRequest, DemoServiceArea, DemoServiceAreaCity } from "@/lib/demo-scheduling/types";
import AdminAppointmentOperations from "@/components/services-scheduling/AdminAppointmentOperations";
import AdminPartyExtras from "@/components/services-scheduling/AdminPartyExtras";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const notificationLabels: Record<string, string> = { ids_new_request: "IDS new-request notification", customer_request_received: "Customer request receipt", customer_more_information: "Customer information request", customer_payment_required: "Customer payment-required link", customer_payment_confirmed_private: "Private Demo confirmation", customer_payment_confirmed_party: "Demo Party confirmation", ids_calendar_invite: "IDS calendar invitation", customer_denied: "Customer denial" };
const applicableNotifications: Record<DemoRequest["status"], string[]> = { pending: ["ids_new_request", "customer_request_received", "customer_more_information"], approved: ["customer_payment_required", "customer_payment_confirmed_private", "customer_payment_confirmed_party", "ids_calendar_invite"], denied: ["customer_denied"], cancelled: [] };

type Payload = {
  requests: DemoRequest[];
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  notifications: Record<string, { event_type: string; status: string; last_error: string | null }[]>;
  serviceAreas: DemoServiceArea[];
  serviceAreaCities: DemoServiceAreaCity[];
  areaAssignments: DemoAreaAssignment[];
};
type DayPlanDraft = { regionId: string; cityId: string; customCity: string; internalNote: string };

const emptyPayload: Payload = { requests: [], rules: [], exceptions: [], notifications: {}, serviceAreas: [], serviceAreaCities: [], areaAssignments: [] };
const emptyDayPlan: DayPlanDraft = { regionId: "", cityId: "", customCity: "", internalNote: "" };
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const human = (start: string, end: string) => `${new Date(start).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long", year: "numeric", month: "long", day: "numeric" })} · ${new Date(start).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })} – ${new Date(end).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })} CT`;
const humanServiceDate = (date: string) => {
  const parts = serviceDateParts(date);
  return parts ? new Date(parts.year, parts.month - 1, parts.day, 12).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : date;
};

export default function DemoSchedulingAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Payload>(emptyPayload);
  const [message, setMessage] = useState("");
  const [{ filter, selected: storedSelected }, setRequestView] = useState<{ filter: DemoRequestFilter; selected: DemoRequest | null }>({ filter: "active", selected: null });
  const [month, setMonth] = useState(() => new Date());
  const [now] = useState(() => Date.now());
  const [denial, setDenial] = useState("Unfortunately, that requested time is unavailable. Please return to the website and choose another available time.");
  const [requestState] = useState(() => new DemoSchedulingAdminRequestState());
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [dayPlanDraft, setDayPlanDraft] = useState<DayPlanDraft>(emptyDayPlan);
  const [managedAreaId, setManagedAreaId] = useState("");

  function applyPayload(payload: Payload, reconcileSelection: boolean) {
    const requests = requestState.applyRefresh(payload.requests ?? []);
    const normalized: Payload = { ...emptyPayload, ...payload, requests, serviceAreas: payload.serviceAreas ?? [], serviceAreaCities: payload.serviceAreaCities ?? [], areaAssignments: payload.areaAssignments ?? [] };
    setData(normalized);
    setManagedAreaId((current) => normalized.serviceAreas.some((area) => area.id === current && area.id !== CUSTOM_DEMO_AREA_ID) ? current : normalized.serviceAreas.find((area) => area.id !== CUSTOM_DEMO_AREA_ID)?.id ?? "");
    if (reconcileSelection) setRequestView((current) => {
      if (!current.selected) return current;
      const refreshed = requests.find((request) => request.id === current.selected?.id) ?? null;
      return { ...current, selected: reconcileSelectedDemoRequest(refreshed, current.filter, now) };
    });
  }

  async function load() {
    const response = await fetch("/api/admin/demo-scheduling", { cache: "no-store" });
    if (response.status === 401) { setAuthed(false); return; }
    const payload = await response.json().catch(() => ({}));
    setAuthed(true);
    if (response.ok) applyPayload(payload as Payload, true);
    else setMessage(payload.error ?? "Scheduling could not be loaded.");
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/demo-scheduling", { cache: "no-store" }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) { setAuthed(false); return; }
      const payload = await response.json().catch(() => ({}));
      if (!active) return;
      setAuthed(true);
      if (response.ok) applyPayload(payload as Payload, false);
      else setMessage(payload.error ?? "Scheduling could not be loaded.");
    });
    return () => { active = false; };
    // The request state object is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestState]);

  const selectedAssignment = data.areaAssignments.find((assignment) => assignment.serviceDate === selectedDate) ?? null;
  useEffect(() => {
    setDayPlanDraft(selectedAssignment ? { regionId: selectedAssignment.regionId, cityId: selectedAssignment.cityId ?? "", customCity: selectedAssignment.customCity ?? "", internalNote: selectedAssignment.internalNote ?? "" } : emptyDayPlan);
  }, [selectedAssignment, selectedDate]);

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/reviews/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) { setPassword(""); await load(); } else setMessage("Invalid password.");
  }

  async function transition(action: string) {
    if (!selected) return;
    setMessage("");
    const response = await fetch(`/api/admin/demo-scheduling/requests/${selected.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, message: action === "deny" || action === "request_info" ? denial : null }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const updated = payload.request as DemoRequest;
      const requests = requestState.applyTransition(updated);
      setData((current) => ({ ...current, requests }));
      setRequestView((current) => ({ ...current, selected: current.selected?.id === updated.id ? reconcileSelectedDemoRequest(updated, current.filter, now) : reconcileSelectedDemoRequest(current.selected, current.filter, now) }));
      setMessage(payload.warning ?? (action === "request_info" ? "Information requested." : `Request ${action}d.`));
      await load();
    } else setMessage(payload.error ?? "Action failed.");
  }

  async function retryNotifications() {
    if (!selected) return;
    setMessage("");
    const response = await fetch(`/api/admin/demo-scheduling/requests/${selected.id}/retry`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? (payload.message ?? (payload.retried ? "Failed notifications retried." : "No notification needed.")) : payload.error ?? "Retry failed.");
    await load();
  }

  async function saveRules() {
    const response = await fetch("/api/admin/demo-scheduling", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rules: data.rules }) });
    setMessage(response.ok ? "Availability saved." : "Availability could not be saved.");
    if (response.ok) await load();
  }

  async function addBlackout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/demo-scheduling/blackouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: form.get("date"), allDay: form.get("allDay") === "on", startTime: form.get("startTime"), endTime: form.get("endTime"), reason: form.get("reason") }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Blackout added." : payload.error ?? "Blackout failed.");
    if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  async function saveDayPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/admin/demo-scheduling/day-plans", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ serviceDate: selectedDate, regionId: dayPlanDraft.regionId, cityId: customAreaSelected ? null : dayPlanDraft.cityId || null, customCity: dayPlanDraft.customCity.trim() || null, internalNote: dayPlanDraft.internalNote || null }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? (selectedAssignment ? "Day Plan updated." : "Day Plan saved.") : payload.error ?? "Day Plan could not be saved.");
    if (response.ok) await load();
  }

  async function clearDayPlan() {
    const response = await fetch(`/api/admin/demo-scheduling/day-plans/${selectedDate}`, { method: "DELETE" });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    setMessage(response.ok ? "Area assignment cleared." : payload.error ?? "Day Plan could not be cleared.");
    if (response.ok) await load();
  }

  async function saveArea(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(id ? `/api/admin/demo-scheduling/areas/${id}` : "/api/admin/demo-scheduling/areas", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), description: form.get("description"), active: form.get("active") === "on", sortOrder: Number(form.get("sortOrder")) }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? (id ? "Area updated." : "Area created.") : payload.error ?? "Area could not be saved.");
    if (response.ok) { if (!id) { event.currentTarget.reset(); setManagedAreaId(payload.area.id); } await load(); }
  }

  async function saveCity(event: FormEvent<HTMLFormElement>, regionId: string, cityId?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const url = cityId ? `/api/admin/demo-scheduling/areas/${regionId}/cities/${cityId}` : `/api/admin/demo-scheduling/areas/${regionId}/cities`;
    const response = await fetch(url, { method: cityId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), stateAbbreviation: form.get("stateAbbreviation"), active: form.get("active") === "on", sortOrder: Number(form.get("sortOrder")) }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? (cityId ? "City updated." : "City added.") : payload.error ?? "City could not be saved.");
    if (response.ok) { if (!cityId) event.currentTarget.reset(); await load(); }
  }

  const visible = data.requests.filter((request) => requestMatchesDemoFilter(request, filter, now));
  const selected = reconcileSelectedDemoRequest(storedSelected, filter, now);
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const byDay = useMemo(() => data.requests.reduce<Map<string, DemoRequest[]>>((map, request) => {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(request.requestedStartAt));
    const group = map.get(key) ?? [];
    group.push(request);
    map.set(key, group);
    return map;
  }, new Map()), [data.requests]);
  const assignmentByDay = useMemo(() => new Map(data.areaAssignments.map((assignment) => [assignment.serviceDate, assignment])), [data.areaAssignments]);
  const selectedDateRequests = byDay.get(selectedDate) ?? [];
  const customAreaSelected = dayPlanDraft.regionId === CUSTOM_DEMO_AREA_ID;
  const availableAreas = data.serviceAreas.filter((area) => area.active || area.id === selectedAssignment?.regionId);
  const availableCities = data.serviceAreaCities.filter((city) => city.regionId === dayPlanDraft.regionId && (city.active || city.id === selectedAssignment?.cityId));
  const manageableAreas = data.serviceAreas.filter((area) => area.id !== CUSTOM_DEMO_AREA_ID);
  const managedArea = manageableAreas.find((area) => area.id === managedAreaId) ?? null;
  const managedCities = data.serviceAreaCities.filter((city) => city.regionId === managedAreaId);

  if (authed === null) return <main className="min-h-screen bg-slate-100 p-6">Loading admin…</main>;
  if (!authed) return <main className="min-h-screen bg-slate-100 p-6"><form onSubmit={login} className="mx-auto max-w-md rounded-[2rem] bg-white p-8 shadow-xl"><h1 className="text-3xl font-black">Services &amp; Scheduling</h1><label className="mt-6 block font-bold">Admin password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label><button className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign In</button>{message && <p role="alert" className="mt-3 text-red-700">{message}</p>}</form></main>;

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-10"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="text-4xl font-black">Services &amp; Scheduling</h1></div><button onClick={async () => { await fetch("/api/admin/reviews/login", { method: "DELETE" }); setAuthed(false); }} className="rounded-xl border px-4 py-2 font-bold">Sign Out</button></div>
    {message && <p role="status" className="mt-5 rounded-xl bg-white p-4 font-bold">{message}</p>}

    <section className="mt-8 rounded-[2rem] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-2"><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))} className="min-h-11 rounded-xl border px-3 font-bold sm:px-4">Previous</button><h2 className="text-center text-lg font-black sm:text-xl">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))} className="min-h-11 rounded-xl border px-3 font-bold sm:px-4">Next</button></div>
      <div className="mt-5 overflow-x-auto pb-2"><div className="grid min-w-[42rem] grid-cols-7 gap-1 text-center text-xs font-black">{weekdays.map((day) => <span key={day}>{day.slice(0, 3)}</span>)}{Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => {
        const date = `${monthPrefix}-${String(index + 1).padStart(2, "0")}`;
        const rows = byDay.get(date) ?? [];
        const occupancyCount = demoCalendarOccupancyCount(rows);
        const display = demoAreaAssignmentDisplay(assignmentByDay.get(date), data.serviceAreas, data.serviceAreaCities);
        return <button key={date} type="button" onClick={() => { setSelectedDate(date); setRequestView((current) => ({ ...current, selected: selectDemoRequestForCalendarDate(rows, current.filter, now) })); }} aria-label={`${date}: ${display ? `${display.regionName}${display.cityName ? `, ${display.cityName}` : ""}; ` : ""}${occupancyCount} slot-occupying demo requests`} className={`min-h-24 min-w-0 overflow-hidden rounded-lg border p-1.5 text-left align-top text-xs ${selectedDate === date ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-200" : "bg-white"}`}><span className="block text-sm font-black">{index + 1}</span>{display && <span className="mt-1 block min-w-0"><span className="block break-words font-black leading-tight text-emerald-800">{display.regionName}</span>{display.cityName && <span className="mt-0.5 block truncate font-semibold text-slate-600">{display.cityName}</span>}</span>}{occupancyCount > 0 && <span className="mt-1 block w-fit rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-black">{occupancyCount} Demo{occupancyCount === 1 ? "" : "s"}</span>}</button>;
      })}</div></div>

      <div className="mt-7 grid gap-6 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,.75fr)]">
        <form onSubmit={saveDayPlan}>
          <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">Day Plan / Area Planning</p><h3 className="mt-1 text-2xl font-black">{humanServiceDate(selectedDate)}</h3><p className="mt-2 text-sm text-slate-600">Planning only. This does not change availability, blackouts, or appointments.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="font-bold">Area / Region <span className="text-red-700">*</span><select required value={dayPlanDraft.regionId} onChange={(event) => setDayPlanDraft((current) => ({ ...current, regionId: event.target.value, cityId: "", customCity: "" }))} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="">Choose an area</option>{availableAreas.map((area) => <option key={area.id} value={area.id}>{area.name}{area.id === CUSTOM_DEMO_AREA_ID ? " (Reserved)" : area.active ? "" : " (Inactive)"}</option>)}</select></label>{!customAreaSelected && <label className="font-bold">Specific City <span className="font-medium text-slate-500">(optional)</span><select value={dayPlanDraft.cityId} onChange={(event) => setDayPlanDraft((current) => ({ ...current, cityId: event.target.value, customCity: event.target.value ? "" : current.customCity }))} disabled={!dayPlanDraft.regionId} className="mt-2 w-full rounded-xl border bg-white p-3 disabled:bg-slate-100"><option value="">No specific city</option>{availableCities.map((city) => <option key={city.id} value={city.id}>{city.name}{city.stateAbbreviation ? `, ${city.stateAbbreviation}` : ""}{city.active ? "" : " (Inactive)"}</option>)}</select></label>}<label className={`font-bold ${customAreaSelected ? "" : "sm:col-span-2"}`}>{customAreaSelected ? <>Custom Location <span className="text-red-700">*</span></> : <>Or enter a custom city <span className="font-medium text-slate-500">(optional)</span></>}<input value={dayPlanDraft.customCity} required={customAreaSelected} placeholder={customAreaSelected ? "Nashville, TN" : undefined} maxLength={120} onChange={(event) => setDayPlanDraft((current) => ({ ...current, customCity: event.target.value, cityId: event.target.value || customAreaSelected ? "" : current.cityId }))} className="mt-2 w-full rounded-xl border bg-white p-3" /></label><label className="font-bold sm:col-span-2">Internal Note <span className="font-medium text-slate-500">(optional)</span><textarea rows={3} maxLength={500} value={dayPlanDraft.internalNote} onChange={(event) => setDayPlanDraft((current) => ({ ...current, internalNote: event.target.value }))} className="mt-2 w-full rounded-xl border bg-white p-3" /></label></div>
          <div className="mt-5 flex flex-wrap gap-3"><button disabled={!dayPlanDraft.regionId} className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-50">{selectedAssignment ? "Update Day Plan" : "Save Day Plan"}</button>{selectedAssignment && <button type="button" onClick={() => void clearDayPlan()} className="rounded-xl border border-red-300 bg-white px-5 py-3 font-black text-red-700">Clear Area Assignment</button>}</div>
        </form>
        <div className="rounded-2xl bg-white p-4"><h4 className="font-black">Requests on this date</h4><p className="mt-1 text-sm text-slate-600">{demoCalendarOccupancyCount(selectedDateRequests)} occupying demo request{demoCalendarOccupancyCount(selectedDateRequests) === 1 ? "" : "s"}</p><div className="mt-3 space-y-2">{selectedDateRequests.length ? selectedDateRequests.map((request) => <button key={request.id} type="button" onClick={() => setRequestView({ filter: "all", selected: request })} className="flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left text-sm"><span className="truncate font-bold">{request.customerName}</span><span className="shrink-0 text-xs font-black uppercase text-slate-500">{request.status}</span></button>) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No demo requests on this date.</p>}</div></div>
      </div>
    </section>

    <div className="mt-8 grid gap-7 lg:grid-cols-2"><section><div className="flex flex-wrap gap-2">{DEMO_REQUEST_FILTERS.map((value) => <button key={value} onClick={() => setRequestView((current) => ({ filter: value, selected: reconcileSelectedDemoRequest(current.selected, value, now) }))} className={`rounded-full px-4 py-2 font-black capitalize ${filter === value ? "bg-emerald-600 text-white" : "bg-white"}`}>{value}</button>)}</div><div className="mt-5 space-y-3">{visible.map((request) => <button key={request.id} onClick={() => setRequestView((current) => ({ ...current, selected: reconcileSelectedDemoRequest(request, current.filter, now) }))} className="w-full rounded-2xl bg-white p-5 text-left shadow-sm"><span className="flex flex-wrap justify-between gap-2"><b>{request.customerName}</b><span className="rounded bg-slate-100 px-2 py-1 text-xs font-black uppercase">{request.status}</span></span><span className="mt-2 block text-sm text-slate-600">{human(request.requestedStartAt, request.requestedEndAt)}</span></button>)}</div></section>
      {selected ? <section className="rounded-[2rem] bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">{selected.customerName}</h2><p className="mt-2 font-black uppercase text-emerald-700">{selected.status}</p><dl className="mt-5 space-y-3"><div><dt className="font-bold">Requested time</dt><dd>{human(selected.requestedStartAt, selected.requestedEndAt)}</dd></div><div><dt className="font-bold">Email</dt><dd><a className="text-emerald-700 underline" href={`mailto:${selected.customerEmail}`}>{selected.customerEmail}</a></dd></div><div><dt className="font-bold">Phone</dt><dd><a className="text-emerald-700 underline" href={phoneHref(selected.customerPhone)}>{selected.customerPhone}</a></dd></div><div><dt className="font-bold">Property</dt><dd><a className="text-emerald-700 underline" target="_blank" rel="noopener noreferrer" href={addressHref(selected.propertyAddress)}>{selected.propertyAddress}</a></dd></div><div><dt className="font-bold">Equipment / source</dt><dd>{selected.equipmentInterest??"Not specified"} · {selected.source}</dd></div><div><dt className="font-bold">Submitted</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div></dl><div className="mt-6"><h3 className="font-black">Notification delivery</h3><div className="mt-2 space-y-2">{applicableNotifications[selected.status].map((type) => { const event = (data.notifications[selected.id] ?? []).find((item) => item.event_type === type); return <div key={type} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span><span className="block">{notificationLabels[type]}</span>{event?.status==="failed"&&event.last_error&&<span className="mt-1 block max-w-md text-xs font-medium text-red-700">{event.last_error}</span>}</span><b className="uppercase">{event?.status ?? "pending"}</b></div>; })}</div></div>{(data.notifications[selected.id] ?? []).some((event) => event.status === "failed" && applicableNotifications[selected.status].includes(event.event_type)) && <button onClick={() => void retryNotifications()} className="mt-4 w-full rounded-xl border px-5 py-3 font-black">Retry Failed Notifications</button>}{selected.status === "approved" && !["paid","partially_refunded","refunded"].includes(selected.paymentStatus ?? "") && !(data.notifications[selected.id] ?? []).some((event) => event.event_type === "customer_payment_required") && <button onClick={() => void retryNotifications()} className="mt-4 w-full rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">Send Payment-Required Email</button>}{selected.status === "approved" && <><button onClick={() => void transition("cancel")} className="mt-3 w-full rounded-xl bg-red-700 px-5 py-3 font-black text-white">Cancel Appointment</button><p className="mt-2 text-xs text-slate-500">Cancellation frees the website slot. Version 1 does not send an ICS cancellation.</p></>}</section> : <section className="rounded-[2rem] bg-white p-8 text-slate-600">Select a request to view details.</section>}
    </div>

    {selected && <section className="mt-8 rounded-[2rem] bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">Shared appointment record</p><h2 className="mt-2 text-2xl font-black">{selected.demoFormat === "party" ? "Demo Party" : "Private Demo"} · {selected.durationMinutes ?? 240} minutes</h2><p className="mt-2 font-black text-slate-700">{selected.paymentStatus === "paid" ? "Confirmed — Paid" : selected.status === "approved" ? "Approved — Payment Required" : selected.paymentStatus ?? "Not paid"}</p>{selected.notes && <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-sm font-bold text-slate-500">Customer notes</p><p className="mt-1 whitespace-pre-wrap">{selected.notes}</p></div>}{selected.status === "pending" && <div className="mt-5"><label className="block font-bold">Customer decision message<textarea value={denial} onChange={(event) => setDenial(event.target.value)} rows={4} maxLength={2000} className="mt-2 w-full rounded-xl border p-3" /></label><div className="mt-3 flex flex-wrap gap-3"><button onClick={() => void transition("request_info")} className="rounded-xl border border-amber-400 px-5 py-3 font-black text-amber-900">Request more information</button><button onClick={() => void transition("approve")} className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">Approve — Require $100 Payment</button><button onClick={() => void transition("deny")} className="rounded-xl bg-red-700 px-5 py-3 font-black text-white">Deny</button></div></div>}<AdminAppointmentOperations key={`${selected.id}:${selected.status}:${selected.paymentStatus ?? "not_started"}`} appointmentId={selected.id} isParty={selected.demoFormat === "party"} /></section>}

    {selected?.demoFormat === "party" && <AdminPartyExtras key={`${selected.id}:${selected.status}:${selected.paymentStatus ?? "not_started"}`} appointmentId={selected.id} />}

    <section className="mt-8 rounded-[2rem] bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">Demo Service Areas</h2><p className="mt-2 text-slate-600">Manage reusable operating regions and their optional city choices. Inactive records remain available to historical Day Plans.</p><p className="mt-2 text-sm font-bold text-red-700">Custom / Out-of-Area is a reserved application option and cannot be edited here.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(17rem,.7fr)_minmax(0,1.3fr)]"><div><form onSubmit={(event) => saveArea(event)} className="rounded-2xl bg-slate-50 p-5"><h3 className="text-lg font-black">Add Area / Region</h3><label className="mt-4 block font-bold">Region name<input name="name" required maxLength={120} className="mt-2 w-full rounded-xl border bg-white p-3" /></label><label className="mt-4 block font-bold">Description <span className="font-medium text-slate-500">(optional)</span><textarea name="description" maxLength={500} rows={2} className="mt-2 w-full rounded-xl border bg-white p-3" /></label><label className="mt-4 block font-bold">Sort order<input name="sortOrder" type="number" min={0} max={100000} defaultValue={data.serviceAreas.length ? Math.max(...data.serviceAreas.map((area) => area.sortOrder)) + 10 : 10} required className="mt-2 w-full rounded-xl border bg-white p-3" /></label><label className="mt-4 flex items-center gap-2 font-bold"><input name="active" type="checkbox" defaultChecked /> Active</label><button className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Add Region</button></form></div>
        <div><label className="block font-bold">Region to manage<select value={managedAreaId} onChange={(event) => setManagedAreaId(event.target.value)} className="mt-2 w-full rounded-xl border p-3">{manageableAreas.map((area) => <option key={area.id} value={area.id}>{area.name}{area.active ? "" : " (Inactive)"}</option>)}</select></label>{managedArea && <div className="mt-5 space-y-6"><form key={managedArea.updatedAt} onSubmit={(event) => saveArea(event, managedArea.id)} className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"><h3 className="text-lg font-black sm:col-span-2">Edit Region</h3><label className="font-bold sm:col-span-2">Region name<input name="name" defaultValue={managedArea.name} required maxLength={120} className="mt-2 w-full rounded-xl border p-3" /></label><label className="font-bold sm:col-span-2">Description <span className="font-medium text-slate-500">(optional)</span><textarea name="description" defaultValue={managedArea.description ?? ""} maxLength={500} rows={2} className="mt-2 w-full rounded-xl border p-3" /></label><label className="font-bold">Sort order<input name="sortOrder" type="number" min={0} max={100000} defaultValue={managedArea.sortOrder} required className="mt-2 w-full rounded-xl border p-3" /></label><label className="flex items-center gap-2 font-bold"><input name="active" type="checkbox" defaultChecked={managedArea.active} /> Active</label><button className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white sm:col-span-2">Save Region</button></form>
          <div className="rounded-2xl border p-5"><h3 className="text-lg font-black">City Options</h3><p className="mt-1 text-sm text-slate-600">City is always optional on a Day Plan.</p><form onSubmit={(event) => saveCity(event, managedArea.id)} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_5rem_6rem_auto_auto]"><input aria-label="New city name" name="name" required maxLength={120} placeholder="City name" className="rounded-xl border bg-white p-3" /><input aria-label="New city state" name="stateAbbreviation" maxLength={2} placeholder="State" className="rounded-xl border bg-white p-3 uppercase" /><input aria-label="New city sort order" name="sortOrder" type="number" min={0} max={100000} defaultValue={managedCities.length ? Math.max(...managedCities.map((city) => city.sortOrder)) + 10 : 10} required className="rounded-xl border bg-white p-3" /><label className="flex items-center gap-2 font-bold"><input name="active" type="checkbox" defaultChecked /> Active</label><button className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white">Add</button></form><div className="mt-4 space-y-3">{managedCities.map((city) => <form key={`${city.id}-${city.updatedAt}`} onSubmit={(event) => saveCity(event, managedArea.id, city.id)} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_5rem_6rem_auto_auto]"><input aria-label={`${city.name} city name`} name="name" defaultValue={city.name} required maxLength={120} className="rounded-lg border p-2" /><input aria-label={`${city.name} state`} name="stateAbbreviation" defaultValue={city.stateAbbreviation ?? ""} maxLength={2} className="rounded-lg border p-2 uppercase" /><input aria-label={`${city.name} sort order`} name="sortOrder" type="number" min={0} max={100000} defaultValue={city.sortOrder} required className="rounded-lg border p-2" /><label className="flex items-center gap-2 text-sm font-bold"><input name="active" type="checkbox" defaultChecked={city.active} /> Active</label><button className="rounded-lg border px-3 py-2 font-black">Save</button></form>)}</div></div>
        </div>}</div>
      </div>
    </section>

    <section className="mt-8 rounded-[2rem] bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">Demo Availability</h2><p className="mt-2 text-slate-600">Recurring four-hour appointment windows in Central Time.</p><div className="mt-5 space-y-3">{data.rules.map((rule, index) => <div key={rule.weekday} className="grid items-center gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto_1fr_1fr]"><b>{weekdays[rule.weekday]}</b><label className="flex items-center gap-2"><input type="checkbox" checked={rule.enabled} onChange={(event) => setData((current) => ({ ...current, rules: current.rules.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item) }))} /> Available</label><label>Start<input type="time" value={rule.startTime} onChange={(event) => setData((current) => ({ ...current, rules: current.rules.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value } : item) }))} className="ml-2 rounded border p-2" /></label><label>End<input type="time" value={rule.endTime} onChange={(event) => setData((current) => ({ ...current, rules: current.rules.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item) }))} className="ml-2 rounded border p-2" /></label></div>)}</div><button onClick={() => void saveRules()} className="mt-5 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white">Save Availability</button>
      <form onSubmit={addBlackout} className="mt-8 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2"><h3 className="text-xl font-black sm:col-span-2">Add Blackout</h3><label className="font-bold">Date<input name="date" type="date" required className="mt-2 w-full rounded-xl border p-3" /></label><label className="flex items-center gap-2 font-bold"><input name="allDay" type="checkbox" defaultChecked />All day</label><label className="font-bold">Start time<input name="startTime" type="time" defaultValue="09:00" className="mt-2 w-full rounded-xl border p-3" /></label><label className="font-bold">End time<input name="endTime" type="time" defaultValue="10:00" className="mt-2 w-full rounded-xl border p-3" /></label><label className="font-bold sm:col-span-2">Internal reason<input name="reason" maxLength={300} className="mt-2 w-full rounded-xl border p-3" /></label><button className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white sm:col-span-2">Add Blackout</button></form><div className="mt-5 space-y-2">{data.exceptions.map((exception) => <div key={exception.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><span><b>{human(exception.startsAt, exception.endsAt)}</b>{exception.reason && <span className="block text-sm text-slate-600">{exception.reason}</span>}</span><button onClick={async () => { await fetch(`/api/admin/demo-scheduling/blackouts/${exception.id}`, { method: "DELETE" }); await load(); }} className="rounded-xl border border-red-300 px-4 py-2 font-bold text-red-700">Remove</button></div>)}</div>
    </section>
  </div></main>;
}
