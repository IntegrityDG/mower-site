import type { CashReceiptResult } from "@/lib/installations/cash";
import { formatInstallationTime } from "@/lib/installations/cash-validation";
import InstallationBalanceSummary from "./InstallationBalanceSummary";

export default function CashEntryStatus({ result, correction = false, refund = false }: { result: CashReceiptResult; correction?: boolean; refund?: boolean }) {
  return <section role="status" className="mt-3 space-y-3 rounded-lg border p-3">
    <p className="font-bold">{refund ? "Actual cash return" : correction ? "Receipt correction" : "Cash receipt"} {result.replayed ? "previously recorded and confirmed" : "recorded"}. Recorded {formatInstallationTime(result.recordedAt)}.</p>
    {correction && <p>This corrects a recording mistake. No cash return is recorded.</p>}
    <details><summary>Saved balance when this entry was recorded</summary><InstallationBalanceSummary balance={result.balanceAtRecording} historical/></details>
    {result.currentBalanceUnavailable || !result.currentBalance ? <p className="font-bold">The entry is confirmed. The current balance could not be refreshed. Refresh history; do not enter this same entry again.</p> :
      <div><p className="font-bold">Balance from the latest confirmation refresh</p><InstallationBalanceSummary balance={result.currentBalance}/></div>}
  </section>;
}
