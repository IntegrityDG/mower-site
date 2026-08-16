import type { Metadata } from "next";
import Link from "next/link";
import PublicTroubleshootingEntry from "@/components/troubleshooting/PublicTroubleshootingEntry";
import { readPublicTroubleshootingEntries } from "@/lib/public-troubleshooting/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Troubleshoot Your Robot | Integrity Distribution Systems",
  description:
    "Search real-world robotic mower issues and proven technical solutions published by Integrity Distribution Systems.",
};

type SearchParameters = Record<string, string | string[] | undefined>;
const inputClass =
  "min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function TroubleshootYourRobotPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const filters = {
    query: first(parameters.q),
    brand: first(parameters.brand),
    model: first(parameters.model),
    systemArea: first(parameters.system),
  };
  let entries: Awaited<ReturnType<typeof readPublicTroubleshootingEntries>> = [];
  let unavailable = false;
  try {
    entries = await readPublicTroubleshootingEntries(filters);
  } catch {
    unavailable = true;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 py-14 text-white md:px-10 md:py-20">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl border border-white/30 px-4 py-2 text-sm font-black hover:bg-white/10"
          >
            ← Integrity Auto Mowers
          </Link>
          <p className="mt-8 text-sm font-black uppercase tracking-[0.24em] text-emerald-400">
            IDS Technical Resource
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
            Troubleshoot Your Robot
          </h1>
          <p className="mt-5 max-w-4xl text-lg leading-8 text-slate-200">
            Search real-world robotic mower issues and proven solutions
            contributed by experienced dealers and technicians through the IDS
            Dealer &amp; Tech Network.
          </p>
        </div>
      </section>

      <section className="px-6 py-10 md:px-10 md:py-14">
        <div className="mx-auto max-w-7xl">
          <form
            method="get"
            className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <label className="grid gap-2 text-sm font-black text-slate-800">
              Search troubleshooting titles
              <input
                name="q"
                type="search"
                maxLength={100}
                defaultValue={filters.query}
                placeholder="Example: GPS position, charging, cutting motor"
                className={inputClass}
              />
            </label>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-black text-slate-800">
                Brand <span className="font-medium text-slate-500">(optional)</span>
                <input
                  name="brand"
                  maxLength={120}
                  defaultValue={filters.brand}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-800">
                Model <span className="font-medium text-slate-500">(optional)</span>
                <input
                  name="model"
                  maxLength={160}
                  defaultValue={filters.model}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-800">
                System Affected{" "}
                <span className="font-medium text-slate-500">(optional)</span>
                <input
                  name="system"
                  maxLength={160}
                  defaultValue={filters.systemArea}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="min-h-12 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white hover:bg-emerald-700">
                Search Solutions
              </button>
              {/* A full navigation prevents stale public records in the Next.js router cache. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/troubleshoot-your-robot"
                className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-6 py-3 font-black hover:bg-slate-50"
              >
                Clear &amp; Browse All
              </a>
            </div>
          </form>

          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <strong>Technical resource disclaimer:</strong> Troubleshooting
            information is provided as a technical resource. Procedures,
            firmware behavior, and manufacturer recommendations may change.
            Always follow current manufacturer safety and service instructions.
          </p>

          <div className="mt-9 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Published solutions
              </p>
              <h2 className="mt-1 text-3xl font-black tracking-tight">
                {entries.length} {entries.length === 1 ? "result" : "results"}
              </h2>
            </div>
          </div>

          {unavailable ? (
            <p className="mt-6 rounded-3xl bg-white p-8 text-slate-700 shadow-sm">
              Troubleshooting information is temporarily unavailable. Please
              try again shortly.
            </p>
          ) : entries.length > 0 ? (
            <div className="mt-6 space-y-5">
              {entries.map((entry) => (
                <PublicTroubleshootingEntry key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-3xl bg-white p-9 text-center shadow-sm">
              <h2 className="text-2xl font-black">No published solutions found</h2>
              <p className="mt-3 text-slate-600">
                Try a shorter title keyword, remove an optional filter, or
                browse all currently published entries.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
