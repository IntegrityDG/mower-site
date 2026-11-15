import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import InstallationLaborTerms from "../components/installations/InstallationLaborTerms";
import InstallationServiceSummary from "../components/installations/InstallationServiceSummary";
import InstallationRefundNotice from "../components/installations/InstallationRefundNotice";
import SetupTerms from "../components/installations/SetupTerms";
import * as cancellation from "../lib/installations/cancellation";
import { DEFAULT_PRICING, additionalLabor } from "../lib/installations/policy";
import * as setup from "../lib/installations/setup";
import { loadInstallationModule as load } from "./helpers/installation-module";

const rate = /Additional Installation labor after the four cumulative included labor hours is \$125\/hour, billed at \$31\.25 per started 15 minutes\./;
const reassurance = "Most installations are completed around the three-hour mark, with the fourth hour set aside for cleanup and packing up. But unexpected site conditions can sometimes make a job take longer.";
function assertDisclosure(html: string) {
  assert.match(html, rate);
  assert.ok(html.includes(reassurance));
  assert.match(html, /same overtime rate as optional Professional Setup &amp; Optimization/);
  assert.match(html, /Installation and optional Setup have separate four-hour labor allowances/);
  assert.match(html, /Setup time does not extend the installation allowance/);
}

test("installation terms prominently disclose overtime alongside a qualified expectation and separate allowances", () => {
  const html = renderToStaticMarkup(<InstallationLaborTerms />);
  assertDisclosure(html);
  assert.match(html, /<strong>Additional Installation labor[^<]+<\/strong>/);
  assert.doesNotMatch(html, /<details|guarantee|never|\d+%|customer approval/i);
});

for (const available of [true, false]) {
  test(`installation landing page shows overtime before booking even when availability=${available}`, async () => {
    const page = load<typeof import("../app/professional-installation/page")>("app/professional-installation/page.tsx", {
      "react/jsx-runtime": runtime,
      "next/link": (props: object) => createElement("a", props),
      "@/components/installations/SetupTerms": SetupTerms,
      "@/lib/installations/setup": setup,
      "@/components/installations/InstallationRefundNotice": InstallationRefundNotice,
      "@/components/installations/InstallationBookingForm": () => createElement("div", null, "Synthetic booking form"),
      "@/components/installations/InstallationLaborTerms": InstallationLaborTerms,
      "@/components/seo/BreadcrumbJsonLd": { __esModule: true, default: () => null, HOME_BREADCRUMB: {}, SERVICES_BREADCRUMB: {} },
      "@/components/seo/ServiceJsonLd": () => null,
      "@/lib/service/availability": { readPublicServiceAvailability: async () => ({
        professional_installation: { available, public_message: "" },
        professional_setup: { available: false, public_message: "" },
      }) },
    });
    const html = renderToStaticMarkup(await page.default());
    assertDisclosure(html);
    assert.ok(html.indexOf(reassurance) < html.indexOf(available ? "Synthetic booking form" : "CURRENTLY UNAVAILABLE"));
    assert.match(html, /\$1,000/);
    assert.match(html, /\$250 booking deposit/);
  });
}

test("booking form repeats installation overtime visibly before terms acceptance and submission with Setup unchecked", () => {
  const { default: Form } = load<typeof import("../components/installations/InstallationBookingForm")>("components/installations/InstallationBookingForm.tsx", {
    "react": React, "react/jsx-runtime": runtime,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/lib/installations/cancellation": cancellation,
    "./SetupTerms": SetupTerms, "./InstallationRefundNotice": InstallationRefundNotice,
    "./InstallationLaborTerms": InstallationLaborTerms,
    "@/lib/installations/setup": setup,
    "@/lib/demo-scheduling/time": { humanDemoTime: () => "Synthetic appointment" },
    "@/lib/installations/availability-client": { loadInstallationAvailability: async () => [] },
  });
  const html = renderToStaticMarkup(<Form setupAvailability={{ available: false, message: "Setup paused" }} />);
  const pricing = html.slice(html.indexOf('aria-label="Initial pricing summary"'), html.indexOf('name="termsAcknowledged"'));
  assertDisclosure(pricing);
  assert.doesNotMatch(pricing, /<details/);
  assert.match(html.match(/<input[^>]*name="setupSelected"[^>]*>/)![0], /disabled=""/);
  assert.ok(html.indexOf(reassurance) < html.indexOf('name="termsAcknowledged"'));
  assert.ok(html.indexOf(reassurance) < html.indexOf("Submit installation request"));
  assert.match(html, /case-by-case cancellation policy/);
});

test("saved-price summary displays the approved installation overtime rate without rewriting historical/custom pricing", () => {
  const render = (pricing = DEFAULT_PRICING) => renderToStaticMarkup(<InstallationServiceSummary job={{ installation_selected: true, setup_selected: false, pricing_snapshot: pricing }} sessions={[]} adjustments={[]} />);
  assertDisclosure(render());
  const customized = render({ ...DEFAULT_PRICING, additionalLaborHourlyCents: 15000 });
  assert.match(customized, /\$150\/hour, billed at \$37\.5 per started 15 minutes/);
  assert.doesNotMatch(customized, /\$125\/hour|same overtime rate/);
  const setupOnly = renderToStaticMarkup(<InstallationServiceSummary job={{ installation_selected: false, setup_selected: true, pricing_snapshot: DEFAULT_PRICING }} sessions={[]} adjustments={[]} />);
  assert.doesNotMatch(setupOnly, /Additional Installation labor|Most installations/);
  const portal = readFileSync("app/professional-installation/[token]/page.tsx", "utf8");
  assert.ok(portal.indexOf("<InstallationServiceSummary") < portal.indexOf("Pay required"));
});

test("existing installation and Setup calculations agree at overtime boundaries without pooling included time", () => {
  for (const [minutes, cents] of [[239, 0], [240, 0], [240.01, 3125], [241, 3125], [255, 3125], [255.01, 6250], [270, 6250]]) {
    assert.equal(additionalLabor(minutes, DEFAULT_PRICING), cents);
    assert.equal(setup.setupOvertime(minutes), cents);
  }
  assert.equal(additionalLabor(241, DEFAULT_PRICING) + setup.setupOvertime(0), 3125);
  assert.equal(additionalLabor(0, DEFAULT_PRICING) + setup.setupOvertime(241), 3125);
});
