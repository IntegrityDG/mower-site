"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { validateCashCorrection, type CashCorrectionInput } from "@/lib/installations/cash-validation";
import type { CashReceiptResult } from "@/lib/installations/cash";
import CashEntryStatus from "./CashEntryStatus";
import { installationMoney } from "./InstallationBalanceSummary";

type Attempt = { input: CashCorrectionInput; attempted: boolean };
type Props = { installationId: string; paymentId: string; eligibleCents: number; enabled?: boolean; onRecorded: () => Promise<void> };
export default function CorrectCashReceipt({ installationId, paymentId, eligibleCents, enabled = false, onRecorded }: Props) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<CashReceiptResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const storageKey = `ids-installation-correction:${installationId}:${paymentId}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) { const parsed = JSON.parse(saved) as Attempt; validateCashCorrection(parsed.input); if (parsed.input.originalPaymentId !== paymentId) throw new Error(); setAttempt(parsed); }
    } catch { setMessage("Saved correction could not be read. Check history before creating another correction."); }
  }, [storageKey, paymentId]);
  function review(event: FormEvent) {
    event.preventDefault();
    if (!enabled || attempt?.attempted) return;
    try {
      const input = { operationKey: attempt?.input.operationKey ?? crypto.randomUUID(), originalPaymentId: paymentId, amountDollars: amount, reason };
      const value = validateCashCorrection(input);
      if (value.amountCents > eligibleCents) throw new Error("Correction exceeds the receipt amount remaining after refunds and prior corrections.");
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
      const response = await fetch(`/api/admin/installations/${installationId}/cash/corrections${confirmationOnly ? "/confirm" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next.input),
      });
      const value = await response.json();
      if (!response.ok) {
        if (["installation_ledger_changed", "cash_correction_exceeds_eligible_amount", "invalid_correction_original"].includes(value.code)) {
          const rejected = { ...next, attempted: false }; sessionStorage.setItem(storageKey, JSON.stringify(rejected)); setAttempt(rejected);
          try { await onRecorded(); } catch { /* keep original retry information */ }
        }
        throw new Error(value.error || "Keep this same correction key and confirm its result.");
      }
      if (value.confirmed === false) { setMessage("No matching correction is recorded. Keep this same key and review the receipt."); return; }
      if (!value.correctionId || !value.balanceAtRecording) throw new Error("Correction response was incomplete. Confirm this same correction.");
      setResult(value); sessionStorage.removeItem(storageKey); setAttempt(null); setAmount(""); setReason("");
      try { await onRecorded(); } catch { setMessage("Correction confirmed; history refresh failed. Do not enter this correction again."); }
    } catch (error) { setMessage((error as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="my-3 rounded-lg border p-3" aria-label="Correct cash receipt">
    <h4 className="font-bold">Correct a cash recording mistake</h4>
    <p className="break-all text-sm">Original receipt: {paymentId}. Eligible amount: {installationMoney(eligibleCents)}.</p>
    <p className="text-sm">The original entry stays visible. A correction reduces recorded payments without changing approved charges. It does not record cash returned to the customer.</p>
    {!enabled && <p>Cash recording and corrections are disabled. Prior-entry confirmation remains available.</p>}
    {message && <p role="status">{message}</p>}
    {result && <CashEntryStatus result={result} correction/>}
    {!attempt ? <form onSubmit={review} className="mt-3 space-y-2">
      <label className="block">Amount recorded in error ($)<input required disabled={!enabled || result?.currentBalanceUnavailable} value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} className="ml-2 rounded border p-2"/></label>
      <label className="block">Reason<textarea required maxLength={2000} disabled={!enabled || result?.currentBalanceUnavailable} value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded border p-2"/></label>
      <button disabled={!enabled || eligibleCents <= 0 || result?.currentBalanceUnavailable} className="min-h-11 rounded border px-3 disabled:opacity-50">Review receipt correction</button>
    </form> : <div className="mt-3 space-y-2">
      <p>Correct {installationMoney(validateCashCorrection(attempt.input).amountCents)}. Reason: {attempt.input.reason}</p>
      <p className="break-all text-xs">Correction key: {attempt.input.operationKey}</p>
      <button type="button" disabled={!enabled || busy} onClick={() => submit(false)} className="min-h-11 rounded border px-3 disabled:opacity-50">{attempt.attempted ? "Retry same correction" : "Confirm recording correction"}</button>
      <button type="button" disabled={busy} onClick={() => submit(true)} className="min-h-11 rounded border px-3">Confirm prior correction only</button>
      {!attempt.attempted && <button type="button" onClick={() => { setAmount(attempt.input.amountDollars); setReason(attempt.input.reason); sessionStorage.removeItem(storageKey); setAttempt(null); }} className="min-h-11 rounded border px-3">Edit correction</button>}
    </div>}
  </section>;
}
