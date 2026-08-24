"use client";

import { Oswald } from "next/font/google";
import { useEffect, useState } from "react";

import type { SalesSpecialsConfig } from "@/lib/promotions/config";
import { validateSalesSpecials } from "@/lib/promotions/validation";
import { SalesSpecialsBanner } from "./SalesSpecialsBanner";

const oswald = Oswald({ subsets: ["latin"], weight: "700" });

export default function HomeSalesSpecial() {
  const [promotions, setPromotions] = useState<SalesSpecialsConfig[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sales-specials", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        if (!Array.isArray(payload.promotions)) return setPromotions([]);
        setPromotions(payload.promotions.flatMap((promotion: unknown) => {
          const parsed = validateSalesSpecials(promotion);
          return parsed.ok && parsed.value.enabled ? [parsed.value] : [];
        }).slice(0, 2));
      })
      .catch(() => setPromotions([]));
    return () => controller.abort();
  }, []);
  return <SalesSpecialsBanner promotions={promotions} headlineClassName={oswald.className} />;
}
