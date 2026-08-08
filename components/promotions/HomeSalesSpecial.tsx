"use client";

import { Oswald } from "next/font/google";
import { useEffect, useState } from "react";

import type { SalesSpecialsConfig } from "@/lib/promotions/config";
import { SalesSpecialsBanner } from "./SalesSpecialsBanner";

const oswald = Oswald({ subsets: ["latin"], weight: "700" });

export default function HomeSalesSpecial() {
  const [promotion, setPromotion] = useState<SalesSpecialsConfig | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sales-specials", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setPromotion(payload.promotion ?? null))
      .catch(() => setPromotion(null));
    return () => controller.abort();
  }, []);
  return <SalesSpecialsBanner promotion={promotion} headlineClassName={oswald.className} />;
}
