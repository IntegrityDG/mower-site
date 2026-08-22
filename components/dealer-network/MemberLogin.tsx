"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";
export default function MemberLogin({ initialMessage = "" }: { initialMessage?: string }) {
  const [forgot, setForgot] = useState(false),
    [message, setMessage] = useState(initialMessage),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const endpoint = forgot
      ? "/api/dealer-network/auth/forgot-pin"
      : "/api/dealer-network/auth/login";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: form.get("phone"),
        pin: form.get("pin"),
        email: form.get("email"),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok && !forgot) {
      window.location.href = "/dealer-tech-resources/member";
      return;
    }
    setMessage(
      payload.message ?? payload.error ?? "The request could not be completed.",
    );
  }
  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-7 text-slate-950 shadow-xl md:p-9">
      <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">
        Approved Members
      </p>
      <h1 className="mt-2 text-3xl font-black">
        {forgot ? "Reset your PIN" : "Member Login"}
      </h1>
      <p className="mt-3 leading-7 text-slate-600">
        {forgot
          ? "Enter the phone number and verified email on your member profile. The response is intentionally the same whether or not an account matches."
          : "Use your member phone number and the six-digit PIN you chose during activation."}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block font-bold">
          Phone Number
          <input name="phone" type="tel" required className={inputClass} />
        </label>
        {forgot ? (
          <label className="block font-bold">
            Verified Email Address
            <input name="email" type="email" required className={inputClass} />
          </label>
        ) : (
          <label className="block font-bold">
            6-digit PIN
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </label>
        )}
        <button
          disabled={busy}
          className="min-h-13 w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-60"
        >
          {busy ? "Please wait…" : forgot ? "Send Reset Link" : "Sign In"}
        </button>
      </form>
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-slate-100 p-3 text-sm font-bold"
        >
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setForgot((value) => !value);
          setMessage("");
        }}
        className="mt-5 font-black text-emerald-700"
      >
        {forgot ? "Return to Member Login" : "Forgot PIN?"}
      </button>
      <div className="mt-6 border-t pt-5 text-sm text-slate-600">
        Not a member?{" "}
        <Link
          href="/dealer-tech-resources/apply"
          className="font-black text-emerald-700"
        >
          Apply to Join
        </Link>
      </div>
    </div>
  );
}
