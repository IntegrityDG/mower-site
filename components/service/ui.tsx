"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

export const serviceButton = "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-800 bg-emerald-800 px-4 py-2 text-center text-sm font-bold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";
export const serviceInput = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-950 disabled:bg-slate-100";
export const servicePanel = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
export const displayStatus = (value: string) => value.replaceAll("_", " ");
export const displayDate = (value: string | null) => value ? new Date(value).toLocaleString() : "Not yet available";
export async function serviceFetch<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(url, { method: method ?? (body === undefined ? "GET" : "POST"), cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result as T;
}
// Keep the operation key on network failures. Changed intent gets a new key.
export function useOperationKey() {
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const getKey = (value: unknown) => {
    const fingerprint = JSON.stringify(value);
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, key: crypto.randomUUID() };
    return operation.current.key;
  };
  return { getKey, clear: () => { operation.current = null; } };
}
export function useServiceTask() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const running = useRef(false);
  async function run(task: () => Promise<void>, success = "Saved.") {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage("");
    try { await task(); if (success) setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The request could not be completed."); }
    finally { running.current = false; setBusy(false); }
  }
  return { busy, run, message, status: <p role="status" aria-live="polite" className="my-3 break-words font-semibold text-slate-800">{message}</p> };
}
export function Field({ label, name, type = "text", required = false, defaultValue, children, ...rest }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string | number; children?: ReactNode; min?: string | number; max?: string | number; step?: string | number; autoComplete?: string; readOnly?: boolean; minLength?: number }) {
  return <label className="block min-w-0 text-sm font-semibold text-slate-800">{label}{children ?? <input name={name} type={type} required={required} defaultValue={defaultValue} className={serviceInput} {...rest} />}</label>;
}
export function Notes({ label, name, required = false, defaultValue = "" }: { label: string; name: string; required?: boolean; defaultValue?: string }) {
  return <Field label={label} name={name}><textarea name={name} required={required} defaultValue={defaultValue} maxLength={8000} rows={3} className={serviceInput} /></Field>;
}
export const formValues = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return new FormData(event.currentTarget); };
