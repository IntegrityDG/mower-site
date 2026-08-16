import Image from "next/image";
import type { PublicTroubleshootingEntry as PublicEntry } from "@/lib/public-troubleshooting/types";

const issueDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

function displayDate(value: string) {
  return issueDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export default function PublicTroubleshootingEntry({
  entry,
  detail = false,
}: {
  entry: PublicEntry;
  detail?: boolean;
}) {
  if (!detail)
    return (
      <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
          Published technical solution
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
          <a
            href={`/troubleshoot-your-robot/${entry.id}`}
            className="rounded-sm hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
          >
            {entry.title}
          </a>
        </h2>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Brand", entry.brand],
            ["Model", entry.model],
            ["System", entry.systemArea],
            ["Problem", entry.issueDescription],
            ["Fix", entry.fixDescription],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 line-clamp-3 text-sm font-semibold leading-6 text-slate-800">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="font-semibold text-slate-500">
            Issue date: {displayDate(entry.issueDate)}
          </p>
          <a
            href={`/troubleshoot-your-robot/${entry.id}`}
            className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-emerald-700"
          >
            View Complete Problem &amp; Fix
          </a>
        </div>
      </article>
    );

  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
        {entry.brand} <span aria-hidden="true">→</span> {entry.model}{" "}
        <span aria-hidden="true">→</span> {entry.systemArea}
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
        {entry.title}
      </h1>
      <dl className="mt-7 grid gap-4 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-black text-slate-500">Date</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {displayDate(entry.issueDate)}
          </dd>
        </div>
        <div>
          <dt className="font-black text-slate-500">Machine Firmware / Software</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {entry.firmwareSoftwareVersion}
          </dd>
        </div>
        <div>
          <dt className="font-black text-slate-500">System Having the Issue</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {entry.systemArea}
          </dd>
        </div>
        <div>
          <dt className="font-black text-slate-500">Exact Part That Was Bad</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {entry.badPart ?? "Not applicable"}
          </dd>
        </div>
      </dl>

      <div className="mt-8 grid gap-7 lg:grid-cols-2">
        {(["issue", "fix"] as const).map((kind) => {
          const photos = entry.photos.filter(
            (photo) => photo.photoKind === kind,
          );
          return (
            <section
              key={kind}
              aria-labelledby={`${kind}-heading`}
              className={`rounded-3xl border p-6 ${
                kind === "issue"
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-emerald-200 bg-emerald-50/60"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                {kind === "issue" ? "Problem" : "Proven solution"}
              </p>
              <h2
                id={`${kind}-heading`}
                className="mt-1 text-2xl font-black text-slate-950"
              >
                {kind === "issue" ? "THE ISSUE" : "THE FIX"}
              </h2>
              <p className="mt-4 whitespace-pre-wrap leading-8 text-slate-800">
                {kind === "issue"
                  ? entry.issueDescription
                  : entry.fixDescription}
              </p>
              {photos.length > 0 ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {photos.map((photo, index) => (
                    <a
                      key={photo.id}
                      href={photo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-2xl border border-white bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      <Image
                        src={photo.url}
                        alt={`${kind === "issue" ? "Issue" : "Fix"} photo ${index + 1}`}
                        width={photo.width}
                        height={photo.height}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        unoptimized
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </article>
  );
}
