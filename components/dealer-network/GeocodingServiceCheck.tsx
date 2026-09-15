"use client";

import { useState } from "react";
import type { GeocodeDiagnostic } from "@/lib/dealer-network/geocoding-adapter";

export default function GeocodingServiceCheck() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function check() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/dealer-network/geocoding", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload.error ?? "Geocoding check failed."); return; }
      const diagnostic = payload.diagnostic as GeocodeDiagnostic;
      setNotice(`${payload.configured ? "Configured" : "Not Configured"}: ${diagnostic.reason}. HTTP: ${diagnostic.httpStatus ?? "not requested"}; Google: ${diagnostic.providerStatus ?? "not requested"}; results: ${diagnostic.resultCount ?? "none"}; valid point: ${diagnostic.validPoint ? "yes" : "no"}${diagnostic.configurationIssue ? `; configuration: ${diagnostic.configurationIssue}` : ""}.`);
    } catch { setNotice("Geocoding check unavailable. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  async function backfill() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/dealer-network/geocoding", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false }) });
      const result = await response.json();
      if (!response.ok) { setNotice(result.blocked ? `Batch stopped: ${result.blocked}. No further locations attempted.` : result.error ?? "Location batch failed."); return; }
      setNotice(`Business locations: ${result.eligible} eligible; ${result.attempted} attempted; ${result.succeeded} ready; ${result.failed} need attention.`);
    } catch { setNotice("Location batch unavailable. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4">
    <button type="button" disabled={busy} onClick={() => void check()}
      className="rounded-xl border px-4 py-3 font-black disabled:opacity-60">
      {busy ? "Checking Geocoding Service…" : "Check Geocoding Service"}
    </button>
    <button type="button" disabled={busy} onClick={() => void backfill()}
      className="ml-3 mt-3 rounded-xl border px-4 py-3 font-black disabled:opacity-60">
      Refresh Missing Business Locations
    </button>
    <p className="mt-2 text-sm text-slate-600">Checks a known public U.S. address. Member addresses and coordinates are not displayed.</p>
    <p className="mt-2 text-sm text-slate-600">Location refresh processes at most five eligible accounts and skips successful locations and incomplete addresses.</p>
    {notice && <p role="status" className="mt-3 text-sm font-bold">{notice}</p>}
  </div>;
}
