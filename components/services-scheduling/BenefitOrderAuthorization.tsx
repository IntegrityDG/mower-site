"use client";

import { type FormEvent, useState } from "react";
import type { DemoPartyPortal } from "@/lib/demo-party/types";

export default function BenefitOrderAuthorization({ token, portal }: { token: string; portal: DemoPartyPortal }) {
  const [message, setMessage] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState(portal.benefitCheckoutUrl);
  const [benefitType, setBenefitType] = useState<"base_machine_discount" | "bonus_credit">("base_machine_discount");
  const [busy, setBusy] = useState(false);
  const paid = ["paid", "partially_refunded", "refunded"].includes(portal.paymentStatus);
  if (portal.status !== "approved" || portal.demoFormat !== "party" || !paid || portal.benefits.qualifyingGuests === 0) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    const response = await fetch(`/api/services-scheduling/portal/${encodeURIComponent(token)}/benefits/reserve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderReference: form.get("orderReference"), benefitType: form.get("benefitType"), application: form.get("application") }) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setCheckoutUrl(typeof body.checkoutUrl === "string" ? body.checkoutUrl : null);
      setMessage(body.message ?? "Benefit authorization is ready.");
    } else setMessage(body.error ?? "Benefit authorization failed.");
    setBusy(false);
  }
  const accessoryBonusAvailable = portal.bonusCreditElection === "accessories" && portal.benefits.bonusCreditCents > 0;
  const machineBonusAvailable = portal.bonusCreditElection === "machine" && portal.benefits.bonusCreditCents > 0;
  return <section className="mt-7 rounded-[2rem] border border-emerald-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"><h2 className="text-2xl font-black">Apply a benefit to an IDS order</h2><p className="mt-2 text-sm leading-6 text-slate-600">Start a card order from the IDS equipment catalog, choose “Back” at Checkout, and copy the public order reference shown on the cancellation page. Enter it here to receive a private replacement checkout with server-verified pricing. Browser prices and public coupon codes are never accepted.</p>{checkoutUrl && <a href={checkoutUrl} className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-emerald-700 px-5 font-black text-white">Resume benefit checkout</a>}<form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="font-bold">IDS order reference<input name="orderReference" required maxLength={80} className="mt-2 min-h-12 w-full rounded-xl border p-3" /></label><label className="font-bold">Benefit<select name="benefitType" required value={benefitType} onChange={(event) => setBenefitType(event.target.value as "base_machine_discount" | "bonus_credit")} className="mt-2 min-h-12 w-full rounded-xl border p-3"><option value="base_machine_discount">Machine benefit{machineBonusAvailable ? " (base + elected bonus)" : ""}</option>{accessoryBonusAvailable && <option value="bonus_credit">Guest 6–10 accessory credit</option>}</select></label><input type="hidden" name="application" value={benefitType === "bonus_credit" ? "accessories" : "machine"} /><div className="self-end rounded-xl bg-slate-100 p-3 text-sm font-bold">Applies to: {benefitType === "bonus_credit" ? "IDS-approved accessories" : "one eligible machine"}</div><button disabled={busy} className="min-h-12 self-end rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50">{busy ? "Applying…" : "Apply benefit securely"}</button></form>{accessoryBonusAvailable && <p className="mt-3 text-sm text-slate-600">Use the machine benefit on a machine order and the elected bonus credit on a separate accessory-only order.</p>}{message && <p role="status" className="mt-4 rounded-xl bg-slate-100 p-4 font-bold">{message}</p>}</section>;
}
