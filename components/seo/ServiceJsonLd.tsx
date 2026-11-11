import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";

const serviceDetails = {
  "/professional-installation": {
    name: "Professional Installation",
    description:
      "Professional installation for autonomous mower equipment with optional Professional Setup & Optimization. Materials are reconciled to actual use, and approved travel or other charges may affect the final cost.",
  },
  "/service": {
    name: "Service",
    description:
      "Remote and on-site service for supported equipment, including diagnostics and maintenance. Diagnosis and actual work are billable even when repair cannot be completed.",
  },
  "/remote-assistance": {
    name: "Remote Assistance",
    description:
      "Remote Support for $100 per month per machine by phone or Facebook Messenger, with two issue-based sessions per billing cycle for each covered machine. Contact IDS for an individual quote for multiple machines.",
  },
} as const;

export type DedicatedServicePath = keyof typeof serviceDetails;

export function serviceJsonLd(path: DedicatedServicePath) {
  const url = `${IDS_CANONICAL_ORIGIN}${path}`;
  const { name, description } = serviceDetails[path];
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}#service`,
    name,
    description,
    url,
    provider: { "@id": `${IDS_CANONICAL_ORIGIN}/#organization` },
  };
}

export function serializeServiceJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function ServiceJsonLd({ path }: { path: DedicatedServicePath }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeServiceJsonLd(serviceJsonLd(path)),
      }}
    />
  );
}
