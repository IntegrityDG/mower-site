import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Referral Program | Integrity Distribution Systems", description: "Referral rewards for qualifying Lymow, Yarbo, and Pandag equipment purchases through IDS." };
const rewards = [
  { brand: "Lymow", reward: "$50 first 5", afterFive: "$75 after 5" },
  { brand: "Yarbo", reward: "$100 first 5", afterFive: "$150 after 5" },
  { brand: "Pandag", reward: "$750 first 5", afterFive: "$1,000 after 5" },
];
const steps = [
  "Tell your friends, family, neighbors, or others about Integrity Distribution Systems and our autonomous lawn-care solutions.",
  "When they purchase, they enter your name and email in the “Referred by someone?” section of the IDS purchase form.",
  "Their qualifying purchase must remain completed through the 30-day return period and meet IDS referral-program eligibility requirements.",
  "Once the 30-day return period has passed, IDS verifies the purchase and sends the referral reward manually.",
];

export default function ReferralProgramPage() {
  return <main className="min-h-screen bg-slate-950 text-white"><section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
    <Link href="/" className="text-sm font-bold text-emerald-300 hover:text-emerald-200">← Integrity Distribution Systems</Link>
    <p className="mt-12 text-sm font-bold uppercase tracking-[0.25em] text-emerald-400">IDS Referral Program</p>
    <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">HELP A FRIEND. HELP YOURSELF. GET PAID.</h1>
    <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">Refer friends, family, neighbors, or others who could benefit from autonomous lawn care and earn a referral reward when they make a qualifying purchase through Integrity Distribution Systems.</p>
    <div className="mt-12 grid gap-6 md:grid-cols-3">{rewards.map((item) => <article key={item.brand} className="rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-xl"><h2 className="text-2xl font-black">{item.brand}</h2><p className="mt-6 text-3xl font-black text-emerald-400">{item.reward}</p><p className="mt-4 leading-7 text-slate-300">{item.afterFive}</p></article>)}</div>
    <section className="mt-16"><p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-400">How It Works</p><div className="mt-6 grid gap-5 md:grid-cols-2">{steps.map((step, index) => <div key={step} className="rounded-2xl border border-slate-700 bg-slate-900 p-6"><p className="text-2xl font-black text-emerald-400">{index + 1}.</p><p className="mt-3 leading-7 text-slate-300">{step}</p></div>)}</div></section>
    <section className="mt-16 rounded-3xl border border-slate-700 bg-slate-900 p-7 md:p-10"><h2 className="text-2xl font-black">Referral Program Terms</h2><p className="mt-5 text-base leading-8 text-slate-300">Referral rewards are available on qualifying retail purchases made through Integrity Distribution Systems. Referral rewards are payable only after the purchaser’s 30-day return period has fully passed and the qualifying purchase remains completed and has not been returned, canceled, or refunded. Referral rewards apply only to qualifying equipment purchased at the IDS Everyday Low Price. Items discounted below the IDS Everyday Low Price, including additional promotional or negotiated discounts, do not qualify for a referral reward. The purchaser must identify the referrer by name and email during the purchase process so the referral can be properly credited. Referral program terms and reward amounts are subject to change.</p><p className="mt-5 text-base font-semibold leading-8 text-white">IDS manually verifies each purchase after the return period has passed and manually sends any earned reward. The 30-day date is not an automatic payout trigger, and no gift card or other reward is issued automatically.</p></section>
  </section></main>;
}
