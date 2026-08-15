import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dealer & Tech Community Resources | IDS",
  description:
    "A private U.S.-based professional network for robotic mower dealers and repair technicians.",
};

export default function DealerTechResourcesPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden px-5 py-20 md:px-10 md:py-28">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,.22),transparent_38%)]"
        />
        <div className="relative mx-auto max-w-6xl">
          <Link
            href="/"
            className="text-sm font-black uppercase tracking-[.2em] text-emerald-300"
          >
            Integrity Distribution Systems
          </Link>
          <p className="mt-12 text-sm font-black uppercase tracking-[.24em] text-emerald-400">
            Private Professional Community
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl md:text-7xl">
            Dealer &amp; Tech Community Resources
          </h1>
          <p className="mt-6 max-w-3xl text-xl font-bold leading-8 text-slate-200 md:text-2xl">
            Building A U.S. Based Network for Dealer &amp; Tech Communication
          </p>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            A reviewed network for professionals who sell, service, and support
            robotic lawn equipment represented by IDS. Approved members can find
            brand support, connect with other approved professionals, and share
            practical resources.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dealer-tech-resources/login"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-7 py-4 text-lg font-black text-slate-950 hover:bg-emerald-400"
            >
              Member Login
            </Link>
            <Link
              href="/dealer-tech-resources/apply"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-7 py-4 text-lg font-black hover:bg-white/15"
            >
              Apply to Join
            </Link>
          </div>
        </div>
      </section>
      <section className="bg-white px-5 py-16 text-slate-950 md:px-10 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {[
            [
              "Built for the trade",
              "Membership is intended for robotic mower dealers, repair technicians, and qualified professional repair businesses.",
            ],
            [
              "Reviewed by IDS",
              "Applications are reviewed before an activation invitation is issued. Applying does not create immediate access.",
            ],
            [
              "Private by design",
              "The member directory and professional contact details are visible only to eligible approved members—not the general public.",
            ],
          ].map(([title, text]) => (
            <article
              key={title}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-7"
            >
              <h2 className="text-xl font-black">{title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
