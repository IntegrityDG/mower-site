import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as config from "../lib/scheduling/config";
import * as types from "../lib/demo-scheduling/types";
import * as disclaimer from "../lib/demo-party/disclaimer";
import { loadInstallationModule as load } from "./helpers/installation-module";

for (const intakeEnabled of [false, true]) test(`service entry reflects server intake=${intakeEnabled}, retains information and demo`, async () => {
  const page = load<typeof import("../app/services-scheduling/page")>("app/services-scheduling/page.tsx", {
    "react/jsx-runtime": runtime,
    "next/link": (props: object) => createElement("a", props), "next/image": () => null,
    "@/components/services-scheduling/DemoRequestForm": () => createElement("div", null, "Synthetic demo form"),
    "@/lib/demo-party/disclaimer": disclaimer, "@/lib/demo-scheduling/types": types, "@/lib/scheduling/config": config,
    "@/lib/installations/controls": { installationControls: () => ({ intakeEnabled, onlinePaymentsEnabled: false }) },
  });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  const card = html.match(/<article[\s\S]*?<\/article>/g)!.find(card => card.includes('href="/professional-installation"'))!;
  assert.match(card, intakeEnabled ? /Available/ : /Coming soon/);
  assert.match(card, intakeEnabled ? /Request installation/ : /Installation information/);
  assert.match(html, /href="#request-demo"/); assert.match(html, /id="services-top"/);
});
