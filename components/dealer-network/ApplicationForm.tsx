"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BUSINESS_TYPE_LABELS,
  ROLE_LABELS,
  type BusinessType,
  type DealerBrand,
  type MemberRole,
} from "@/lib/dealer-network/types";
import { US_STATES } from "@/lib/dealer-network/validation";

type CertificationDraft = {
  certificationName: string;
  brandOrManufacturer: string;
  issuingOrganization: string;
  dateEarned: string;
  expirationDate: string;
  file: File | null;
};
const emptyCertification = (): CertificationDraft => ({
  certificationName: "",
  brandOrManufacturer: "",
  issuingOrganization: "",
  dateEarned: "",
  expirationDate: "",
  file: null,
});
const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";

export default function ApplicationForm() {
  const [brands, setBrands] = useState<DealerBrand[]>([]);
  const [businessType, setBusinessType] = useState<BusinessType>(
    "robotic_mower_dealer",
  );
  const [hasCertifications, setHasCertifications] = useState<boolean | null>(
    null,
  );
  const [certifications, setCertifications] = useState<CertificationDraft[]>([
    emptyCertification(),
  ]);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const idempotencyKey = useRef("");
  useEffect(() => {
    fetch("/api/dealer-network/brands")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload) => setBrands(payload.brands ?? []))
      .catch(() =>
        setStatus("Brand choices could not be loaded. Please try again later."),
      );
  }, []);
  const repairShop =
    businessType === "general_repair_shop" ||
    businessType === "small_engine_repair_shop";
  const updateCertification = (
    index: number,
    key: keyof CertificationDraft,
    value: string | File | null,
  ) =>
    setCertifications((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    setErrors({});
    const form = new FormData(event.currentTarget);
    const payload = {
      applicantName: form.get("applicantName"),
      companyName: form.get("companyName"),
      phone: form.get("phone"),
      email: form.get("email"),
      addressLine1: form.get("addressLine1"),
      addressLine2: form.get("addressLine2"),
      city: form.get("city"),
      state: form.get("state"),
      zipCode: form.get("zipCode"),
      websiteUrl: form.get("websiteUrl"),
      role: form.get("role") as MemberRole,
      experience: form.get("experience"),
      serviceRegion: form.get("serviceRegion"),
      introduction: form.get("introduction"),
      businessType,
      otherBusinessType: form.get("otherBusinessType"),
      certificationAnswer: repairShop ? hasCertifications : null,
      brandsSold: form.getAll("brandsSold"),
      brandsServiced: form.getAll("brandsServiced"),
      certifications:
        repairShop && hasCertifications
          ? certifications.map((record) => ({
              certificationName: record.certificationName,
              brandOrManufacturer: record.brandOrManufacturer,
              issuingOrganization: record.issuingOrganization,
              dateEarned: record.dateEarned,
              expirationDate: record.expirationDate,
            }))
          : [],
      consent: form.get("consent") === "on",
      websiteFax: form.get("websiteFax"),
    };
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    const request = new FormData();
    request.set("application", JSON.stringify(payload));
    request.set("idempotencyKey", idempotencyKey.current);
    if (repairShop && hasCertifications)
      certifications.forEach((item, index) => {
        if (item.file) request.set(`certificationFile${index}`, item.file);
      });
    const response = await fetch("/api/dealer-network/applications", {
      method: "POST",
      body: request,
    });
    const result = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) {
      setErrors(result.errors ?? {});
      setStatus(result.error ?? "Please review the form and try again.");
      return;
    }
    setSubmitted(true);
    setStatus(
      result.warnings?.length
        ? `${result.message} ${result.warnings.join(" ")}`
        : result.message,
    );
  }
  if (submitted)
    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-slate-950">
        <h2 className="text-3xl font-black">Application received</h2>
        <p role="status" className="mt-4 leading-7">
          {status}
        </p>
        <p className="mt-3 leading-7 text-slate-600">
          Submitting an application does not create member access. IDS will
          review it and contact you by email.
        </p>
      </section>
    );
  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-2xl font-black">Professional information</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field
            label="Applicant Name"
            name="applicantName"
            error={errors.applicantName}
          />
          <Field
            label="Company Name"
            name="companyName"
            error={errors.companyName}
          />
          <Field
            label="Phone Number"
            name="phone"
            type="tel"
            error={errors.phone}
          />
          <Field
            label="Email Address"
            name="email"
            type="email"
            error={errors.email}
          />
          <Field
            label="Website or Social Media Page"
            name="websiteUrl"
            type="url"
            required={false}
            error={errors.websiteUrl}
          />
          <label className="font-bold">
            Role *
            <select name="role" required className={inputClass}>
              {(Object.entries(ROLE_LABELS) as Array<[MemberRole, string]>).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
            {errors.role && <ErrorText>{errors.role}</ErrorText>}
          </label>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-2xl font-black">Business address</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field
            label="Address Line 1"
            name="addressLine1"
            error={errors.addressLine1}
          />
          <Field label="Address Line 2" name="addressLine2" required={false} />
          <Field label="City" name="city" error={errors.city} />
          <label className="font-bold">
            State *
            <select
              name="state"
              required
              defaultValue=""
              className={inputClass}
            >
              <option value="" disabled>
                Choose state
              </option>
              {US_STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
            {errors.state && <ErrorText>{errors.state}</ErrorText>}
          </label>
          <Field
            label="ZIP Code"
            name="zipCode"
            inputMode="numeric"
            error={errors.zipCode}
          />
          <label className="font-bold">
            Country
            <input
              readOnly
              value="United States"
              className={`${inputClass} bg-slate-100`}
            />
          </label>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-2xl font-black">Business background</h2>
        <div className="mt-5 grid gap-5">
          <label className="font-bold">
            Professional business type *
            <select
              value={businessType}
              onChange={(event) => {
                setBusinessType(event.target.value as BusinessType);
                setHasCertifications(null);
              }}
              className={inputClass}
            >
              {(
                Object.entries(BUSINESS_TYPE_LABELS) as Array<
                  [BusinessType, string]
                >
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {errors.businessType && (
              <ErrorText>{errors.businessType}</ErrorText>
            )}
          </label>
          {businessType === "other" && (
            <Field
              label="Describe the business type"
              name="otherBusinessType"
              error={errors.otherBusinessType}
            />
          )}
          <TextArea
            label="Length of Time / Experience"
            name="experience"
            error={errors.experience}
          />
          <TextArea
            label="Service Region / Area"
            name="serviceRegion"
            error={errors.serviceRegion}
          />
          <TextArea
            label="Brief Introduction"
            name="introduction"
            rows={5}
            error={errors.introduction}
          />
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-2xl font-black">Brand relationships</h2>
        <p className="mt-2 text-slate-600">
          Keep brands you sell separate from brands you service or repair.
        </p>
        <div className="mt-6 grid gap-7 md:grid-cols-2">
          <BrandChecks title="Brands Sold" name="brandsSold" brands={brands} />
          <BrandChecks
            title="Brands Serviced / Repaired"
            name="brandsServiced"
            brands={brands}
          />
        </div>
        {errors.brandsSold && <ErrorText>{errors.brandsSold}</ErrorText>}
        {errors.brandsServiced && (
          <ErrorText>{errors.brandsServiced}</ErrorText>
        )}
      </section>
      {repairShop && (
        <section className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-6 md:p-8">
          <h2 className="text-2xl font-black">Robotic equipment training</h2>
          <fieldset className="mt-5">
            <legend className="font-bold">
              Do you currently hold any certifications, factory training, or
              manufacturer authorization for repairing robotic lawn equipment? *
            </legend>
            <div className="mt-3 flex gap-6">
              <label className="font-bold">
                <input
                  type="radio"
                  name="hasCertifications"
                  className="mr-2"
                  checked={hasCertifications === true}
                  onChange={() => setHasCertifications(true)}
                />
                Yes
              </label>
              <label className="font-bold">
                <input
                  type="radio"
                  name="hasCertifications"
                  className="mr-2"
                  checked={hasCertifications === false}
                  onChange={() => setHasCertifications(false)}
                />
                No
              </label>
            </div>
            {errors.certificationAnswer && (
              <ErrorText>{errors.certificationAnswer}</ErrorText>
            )}
          </fieldset>
          {hasCertifications && (
            <div className="mt-6 space-y-5">
              {certifications.map((item, index) => (
                <fieldset
                  key={index}
                  className="rounded-2xl border border-amber-200 bg-white p-5"
                >
                  <legend className="px-2 font-black">
                    Certification / Training {index + 1}
                  </legend>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Controlled
                      label="Certification / Training Name"
                      value={item.certificationName}
                      onChange={(value) =>
                        updateCertification(index, "certificationName", value)
                      }
                    />
                    <Controlled
                      label="Robotic Mower Brand or Manufacturer"
                      value={item.brandOrManufacturer}
                      onChange={(value) =>
                        updateCertification(index, "brandOrManufacturer", value)
                      }
                    />
                    <Controlled
                      label="Issuing Organization"
                      value={item.issuingOrganization}
                      onChange={(value) =>
                        updateCertification(index, "issuingOrganization", value)
                      }
                    />
                    <Controlled
                      label="Date Earned"
                      type="date"
                      required={false}
                      value={item.dateEarned}
                      onChange={(value) =>
                        updateCertification(index, "dateEarned", value)
                      }
                    />
                    <Controlled
                      label="Expiration Date"
                      type="date"
                      required={false}
                      value={item.expirationDate}
                      onChange={(value) =>
                        updateCertification(index, "expirationDate", value)
                      }
                    />
                    <label className="font-bold">
                      Supporting document/image{" "}
                      <span className="font-medium text-slate-500">
                        (optional, private)
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          updateCertification(
                            index,
                            "file",
                            event.target.files?.[0] ?? null,
                          )
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>
                  {certifications.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setCertifications((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      className="mt-4 font-bold text-red-700"
                    >
                      Remove record
                    </button>
                  )}
                </fieldset>
              ))}
              <button
                type="button"
                disabled={certifications.length >= 20}
                onClick={() =>
                  setCertifications((current) => [
                    ...current,
                    emptyCertification(),
                  ])
                }
                className="rounded-xl border border-slate-400 bg-white px-4 py-3 font-black"
              >
                Add Another Record
              </button>
              {errors.certifications && (
                <ErrorText>{errors.certifications}</ErrorText>
              )}
            </div>
          )}
        </section>
      )}
      <section className="rounded-3xl bg-slate-900 p-6 text-white md:p-8">
        <label className="flex items-start gap-3 font-bold">
          <input
            name="consent"
            type="checkbox"
            required
            className="mt-1 h-5 w-5"
          />
          <span>
            I understand that, if approved, my professional profile and contact
            information will be visible to other approved Dealer Network
            members. It will not be displayed to the general public.
          </span>
        </label>
        {errors.consent && <ErrorText>{errors.consent}</ErrorText>}
        <label className="sr-only">
          Leave this field empty
          <input name="websiteFax" tabIndex={-1} autoComplete="off" />
        </label>
        <button
          disabled={submitting}
          className="mt-6 min-h-14 w-full rounded-2xl bg-emerald-500 px-7 py-4 text-lg font-black text-slate-950 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit Application for IDS Review"}
        </button>
        {status && (
          <p role="status" className="mt-4 font-bold text-amber-200">
            {status}
          </p>
        )}
      </section>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = true,
  error,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  error?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="font-bold">
      {label}
      {required && " *"}
      <input
        name={name}
        type={type}
        required={required}
        maxLength={type === "email" ? 254 : 180}
        inputMode={inputMode}
        className={inputClass}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </label>
  );
}
function TextArea({
  label,
  name,
  rows = 3,
  error,
}: {
  label: string;
  name: string;
  rows?: number;
  error?: string;
}) {
  return (
    <label className="font-bold">
      {label} *
      <textarea
        name={name}
        required
        rows={rows}
        maxLength={name === "introduction" ? 3000 : 1000}
        className={inputClass}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </label>
  );
}
function Controlled({
  label,
  value,
  onChange,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="font-bold">
      {label}
      {required && " *"}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}
function BrandChecks({
  title,
  name,
  brands,
}: {
  title: string;
  name: string;
  brands: DealerBrand[];
}) {
  return (
    <fieldset>
      <legend className="text-lg font-black">{title}</legend>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-4">
        {brands.length ? (
          brands.map((brand) => (
            <label key={brand.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                name={name}
                value={brand.id}
                className="h-5 w-5"
              />
              <span className="font-bold">{brand.name}</span>
            </label>
          ))
        ) : (
          <p className="text-sm text-slate-500">
            No active brands are available.
          </p>
        )}
      </div>
    </fieldset>
  );
}
function ErrorText({ children }: { children: string }) {
  return (
    <span className="mt-2 block text-sm font-bold text-red-700" role="alert">
      {children}
    </span>
  );
}
