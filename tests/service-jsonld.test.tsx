import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ServiceJsonLd, {
  serializeServiceJsonLd,
  serviceJsonLd,
  type DedicatedServicePath,
} from "../components/seo/ServiceJsonLd";
import { IDS_CANONICAL_ORIGIN } from "../lib/site-origin";

const services: Array<{
  path: DedicatedServicePath;
  name: string;
  description: string;
}> = [
  {
    path: "/professional-installation",
    name: "Professional Installation",
    description:
      "Professional installation for autonomous mower equipment with optional Professional Setup & Optimization. Materials are reconciled to actual use, and approved travel or other charges may affect the final cost.",
  },
  {
    path: "/service",
    name: "Service",
    description:
      "Remote and on-site service for supported equipment, including diagnostics and maintenance. Diagnosis and actual work are billable even when repair cannot be completed.",
  },
  {
    path: "/remote-assistance",
    name: "Remote Assistance",
    description:
      "Remote Support by phone or Facebook Messenger for active subscribers, with four issue-based sessions per billing cycle and follow-up conversations on the same issue until resolved.",
  },
];

for (const { path, name, description } of services) {
  test(`${path} renders one standalone Service with the existing provider reference`, () => {
    const url = `${IDS_CANONICAL_ORIGIN}${path}`;
    const expected = {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": `${url}#service`,
      name,
      description,
      url,
      provider: { "@id": `${IDS_CANONICAL_ORIGIN}/#organization` },
    };
    assert.deepEqual(serviceJsonLd(path), expected);

    const html = renderToStaticMarkup(<ServiceJsonLd path={path} />);
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.deepEqual(JSON.parse(scripts[0][1]), expected);

    const pageSource = readFileSync(`app${path}/page.tsx`, "utf8");
    assert.equal(pageSource.match(/<ServiceJsonLd\b/g)?.length, 1);
    assert.match(pageSource, /<BreadcrumbJsonLd\b/);
  });
}

test("the services overview has no Service entity", () => {
  assert.doesNotMatch(readFileSync("app/services-scheduling/page.tsx", "utf8"), /ServiceJsonLd/);
});

test("Service JSON-LD safely serializes text without changing its value", () => {
  const description = '</script><script>alert("x")</script>';
  const serialized = serializeServiceJsonLd({ description });
  assert.doesNotMatch(serialized, /<\/script>/);
  assert.equal(JSON.parse(serialized).description, description);
});
