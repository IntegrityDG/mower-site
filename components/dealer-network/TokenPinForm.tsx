"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function TokenPinForm({
  token,
  mode,
}: {
  token: string;
  mode: "activate" | "reset";
}) {
  const [message, setMessage] = useState(""),
    [complete, setComplete] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const pin = String(form.get("pin") ?? ""),
      confirm = String(form.get("confirmPin") ?? "");
    if (pin !== confirm) {
      setBusy(false);
      setMessage("PIN entries must match.");
      return;
    }
    const response = await fetch(
      `/api/dealer-network/auth/${mode === "activate" ? "activate" : "reset-pin"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, pin }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(
      payload.message ?? payload.error ?? "The request could not be completed.",
    );
    setComplete(response.ok);
    if (response.ok)
      window.history.replaceState(null, "", window.location.pathname);
  }
  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-8 text-slate-950 shadow-xl">
      <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">
        Dealer &amp; Tech Community
      </p>
      <h1 className="mt-2 text-3xl font-black">
        {mode === "activate" ? "Activate your account" : "Choose a new PIN"}
      </h1>
      {!complete && (
        <>
          <p className="mt-3 leading-7 text-slate-600">
            Choose a six-digit PIN. IDS never stores or returns the PIN in
            plaintext.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <PinField name="pin" label="New 6-digit PIN" />
            <PinField name="confirmPin" label="Confirm PIN" />
            <button
              disabled={busy || !token}
              className="min-h-13 w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-60"
            >
              {busy
                ? "Saving…"
                : mode === "activate"
                  ? "Activate Account"
                  : "Reset PIN"}
            </button>
          </form>
        </>
      )}
      {message && (
        <p role="status" className="mt-5 rounded-xl bg-slate-100 p-4 font-bold">
          {message}
        </p>
      )}
      {complete && (
        <Link
          href="/dealer-tech-resources/login"
          className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white"
        >
          Continue to Member Login
        </Link>
      )}
    </div>
  );
}
function PinField({ name, label }: { name: string; label: string }) {
  return (
    <label className="block font-bold">
      {label}
      <input
        name={name}
        type="password"
        inputMode="numeric"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        autoComplete="new-password"
        required
        className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-2xl tracking-[.45em] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
      />
    </label>
  );
}
