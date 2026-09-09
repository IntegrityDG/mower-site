import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import FooterActions from "../components/footer/FooterActions";
import * as config from "../lib/scheduling/config";
import * as types from "../lib/demo-scheduling/types";
import * as disclaimer from "../lib/demo-party/disclaimer";
import { loadInstallationModule as load } from "./helpers/installation-module";

for (const intakeEnabled of [false, true]) test(`service entry reflects server intake=${intakeEnabled}, retains information and demo`, async () => {
  const page = load<typeof import("../app/services-scheduling/page")>("app/services-scheduling/page.tsx", {
    "react/jsx-runtime": runtime,
    "@/components/footer/FooterActions": FooterActions,
    "next/link": (props: object) => createElement("a", props), "next/image": () => null,
    "@/components/services-scheduling/DemoRequestForm": () => createElement("div", null, "Synthetic demo form"),
    "@/lib/demo-party/disclaimer": disclaimer, "@/lib/demo-scheduling/types": types, "@/lib/scheduling/config": config,
    "@/lib/installations/controls": { installationControls: () => ({ intakeEnabled, onlinePaymentsEnabled: false }) },
    "@/lib/service/availability": { readPublicServiceAvailability: async () => ({
      professional_installation: { available: intakeEnabled, public_message: "" }, professional_setup: { available: intakeEnabled, public_message: "" },
      paid_remote_service: { available: false, public_message: "" }, onsite_service: { available: false, public_message: "" },
      new_remote_support_subscriptions: { available: false, public_message: "" }, existing_subscriber_assistance: { available: false, public_message: "" },
    }) },
  });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  const card = html.match(/<article[\s\S]*?<\/article>/g)!.find(card => card.includes('href="/professional-installation"'))!;
  assert.match(card, intakeEnabled ? /Available/ : /CURRENTLY UNAVAILABLE/);
  assert.match(card, intakeEnabled ? /Request installation/ : /Installation information/);
  assert.match(html, /href="#request-demo"/); assert.match(html, /id="services-top"/);
});
