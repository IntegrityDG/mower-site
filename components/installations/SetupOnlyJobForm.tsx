"use client";
import InstallationAdminAction from "./InstallationAdminAction";
import SetupTerms from "./SetupTerms";

export default function SetupOnlyJobForm({ slots, onSaved, disabled }: { slots: { value: string; label: string }[]; onSaved: () => Promise<void>; disabled: boolean }) {
  return <details className="mt-4 rounded-xl bg-white p-5"><summary className="font-bold">Create Setup-only job for an existing mower owner</summary>
    <p className="my-3 text-sm">One internal Setup job using the existing calendar, ledger, and customer record. No Installation purchase or materials allowance. Pricing and payment still require IDS approval; this action sends no email or payment request.</p>
    <SetupTerms/>
    <InstallationAdminAction action="setup_only_create" title="Create Setup-only job" endpoint="/api/admin/installations/setup-only" onSaved={onSaved} disabled={disabled || !slots.length} fields={[
      { name: "name", label: "Customer name" }, { name: "email", label: "Customer email" }, { name: "phone", label: "Customer phone" },
      { name: "address", label: "Property address" }, { name: "equipment", label: "Existing mower / model" },
      { name: "internetAvailability", label: "Internet availability", kind: "select", options: ["yes", "no", "unsure"].map(value => ({ value, label: value })) },
      { name: "startAt", label: "Initial four-hour appointment", kind: "select", options: slots },
      { name: "responsibilitiesAcknowledged", label: "Customer authorized this work and confirmed safe access, an authorized adult, and property responsibilities", kind: "checkbox" },
      { name: "termsAcknowledged", label: "Customer accepted applicable Setup, safety, deposit, and cancellation terms", kind: "checkbox" },
    ]}/>
    {!slots.length && <p role="status" className="mt-3">Load current availability before creating a job.</p>}
  </details>;
}
