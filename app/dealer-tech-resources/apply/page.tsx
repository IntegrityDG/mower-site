import Link from "next/link";
import ApplicationForm from "@/components/dealer-network/ApplicationForm";

export default function DealerNetworkApplyPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-950 md:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dealer-tech-resources"
          className="font-black text-emerald-700"
        >
          ← Dealer &amp; Tech Community Resources
        </Link>
        <p className="mt-8 text-sm font-black uppercase tracking-[.2em] text-emerald-700">
          Reviewed Membership
        </p>
        <h1 className="mt-2 text-4xl font-black md:text-5xl">Apply to Join</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
          Tell IDS about your professional work with robotic lawn equipment.
          Applying creates a review record only and does not grant immediate
          access.
        </p>
        <div className="mt-9">
          <ApplicationForm />
        </div>
      </div>
    </main>
  );
}
