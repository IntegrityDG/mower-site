"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { validateCashRefund, type CashRefundInput, chicagoInputTime, chicagoTimeToUtc } from "@/lib/installations/cash-validation";
import type { CashReceiptResult } from "@/lib/installations/cash";
import CashEntryStatus from "./CashEntryStatus";
import { installationMoney } from "./InstallationBalanceSummary";

type Attempt = { input: CashRefundInput; attempted: boolean };
type Props = { installationId: string; paymentId: string; eligibleCents: number; enabled?: boolean; onRecorded: () => Promise<void> };
export default function RecordCashRefund({ installationId, paymentId, eligibleCents, enabled = false, onRecorded }: Props) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [returnedAt, setReturnedAt] = useState("");
  const [occurrence, setOccurrence] = useState<"" | "earlier" | "later">("");
  const [reference, setReference] = useState("");
  const [returned, setReturned] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<CashReceiptResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const storageKey = `ids-installation-cash-refund:${installationId}:${paymentId}`;
  useEffect(() => {
    setReturnedAt(chicagoInputTime(new Date()));
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) { const parsed = JSON.parse(saved) as Attempt; validateCashRefund(parsed.input); if (parsed.input.originalPaymentId !== paymentId) throw new Error(); setAttempt(parsed); }
    } catch { setMessage("Saved refund could not be read. Check history before creating another refund."); }
  }, [storageKey, paymentId]);
  function review(event: FormEvent) {
    event.preventDefault();
    if (!enabled || attempt?.attempted) return;
    try {
      const input = { operationKey: attempt?.input.operationKey ?? crypto.randomUUID(), originalPaymentId: paymentId, amountDollars: amount, reason, returnedAt: chicagoTimeToUtc(returnedAt, occurrence), reference, confirmMoneyReturned: returned };
      const value = validateCashRefund(input);
      if (value.amountCents > eligibleCents) throw new Error("Refund exceeds the receipt amount remaining after prior refunds and recording corrections.");
      const next = { input, attempted: false };
      sessionStorage.setItem(storageKey, JSON.stringify(next)); setAttempt(next); setMessage(""); setResult(null);
    } catch (error) { setMessage((error as Error).message); }
  }
  async function submit(confirmationOnly: boolean) {
    if (!attempt || inFlight.current || (!confirmationOnly && !enabled)) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const next = { ...attempt, attempted: true };
      sessionStorage.setItem(storageKey, JSON.stringify(next)); setAttempt(next);
      const response = await fetch(`/api/admin/installations/${installationId}/cash/refunds${confirmationOnly ? "/confirm" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next.input),
      });
      const value = await response.json();
      if (!response.ok) {
        if (["installation_ledger_changed", "cash_refund_exceeds_eligible_amount", "invalid_cash_refund_original"].includes(value.code)) {
          const rejected = { ...next, attempted: false }; sessionStorage.setItem(storageKey, JSON.stringify(rejected)); setAttempt(rejected);
          try { await onRecorded(); } catch { /* keep original retry information */ }
        }
        throw new Error(value.error || "Keep this same refund key and confirm its result.");
      }
      if (value.confirmed === false) { setMessage("No matching refund is recorded. Keep this same key and review the receipt."); return; }
      if (!value.refundId || !value.balanceAtRecording) throw new Error("Refund response was incomplete. Confirm this same refund.");
      setResult(value); sessionStorage.removeItem(storageKey); setAttempt(null); setAmount(""); setReason(""); setReturned(false);
      try { await onRecorded(); } catch { setMessage("Refund confirmed; history refresh failed. Do not enter this refund again."); }
    } catch (error) { setMessage((error as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="my-3 rounded-lg border p-3" aria-label="Record cash actually returned">
    <h4 className="font-bold">Record cash actually returned</h4>
    <p className="break-all text-sm">Original receipt: {paymentId}. Eligible amount: {installationMoney(eligibleCents)}.</p>
    <p className="text-sm">Use this only after IDS handed cash back to the customer. It records that return against the original receipt; it does not send money or contact Stripe.</p>
    {!enabled && <p>Cash recording and refunds are disabled. Prior-entry confirmation remains available.</p>}
    {message && <p role="status">{message}</p>}
    {result && <CashEntryStatus result={result} refund/>}
    {!attempt ? <form onSubmit={review} className="mt-3 space-y-2">
      <label className="block">Cash actually returned ($)<input required disabled={!enabled || result?.currentBalanceUnavailable} value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} className="ml-2 rounded border p-2"/></label>
      <label className="block">Actual returned time (America/Chicago)<input type="datetime-local" required disabled={!enabled} value={returnedAt} onChange={e => setReturnedAt(e.target.value)} className="block rounded border p-2"/></label>
      <label className="block">Repeated fall hour<select value={occurrence} onChange={e => setOccurrence(e.target.value as typeof occurrence)} className="ml-2 border p-2"><option value="">Choose if time repeats</option><option value="earlier">Earlier (daylight time)</option><option value="later">Later (standard time)</option></select></label>
      <label className="block">Return reference<input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} className="block w-full border p-2"/></label>
      <label className="block"><input type="checkbox" required checked={returned} onChange={e => setReturned(e.target.checked)}/> I confirm IDS actually returned this cash.</label>
      <label className="block">Reason<textarea required maxLength={2000} disabled={!enabled || result?.currentBalanceUnavailable} value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded border p-2"/></label>
      <button disabled={!enabled || eligibleCents <= 0 || result?.currentBalanceUnavailable} className="min-h-11 rounded border px-3 disabled:opacity-50">Review cash return</button>
    </form> : <div className="mt-3 space-y-2">
      <p>Return recorded: {installationMoney(validateCashRefund(attempt.input).amountCents)}. Reason: {attempt.input.reason}</p>
      <p className="break-all text-xs">Refund key: {attempt.input.operationKey}</p>
      <button type="button" disabled={!enabled || busy} onClick={() => submit(false)} className="min-h-11 rounded border px-3 disabled:opacity-50">{attempt.attempted ? "Retry same refund" : "Confirm actual cash return"}</button>
      <button type="button" disabled={busy} onClick={() => submit(true)} className="min-h-11 rounded border px-3">Confirm prior refund only</button>
      {!attempt.attempted && <button type="button" onClick={() => { setAmount(attempt.input.amountDollars); setReason(attempt.input.reason); sessionStorage.removeItem(storageKey); setAttempt(null); }} className="min-h-11 rounded border px-3">Edit refund</button>}
    </div>}
  </section>;
}
