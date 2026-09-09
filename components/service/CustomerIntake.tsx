"use client";
import { useState } from "react";
import { Field, Notes, formValues, serviceButton, serviceFetch, serviceInput, useOperationKey, useServiceTask } from "./ui";

type Availability = { available: boolean; message: string };
const available: Availability = { available: true, message: "" };
const unavailable: Availability = { available: false, message: "" };
function UnavailableNotice({ value, label }: { value: Availability; label: string }) {
  if (value.available) return null;
  return <p className="rounded-xl bg-amber-50 p-4 font-semibold text-amber-950"><strong>CURRENTLY UNAVAILABLE:</strong> {value.message || `${label} is not accepting new requests right now.`}</p>;
}

export function SupportPurchase({ enabled, availability }: { enabled?: boolean; availability?: Availability }) {
  const state = availability ?? (enabled ? available : unavailable);
  const task = useServiceTask(); const { getKey: key } = useOperationKey();
  return <form className="space-y-4" onSubmit={event => { const data = formValues(event); void task.run(async () => {
    const input = { name: data.get("name"), email: data.get("email"), phone: data.get("phone"), acceptedTerms: data.get("terms") === "on" };
    const result = await serviceFetch<{ checkoutUrl: string }>("/api/remote-support/checkout", { ...input, key: key(input) }); window.location.assign(result.checkoutUrl);
  }, ""); }}><UnavailableNotice value={state} label="New Remote Support subscriptions" /><Field name="name" label="Name" autoComplete="name" required /><Field name="email" label="Email for your private billing link" type="email" autoComplete="email" required /><Field name="phone" label="Phone" type="tel" autoComplete="tel" required /><label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 size-5 shrink-0" name="terms" type="checkbox" required disabled={!state.available} />I authorize $100 now and $100 monthly under the subscription terms above, until cancelled. No partial-month refunds.</label>{task.status}<button className={serviceButton} disabled={!state.available || task.busy}>{task.busy ? "Opening secure checkout…" : state.available ? "Subscribe — $100/month" : "CURRENTLY UNAVAILABLE"}</button></form>;
}
export function ServiceIntake({ included = false, enabled, availability }: { included?: boolean; enabled?: boolean; availability?: { included?: Availability; remote?: Availability; onsite?: Availability } }) {
  const [kind, setKind] = useState("remote_service"); const [warranty, setWarranty] = useState("");
  const task = useServiceTask(); const { getKey: key } = useOperationKey();
  const legacy = enabled ? available : unavailable;
  const includedState = availability?.included ?? legacy;
  const selectedState = kind === "onsite_service" ? (availability?.onsite ?? legacy) : (availability?.remote ?? legacy);
  const intakeAvailable = included ? includedState.available : warranty !== "no" || selectedState.available;
  return <form className="space-y-4" onSubmit={event => { const data = formValues(event); void task.run(async () => {
    const base = { kind: included ? "included_support" : kind, name: data.get("name"), phone: data.get("phone"), issue: data.get("issue") };
    const input = included ? base : { ...base, email: data.get("email"), warranty, address: data.get("address") ?? "", equipment: Object.fromEntries(["manufacturer", "model", "serial", "purchaseDate", "purchasedFrom"].map(name => [name, data.get(name) ?? ""])) };
    const result = await serviceFetch<{ manageUrl: string }>("/api/service/cases", { ...input, key: key(input) }); window.location.assign(result.manageUrl);
  }, ""); }}>
    {included && <UnavailableNotice value={includedState} label="Existing-subscriber Remote Support assistance" />}
    {!included && <><Field label="Service type" name="kind"><select id="service-kind" name="kind" className={serviceInput} value={kind} onChange={e => setKind(e.target.value)}><option value="remote_service">Paid Remote Service</option><option value="onsite_service">On-Site Service</option></select></Field><UnavailableNotice value={selectedState} label={kind === "onsite_service" ? "On-Site Service" : "Paid Remote Service"} /><Field label="Is this equipment and required service covered under warranty?" name="warranty"><select name="warranty" className={serviceInput} required value={warranty} onChange={e => setWarranty(e.target.value)}><option value="">Choose an answer</option><option value="yes">Yes — request IDS verification</option><option value="no" disabled={!selectedState.available}>No — paid Service{selectedState.available ? "" : " (currently unavailable)"}</option><option value="unsure">Unsure — request IDS verification</option></select></Field>{warranty && warranty !== "no" && <p className="rounded-xl bg-amber-50 p-4 leading-7">IDS must verify coverage before paid authorization or scheduling. Physical warranty work defaults to shop drop-off. If not covered, you may choose an available paid Service option or cancel.</p>}</>}
    <Field name="name" label="Name" autoComplete="name" required /><Field name="phone" label="Phone" type="tel" autoComplete="tel" required />
    {!included && <Field name="email" label="Email for your private Service link" type="email" autoComplete="email" required />}
    <Notes name="issue" label="Brief Issue" required />
    {!included && <><fieldset className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="mb-3 font-bold">Equipment{warranty && warranty !== "no" ? " — required for warranty verification" : " (when available)"}</legend>{[["manufacturer", "Manufacturer"], ["model", "Model"], ["serial", "Serial number"], ["purchaseDate", "Approximate purchase date"], ["purchasedFrom", "Purchased from"]].map(([name, label]) => <Field key={name} name={name} label={label} required={Boolean(warranty && warranty !== "no")} />)}</fieldset>{kind === "onsite_service" && <Notes name="address" label="Service address" required={warranty === "no"} />}</>}
    {included && <p className="text-sm leading-6">Submitting this request does not use a session. IDS confirms your subscription and starts a session only when actual assistance begins. Photos may be added by staff later.</p>}
    {task.status}<button className={serviceButton} disabled={!intakeAvailable || task.busy}>{task.busy ? "Submitting…" : intakeAvailable ? "Submit request" : "CURRENTLY UNAVAILABLE"}</button>
  </form>;
}
