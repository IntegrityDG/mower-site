"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  APPLICATION_STATUS_LABELS,
  BUSINESS_TYPE_LABELS,
  MEMBER_STATUS_LABELS,
  ROLE_LABELS,
  type ApplicationStatus,
  type BusinessType,
  type DealerBrand,
  type MemberRole,
  type MemberStatus,
} from "@/lib/dealer-network/types";
import { US_STATES } from "@/lib/dealer-network/validation";

type Tab = "applications" | "members" | "brands" | "suggestions" | "security";
type Notice = {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
};
type Application = {
  id: string;
  applicantName: string;
  companyName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  websiteUrl: string | null;
  role: MemberRole;
  experience: string;
  serviceRegion: string;
  introduction: string;
  businessType: BusinessType;
  otherBusinessType: string | null;
  certificationAnswer: boolean | null;
  duplicateMatches: Array<{
    recordType: string;
    id: string;
    companyName: string;
    reason: string;
  }>;
  status: ApplicationStatus;
  reviewMessage: string | null;
  createdAt: string;
  brandsSold: Array<{ id: string; name: string }>;
  brandsServiced: Array<{ id: string; name: string }>;
  certifications: Array<{
    id: string;
    certificationName: string;
    brandOrManufacturer: string;
    issuingOrganization: string;
    dateEarned: string | null;
    expirationDate: string | null;
    evidenceUrl: string | null;
  }>;
  notifications: Notice[];
  memberId: string | null;
};
type Affiliation = {
  id: string;
  relationship_type: string;
  approval_status: string;
  requested_at: string;
  brand: { id: string; name: string; status: string };
};
type Member = {
  id: string;
  applicationId: string;
  memberName: string;
  companyName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  websiteUrl: string | null;
  role: MemberRole;
  experience: string;
  serviceRegion: string;
  introduction: string;
  status: MemberStatus;
  accountLocked: boolean;
  activatedAt: string | null;
  suspendedAt: string | null;
  archivedAt: string | null;
  lastLoginAt: string | null;
  brands: Affiliation[];
  security: {
    emailVerifiedAt: string | null;
    failedAttempts: number;
    temporaryLockUntil: string | null;
    activeSessionCount: number;
    geocodeStatus: string;
    geocodedAt: string | null;
    geocodeError: string | null;
  } | null;
};
type Suggestion = {
  id: string;
  member_id: string;
  company_name_snapshot: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  member: { member_name: string; email: string } | null;
};
type Dashboard = {
  applications: Application[];
  members: Member[];
  brands: DealerBrand[];
  suggestions: Suggestion[];
  notifications: Array<
    Notice & {
      event_key: string;
      application_id: string | null;
      member_id: string | null;
    }
  >;
  pendingApplicationCount: number;
};
const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";

export default function DealerNetworkAdmin() {
  const [data, setData] = useState<Dashboard | null>(null),
    [authed, setAuthed] = useState<boolean | null>(null),
    [tab, setTab] = useState<Tab>("applications"),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/dealer-network");
    if (response.status === 401) {
      setAuthed(false);
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setData(payload);
      setAuthed(true);
    } else setMessage(payload.error ?? "Admin data unavailable.");
  }, []);
  useEffect(() => {
    // The initial fetch synchronizes this client-only admin surface with its authenticated server state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/reviews/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: form.get("password") }),
    });
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    } else setMessage("Invalid password.");
  }
  async function signOut() {
    await fetch("/api/admin/reviews/login", { method: "DELETE" });
    setAuthed(false);
    setData(null);
  }
  if (authed === null)
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        Loading Dealer Network administration…
      </main>
    );
  if (!authed)
    return (
      <main className="min-h-screen bg-slate-100 p-5">
        <form
          onSubmit={login}
          className="mx-auto mt-16 max-w-md rounded-3xl bg-white p-8 shadow-sm"
        >
          <p className="font-black uppercase tracking-[.2em] text-emerald-700">
            IDS Admin
          </p>
          <h1 className="mt-2 text-4xl font-black">Dealer Network</h1>
          <label className="mt-6 block font-bold">
            Admin password
            <input
              name="password"
              type="password"
              required
              className={inputClass}
            />
          </label>
          <button className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">
            Sign In
          </button>
          {message && (
            <p role="alert" className="mt-4 text-red-700">
              {message}
            </p>
          )}
        </form>
      </main>
    );
  if (!data) return null;
  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">
              IDS Admin
            </p>
            <h1 className="mt-1 text-4xl font-black">
              Dealer &amp; Tech Community
            </h1>
            <p className="mt-2 text-slate-600">
              {data.pendingApplicationCount} pending application
              {data.pendingApplicationCount === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-xl border bg-white px-4 py-3 font-black"
          >
            Sign Out
          </button>
        </div>
        <nav
          aria-label="Dealer Network administration"
          className="mt-7 flex flex-wrap gap-2"
        >
          {(
            [
              [
                "applications",
                `Applications (${data.pendingApplicationCount})`,
              ],
              ["members", "Members"],
              ["brands", "Brands"],
              ["suggestions", "Suggestions"],
              ["security", "Account / Security"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-xl px-4 py-3 font-black ${tab === value ? "bg-slate-950 text-white" : "border bg-white"}`}
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
        {tab === "applications" && (
          <ApplicationsTab
            applications={data.applications}
            reload={load}
            notify={setMessage}
          />
        )}{" "}
        {tab === "members" && (
          <MembersTab
            members={data.members}
            reload={load}
            notify={setMessage}
          />
        )}{" "}
        {tab === "brands" && (
          <BrandsTab brands={data.brands} reload={load} notify={setMessage} />
        )}{" "}
        {tab === "suggestions" && (
          <SuggestionsTab
            suggestions={data.suggestions}
            reload={load}
            notify={setMessage}
          />
        )}{" "}
        {tab === "security" && (
          <SecurityTab
            members={data.members}
            notifications={data.notifications}
            reload={load}
            notify={setMessage}
          />
        )}
      </div>
    </main>
  );
}

function ApplicationsTab({
  applications,
  reload,
  notify,
}: {
  applications: Application[];
  reload: () => Promise<void>;
  notify: (value: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(applications[0]?.id ?? "");
  const selected =
    applications.find((item) => item.id === selectedId) ?? applications[0];
  const [message, setMessage] = useState("");
  async function action(action: "approve" | "deny" | "more_information") {
    if (
      (action === "deny" || action === "more_information") &&
      !message.trim()
    ) {
      notify("A message is required.");
      return;
    }
    const response = await fetch(
      `/api/admin/dealer-network/applications/${selected.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, message }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    notify(
      response.ok
        ? `${action.replace("_", " ")} completed. Email delivery is tracked separately.`
        : (payload.error ?? "Application update failed."),
    );
    if (response.ok) {
      setMessage("");
      await reload();
    }
  }
  if (!selected)
    return (
      <section className="mt-7 rounded-3xl bg-white p-8">
        No applications.
      </section>
    );
  return (
    <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(18rem,.65fr)_minmax(0,1.35fr)]">
      <div className="space-y-3">
        {applications.map((application) => (
          <button
            key={application.id}
            onClick={() => setSelectedId(application.id)}
            className={`w-full rounded-2xl p-4 text-left shadow-sm ${application.id === selected.id ? "bg-emerald-700 text-white" : "bg-white"}`}
          >
            <span className="flex justify-between gap-2">
              <b>{application.companyName}</b>
              <span className="text-xs font-black uppercase">
                {APPLICATION_STATUS_LABELS[application.status]}
              </span>
            </span>
            <span className="mt-1 block text-sm">
              {application.applicantName} ·{" "}
              {new Date(application.createdAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
      <article className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-3xl font-black">{selected.companyName}</h2>
            <p className="font-bold text-emerald-700">
              {selected.applicantName} · {ROLE_LABELS[selected.role]}
            </p>
          </div>
          <StatusBadge>
            {APPLICATION_STATUS_LABELS[selected.status]}
          </StatusBadge>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <Detail label="Phone" value={selected.phone} />
          <Detail label="Email" value={selected.email} />
          <Detail
            label="Full Address"
            value={[
              selected.addressLine1,
              selected.addressLine2,
              `${selected.city}, ${selected.state} ${selected.zipCode}`,
              selected.country,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <Detail
            label="Website / Social"
            value={selected.websiteUrl ?? "Not provided"}
          />
          <Detail label="Experience" value={selected.experience} />
          <Detail label="Service Region" value={selected.serviceRegion} />
          <Detail
            label="Business Type"
            value={`${BUSINESS_TYPE_LABELS[selected.businessType]}${selected.otherBusinessType ? ` — ${selected.otherBusinessType}` : ""}`}
          />
          <Detail
            label="Certification / Training Answer"
            value={
              selected.certificationAnswer === null
                ? "Not applicable"
                : selected.certificationAnswer
                  ? "Yes"
                  : "No"
            }
          />
          <div className="sm:col-span-2">
            <Detail label="Introduction" value={selected.introduction} />
          </div>
        </dl>
        <BrandSummary title="Brands Sold" items={selected.brandsSold} />
        <BrandSummary
          title="Brands Serviced / Repaired"
          items={selected.brandsServiced}
        />
        <section className="mt-6">
          <h3 className="text-lg font-black">Certifications / Training</h3>
          <div className="mt-3 space-y-3">
            {selected.certifications.map((item) => (
              <div key={item.id} className="rounded-xl border p-4">
                <b>{item.certificationName}</b>
                <p className="text-sm text-slate-600">
                  {item.brandOrManufacturer} · {item.issuingOrganization}
                </p>
                <p className="text-xs text-slate-500">
                  Earned: {item.dateEarned ?? "Not supplied"} · Expires:{" "}
                  {item.expirationDate ?? "Not supplied"}
                </p>
                {item.evidenceUrl && (
                  <a
                    href={item.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex font-black text-emerald-700 underline"
                  >
                    Open private evidence
                  </a>
                )}
              </div>
            ))}
            {!selected.certifications.length && (
              <p className="text-sm text-slate-500">
                No certification records.
              </p>
            )}
          </div>
        </section>
        <section className="mt-6">
          <h3 className="text-lg font-black">Possible Duplicates</h3>
          {selected.duplicateMatches.length ? (
            <div className="mt-3 space-y-2">
              {selected.duplicateMatches.map((duplicate) => (
                <p
                  key={`${duplicate.recordType}-${duplicate.id}`}
                  className="rounded-xl bg-amber-50 p-3 text-sm"
                >
                  <b>
                    {duplicate.recordType}: {duplicate.companyName}
                  </b>{" "}
                  · matched {duplicate.reason}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No likely duplicate phone, email, or company matches were found at
              submission.
            </p>
          )}
        </section>
        <NotificationList notices={selected.notifications} />
        {(selected.status === "pending" ||
          selected.status === "more_information_requested") && (
          <section className="mt-7 space-y-3 border-t pt-6">
            <button
              onClick={() => void action("approve")}
              className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white"
            >
              Approve &amp; Send Activation
            </button>
            <label className="block font-bold">
              Required message for More Information or Denial
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={5}
                maxLength={3000}
                className={inputClass}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {selected.status === "pending" && (
                <button
                  onClick={() => void action("more_information")}
                  className="rounded-xl border border-amber-500 px-5 py-3 font-black text-amber-800"
                >
                  Request More Information
                </button>
              )}
              <button
                onClick={() => void action("deny")}
                className="rounded-xl bg-red-700 px-5 py-3 font-black text-white"
              >
                Deny
              </button>
            </div>
          </section>
        )}
        {selected.reviewMessage && (
          <section className="mt-6 rounded-xl bg-slate-100 p-4">
            <h3 className="font-black">Stored IDS Message</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {selected.reviewMessage}
            </p>
          </section>
        )}
      </article>
    </section>
  );
}

function MembersTab({
  members,
  reload,
  notify,
}: {
  members: Member[];
  reload: () => Promise<void>;
  notify: (value: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [selectedId, setSelectedId] = useState(members[0]?.id ?? "");
  const shown = useMemo(
    () =>
      members.filter((member) =>
        `${member.memberName} ${member.companyName} ${member.phone} ${member.email}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [members, query],
  );
  const selected =
    members.find((member) => member.id === selectedId) ?? shown[0];
  async function patch(body: object) {
    if (!selected) return;
    const response = await fetch(
      `/api/admin/dealer-network/members/${selected.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json().catch(() => ({}));
    notify(
      response.ok
        ? "Member updated."
        : (payload.error ??
            Object.values(payload.errors ?? {}).join(" ") ??
            "Member update failed."),
    );
    if (response.ok) await reload();
  }
  async function decide(id: string, decision: "approve" | "reject") {
    const response = await fetch(
      `/api/admin/dealer-network/member-brands/${id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      },
    );
    notify(
      response.ok
        ? `Brand affiliation ${decision}d.`
        : "Brand decision failed.",
    );
    if (response.ok) await reload();
  }
  if (!selected)
    return (
      <section className="mt-7 rounded-3xl bg-white p-8">No members.</section>
    );
  return (
    <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(18rem,.65fr)_minmax(0,1.35fr)]">
      <div>
        <label className="font-bold">
          Search Members
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={inputClass}
          />
        </label>
        <div className="mt-4 space-y-3">
          {shown.map((member) => (
            <button
              key={member.id}
              onClick={() => setSelectedId(member.id)}
              className={`w-full rounded-2xl p-4 text-left shadow-sm ${member.id === selected.id ? "bg-slate-950 text-white" : "bg-white"}`}
            >
              <b>{member.companyName}</b>
              <span className="mt-1 block text-sm">
                {member.memberName} · {MEMBER_STATUS_LABELS[member.status]} ·{" "}
                {member.accountLocked ? "Locked" : "Unlocked"}
              </span>
            </button>
          ))}
        </div>
      </div>
      <article className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">{selected.companyName}</h2>
        <p className="font-bold text-emerald-700">
          {selected.memberName} · {ROLE_LABELS[selected.role]}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Member Status
            </p>
            <p className="mt-1 text-xl font-black">
              {MEMBER_STATUS_LABELS[selected.status]}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Account Access
            </p>
            <p className="mt-1 text-xl font-black">
              {selected.accountLocked ? "Locked" : "Unlocked"}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Locked members may sign in but will only see the IDS contact
              message.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() =>
              void patch({ accountLocked: !selected.accountLocked })
            }
            className="rounded-xl border px-4 py-3 font-black"
          >
            Set {selected.accountLocked ? "Unlocked" : "Locked"}
          </button>
          {selected.status === "active" && (
            <button
              onClick={() => void patch({ status: "suspended" })}
              className="rounded-xl border border-amber-600 px-4 py-3 font-black text-amber-800"
            >
              Suspend
            </button>
          )}
          {selected.status === "suspended" && (
            <button
              onClick={() => void patch({ status: "active" })}
              className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white"
            >
              Reactivate
            </button>
          )}
          {selected.status !== "archived" && (
            <button
              onClick={() => void patch({ status: "archived" })}
              className="rounded-xl bg-red-700 px-4 py-3 font-black text-white"
            >
              Archive
            </button>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void patch({
              action: "profile",
              profile: Object.fromEntries(
                new FormData(event.currentTarget).entries(),
              ),
            });
          }}
          className="mt-7 border-t pt-6"
        >
          <h3 className="text-xl font-black">Correct Professional Profile</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AdminField
              label="Member Name"
              name="memberName"
              value={selected.memberName}
            />
            <AdminField
              label="Company Name"
              name="companyName"
              value={selected.companyName}
            />
            <AdminField label="Phone" name="phone" value={selected.phone} />
            <AdminField label="Email" name="email" value={selected.email} />
            <AdminField
              label="Address Line 1"
              name="addressLine1"
              value={selected.addressLine1}
            />
            <AdminField
              label="Address Line 2"
              name="addressLine2"
              value={selected.addressLine2 ?? ""}
              required={false}
            />
            <AdminField label="City" name="city" value={selected.city} />
            <label className="font-bold">
              State
              <select
                name="state"
                defaultValue={selected.state}
                className={inputClass}
              >
                {US_STATES.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <AdminField label="ZIP" name="zipCode" value={selected.zipCode} />
            <AdminField
              label="Website / Social"
              name="websiteUrl"
              value={selected.websiteUrl ?? ""}
              required={false}
            />
            <label className="font-bold">
              Role
              <select
                name="role"
                defaultValue={selected.role}
                className={inputClass}
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <AdminField
              label="Experience"
              name="experience"
              value={selected.experience}
            />
            <label className="font-bold sm:col-span-2">
              Service Region
              <textarea
                name="serviceRegion"
                defaultValue={selected.serviceRegion}
                className={inputClass}
              />
            </label>
            <label className="font-bold sm:col-span-2">
              Introduction
              <textarea
                name="introduction"
                rows={4}
                defaultValue={selected.introduction}
                className={inputClass}
              />
            </label>
          </div>
          <button className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-black text-white">
            Save Corrections
          </button>
        </form>
        <section className="mt-7 border-t pt-6">
          <h3 className="text-xl font-black">Brand Affiliations</h3>
          <div className="mt-4 space-y-3">
            {selected.brands.map((brand) => (
              <div
                key={brand.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"
              >
                <span>
                  <b>{brand.brand.name}</b>
                  <span className="block text-sm capitalize text-slate-600">
                    {brand.relationship_type} · {brand.approval_status}
                  </span>
                </span>
                {brand.approval_status === "pending" && (
                  <span className="flex gap-2">
                    <button
                      onClick={() => void decide(brand.id, "approve")}
                      className="rounded-lg bg-emerald-600 px-3 py-2 font-black text-white"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void decide(brand.id, "reject")}
                      className="rounded-lg border border-red-400 px-3 py-2 font-black text-red-700"
                    >
                      Reject
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="mt-7 rounded-2xl bg-slate-100 p-5">
          <h3 className="font-black">Account / Security Summary</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Detail
              label="Verified recovery email"
              value={selected.security?.emailVerifiedAt ? "Yes" : "No"}
            />
            <Detail
              label="Temporary auth lock until"
              value={selected.security?.temporaryLockUntil ?? "Not locked"}
            />
            <Detail
              label="Failed login attempts"
              value={String(selected.security?.failedAttempts ?? 0)}
            />
            <Detail
              label="Active sessions"
              value={String(selected.security?.activeSessionCount ?? 0)}
            />
            <Detail
              label="Geocoding"
              value={`${selected.security?.geocodeStatus ?? "unknown"}${selected.security?.geocodeError ? ` (${selected.security.geocodeError})` : ""}`}
            />
            <Detail
              label="Last login"
              value={
                selected.lastLoginAt
                  ? new Date(selected.lastLoginAt).toLocaleString()
                  : "Never"
              }
            />
          </dl>
          <button
            type="button"
            onClick={() => void patch({ action: "retry_geocode" })}
            className="mt-4 rounded-xl border px-4 py-2 font-black"
          >
            Retry Geocoding
          </button>
        </section>
      </article>
    </section>
  );
}

function BrandsTab({
  brands,
  reload,
  notify,
}: {
  brands: DealerBrand[];
  reload: () => Promise<void>;
  notify: (value: string) => void;
}) {
  const [editing, setEditing] = useState<DealerBrand | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      body = Object.fromEntries(form.entries()),
      endpoint = editing
        ? `/api/admin/dealer-network/brands/${editing.id}`
        : "/api/admin/dealer-network/brands";
    const response = await fetch(endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    notify(response.ok ? "Brand saved." : "Brand could not be saved.");
    if (response.ok) {
      setEditing(null);
      event.currentTarget.reset();
      await reload();
    }
  }
  return (
    <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(18rem,.7fr)_minmax(0,1.3fr)]">
      <form
        key={editing?.id ?? "new"}
        onSubmit={save}
        className="rounded-3xl bg-white p-6 shadow-sm"
      >
        <h2 className="text-2xl font-black">
          {editing ? "Edit Brand" : "Add Brand"}
        </h2>
        <AdminField
          label="Brand Name"
          name="name"
          value={editing?.name ?? ""}
        />
        <label className="mt-4 block font-bold">
          Description
          <textarea
            name="description"
            defaultValue={editing?.description ?? ""}
            rows={4}
            maxLength={1000}
            className={inputClass}
          />
        </label>
        <AdminField
          label="Website"
          name="websiteUrl"
          value={editing?.websiteUrl ?? ""}
          required={false}
        />
        <label className="mt-4 block font-bold">
          Status
          <select
            name="status"
            defaultValue={editing?.status ?? "active"}
            className={inputClass}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="mt-4 block font-bold">
          Display Order
          <input
            name="sortOrder"
            type="number"
            min={0}
            max={100000}
            defaultValue={editing?.sortOrder ?? 100}
            className={inputClass}
          />
        </label>
        <button className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">
          Save Brand
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="mt-2 w-full rounded-xl border px-5 py-3 font-black"
          >
            Cancel
          </button>
        )}
      </form>
      <div className="space-y-3">
        {brands.map((brand) => (
          <article
            key={brand.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm"
          >
            <div>
              <h3 className="text-xl font-black">{brand.name}</h3>
              <p className="text-sm capitalize text-slate-600">
                {brand.status} · order {brand.sortOrder}
              </p>
              <p className="mt-1 text-sm text-slate-500">{brand.description}</p>
            </div>
            <button
              onClick={() => setEditing(brand)}
              className="rounded-xl border px-4 py-2 font-black"
            >
              Edit
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function SuggestionsTab({
  suggestions,
  reload,
  notify,
}: {
  suggestions: Suggestion[];
  reload: () => Promise<void>;
  notify: (value: string) => void;
}) {
  async function update(id: string, status: string) {
    const response = await fetch(
      `/api/admin/dealer-network/suggestions/${id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    notify(response.ok ? "Suggestion updated." : "Suggestion update failed.");
    if (response.ok) await reload();
  }
  return (
    <section className="mt-7 space-y-4">
      {suggestions.map((suggestion) => (
        <article
          key={suggestion.id}
          className="rounded-3xl bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.15em] text-emerald-700">
                {suggestion.category.replaceAll("_", " ")}
              </p>
              <h2 className="mt-1 text-2xl font-black">{suggestion.subject}</h2>
              <p className="text-sm text-slate-500">
                {suggestion.member?.member_name} ·{" "}
                {suggestion.company_name_snapshot} · {suggestion.member?.email}
              </p>
            </div>
            <StatusBadge>{suggestion.status}</StatusBadge>
          </div>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-700">
            {suggestion.message}
          </p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => void update(suggestion.id, "reviewed")}
              className="rounded-xl border px-4 py-2 font-black"
            >
              Mark Reviewed
            </button>
            <button
              onClick={() => void update(suggestion.id, "resolved")}
              className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white"
            >
              Mark Resolved
            </button>
          </div>
        </article>
      ))}
      {!suggestions.length && (
        <p className="rounded-3xl bg-white p-8">No suggestions.</p>
      )}
    </section>
  );
}

function SecurityTab({
  members,
  notifications,
  reload,
  notify,
}: {
  members: Member[];
  notifications: Dashboard["notifications"];
  reload: () => Promise<void>;
  notify: (value: string) => void;
}) {
  async function retry(id: string) {
    const response = await fetch(
      `/api/admin/dealer-network/notifications/${id}/retry`,
      { method: "POST" },
    );
    const payload = await response.json().catch(() => ({}));
    notify(
      response.ok
        ? payload.retried
          ? "Notification retried."
          : "Notification was not in a failed state."
        : (payload.error ?? "Retry failed."),
    );
    if (response.ok) await reload();
  }
  return (
    <section className="mt-7 grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">Notification Delivery</h2>
        <div className="mt-5 space-y-3">
          {notifications.map((notice) => (
            <div key={notice.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <b>{notice.event_type.replaceAll("_", " ")}</b>
                <StatusBadge>{notice.status}</StatusBadge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Attempts: {notice.attempt_count}
              </p>
              {notice.last_error && (
                <p className="mt-2 text-sm font-bold text-red-700">
                  {notice.last_error}
                </p>
              )}
              {notice.status === "failed" && (
                <button
                  onClick={() => void retry(notice.id)}
                  className="mt-3 rounded-lg border px-3 py-2 font-black"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">Member Security Overview</h2>
        <p className="mt-2 text-sm text-slate-600">
          PIN hashes, salts, session tokens, and token hashes are never returned
          to this interface.
        </p>
        <div className="mt-5 space-y-3">
          {members.map((member) => (
            <div key={member.id} className="rounded-xl border p-4">
              <div className="flex justify-between gap-2">
                <b>{member.companyName}</b>
                <span className="text-sm font-black">
                  {member.accountLocked ? "Locked" : "Unlocked"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {MEMBER_STATUS_LABELS[member.status]} ·{" "}
                {member.security?.activeSessionCount ?? 0} active session(s) ·
                Geocode {member.security?.geocodeStatus ?? "unknown"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NotificationList({ notices }: { notices: Notice[] }) {
  return (
    <section className="mt-6">
      <h3 className="text-lg font-black">Notification Delivery</h3>
      <div className="mt-3 space-y-2">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"
          >
            <span>
              {notice.event_type.replaceAll("_", " ")}
              {notice.last_error && (
                <span className="block text-xs font-bold text-red-700">
                  {notice.last_error}
                </span>
              )}
            </span>
            <b className="uppercase">
              {notice.status} · {notice.attempt_count} attempt(s)
            </b>
          </div>
        ))}
        {!notices.length && (
          <p className="text-sm text-slate-500">No notification events yet.</p>
        )}
      </div>
    </section>
  );
}
function BrandSummary({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
}) {
  return (
    <section className="mt-6">
      <h3 className="font-black">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.id}
            className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800"
          >
            {item.name}
          </span>
        ))}
        {!items.length && (
          <span className="text-sm text-slate-500">None selected</span>
        )}
      </div>
    </section>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[.1em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
function StatusBadge({ children }: { children: string }) {
  return (
    <span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-700">
      {children}
    </span>
  );
}
function AdminField({
  label,
  name,
  value,
  required = true,
}: {
  label: string;
  name: string;
  value: string;
  required?: boolean;
}) {
  return (
    <label className="mt-4 block font-bold">
      {label}
      <input
        name={name}
        required={required}
        defaultValue={value}
        className={inputClass}
      />
    </label>
  );
}
