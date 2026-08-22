"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MemberNotificationItem,
  MemberNotificationSummary,
} from "@/lib/dealer-network/types";

export default function DealerNetworkNotificationBell({
  summary,
  unavailable,
  onNavigate,
}: {
  summary: MemberNotificationSummary | null;
  unavailable: boolean;
  onNavigate: (item: MemberNotificationItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const total = summary?.total ?? null;
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent | MouseEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !container.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("mousedown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-label={
          total === null
            ? "Notifications, count unavailable"
            : `Notifications, ${total} unread`
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl border border-white/30 p-3 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.9 18a3 3 0 0 1-5.8 0m9-3H5.9c1.1-1.2 1.6-2.8 1.6-4.4V9a4.5 4.5 0 0 1 9 0v1.6c0 1.6.6 3.2 1.6 4.4Z" />
        </svg>
        {total !== null && total > 0 && (
          <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-xs font-black text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-4 top-24 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 text-slate-950 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <h2 className="text-lg font-black">Notifications</h2>
            <span className="text-xs font-bold text-slate-500">
              {total === null ? "Count unavailable" : `${total} requiring attention`}
            </span>
          </div>
          {unavailable && (
            <p className="m-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">
              Could not refresh. Showing the last available result.
            </p>
          )}
          <div className="space-y-1">
            {(summary?.items ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate(item);
                }}
                className="block w-full rounded-xl p-3 text-left hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <span className="flex justify-between gap-3 font-black">
                  <span>{item.title}</span>
                  {item.unreadCount > 1 && <span>{item.unreadCount}</span>}
                </span>
                <span className="mt-1 block text-sm text-slate-600">{item.detail}</span>
                <time className="mt-1 block text-xs text-slate-500">
                  {new Date(item.occurredAt).toLocaleString()}
                </time>
              </button>
            ))}
            {summary && !summary.items.length && (
              <p className="p-5 text-center text-sm text-slate-600">You’re all caught up.</p>
            )}
            {!summary && !unavailable && (
              <p className="p-5 text-center text-sm text-slate-600">Loading notifications…</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
