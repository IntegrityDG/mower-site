import type { LymowVariantPage } from "@/lib/catalog/lymow-variant-pages";
import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";
import { lymowImages } from "@/components/equipment/lymowBrochureContent";

export function lymowVariantJsonLd(page: LymowVariantPage) {
  if (!page.canPurchase) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${page.url}#product`,
    name: page.name,
    description: page.description,
    url: page.url,
    sku: page.sku,
    brand: { "@type": "Brand", name: "Lymow" },
    image: new URL(lymowImages.hero.src, IDS_CANONICAL_ORIGIN).href,
    offers: {
      "@type": "Offer",
      url: page.url,
      price: (page.variant.currentPriceCents! / 100).toFixed(2),
      priceCurrency: "USD",
      ...(page.schemaAvailability ? { availability: page.schemaAvailability } : {}),
      seller: { "@id": `${IDS_CANONICAL_ORIGIN}/#organization` },
    },
  };
}

export default function LymowVariantJsonLd({ page }: { page: LymowVariantPage }) {
  const data = lymowVariantJsonLd(page);
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
