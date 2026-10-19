"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import SalesTicker from "@/components/promotions/SalesTicker";
import { DEFAULT_TICKER_CONFIG, TICKER_MIN_SPEED, TICKER_MAX_SPEED, TICKER_MESSAGE_MAX, TICKER_MESSAGES_MAX, type TickerConfig } from "@/lib/promotions/ticker";
import { chicagoInputCandidates, duplicateTickerEditorMessage, moveTickerMessage, newTickerEditorMessage, tickerContrastRatio, tickerEditorPreview, tickerToEditor, validateTickerEditor, type TickerEditorConfig, type TickerEditorMessage } from "@/lib/promotions/ticker-editor";

type Snapshot = { ticker: TickerConfig; revision: number };
type Props = { onUnauthorized?: () => void; initialSnapshot?: Snapshot };
const field = "mt-2 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 font-normal";
const secondaryButton = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50 disabled:opacity-40";

function ColorField({ label, name, value, fallback, error, onChange }: { label: string; name: string; value: string; fallback: string; error?: string; onChange: (value: string) => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return <div>
    <label htmlFor={`ticker-${name}`} className="block font-bold">{label}</label>
    <div className="mt-2 flex items-center gap-3">
      <input type="color" aria-label={`${label} picker`} value={valid ? value : fallback} onChange={(event) => onChange(event.target.value)} className="h-12 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
      <input id={`ticker-${name}`} value={value} onChange={(event) => onChange(event.target.value)} maxLength={7} spellCheck={false} aria-invalid={!valid || !!error} aria-describedby={`ticker-${name}-help`} className="w-full min-w-0 rounded-xl border border-slate-300 p-3 font-mono" />
    </div>
    <p id={`ticker-${name}-help`} className={`mt-1 text-xs ${!valid || error ? "text-red-700" : "text-slate-500"}`}>{error || (!valid ? "Use a six-digit hex color, such as #064E3B. Preview uses a safe fallback until corrected." : "Six-digit hex color (#RRGGBB).")}</p>
  </div>;
}

function MessageCard({ message, index, count, errors, onChange, onMove, onDuplicate, onDelete, onDragStart, onDrop, onDragEnd, dragged }: {
  message: TickerEditorMessage; index: number; count: number; errors: Record<string, string>;
  onChange: (message: TickerEditorMessage) => void; onMove: (direction: number) => void; onDuplicate: () => void; onDelete: () => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void; onDrop: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void; dragged: boolean;
}) {
  const update = <K extends keyof TickerEditorMessage>(key: K, value: TickerEditorMessage[K]) => onChange({ ...message, [key]: value });
  const prefix = `ticker-message-${message.id}`;
  const errorFor = (name: string) => errors[`messages.${index}.${name}`];
  const messageLength = [...message.message].length;
  const messageError = errorFor("message") || (messageLength > TICKER_MESSAGE_MAX ? `Message must be ${TICKER_MESSAGE_MAX} characters or fewer. Shorten it before saving.` : undefined);
  return <article data-ticker-message-id={message.id} aria-label={`Message ${index + 1}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className={`min-w-0 space-y-4 rounded-2xl border bg-slate-50 p-4 sm:p-5 ${dragged ? "border-emerald-600 opacity-70" : "border-slate-200"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="font-black">Message {index + 1}</h4>
      <div className="flex flex-wrap gap-2">
        <button type="button" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} aria-label={`Drag message ${index + 1} to reorder`} title="Drag to reorder; or use Move Up and Move Down" className={`${secondaryButton} cursor-grab touch-auto`}>↕ Drag</button>
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move Up: message ${index + 1}`} className={secondaryButton}>Move Up</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move Down: message ${index + 1}`} className={secondaryButton}>Move Down</button>
      </div>
    </div>
    <label className="block font-bold" htmlFor={`${prefix}-text`}>Message text</label>
    <input id={`${prefix}-text`} value={message.message} required maxLength={TICKER_MESSAGE_MAX * 2} onChange={(event) => update("message", event.target.value)} aria-invalid={!!messageError} aria-describedby={`${prefix}-text-help`} className={field} />
    <p id={`${prefix}-text-help`} className={`text-xs ${messageError ? "text-red-700" : "text-slate-500"}`}>{messageError || `${messageLength}/${TICKER_MESSAGE_MAX} characters. Plain text only.`}</p>
    <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
      <label className="flex items-center gap-3 py-3 font-bold"><input type="checkbox" checked={message.active} onChange={(event) => update("active", event.target.checked)} className="h-5 w-5 accent-emerald-600" />Active</label>
      <div>
        <label htmlFor={`${prefix}-link`} className="block font-bold">Optional link</label>
        <input id={`${prefix}-link`} value={message.link} onChange={(event) => update("link", event.target.value)} placeholder="/products or https://example.com" aria-invalid={!!errorFor("link")} aria-describedby={`${prefix}-link-help`} className={field} />
        <p id={`${prefix}-link-help`} className={`mt-1 text-xs ${errorFor("link") ? "text-red-700" : "text-slate-500"}`}>{errorFor("link") || "Use a site path starting with / or a full http:// or https:// link."}</p>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {([['startsAt', 'Start date/time (optional)'], ['endsAt', 'End date/time (optional)']] as const).map(([key, label]) => {
        const candidates = chicagoInputCandidates(message[key]);
        const originalKey = key === "startsAt" ? "originalStartsAt" : "originalEndsAt";
        const selectedOccurrence = candidates.find((candidate) => message[originalKey] && Math.floor(Date.parse(candidate) / 60_000) === Math.floor(Date.parse(message[originalKey]) / 60_000)) ?? "";
        return <div key={key}>
        <label htmlFor={`${prefix}-${key}`} className="block font-bold">{label}</label>
        <input id={`${prefix}-${key}`} type="datetime-local" step={60} value={message[key]} onChange={(event) => update(key, event.target.value)} aria-invalid={!!errorFor(key)} aria-describedby={`${prefix}-${key}-help`} className={field} />
        <p id={`${prefix}-${key}-help`} className={`mt-1 text-xs ${errorFor(key) ? "text-red-700" : "text-slate-500"}`}>{errorFor(key) || "America/Chicago (Central time)."}</p>
        {candidates.length > 1 && <label className="mt-2 block text-sm font-bold">Repeated hour — choose occurrence<select required value={selectedOccurrence} onChange={(event) => update(originalKey, event.target.value || null)} className={field}><option value="">Choose first or second occurrence</option><option value={candidates[0]}>First occurrence — CDT (UTC−05:00)</option><option value={candidates[1]}>Second occurrence — CST (UTC−06:00)</option></select></label>}
      </div>; })}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={count >= TICKER_MESSAGES_MAX} onClick={onDuplicate} aria-label={`Duplicate message ${index + 1}`} className={secondaryButton}>Duplicate</button>
      <button type="button" onClick={onDelete} aria-label={`Delete message ${index + 1}`} className={`${secondaryButton} text-red-700`}>Delete</button>
    </div>
  </article>;
}

export default function HomepageSalesTickerEditor({ onUnauthorized, initialSnapshot }: Props) {
  const [draft, setDraft] = useState<TickerEditorConfig>(() => tickerToEditor(initialSnapshot?.ticker ?? DEFAULT_TICKER_CONFIG));
  const [revision, setRevision] = useState(initialSnapshot?.revision ?? 0);
  const [loaded, setLoaded] = useState(!!initialSnapshot);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  const dragged = useRef<string | null>(null);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => { unauthorized.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => { const timer = window.setInterval(() => setPreviewNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const acceptSnapshot = useCallback((snapshot: Snapshot) => {
    setDraft(tickerToEditor(snapshot.ticker)); setRevision(snapshot.revision); setLoaded(true); setDirty(false); setErrors({});
  }, []);

  useEffect(() => {
    if (initialSnapshot) return;
    const controller = new AbortController();
    fetch("/api/admin/sales-specials/ticker", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { unauthorized.current?.(); throw new Error("Your admin session expired. Sign in again."); }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Ticker settings could not be loaded.");
      acceptSnapshot(payload);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Ticker settings could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialSnapshot, acceptSnapshot]);

  function edit(next: TickerEditorConfig) { setDraft(next); setDirty(true); setStatus(""); setError(""); setErrors({}); setPreviewNow(Date.now()); }
  function update<K extends keyof TickerEditorConfig>(key: K, value: TickerEditorConfig[K]) { edit({ ...draft, [key]: value }); }
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= draft.messages.length) return;
    update("messages", moveTickerMessage(draft.messages, from, to));
    setStatus(`Message moved to position ${to + 1}. Save to publish the new sequence.`);
  }

  async function reload() {
    if (dirty && !window.confirm("Discard your unsaved ticker changes and reload saved settings?")) return;
    setLoading(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/admin/sales-specials/ticker", { cache: "no-store" });
      if (response.status === 401) { unauthorized.current?.(); throw new Error("Your admin session expired. Sign in again."); }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Ticker settings could not be loaded.");
      acceptSnapshot(payload); setStatus("Saved ticker settings reloaded.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ticker settings could not be loaded. Your edits are still here."); }
    finally { setLoading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setStatus(""); setError("");
    const result = validateTickerEditor(draft);
    if (!result.ok) { setErrors(result.errors); setError("Correct the highlighted ticker settings before saving."); return; }
    setSaving(true); setErrors({});
    try {
      const response = await fetch("/api/admin/sales-specials/ticker", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: result.value, revision }) });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { unauthorized.current?.(); throw new Error("Your admin session expired. Sign in again."); }
      if (!response.ok) {
        setErrors(payload.errors ?? {});
        throw new Error(response.status === 409 ? "Ticker settings changed in another session. Your edits have been kept. Reload saved settings before applying your changes again." : payload.error ?? "Ticker settings could not be saved. Your edits have been kept.");
      }
      acceptSnapshot(payload); setStatus("Homepage Sales Ticker saved successfully.");
    } catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Connection failed. Your unsaved edits have been kept; try saving again."); }
    finally { setSaving(false); }
  }

  const preview = tickerEditorPreview(draft);
  const contrast = tickerContrastRatio(draft.textColor, draft.backgroundColor);
  return <section data-ticker-admin aria-labelledby="homepage-sales-ticker-heading" className="mt-7 min-w-0 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
    <h2 id="homepage-sales-ticker-heading" className="text-2xl font-black uppercase">Homepage Sales Ticker</h2>
    <p className="mt-2 text-sm text-slate-600">A slim promotional strip between the homepage navigation and Intro. Changes stay in this form until you save.</p>
    {loading && <p role="status" className="mt-5 font-bold">Loading ticker settings…</p>}
    {!loading && !loaded && <button type="button" onClick={() => void reload()} className={`${secondaryButton} mt-5`}>Retry loading ticker</button>}
    {loaded && <form onSubmit={save} className="mt-6">
      <fieldset disabled={saving || loading} className="min-w-0 space-y-7 disabled:opacity-70">
        <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={draft.enabled} onChange={(event) => update("enabled", event.target.checked)} className="h-5 w-5 accent-emerald-600" />Ticker Enabled</label>
        <div className="space-y-5">
          <h3 className="text-lg font-black">Appearance</h3>
          <label className="block font-bold" htmlFor="ticker-speed">Scroll Speed <span className="font-normal">— {draft.speed} pixels/second</span></label>
          <input id="ticker-speed" type="range" min={TICKER_MIN_SPEED} max={TICKER_MAX_SPEED} step={1} value={draft.speed} onChange={(event) => update("speed", Number(event.target.value))} aria-valuetext={`${draft.speed} pixels per second`} aria-describedby="ticker-speed-help" className="w-full accent-emerald-600" />
          <div id="ticker-speed-help" className="flex justify-between text-xs text-slate-600"><span>Slower ({TICKER_MIN_SPEED})</span><span>Faster ({TICKER_MAX_SPEED})</span></div>
          {errors.speed && <p className="text-sm text-red-700">{errors.speed}</p>}
          <div className="grid gap-5 md:grid-cols-3">
            <ColorField label="Background Color" name="backgroundColor" value={draft.backgroundColor} fallback={DEFAULT_TICKER_CONFIG.backgroundColor} error={errors.backgroundColor} onChange={(value) => update("backgroundColor", value)} />
            <ColorField label="Text Color" name="textColor" value={draft.textColor} fallback={DEFAULT_TICKER_CONFIG.textColor} error={errors.textColor} onChange={(value) => update("textColor", value)} />
            <ColorField label="Separator / Accent Color" name="accentColor" value={draft.accentColor} fallback={DEFAULT_TICKER_CONFIG.accentColor} error={errors.accentColor} onChange={(value) => update("accentColor", value)} />
          </div>
          {contrast !== null && contrast < 4.5 && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">Low text contrast ({contrast.toFixed(2)}:1). Aim for at least 4.5:1 so these colors are easier to read. Your selected colors will be saved as entered.</p>}
          <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={draft.pauseOnHover} onChange={(event) => update("pauseOnHover", event.target.checked)} className="h-5 w-5 accent-emerald-600" />Pause on Hover / Focus</label>
        </div>
        <div className="min-w-0 space-y-3">
          <h3 className="text-lg font-black">Live Preview</h3>
          <p className="text-sm text-slate-600">Uses your unsaved appearance and currently eligible messages. Preview is shown even while Ticker Enabled is off. Inactive, future, expired, or invalid-time messages stay hidden.</p>
          <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200"><SalesTicker config={preview} serverTime={new Date(previewNow).toISOString()} preview /></div>
          {preview.messages.every((message) => !message.active || (message.startsAt && Date.parse(message.startsAt) > previewNow) || (message.endsAt && Date.parse(message.endsAt) <= previewNow)) && <p className="text-sm text-slate-500">No messages are currently eligible. Add an active message or adjust its schedule to preview the ticker.</p>}
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black">Ticker Messages — Drag to Reorder Messages</h3><button type="button" disabled={draft.messages.length >= TICKER_MESSAGES_MAX} onClick={() => update("messages", [...draft.messages, newTickerEditorMessage(crypto.randomUUID())])} className={secondaryButton}>Add Message</button></div>
          <p className="text-sm text-slate-600">List order is the ticker sequence. Use Drag or Move Up / Move Down. Up to {TICKER_MESSAGES_MAX} messages. All schedule times use America/Chicago and account for daylight saving time. If an hour repeats when clocks move back, choose its first or second occurrence.</p>
          {errors.messages && <p className="text-sm text-red-700">{errors.messages}</p>}
          {!draft.messages.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No ticker messages yet. Nothing appears on the homepage until you add an eligible message and enable the ticker.</p>}
          {draft.messages.map((message, index) => <MessageCard key={message.id} message={message} index={index} count={draft.messages.length} errors={errors} dragged={draggedId === message.id}
            onChange={(next) => update("messages", draft.messages.map((current) => current.id === next.id ? next : current))}
            onMove={(direction) => reorder(index, index + direction)}
            onDuplicate={() => { const next = [...draft.messages]; next.splice(index + 1, 0, duplicateTickerEditorMessage(message, crypto.randomUUID())); update("messages", next); }}
            onDelete={() => { if (window.confirm(`Delete message ${index + 1}${message.message ? `: “${message.message}”` : ""}? Save Changes to publish this deletion.`)) update("messages", draft.messages.filter((current) => current.id !== message.id)); }}
            onDragStart={(event) => { dragged.current = message.id; setDraggedId(message.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", message.id); }}
            onDrop={(event) => { event.preventDefault(); if (!dragged.current) return; reorder(draft.messages.findIndex((current) => current.id === dragged.current), index); dragged.current = null; setDraggedId(null); }}
            onDragEnd={() => { dragged.current = null; setDraggedId(null); }} />)}
        </div>
        <div className="flex flex-wrap gap-3"><button disabled={saving || !dirty} className="rounded-xl bg-emerald-700 px-6 py-3 font-black text-white disabled:opacity-60">{saving ? "Saving…" : "Save Ticker Changes"}</button><button type="button" onClick={() => void reload()} className={secondaryButton}>Reload saved settings</button></div>
        <p className="text-sm text-slate-500">{dirty ? "Unsaved ticker changes. The public homepage has not changed." : "Showing saved ticker settings."}</p>
      </fieldset>
    </form>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 font-bold text-red-700">{error}</p>}
    {status && <p role="status" className="mt-4 font-bold text-slate-700">{status}</p>}
  </section>;
}
