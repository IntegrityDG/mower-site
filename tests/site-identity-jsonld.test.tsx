import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import SiteIdentityJsonLd from "../components/seo/SiteIdentityJsonLd";
import { SITE_CONTACT } from "../lib/site-contact";
import { IDS_CANONICAL_ORIGIN, IDS_SITE_NAME } from "../lib/site-origin";

test("server-rendered site identity is one connected Organization and WebSite graph", () => {
  const html = renderToStaticMarkup(<SiteIdentityJsonLd />);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);

  const graph = JSON.parse(scripts[0][1]);
  assert.equal(graph["@context"], "https://schema.org");
  assert.equal(graph["@graph"].length, 2);
  assert.deepEqual(graph["@graph"], [
    {
      "@type": "Organization",
      "@id": `${IDS_CANONICAL_ORIGIN}/#organization`,
      name: IDS_SITE_NAME,
      url: IDS_CANONICAL_ORIGIN,
      logo: `${IDS_CANONICAL_ORIGIN}/logo.png`,
      email: SITE_CONTACT.email.display,
      sameAs: [SITE_CONTACT.facebook.href],
    },
    {
      "@type": "WebSite",
      "@id": `${IDS_CANONICAL_ORIGIN}/#website`,
      url: IDS_CANONICAL_ORIGIN,
      name: IDS_SITE_NAME,
      publisher: { "@id": `${IDS_CANONICAL_ORIGIN}/#organization` },
    },
  ]);
  assert.ok(existsSync(join(process.cwd(), "public", "logo.png")));
});
