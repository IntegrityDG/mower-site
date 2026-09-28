import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import BreadcrumbJsonLd, {
  breadcrumbJsonLd,
  EQUIPMENT_BREADCRUMB,
  HOME_BREADCRUMB,
  SERVICES_BREADCRUMB,
  TROUBLESHOOTING_BREADCRUMB,
} from "../components/seo/BreadcrumbJsonLd";
import { IDS_CANONICAL_ORIGIN } from "../lib/site-origin";

const routes = [
  { path: "/equipment/lymow-one-plus", name: "Lymow One Plus", parent: EQUIPMENT_BREADCRUMB },
  { path: "/equipment/yarbo", name: "Yarbo Core", parent: EQUIPMENT_BREADCRUMB },
  { path: "/equipment/pandag-g1", name: "Pandag G1", parent: EQUIPMENT_BREADCRUMB },
  { path: "/equipment/accessories", name: "Accessories & Parts", parent: EQUIPMENT_BREADCRUMB },
  { path: "/professional-installation", name: "Professional Installation", parent: SERVICES_BREADCRUMB },
  { path: "/service", name: "Service", parent: SERVICES_BREADCRUMB },
  { path: "/remote-assistance", name: "Remote Assistance", parent: SERVICES_BREADCRUMB },
  {
    path: "/troubleshoot-your-robot/46a3f5dc-bcbb-40c4-98ae-be366d78e31f",
    name: "Yarbo has DISAPPEARED!",
    parent: TROUBLESHOOTING_BREADCRUMB,
  },
] as const;

for (const { path, name, parent } of routes) {
  test(`${path} renders one ordered canonical BreadcrumbList`, () => {
    const html = renderToStaticMarkup(
      <BreadcrumbJsonLd items={[HOME_BREADCRUMB, parent, { name, path }]} />,
    );
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.deepEqual(JSON.parse(scripts[0][1]), {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: IDS_CANONICAL_ORIGIN },
        { "@type": "ListItem", position: 2, name: parent.name, item: `${IDS_CANONICAL_ORIGIN}${parent.path}` },
        { "@type": "ListItem", position: 3, name, item: `${IDS_CANONICAL_ORIGIN}${path}` },
      ],
    });
  });
}

test("dynamic article titles cannot escape their JSON-LD script", () => {
  const title = "Fix </script><script>alert(1)</script>";
  const html = renderToStaticMarkup(
    <BreadcrumbJsonLd items={[HOME_BREADCRUMB, TROUBLESHOOTING_BREADCRUMB, {
      name: title,
      path: "/troubleshoot-your-robot/46a3f5dc-bcbb-40c4-98ae-be366d78e31f",
    }]} />,
  );
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  const payload = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(payload);
  assert.equal(JSON.parse(payload).itemListElement[2].name, title);
});

test("breadcrumb paths reject external URLs and query parameters", () => {
  for (const path of ["https://example.com/x", "//example.com/x", "/service?source=ad", "/service#request"]) {
    assert.throws(() => breadcrumbJsonLd([HOME_BREADCRUMB, { name: "Bad", path }]));
  }
});
