import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import HostPortal from "@/components/services-scheduling/HostPortal";
import BenefitOrderAuthorization from "@/components/services-scheduling/BenefitOrderAuthorization";
import HostGuestEditor from "@/components/services-scheduling/HostGuestEditor";
import { readDemoPartyPortal } from "@/lib/demo-party/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Secure Appointment | IDS",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function ManageDemoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await readDemoPartyPortal(token);
  if (!portal) notFound();
  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-7"><div className="mx-auto max-w-6xl"><div className="mb-7 flex items-center justify-between gap-4"><Link href="/" className="font-black text-emerald-800">Integrity Distribution Systems</Link><Link href="/services-scheduling" className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold">Services &amp; Scheduling</Link></div><HostPortal token={token} initial={portal} /><HostGuestEditor token={token} portal={portal} /><BenefitOrderAuthorization token={token} portal={portal} /><p className="mt-7 text-center text-xs leading-5 text-slate-500">This private link grants access to appointment and guest information. Do not forward it. IDS never stores the raw link token.</p></div></main>;
}
