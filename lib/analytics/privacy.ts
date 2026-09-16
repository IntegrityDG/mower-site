import type { BeforeSendEvent } from "@vercel/analytics/next";

// These pages contain private portal tokens or authenticated customer/member data.
const privatePages = [
  /^\/(?:admin|staff)(?:\/|$)/,
  /^\/(?:service|services-scheduling|remote-assistance)\/manage(?:\/|$)/,
  /^\/professional-installation\/[^/]+/,
  /^\/dealer-tech-resources\/(?:member|activate|reset-pin)(?:\/|$)/,
];

export function beforeSendAnalytics(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    if (privatePages.some((pattern) => pattern.test(decodeURIComponent(url.pathname)))) {
      return null;
    }

    // Checkout session IDs, signed cancel tokens, and free-text searches live here.
    // Base page-view analytics needs neither query values nor URL fragments.
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    // Never send a URL we could not safely inspect.
    return null;
  }
}
