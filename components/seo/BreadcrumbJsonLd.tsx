import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";

export type BreadcrumbItem = { name: string; path: string };

export const HOME_BREADCRUMB = { name: "Home", path: "/" } as const;
export const EQUIPMENT_BREADCRUMB = { name: "Equipment", path: "/equipment" } as const;
export const SERVICES_BREADCRUMB = {
  name: "Services & Scheduling",
  path: "/services-scheduling",
} as const;
export const TROUBLESHOOTING_BREADCRUMB = {
  name: "Troubleshoot Your Robot",
  path: "/troubleshoot-your-robot",
} as const;

function canonicalBreadcrumbUrl(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#]/.test(path)) {
    throw new Error("Breadcrumb paths must be canonical site paths.");
  }
  return path === "/" ? IDS_CANONICAL_ORIGIN : `${IDS_CANONICAL_ORIGIN}${path}`;
}

export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, path }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: canonicalBreadcrumbUrl(path),
    })),
  };
}

export default function BreadcrumbJsonLd({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(breadcrumbJsonLd(items)).replace(/</g, "\\u003c"),
      }}
    />
  );
}
