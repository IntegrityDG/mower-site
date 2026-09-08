import type { InstallationBalance } from "@/lib/installations/accounting";
export const installationMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);

export default function InstallationBalanceSummary({ balance, settlementRequired = false, historical = false }: { balance: InstallationBalance; settlementRequired?: boolean; historical?: boolean }) {
  const rows: [string, number][] = [
    ["Approved charges", balance.approvedChargesCents], ["Confirmed payments received", balance.receivedCents],
    ["Completed refunds", balance.completedRefundsCents], ["Receipt recording corrections", balance.receiptCorrectionsCents], ["Net payments recorded", balance.netPaidCents],
    [settlementRequired ? "Unsettled accounting amount" : historical ? "Balance due when recorded" : "Current balance due", balance.balanceDueCents],
  ];
  return <section aria-label="Installation balance" className="rounded-xl bg-slate-50 p-4">
    <dl className="space-y-2">{rows.map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{label}</dt><dd className="font-bold tabular-nums">{installationMoney(amount)}</dd></div>)}</dl>
    {balance.customerCreditCents > 0 && <p className="mt-3 rounded-lg bg-amber-100 p-3 font-bold">Customer credit / refund due: {installationMoney(balance.customerCreditCents)}</p>}
    <p className="mt-3 font-bold">{settlementRequired ? "Closed work — review cancellation settlement" : balance.paymentState === "customer_credit" ? "Overpaid — customer credit remains" : balance.paymentState === "paid" ? "Paid in full" : balance.paymentState === "partially_paid" ? "Partial payment — balance remains due" : "Payment not yet received"}</p>
    {settlementRequired && <p className="mt-2 text-sm">Settlement depends on approved cancellation adjustments. Refunding a payment does not itself create a new payment request or reopen this work.</p>}
    {balance.pendingRefundsCents > 0 && <p className="mt-2 text-sm">Pending refunds: {installationMoney(balance.pendingRefundsCents)}. These have not reduced net payments.</p>}
    <p className="mt-2 text-sm text-slate-600">The deposit is credited toward these charges. A price credit does not mean money has been refunded.</p>
    {balance.receiptCorrectionsCents > 0 && <p className="mt-2 text-sm">Receipt corrections fix recorded amounts. They do not mean cash was returned and do not change approved charges.</p>}
  </section>;
}
