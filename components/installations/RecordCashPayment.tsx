"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InstallationBalance } from "@/lib/installations/accounting";
import { chicagoInputTime, chicagoTimeToUtc, dollarsToCents, formatInstallationTime, validateCashReceipt, type CashReceiptInput } from "@/lib/installations/cash-validation";
import InstallationBalanceSummary, { installationMoney } from "./InstallationBalanceSummary";
import CashEntryStatus from "./CashEntryStatus";
import type { CashReceiptResult } from "@/lib/installations/cash";

type Props = { installationId: string; balance: InstallationBalance | null; enabled?: boolean; settlementRequired?: boolean; onRecorded: () => Promise<void> };
type SavedAttempt = { receipt: CashReceiptInput; attempted: boolean };

export default function RecordCashPayment({ installationId, balance, enabled = false, settlementRequired = false, onRecorded }: Props) {
  const [confirmedResult, setConfirmedResult] = useState<CashReceiptResult | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [receivedTime, setReceivedTime] = useState("");
  const [occurrence, setOccurrence] = useState<"" | "earlier" | "later">("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [attempt, setAttempt] = useState<SavedAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const storageKey = `ids-installation-cash:${installationId}`;

  useEffect(() => {
    // Restore an unresolved attempt after refresh, including its original key.
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const restored = JSON.parse(saved) as SavedAttempt;
        validateCashReceipt(restored.receipt);
        setAttempt(restored); setOpen(true);
      }
    } catch { setMessage("The saved receipt draft could not be read. Review transaction history before recording another receipt."); }
    setReceivedTime(chicagoInputTime(new Date()));
  }, [storageKey]);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      dollarsToCents(amount);
      const receipt: CashReceiptInput = { operationKey: attempt?.receipt.operationKey ?? crypto.randomUUID(), amountDollars: amount,
        receivedAt: chicagoTimeToUtc(receivedTime, occurrence), reference, notes, confirmOverpayment: false };
      validateCashReceipt(receipt);
      const next = { receipt, attempted: false };
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setAttempt(next); setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  }
  function confirmOverpayment(confirmed: boolean) {
    if (!attempt || attempt.attempted) return;
    const next = { ...attempt, receipt: { ...attempt.receipt, confirmOverpayment: confirmed } };
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); setAttempt(next); }
    catch { setMessage("Receipt draft could not be saved locally. Retry before recording."); }
  }
  async function save(confirmationOnly = false) {
    if (!attempt || inFlight.current || (!confirmationOnly && (!enabled || !balance))) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const next = { ...attempt, attempted: true };
      // Persist BEFORE sending. A lost response must reuse this exact payload.
      sessionStorage.setItem(storageKey, JSON.stringify(next)); setAttempt(next);
      const response = await fetch(`/api/admin/installations/${installationId}/cash${confirmationOnly ? "/confirm" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next.receipt),
      });
      const result = await response.json();
      if (!response.ok) {
        if (["installation_ledger_changed", "cash_overpayment_confirmation_required", "invalid_receipt"].includes(result.code)) {
          const rejected = { ...next, attempted: false };
          sessionStorage.setItem(storageKey, JSON.stringify(rejected)); setAttempt(rejected);
          await onRecorded();
        }
        throw new Error(result.error || "Receipt could not be confirmed. Retry this same receipt.");
      }
      if (result.confirmed === false) { setMessage("No matching receipt is recorded. Keep this same key and review before recording when cash writes are enabled."); return; }
      if (!result.paymentId || !result.balanceAtRecording) throw new Error("Receipt response was incomplete. Retry this same receipt.");
      setConfirmedResult(result);
      sessionStorage.removeItem(storageKey); setAttempt(null); setOpen(false); setAmount(""); setReference(""); setNotes("");
      setReceivedTime(chicagoInputTime(new Date()));
      setMessage("");
      try { await onRecorded(); } catch { setMessage("The receipt is confirmed. History refresh failed; do not record this same cash again."); }
    } catch (error) { setMessage((error as Error).message || "Retry this same receipt; keep its operation key."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function editReceipt() {
    if (!attempt || attempt.attempted) return;
    setAmount(attempt.receipt.amountDollars); setReference(attempt.receipt.reference); setNotes(attempt.receipt.notes);
    setReceivedTime(chicagoInputTime(new Date(attempt.receipt.receivedAt)));
    sessionStorage.removeItem(storageKey); setAttempt(null);
  }
  // The refreshed balance may already include an unresolved attempted receipt.
  // Retry its original payload instead of presenting it as a new overpayment.
  const overpayment = balance && attempt && !attempt.attempted ? Math.max(0, dollarsToCents(attempt.receipt.amountDollars) - balance.balanceDueCents) : 0;
  return <section className="mt-5 rounded-2xl border border-emerald-200 p-4 md:p-5" aria-label="Record payment">
    <button type="button" disabled={!enabled || !balance || confirmedResult?.currentBalanceUnavailable} onClick={() => { setOpen(true); setConfirmedResult(null); }} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">Record payment</button>
    {!enabled && <p>Cash recording and corrections are disabled. History and prior-entry confirmation remain available.</p>}
    {confirmedResult && <CashEntryStatus result={confirmedResult}/>}
    {message && <p role="status" className="mt-3 break-words font-semibold">{message}</p>}
    {open && <div className="mt-4 space-y-4">
      <h3 className="text-xl font-black">Record payment → Cash</h3>
      <p className="text-sm text-slate-600">Record cash actually received by IDS. Cash approval is a separate action.</p>
      {balance ? <InstallationBalanceSummary balance={balance} settlementRequired={settlementRequired}/> : <p>Current balance unavailable. Prior-entry confirmation remains available.</p>}
      {!attempt ? <form onSubmit={review} className="space-y-4">
        <label className="block font-bold">Cash received ($)<input required inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} placeholder="750.00" className="mt-1 min-h-11 w-full rounded-lg border p-3"/></label>
        <label className="block font-bold">Received date/time (America/Chicago)<input required type="datetime-local" value={receivedTime} onChange={e => setReceivedTime(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border p-3"/></label>
        <label className="block text-sm">If this is a repeated daylight saving time hour<select value={occurrence} onChange={e => setOccurrence(e.target.value as typeof occurrence)} className="mt-1 min-h-11 w-full rounded-lg border p-2"><option value="">Choose only if prompted</option><option value="earlier">Earlier occurrence (CDT)</option><option value="later">Later occurrence (CST)</option></select></label>
        <label className="block font-bold">Receipt/reference (optional)<input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-3"/></label>
        <label className="block font-bold">Notes (optional)<textarea maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <div className="flex flex-wrap gap-3"><button className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 font-bold text-white">Review cash receipt</button><button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border px-4 py-2">Cancel</button></div>
      </form> : <div className="space-y-3 rounded-xl border border-slate-300 p-4">
        <h4 className="text-lg font-black">Confirm cash receipt</h4>
        <dl className="space-y-2"><div><dt>Cash received</dt><dd className="text-2xl font-black">{installationMoney(dollarsToCents(attempt.receipt.amountDollars))}</dd></div><div><dt>Received</dt><dd>{formatInstallationTime(attempt.receipt.receivedAt)}</dd></div><div><dt>Receipt/reference</dt><dd className="break-words">{attempt.receipt.reference || "None"}</dd></div><div><dt>Notes</dt><dd className="whitespace-pre-wrap break-words">{attempt.receipt.notes || "None"}</dd></div></dl>
        <p className="text-sm">Recorded by: IDS shared administrator. The recording time is saved separately when this receipt is accepted.</p>
        {overpayment > 0 && <div role="alert" className="rounded-lg bg-amber-100 p-3"><p className="font-bold">Overpayment: {installationMoney(overpayment)} above the current balance.</p><label className="mt-3 flex items-start gap-3"><input type="checkbox" checked={attempt.receipt.confirmOverpayment} disabled={attempt.attempted} onChange={e => confirmOverpayment(e.target.checked)} className="mt-1"/><span>I confirm this extra cash was received and should remain as customer credit.</span></label></div>}
        <p className="break-all text-xs text-slate-500">Receipt key: {attempt.receipt.operationKey}</p>
        {attempt.attempted && <p className="text-sm font-bold">A submission has been attempted. Retry this same receipt to confirm its result before recording another.</p>}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={!enabled || !balance || busy || (!attempt.attempted && overpayment > 0 && !attempt.receipt.confirmOverpayment)} onClick={() => save(false)} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? "Recording…" : attempt.attempted ? "Retry same cash receipt" : "Confirm and record cash"}</button><button type="button" disabled={busy} onClick={() => save(true)} className="min-h-11 rounded-lg border px-4 py-2">Confirm prior receipt only</button>{!attempt.attempted && <button type="button" onClick={editReceipt} className="min-h-11 rounded-lg border px-4 py-2">Edit receipt</button>}</div>
      </div>}
    </div>}
  </section>;
}
