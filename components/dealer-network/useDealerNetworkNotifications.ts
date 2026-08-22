"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemberNotificationSummary } from "@/lib/dealer-network/types";

export function useDealerNetworkNotifications(enabled: boolean) {
  const [summary, setSummary] = useState<MemberNotificationSummary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);

  const refreshNotifications = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/dealer-network/member/notifications", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error);
      setSummary(payload as MemberNotificationSummary);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refreshNotifications();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshNotifications();
    }, 60_000);
    const resume = () => {
      if (!document.hidden) void refreshNotifications();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [enabled, refreshNotifications]);

  return { summary, unavailable, refreshNotifications };
}
