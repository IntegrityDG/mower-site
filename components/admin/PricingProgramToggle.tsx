"use client";

import { useEffect, useState } from "react";

export default function PricingProgramToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/admin/pricing/program", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error ?? "Pricing program setting could not be loaded."
          );
        }

        setEnabled(payload.settings.everydayLowPriceEnabled);
      })
      .catch((error) => {
        setMessage(
          error instanceof Error
            ? error.message
            : "Pricing program setting could not be loaded."
        );
      });
  }, []);

  async function toggle() {
    if (enabled === null || saving) return;

    const nextEnabled = !enabled;
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/pricing/program", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          enabled: nextEnabled,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Pricing program setting could not be saved."
        );
      }

      setEnabled(payload.settings.everydayLowPriceEnabled);
      setMessage(
        payload.settings.everydayLowPriceEnabled
          ? "IDS Everyday Low Price Program enabled."
          : "IDS Everyday Low Price Program disabled."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Pricing program setting could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-7 rounded-[2rem] border-2 border-slate-300 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-black">
              IDS Everyday Low Price Program
            </h2>

            <span
              className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                enabled === true
                  ? "bg-emerald-100 text-emerald-800"
                  : enabled === false
                    ? "bg-slate-200 text-slate-700"
                    : "bg-amber-100 text-amber-800"
              }`}
            >
              {enabled === null ? "Loading" : enabled ? "ON" : "OFF"}
            </span>
          </div>

          <p className="mt-3 leading-7 text-slate-600">
            ON uses an active Temporary Sale Price first, then the IDS Everyday
            Low Price. OFF removes the IDS Everyday Low Price from customer
            pricing and uses an active Temporary Sale Price first, then
            Manufacturer MSRP. If an item has no MSRP, its existing regular
            price remains the safety fallback.
          </p>

          <p className="mt-2 font-bold text-slate-800">
            Stored IDS Everyday Low Prices are preserved when the program is
            turned off and return immediately when it is turned back on.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void toggle()}
          disabled={enabled === null || saving}
          className={`rounded-xl px-6 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-red-700" : "bg-emerald-600"
          }`}
        >
          {saving
            ? "Saving..."
            : enabled
              ? "Turn Program OFF"
              : "Turn Program ON"}
        </button>
      </div>

      {message && (
        <p role="status" className="mt-4 rounded-xl bg-slate-100 p-4 font-bold">
          {message}
        </p>
      )}
    </section>
  );
}
