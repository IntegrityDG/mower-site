"use client";

import { Analytics } from "@vercel/analytics/next";
import { beforeSendAnalytics } from "@/lib/analytics/privacy";

// The callback needs a client boundary; the root layout remains a Server Component.
export function WebAnalytics() {
  return <Analytics beforeSend={beforeSendAnalytics} />;
}
