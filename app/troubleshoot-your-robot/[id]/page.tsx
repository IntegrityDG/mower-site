import { notFound } from "next/navigation";
import PublicTroubleshootingEntry from "@/components/troubleshooting/PublicTroubleshootingEntry";
import { readPublicTroubleshootingEntry } from "@/lib/public-troubleshooting/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicTroubleshootingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const entry = await readPublicTroubleshootingEntry((await params).id).catch(
    () => null,
  );
  if (!entry) notFound();

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-950 md:px-10 md:py-14">
      <div className="mx-auto max-w-7xl">
        {/* A full navigation prevents stale public records in the Next.js router cache. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/troubleshoot-your-robot"
          className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black hover:bg-slate-50"
        >
          ← Back to Troubleshooting Search
        </a>
        <div className="mt-6">
          <PublicTroubleshootingEntry entry={entry} detail />
        </div>
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <strong>Technical resource disclaimer:</strong> Troubleshooting
          information is provided as a technical resource. Procedures,
          firmware behavior, and manufacturer recommendations may change.
          Always follow current manufacturer safety and service instructions.
        </p>
      </div>
    </main>
  );
}
