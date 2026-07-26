"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import CatalogHeader from "@/components/equipment/CatalogHeader";

const propertyTypes = [
  ["solar_farm", "Solar Farm"],
  ["golf_course", "Golf Course"],
  ["municipal_park", "City or Municipal Park"],
  ["private_estate", "Large Private Estate"],
  ["aviation", "Airport or Aviation Property"],
  ["commercial_campus", "Commercial Campus"],
  ["agricultural_utility", "Agricultural or Utility Property"],
  ["other_large_acreage", "Other Large-Acreage Property"],
] as const;

const states = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

type FormValues = Record<string, string>;

const initialValues: FormValues = {
  organizationName: "", contactName: "", email: "", phone: "",
  preferredContactMethod: "", propertyType: "", propertyAddress: "",
  city: "", state: "", zipCode: "", totalAcreage: "", mowingAcreage: "",
  terrainDescription: "", maximumSlopes: "", vegetationConditions: "",
  mowingFrequency: "", availablePower: "", chargingStrategy: "",
  obstaclesAndAccess: "", connectivity: "", deploymentTimeframe: "",
  currentEquipment: "", currentLaborBurden: "", expectedMachineCount: "",
  modelInterest: "recommend", securityRestrictions: "", additionalNotes: "",
};

const modelInterests = new Set(["recommend", "m1500_sd", "m1500_rd", "pro_m3000"]);

export default function PandagProjectQuotePage() {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const requestedModel = new URLSearchParams(window.location.search).get("model");
    if (requestedModel && modelInterests.has(requestedModel)) {
      setValues((current) => ({ ...current, modelInterest: requestedModel }));
    }
  }, []);

  function update(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const response = await fetch("/api/pandag/project-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to submit the project request.");
      router.push("/pandag/project-quote/received");
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Unable to submit the project request.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader salesMode="quote_only" />
      <main>
        <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white sm:px-8">
          <div className="mx-auto max-w-5xl">
            <Link href="/equipment/pandag-g1" className="font-bold text-emerald-300">Back to Pandag G1</Link>
            <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-emerald-400">Commercial Project Intake</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Request a Pandag project review</h1>
            <p className="mt-6 max-w-4xl text-lg leading-8 text-slate-200">
              This form begins a commercial site and operating-requirements review. No purchase or payment occurs here. Model interest is non-binding; IDS will recommend the final equipment configuration and provide pricing after reviewing the project.
            </p>
          </div>
        </section>

        <form onSubmit={submit} className="mx-auto max-w-5xl space-y-10 px-5 py-12 sm:px-8">
          <FormSection title="Organization and contact">
            <TextField label="Organization or customer name" name="organizationName" value={values.organizationName} onChange={update} required />
            <TextField label="Contact name" name="contactName" value={values.contactName} onChange={update} required />
            <TextField label="Email" name="email" type="email" value={values.email} onChange={update} required />
            <TextField label="Phone" name="phone" type="tel" value={values.phone} onChange={update} required />
            <SelectField label="Preferred contact method" name="preferredContactMethod" value={values.preferredContactMethod} onChange={update} required options={[["", "Choose a method"], ["email", "Email"], ["phone", "Phone"], ["either", "Email or phone"]]} />
          </FormSection>

          <FormSection title="Property">
            <SelectField label="Property type" name="propertyType" value={values.propertyType} onChange={update} required options={[["", "Choose a property type"], ...propertyTypes]} />
            <TextField label="Property address" name="propertyAddress" value={values.propertyAddress} onChange={update} required wide />
            <TextField label="City" name="city" value={values.city} onChange={update} required />
            <SelectField label="State" name="state" value={values.state} onChange={update} required options={[["", "Choose a state"], ...states.map((state) => [state, state] as const)]} />
            <TextField label="ZIP code" name="zipCode" value={values.zipCode} onChange={update} required />
            <TextField label="Total property acreage" name="totalAcreage" type="number" min="0.01" step="0.01" value={values.totalAcreage} onChange={update} required />
            <TextField label="Approximate acreage requiring mowing" name="mowingAcreage" type="number" min="0.01" step="0.01" value={values.mowingAcreage} onChange={update} required />
            <TextArea label="Terrain description" name="terrainDescription" value={values.terrainDescription} onChange={update} required />
            <TextField label="Estimated maximum slopes (optional)" name="maximumSlopes" value={values.maximumSlopes} onChange={update} />
            <TextArea label="Typical vegetation or mowing conditions" name="vegetationConditions" value={values.vegetationConditions} onChange={update} required />
            <TextField label="Desired mowing frequency" name="mowingFrequency" value={values.mowingFrequency} onChange={update} required />
          </FormSection>

          <FormSection title="Power, charging, and site access">
            <TextArea label="Available electrical power" name="availablePower" value={values.availablePower} onChange={update} required />
            <TextArea label="Charging location or charging strategy" name="chargingStrategy" value={values.chargingStrategy} onChange={update} required />
            <TextArea label="Major obstacles, restricted areas, or access concerns" name="obstaclesAndAccess" value={values.obstaclesAndAccess} onChange={update} required />
            <TextArea label="Cellular or internet availability" name="connectivity" value={values.connectivity} onChange={update} required />
            <TextArea label="Security or access restrictions (optional)" name="securityRestrictions" value={values.securityRestrictions} onChange={update} />
          </FormSection>

          <FormSection title="Operations and timing">
            <TextField label="Desired deployment timeframe" name="deploymentTimeframe" value={values.deploymentTimeframe} onChange={update} required />
            <TextArea label="Current mowing equipment (optional)" name="currentEquipment" value={values.currentEquipment} onChange={update} />
            <TextArea label="Current mowing labor or operating burden (optional)" name="currentLaborBurden" value={values.currentLaborBurden} onChange={update} />
            <TextField label="Expected number of machines (optional)" name="expectedMachineCount" value={values.expectedMachineCount} onChange={update} />
            <SelectField label="Preferred or interested model (non-binding)" name="modelInterest" value={values.modelInterest} onChange={update} required options={[["recommend", "Not sure — recommend a model"], ["m1500_sd", "Pandag G1 M1500 SD"], ["m1500_rd", "Pandag G1 M1500 RD"], ["pro_m3000", "Pandag G1 PRO M3000"]]} />
            <TextArea label="Additional project notes" name="additionalNotes" value={values.additionalNotes} onChange={update} required wide />
          </FormSection>

          <div className="rounded-[2rem] bg-slate-950 p-7 text-white">
            <p className="leading-7 text-slate-300">Submitting this form requests project review only. It does not select a final model, authorize a purchase, or collect payment.</p>
            <button type="submit" disabled={status === "submitting"} className="mt-5 rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">
              {status === "submitting" ? "Submitting Project Request..." : "Request a Custom Project Quote"}
            </button>
            {status === "error" && <p className="mt-4 rounded-xl bg-red-950/60 p-4 font-semibold text-red-100">{error}</p>}
          </div>
        </form>
      </main>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="text-2xl font-black">{title}</h2><div className="mt-6 grid gap-6 md:grid-cols-2">{children}</div></section>;
}

type FieldProps = { label: string; name: string; value: string; onChange: (name: string, value: string) => void; required?: boolean; wide?: boolean };

function TextField({ label, name, value, onChange, required, wide, type = "text", min, step }: FieldProps & { type?: string; min?: string; step?: string }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="font-bold">{label}</span><input name={name} type={type} min={min} step={step} value={value} onChange={(event) => onChange(name, event.target.value)} required={required} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>;
}

function TextArea({ label, name, value, onChange, required, wide }: FieldProps) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="font-bold">{label}</span><textarea name={name} value={value} onChange={(event) => onChange(name, event.target.value)} required={required} rows={5} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>;
}

function SelectField({ label, name, value, onChange, required, options }: FieldProps & { options: readonly (readonly [string, string])[] }) {
  return <label><span className="font-bold">{label}</span><select name={name} value={value} onChange={(event) => onChange(name, event.target.value)} required={required} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
