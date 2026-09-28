import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProductJsonLd, { productJsonLd } from "../components/seo/ProductJsonLd";
import { IDS_CANONICAL_ORIGIN } from "../lib/site-origin";

const cases = [
  {
    slug: "lymow-one-plus",
    name: "Lymow One Plus",
    brand: "Lymow",
    imagePath: "/equipment/lymow/brochure/lymow-one-plus-on-lawn.webp",
    description: "Lymow detail description",
  },
  {
    slug: "yarbo",
    name: "Yarbo Core",
    brand: "Yarbo",
    imagePath: "/equipment/yarbo/brochure/yarbo-core.webp",
    description: "Yarbo summary shown on the page",
  },
  {
    slug: "pandag-g1",
    name: "Pandag G1",
    brand: "Pandag",
    imagePath: "/equipment/pandag/brochure/pandag-platform-lineup.webp",
    description: "Pandag detail description",
  },
] as const;

for (const item of cases) {
  test(`${item.name} renders one descriptive Product without commerce claims`, () => {
    const product = {
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      fullDescription: `${item.brand} detail description`,
      homepageSummary: `${item.brand} summary shown on the page`,
    };
    const html = renderToStaticMarkup(<ProductJsonLd product={product} />);
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);

    const schema = JSON.parse(scripts[0][1]);
    const url = `${IDS_CANONICAL_ORIGIN}/equipment/${item.slug}`;
    assert.deepEqual(schema, {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}#product`,
      name: item.name,
      url,
      description: item.description,
      image: `${IDS_CANONICAL_ORIGIN}${item.imagePath}`,
      brand: item.brand,
    });
    assert.ok(existsSync(join(process.cwd(), "public", item.imagePath.slice(1))));
  });
}

test("catalog text cannot end the JSON-LD script", () => {
  const name = "Lymow </script><script>alert(1)</script>";
  const html = renderToStaticMarkup(
    <ProductJsonLd
      product={{
        slug: "lymow-one-plus",
        name,
        brand: "Lymow",
        fullDescription: "Tracked mower",
        homepageSummary: null,
      }}
    />
  );
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  const payload = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(payload);
  assert.equal(JSON.parse(payload).name, name);
});

test("unsupported catalog entries do not receive Product markup", () => {
  assert.equal(
    productJsonLd({
      slug: "other",
      name: "Other",
      brand: "Other",
      fullDescription: "Other product",
      homepageSummary: null,
    }),
    null
  );
});
