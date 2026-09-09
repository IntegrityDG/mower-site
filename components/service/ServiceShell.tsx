import Link from "next/link";
import FooterActions from "@/components/footer/FooterActions";
import type { ReactNode } from "react";

export default function ServiceShell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-950"><header className="bg-slate-950 px-4 py-5 text-white"><nav aria-label="Service navigation" className="mx-auto flex max-w-6xl flex-wrap items-center gap-4"><Link className="mr-auto font-black" href="/">Integrity Distribution Systems</Link><Link className="inline-flex min-h-11 items-center font-bold" href="/remote-assistance">Remote Assistance</Link><Link className="inline-flex min-h-11 items-center font-bold" href="/services-scheduling">Services &amp; Scheduling</Link></nav></header><main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6"><h1 className="text-3xl font-black sm:text-4xl">{title}</h1>{children}</main><footer className="bg-slate-950 px-4 py-8 text-white"><div className="mx-auto max-w-6xl"><p className="mb-4 font-bold">Integrity Distribution Systems · Autonomous Lawn Care Solutions</p><FooterActions /></div></footer></div>;
}
