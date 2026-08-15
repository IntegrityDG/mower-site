"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  LOCKED_MEMBER_MESSAGE,
  ROLE_LABELS,
  type AccountState,
  type DealerBrand,
  type DirectoryResult,
  type MemberProfile,
} from "@/lib/dealer-network/types";
import { US_STATES } from "@/lib/dealer-network/validation";

type Tab = "directory" | "profile" | "suggestions";
type Suggestion = {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};
const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";

export default function MemberPortal() {
  const [account, setAccount] = useState<AccountState | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState<Tab>("directory"),
    [message, setMessage] = useState("");
  const [profile, setProfile] = useState<MemberProfile | null>(null),
    [brands, setBrands] = useState<DealerBrand[]>([]),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [results, setResults] = useState<DirectoryResult[]>([]),
    [searched, setSearched] = useState(false);
  const searchForm = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/dealer-network/auth/session");
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const payload = await response.json();
    setAccount(payload.account);
    setLoading(false);
    if (!payload.account.effectiveLocked) {
      const [profileResponse, brandResponse, suggestionResponse] =
        await Promise.all([
          fetch("/api/dealer-network/member/profile"),
          fetch("/api/dealer-network/brands"),
          fetch("/api/dealer-network/member/suggestions"),
        ]);
      if (profileResponse.ok)
        setProfile((await profileResponse.json()).profile);
      if (brandResponse.ok)
        setBrands((await brandResponse.json()).brands ?? []);
      if (suggestionResponse.ok)
        setSuggestions((await suggestionResponse.json()).suggestions ?? []);
    }
  }, []);
  useEffect(() => {
    // The initial fetch synchronizes this client-only portal with its server session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function signOut() {
    await fetch("/api/dealer-network/auth/logout", { method: "DELETE" });
    window.location.href = "/dealer-tech-resources/login";
  }
  if (loading)
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading member portal…
      </main>
    );
  if (!account)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="max-w-md rounded-3xl bg-white p-8 text-slate-950">
          <h1 className="text-3xl font-black">Member session required</h1>
          <a
            href="/dealer-tech-resources/login"
            className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-black text-white"
          >
            Member Login
          </a>
        </div>
      </main>
    );
  if (account.effectiveLocked)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-amber-300/40 bg-slate-900 p-9 text-center">
          <p className="text-sm font-black uppercase tracking-[.2em] text-amber-300">
            Member Account
          </p>
          <h1 className="mt-4 text-3xl font-black">{LOCKED_MEMBER_MESSAGE}</h1>
          <button
            onClick={() => void signOut()}
            className="mt-8 rounded-xl bg-white px-6 py-3 font-black text-slate-950"
          >
            Sign Out
          </button>
        </section>
      </main>
    );
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b bg-slate-950 px-5 py-6 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">
              Dealer &amp; Tech Community Resources
            </p>
            <h1 className="mt-1 text-2xl font-black">
              Welcome, {account.memberName}
            </h1>
            <p className="text-sm text-slate-300">{account.companyName}</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-xl border border-white/30 px-4 py-3 font-black"
          >
            Sign Out
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-7 md:px-8">
        <nav aria-label="Member portal" className="flex flex-wrap gap-2">
          {(
            [
              ["directory", "Directory Search"],
              ["profile", "My Profile"],
              ["suggestions", "Contact IDS / Suggest an Improvement"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-xl px-4 py-3 font-black ${tab === value ? "bg-emerald-600 text-white" : "border bg-white"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-white p-4 font-bold shadow-sm"
          >
            {message}
          </p>
        )}
        {tab === "directory" && (
          <DirectoryPanel
            formRef={searchForm}
            brands={brands}
            results={results}
            searched={searched}
            onResults={(value) => {
              setResults(value);
              setSearched(true);
            }}
            onMessage={setMessage}
          />
        )}{" "}
        {tab === "profile" && profile && (
          <ProfilePanel
            profile={profile}
            brands={brands}
            onProfile={setProfile}
            onMessage={setMessage}
          />
        )}{" "}
        {tab === "suggestions" && (
          <SuggestionsPanel
            suggestions={suggestions}
            onSuggestions={setSuggestions}
            onMessage={setMessage}
          />
        )}
      </div>
    </main>
  );
}

function DirectoryPanel({
  formRef,
  brands,
  results,
  searched,
  onResults,
  onMessage,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  brands: DealerBrand[];
  results: DirectoryResult[];
  searched: boolean;
  onResults: (value: DirectoryResult[]) => void;
  onMessage: (value: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  async function search(
    near?: "business" | "zip" | "coordinates",
    coordinates?: GeolocationCoordinates,
  ) {
    const form = formRef.current;
    if (!form) return;
    setSearching(true);
    onMessage("");
    const data = new FormData(form),
      params = new URLSearchParams();
    for (const key of [
      "query",
      "role",
      "brandId",
      "relationshipType",
      "region",
      "zip",
      "areaCode",
      "nearZip",
      "radius",
    ]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    if (near) params.set("near", near);
    if (coordinates) {
      params.set("latitude", String(coordinates.latitude));
      params.set("longitude", String(coordinates.longitude));
    }
    const response = await fetch(
      `/api/dealer-network/member/directory?${params}`,
    );
    const payload = await response.json().catch(() => ({}));
    setSearching(false);
    if (response.ok) onResults(payload.results ?? []);
    else onMessage(payload.error ?? "Search failed.");
  }
  function useLocation() {
    if (!navigator.geolocation) {
      onMessage(
        "Browser location is unavailable. Use ZIP or business location instead.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => void search("coordinates", position.coords),
      () =>
        onMessage(
          "Location permission was denied. Use ZIP or business location instead.",
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  return (
    <section className="mt-7">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">Directory Search</h2>
        <p className="mt-2 text-slate-600">
          Search approved, active, unlocked members. Street addresses and raw
          coordinates are never displayed.
        </p>
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
          className="mt-6 grid gap-4 md:grid-cols-3"
        >
          <label className="font-bold md:col-span-2">
            Member or Company
            <input name="query" className={inputClass} />
          </label>
          <label className="font-bold">
            Role
            <select name="role" className={inputClass}>
              <option value="">Any role</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="font-bold">
            Brand
            <select name="brandId" className={inputClass}>
              <option value="">Any brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="font-bold">
            Brand Relationship
            <select name="relationshipType" className={inputClass}>
              <option value="">Sold or Serviced</option>
              <option value="sold">Sold</option>
              <option value="serviced">Serviced / Repaired</option>
            </select>
          </label>
          <label className="font-bold">
            Region / Service Area
            <input name="region" className={inputClass} />
          </label>
          <label className="font-bold">
            ZIP Code
            <input
              name="zip"
              inputMode="numeric"
              maxLength={10}
              className={inputClass}
            />
          </label>
          <label className="font-bold">
            Area Code
            <input
              name="areaCode"
              inputMode="numeric"
              maxLength={3}
              className={inputClass}
            />
          </label>
          <label className="font-bold">
            Near ZIP Code
            <input
              name="nearZip"
              inputMode="numeric"
              maxLength={10}
              className={inputClass}
            />
          </label>
          <label className="font-bold">
            Radius
            <select name="radius" defaultValue="100" className={inputClass}>
              {[25, 50, 100, 250].map((radius) => (
                <option key={radius} value={radius}>
                  {radius} miles
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <button
              disabled={searching}
              className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white"
            >
              Search
            </button>
            <button
              type="button"
              disabled={searching}
              onClick={() => void search("business")}
              className="rounded-xl border px-5 py-3 font-black"
            >
              Use My Business Location
            </button>
            <button
              type="button"
              disabled={searching}
              onClick={() => void search("zip")}
              className="rounded-xl border px-5 py-3 font-black"
            >
              Search Near ZIP
            </button>
            <button
              type="button"
              disabled={searching}
              onClick={useLocation}
              className="rounded-xl border border-emerald-700 px-5 py-3 font-black text-emerald-800"
            >
              Use My Location
            </button>
            <button
              type="reset"
              onClick={() => {
                onResults([]);
              }}
              className="rounded-xl px-5 py-3 font-black text-slate-600"
            >
              Clear Filters
            </button>
          </div>
        </form>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {results.map((result) => (
          <DirectoryCard key={result.id} result={result} />
        ))}
        {searched && results.length === 0 && (
          <p className="rounded-3xl bg-white p-8 text-slate-600">
            No eligible members matched those filters. Clear one or more filters
            and try again.
          </p>
        )}
      </div>
    </section>
  );
}
function DirectoryCard({ result }: { result: DirectoryResult }) {
  return (
    <article className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex gap-4">
        {result.logoUrl ? (
          <Image
            src={result.logoUrl}
            alt={`${result.companyName} logo`}
            width={96}
            height={80}
            unoptimized
            className="h-20 w-24 rounded-xl border object-contain"
          />
        ) : (
          <div className="flex h-20 w-24 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">
            Company Logo
          </div>
        )}
        <div>
          <h3 className="text-2xl font-black">{result.companyName}</h3>
          <p className="font-bold text-emerald-700">
            {result.memberName} · {ROLE_LABELS[result.role]}
          </p>
          <p className="text-sm text-slate-600">
            {result.city}, {result.state}
            {result.distanceMiles !== null
              ? ` · ${result.distanceMiles} miles away`
              : ""}
          </p>
        </div>
      </div>
      <p className="mt-4 leading-7 text-slate-600">{result.introduction}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-black">Service Region</dt>
          <dd>{result.serviceRegion}</dd>
        </div>
        <div>
          <dt className="font-black">Experience</dt>
          <dd>{result.experience}</dd>
        </div>
        <div>
          <dt className="font-black">Phone</dt>
          <dd>
            <a
              href={`tel:${result.phone.replace(/\D/g, "")}`}
              className="text-emerald-700 underline"
            >
              {result.phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="font-black">Email</dt>
          <dd>
            <a
              href={`mailto:${result.email}`}
              className="break-all text-emerald-700 underline"
            >
              {result.email}
            </a>
          </dd>
        </div>
      </dl>
      {result.websiteUrl && (
        <a
          href={result.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex font-black text-emerald-700 underline"
        >
          Website / Social Page
        </a>
      )}
      <BrandList title="Brands Sold" items={result.brandsSold} />
      <BrandList
        title="Brands Serviced / Repaired"
        items={result.brandsServiced}
      />
    </article>
  );
}
function BrandList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
}) {
  return items.length ? (
    <div className="mt-4">
      <h4 className="text-sm font-black">{title}</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.id}
            className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"
          >
            {item.name}
          </span>
        ))}
      </div>
    </div>
  ) : null;
}

function ProfilePanel({
  profile,
  brands,
  onProfile,
  onMessage,
}: {
  profile: MemberProfile;
  brands: DealerBrand[];
  onProfile: (value: MemberProfile) => void;
  onMessage: (value: string) => void;
}) {
  const [brandId, setBrandId] = useState(""),
    [relationshipType, setRelationshipType] = useState("serviced"),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const value = Object.fromEntries(form.entries());
    const response = await fetch("/api/dealer-network/member/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      onMessage(
        payload.error ??
          Object.values(payload.errors ?? {}).join(" ") ??
          "Save failed.",
      );
      return;
    }
    onProfile(payload.profile);
    onMessage(
      payload.reauthenticate
        ? "Profile saved. Sign in again because your login or recovery identity changed."
        : "Profile saved. Role changes take effect immediately; new brand requests remain pending.",
    );
    if (payload.reauthenticate)
      window.location.href = "/dealer-tech-resources/login";
  }
  async function addBrand() {
    if (!brandId) return;
    const response = await fetch("/api/dealer-network/member/brands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandId, relationshipType }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      onProfile({ ...profile, brands: [...profile.brands, payload.brand] });
      onMessage("Brand affiliation submitted for IDS approval.");
      setBrandId("");
    } else onMessage(payload.error ?? "Brand request failed.");
  }
  async function removeBrand(id: string) {
    const response = await fetch(`/api/dealer-network/member/brands/${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      onProfile({
        ...profile,
        brands: profile.brands.filter((brand) => brand.id !== id),
      });
      onMessage("Brand affiliation removed.");
    } else onMessage("Brand affiliation could not be removed.");
  }
  async function uploadLogo(file: File) {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/dealer-network/member/logo", {
      method: "POST",
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      onProfile({ ...profile, logoUrl: payload.logoUrl });
      onMessage("Company logo updated.");
    } else onMessage(payload.error ?? "Logo upload failed.");
  }
  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.6fr)]">
      <form
        key={`${profile.id}-${profile.phone}-${profile.email}`}
        onSubmit={save}
        className="rounded-3xl bg-white p-6 shadow-sm"
      >
        <h2 className="text-3xl font-black">My Profile</h2>
        <p className="mt-2 text-slate-600">
          Your approved professional fields appear to other eligible members. A
          role change needs no IDS approval.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ProfileField
            label="Member Name"
            name="memberName"
            value={profile.memberName}
          />
          <ProfileField
            label="Company Name"
            name="companyName"
            value={profile.companyName}
          />
          <ProfileField label="Phone" name="phone" value={profile.phone} />
          <ProfileField
            label="Email"
            name="email"
            type="email"
            value={profile.email}
          />
          <ProfileField
            label="Address Line 1"
            name="addressLine1"
            value={profile.addressLine1}
          />
          <ProfileField
            label="Address Line 2"
            name="addressLine2"
            required={false}
            value={profile.addressLine2 ?? ""}
          />
          <ProfileField label="City" name="city" value={profile.city} />
          <label className="font-bold">
            State
            <select
              name="state"
              defaultValue={profile.state}
              className={inputClass}
            >
              {US_STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <ProfileField
            label="ZIP Code"
            name="zipCode"
            value={profile.zipCode}
          />
          <ProfileField
            label="Website / Social"
            name="websiteUrl"
            type="url"
            required={false}
            value={profile.websiteUrl ?? ""}
          />
          <label className="font-bold">
            Role
            <select
              name="role"
              defaultValue={profile.role}
              className={inputClass}
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <ProfileField
            label="Experience"
            name="experience"
            value={profile.experience}
          />
          <label className="font-bold md:col-span-2">
            Service Region
            <textarea
              name="serviceRegion"
              defaultValue={profile.serviceRegion}
              rows={3}
              className={inputClass}
            />
          </label>
          <label className="font-bold md:col-span-2">
            Brief Introduction
            <textarea
              name="introduction"
              defaultValue={profile.introduction}
              rows={5}
              className={inputClass}
            />
          </label>
          <label className="font-bold md:col-span-2">
            Current PIN{" "}
            <span className="font-medium text-slate-500">
              (required only when changing phone or email)
            </span>
            <input
              name="currentPin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className={inputClass}
            />
          </label>
        </div>
        <button
          disabled={busy}
          className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white"
        >
          {busy ? "Saving…" : "Save Profile"}
        </button>
      </form>
      <aside className="space-y-6">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Company Logo</h2>
          {profile.logoUrl && (
            <Image
              src={profile.logoUrl}
              alt={`${profile.companyName} logo`}
              width={480}
              height={128}
              unoptimized
              className="mt-4 h-32 w-full rounded-xl border object-contain"
            />
          )}
          <label className="mt-4 block cursor-pointer rounded-xl border p-3 text-center font-black">
            Upload JPEG, PNG, or WebP
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadLogo(file);
                event.target.value = "";
              }}
            />
          </label>
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Brand Affiliations</h2>
          <p className="mt-2 text-sm text-slate-600">
            New affiliations remain pending and are not searchable until IDS
            approves them. Removals take effect immediately.
          </p>
          <div className="mt-4 space-y-2">
            {profile.brands.map((brand) => (
              <div
                key={brand.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"
              >
                <span>
                  <b>{brand.brandName}</b>
                  <span className="block capitalize text-slate-500">
                    {brand.relationshipType} · {brand.approvalStatus}
                  </span>
                </span>
                <button
                  onClick={() => void removeBrand(brand.id)}
                  className="font-black text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <select
            aria-label="Brand"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className={inputClass}
          >
            <option value="">Choose active brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Relationship"
            value={relationshipType}
            onChange={(event) => setRelationshipType(event.target.value)}
            className={inputClass}
          >
            <option value="sold">Sold</option>
            <option value="serviced">Serviced / Repaired</option>
          </select>
          <button
            type="button"
            onClick={() => void addBrand()}
            className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white"
          >
            Request Brand Affiliation
          </button>
        </section>
      </aside>
    </section>
  );
}
function ProfileField({
  label,
  name,
  value,
  type = "text",
  required = true,
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="font-bold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={value}
        className={inputClass}
      />
    </label>
  );
}

function SuggestionsPanel({
  suggestions,
  onSuggestions,
  onMessage,
}: {
  suggestions: Suggestion[];
  onSuggestions: (value: Suggestion[]) => void;
  onMessage: (value: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const response = await fetch("/api/dealer-network/member/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data.entries())),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      onSuggestions([payload.suggestion, ...suggestions]);
      form.reset();
      onMessage("Suggestion sent to IDS.");
    } else
      onMessage(
        payload.error ??
          Object.values(payload.errors ?? {}).join(" ") ??
          "Suggestion failed.",
      );
  }
  return (
    <section className="mt-7 grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">
          Contact IDS / Suggest an Improvement
        </h2>
        <p className="mt-2 text-slate-600">
          Your submission is tied to your authenticated member account and
          company.
        </p>
        <label className="mt-5 block font-bold">
          Type
          <select name="category" className={inputClass}>
            <option value="new_brand">New Brand Request</option>
            <option value="database_correction">Database Correction</option>
            <option value="member_information">
              Member Information Concern
            </option>
            <option value="search_improvement">
              Search / Filter Suggestion
            </option>
            <option value="portal_improvement">Portal Improvement</option>
            <option value="inaccurate_information">
              Inaccurate Information Report
            </option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="mt-4 block font-bold">
          Subject
          <input
            name="subject"
            required
            maxLength={180}
            className={inputClass}
          />
        </label>
        <label className="mt-4 block font-bold">
          Message
          <textarea
            name="message"
            required
            rows={7}
            maxLength={3000}
            className={inputClass}
          />
        </label>
        <button className="mt-5 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white">
          Submit to IDS
        </button>
      </form>
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">My Submissions</h2>
        <div className="mt-5 space-y-3">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="rounded-2xl border p-4">
              <div className="flex justify-between gap-2">
                <h3 className="font-black">{suggestion.subject}</h3>
                <span className="text-xs font-black uppercase text-emerald-700">
                  {suggestion.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {suggestion.message}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {new Date(suggestion.created_at).toLocaleString()}
              </p>
            </article>
          ))}
          {suggestions.length === 0 && (
            <p className="text-slate-500">
              You have not submitted any suggestions.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
