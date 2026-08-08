"use client";
import { useId } from "react";
export function Stars({ value, label = "Rating", interactive = false, onChange }: { value: number | null; label?: string; interactive?: boolean; onChange?: (value: number) => void }) {
  const name = useId();
  if (!interactive) return <span className="inline-flex items-center gap-2" aria-label={`${value ?? 0} of 5 stars`}><span aria-hidden="true" className="text-lg tracking-wide text-amber-500">{[1,2,3,4,5].map((n) => n <= (value ?? 0) ? "★" : "☆").join("")}</span><span className="sr-only">{value ?? 0} of 5 stars</span></span>;
  return <fieldset><legend className="sr-only">{label}</legend><div className="flex gap-1" role="radiogroup" aria-label={label}>{[1,2,3,4,5].map((n) => <label key={n} className="cursor-pointer rounded-lg p-1 focus-within:ring-2 focus-within:ring-emerald-600"><input className="sr-only" type="radio" name={name} value={n} checked={value === n} onChange={() => onChange?.(n)} /><span aria-hidden="true" className={`text-3xl ${n <= (value ?? 0) ? "text-amber-500" : "text-slate-300"}`}>★</span><span className="sr-only">{n} stars</span></label>)}</div><p className="mt-1 text-sm font-semibold text-slate-600" aria-live="polite">{value ? `${value} of 5 stars` : "No rating selected"}</p></fieldset>;
}
