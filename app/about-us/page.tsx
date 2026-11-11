import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us | Integrity Distribution Systems",
  description: "Meet Integrity Distribution Systems, a Southeast Missouri business helping customers find the right autonomous lawn care system.",
  alternates: { canonical: "/about-us" },
};

function AboutContent() {
  return (
    <section className="ids-purpose-background relative overflow-hidden px-5 py-10 text-white md:px-10 md:py-16">
      <div className="ids-visual-copy-shadow relative z-10 mx-auto w-full max-w-5xl text-center">
        <div className="flex w-full justify-center">
          <img src="/images/cartoon-mowers.png" alt="Autonomous mower lineup" className="h-auto w-full max-w-[620px] object-contain drop-shadow-2xl" />
        </div>
        <p className="mt-4 w-full text-center text-2xl font-bold uppercase leading-tight tracking-[0.08em] text-emerald-300 md:text-[2rem]"><span className="block md:inline">A SMALL BUSINESS</span>{" "}<span className="block md:inline">WITH A SIMPLE</span>{" "}<span className="block md:inline">PURPOSE</span></p>
        <h1 className="mx-auto mt-5 max-w-4xl text-3xl font-black leading-[1.08] md:text-5xl tracking-tight">Robot mowers that give people more time back for what matters most.</h1>
        <p className="mx-auto mt-7 max-w-4xl text-base leading-7 text-slate-100 md:text-xl md:leading-8">Integrity Distribution Systems is a small, Southeast Missouri&ndash;based business built around honesty, practical guidance, and doing right by the people we serve. We are not here to push the most expensive machine or chase the biggest sale. Our goal is to help each customer find a system that genuinely fits their property, needs, and budget.</p>
        <p className="mx-auto mt-5 max-w-4xl text-base leading-7 text-slate-100 md:text-xl md:leading-8">After spending a great deal of my own life working away from home, I understand how valuable time can be. Autonomous lawn care can reduce the hours and expense tied up in routine property maintenance, giving people more time with family, more room in their budget, and a little more opportunity to slow down and enjoy life.</p>
        <p className="mx-auto mt-5 max-w-4xl text-base leading-7 text-slate-100 md:text-lg md:leading-8">Compare <Link href="/equipment/lymow-one-plus" className="underline">Lymow One Plus</Link>, <Link href="/equipment/yarbo" className="underline">Yarbo</Link>, and <Link href="/equipment/pandag-g1" className="underline">Pandag G1</Link> robotic mowers for residential, commercial, and municipal properties in our <Link href="/equipment" className="underline">equipment catalog</Link>. IDS also offers <Link href="/services-scheduling" className="underline">demos</Link>, <Link href="/professional-installation" className="underline">professional installation</Link>, and <Link href="/service" className="underline">service and support</Link> for supported systems. Financing options are shown where available. Our <Link href="/robot-mowers" className="underline">robot mower buying guide</Link> explains property fit, and the <Link href="/commercial-robot-mowers" className="underline">commercial mowing guide</Link> covers larger grounds operations.</p>
        <p className="mx-auto mt-5 max-w-4xl text-base leading-7 text-slate-100 md:text-lg md:leading-8">See real demonstrations and installations in <Link href="/ids-in-action" className="underline">IDS in Action</Link> and read <Link href="/reviews" className="underline">customer reviews</Link> as you compare your options.</p>
        <div className="mt-8 flex justify-center"><div className="inline-flex rounded-2xl border border-white/30 bg-slate-950/35 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm">Southeast Missouri Based &bull; Nationwide Equipment Sales &bull; Regional Hands-On Support</div></div>
      </div>
    </section>
  );
}


export default function AboutUsPage() {
  return <main className="min-h-screen bg-slate-100"><div className="mx-auto max-w-7xl px-5 py-5 md:px-10"><Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-white px-5 font-black text-emerald-800 shadow-sm">← Back to Home</Link></div><AboutContent /></main>;
}
