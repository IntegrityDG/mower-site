import { lymowImages } from "@/components/equipment/lymowBrochureContent";
import { pandagImages } from "@/components/equipment/pandagBrochureContent";
import { yarboImages } from "@/components/equipment/yarboBrochureContent";
import type { CatalogProduct } from "@/lib/catalog/types";
import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";

type ProductIdentity = Pick<
  CatalogProduct,
  "slug" | "name" | "brand" | "fullDescription" | "homepageSummary"
>;

const imagePaths: Record<string, string> = {
  "lymow-one-plus": lymowImages.hero.src,
  yarbo: yarboImages.core.src,
  "pandag-g1": pandagImages.platformLineup.src,
};

export function productJsonLd(product: ProductIdentity) {
  const imagePath = imagePaths[product.slug];
  if (!imagePath) return null;

  const url = `${IDS_CANONICAL_ORIGIN}/equipment/${product.slug}`;
  const description = product.slug === "yarbo"
    ? product.homepageSummary ?? product.fullDescription
    : product.fullDescription ?? product.homepageSummary;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    url,
    ...(description ? { description } : {}),
    image: new URL(imagePath, IDS_CANONICAL_ORIGIN).href,
    brand: product.brand,
  };
}

export default function ProductJsonLd({ product }: { product: ProductIdentity }) {
  const jsonLd = productJsonLd(product);
  if (!jsonLd) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
  );
}
