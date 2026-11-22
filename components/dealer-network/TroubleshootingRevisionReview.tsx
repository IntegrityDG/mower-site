import type { AdminTroubleshootingEntry, TroubleshootingTextFields } from "@/lib/dealer-network/types";

const reviewFields: { key: keyof TroubleshootingTextFields; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "issueDate", label: "Issue date" },
  { key: "firmwareSoftwareVersion", label: "Firmware / software" },
  { key: "systemArea", label: "System area" },
  { key: "badPart", label: "Bad part" },
  { key: "issueDescription", label: "Issue description" },
  { key: "fixDescription", label: "Fix description" },
];

export default function TroubleshootingRevisionReview({
  entry,
  busy,
  review,
}: {
  entry: AdminTroubleshootingEntry;
  busy: boolean;
  review: (revisionId: string, approve: boolean) => void;
}) {
  const revision = entry.pendingRevision;
  if (!revision) return null;
  const fields = reviewFields.filter(({ key }) => entry[key] !== revision.patch[key]);

  return (
    <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="text-lg font-black text-amber-950">Pending author edit</h3>
      <p className="mt-1 text-sm text-slate-700">
        Submitted <time dateTime={revision.submittedAt}>{new Date(revision.submittedAt).toLocaleString()}</time>.
        {entry.publiclyPublished
          ? " The current text stays on the public website until you approve this edit. Approval replaces the published text."
          : " Approval changes the Dealer Network entry but does not publish it on the public website."}
      </p>
      {fields.length ? (
        <dl className="mt-4 space-y-3">
          {fields.map(({ key, label }) => (
            <div key={key} className="rounded-xl border border-amber-200 bg-white p-3">
              <dt className="font-black text-slate-950">{label}</dt>
              <dd className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-700">Current</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-slate-900">{entry[key] ?? "Not provided"}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-700">Proposed</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-slate-900">{revision.patch[key] ?? "Not provided"}</p>
                </div>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-700">The submitted text matches the current version.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || entry.status !== "approved"}
          onClick={() => review(revision.id, true)}
          className="rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-55"
        >
          Approve edit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => review(revision.id, false)}
          className="rounded-xl border border-red-300 bg-white px-4 py-3 font-black text-red-800 disabled:opacity-55"
        >
          Reject edit
        </button>
      </div>
      {entry.status !== "approved" && (
        <p className="mt-2 text-sm text-slate-700">Approve the current Dealer Network entry before accepting an edit.</p>
      )}
    </section>
  );
}
