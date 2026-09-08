import { cumulativeWorkMinutes, displayWorkMinutes, type WorkSession } from "@/lib/installations/admin-policy";
import { additionalLabor, type PricingSnapshot } from "@/lib/installations/policy";
import { hasInstallation, hasSetup, setupOvertime, setupPrice, SETUP, type ServiceSelection } from "@/lib/installations/setup";
import { installationMoney as money } from "./InstallationBalanceSummary";

type Props = { job: ServiceSelection & { pricing_snapshot?: PricingSnapshot | null; approved_travel_charge_cents?: number; travel_policy?: string }; sessions: WorkSession[]; adjustments: { amount_cents: number; reconciliation_kind?: string | null }[] };
export default function InstallationServiceSummary({ job, sessions, adjustments }: Props) {
  const p = job.pricing_snapshot, installationMinutes = cumulativeWorkMinutes(sessions, "installation"), setupMinutes = cumulativeWorkMinutes(sessions, "setup");
  const amount = (kind: string) => adjustments.filter(a => a.reconciliation_kind === kind).reduce((n, a) => n + a.amount_cents, 0);
  return <section aria-label="Service components and labor" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
    <p className="font-bold">Installation selected: {hasInstallation(job) ? "Yes" : "No — Setup-only job"}. Setup selected: {hasSetup(job) ? "Yes" : "No"}.</p>
    <dl className="mt-3 space-y-2 text-sm">
      {hasInstallation(job) && <><div><dt className="font-bold">Installation labor / materials allowance</dt><dd>{p ? `${money(p.laborCents)} labor + ${money(p.materialsAllowanceCents)} allowance` : "Awaiting IDS pricing approval"}</dd></div><div><dt className="font-bold">Installation labor recorded</dt><dd>{displayWorkMinutes(installationMinutes)} minutes; {displayWorkMinutes(Math.max(0, 240 - installationMinutes))} included minutes remaining. Overtime: {money(p ? Math.round(additionalLabor(installationMinutes, p)) : 0)}.</dd></div>{p && <div><dt className="font-bold">Installation materials / allowance reconciliation</dt><dd>{money(p.materialsAllowanceCents + amount("materials"))} currently accounted for, including the allowance until actual use is reconciled.</dd></div>}</>}
      {(hasSetup(job) || setupMinutes > 0 || adjustments.some(a => a.reconciliation_kind?.startsWith("setup_"))) && <>
        <div><dt className="font-bold">Approved Setup labor price</dt><dd>{p ? `${money(setupPrice(p))} saved price; ${hasSetup(job) ? "selected" : "base charge removed"}` : "Awaiting IDS approval"}. Up to four cumulative Setup hours; no materials allowance.</dd></div>
        <div><dt className="font-bold">Setup labor recorded</dt><dd>{displayWorkMinutes(setupMinutes)} minutes; {displayWorkMinutes(Math.max(0, SETUP.includedMinutes - setupMinutes))} included minutes remaining. Overtime: {money(setupOvertime(setupMinutes))} before any eligible subscriber discount.</dd></div>
        <div><dt className="font-bold">Actual Setup parts/materials</dt><dd>{money(amount("setup_materials"))}</dd></div>
        {p && <div><dt className="font-bold">Setup labor charged / subscriber discount</dt><dd>{money(amount("setup_base") + amount("setup_labor"))} / {money(Math.abs(amount("setup_discount")))}</dd></div>}
      </>}
      {p && <div><dt className="font-bold">One approved travel charge</dt><dd>{money(job.approved_travel_charge_cents ?? 0)}{amount("travel_discount") !== 0 ? ` after ${money(-amount("travel_discount"))} subscriber discount` : ""}. {job.travel_policy === "combined_visit" ? "Combined visit: $35 per started excess one-way hour total." : "Separate-visit travel policy."}</dd></div>}
      {p && <div><dt className="font-bold">One booking deposit</dt><dd>{money(p.depositCents)}, credited toward the shared balance.</dd></div>}
    </dl>
    <p className="mt-3 text-xs">Labor buckets remain separate across pauses and continuation visits. Running time is finalized when the session stops. Travel, waiting, and lodging are not Setup labor. One deposit stays credited to the overall balance.</p>
  </section>;
}
