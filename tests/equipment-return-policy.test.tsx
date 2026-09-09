import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import Image from "next/image";
import EquipmentReturnPolicyModal from "../components/policies/EquipmentReturnPolicyModal";
import FooterActions from "../components/footer/FooterActions";
import InstallationRefundNotice from "../components/installations/InstallationRefundNotice";
import { loadInstallationModule as load } from "./helpers/installation-module";
import { servicesSchedulingPage } from "./helpers/installation-service-page";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
const footer = (html: string) => {
  const match = html.match(/<footer\b[\s\S]*?<\/footer>/);
  assert.ok(match, "Public footer is rendered");
  assert.equal((match[0].match(/>Returns &amp; Refunds<\/button>/g) ?? []).length, 1);
  const actions = [...match[0].matchAll(/<(button|a)\b[^>]*>([^<]+)<\/\1>/g)].map(action => text(action[2]));
  assert.deepEqual(actions.filter(label => ["Contact Us", "Schedule Service/Demo", "Troubleshoot Your Robot", "Returns & Refunds"].includes(label)), ["Contact Us", "Schedule Service/Demo", "Troubleshoot Your Robot", "Returns & Refunds"]);
  assert.match(match[0], /href="\/services-scheduling\?service=demo&amp;source=contact_ids#services-top"/);
  assert.match(match[0], /href="\/troubleshoot-your-robot"/);
  return text(match[0]);
};

for (const variant of ["Desktop", "Mobile"] as const) test(`${variant} public footer contains the policy control and retains company/coverage content`, () => {
  // Render the actual homepage shell and policy component. Only unrelated
  // content panels/navigation are omitted (including their network/CSS imports).
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": runtime, "next/image": Image,
    "@/components/footer/FooterActions": FooterActions,
    "@/lib/homepage-navigation": {},
    [`./${variant}HomeNavigation`]: () => null,
  };
  for (const panel of ["contact/HomepageContactSection", "customer-paths/purchase/NationwidePurchaseFlow", "demo-scheduling/ScheduleDemoModal", "equipment/EquipmentCatalog", "featured-businesses/HomeBusinessSpotlight", "ids-action/IdsActionCarousel", "home/HomeFinancing", "promotions/HomePriceMatch", "promotions/HomeSalesSpecial", "reviews/HomeReviews"]) modules[`@/components/${panel}`] = () => null;
  const Page = load<{ default: React.ComponentType }>(`components/${variant === "Desktop" ? "home" : "mobile"}/${variant}Homepage.tsx`, modules).default;
  const content = footer(renderToStaticMarkup(<Page />));
  for (const retained of ["Integrity Distribution Systems", "Nationwide autonomous mower sales", "Regional Service Coverage", "Southern Missouri", "Northern Arkansas", "Western Kentucky", "Western Tennessee", "Southern Illinois"]) assert.ok(content.includes(retained), retained);
});

test("Services & Scheduling footer retains its home link and adds the same policy control", async () => {
  const Page = servicesSchedulingPage(false);
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.match(footer(html), /Integrity Distribution Systems · Services & Scheduling/);
  assert.match(html.match(/<footer\b[\s\S]*?<\/footer>/)![0], /href="\/"[^>]*>Integrity Distribution Systems<\/a>/);
});

test("the rendered policy exactly matches the IDS-approved wording and punctuation", () => {
  const html = renderToStaticMarkup(<EquipmentReturnPolicyModal />);
  const policy = [...html.matchAll(/<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => text(match[2])).join(" ");
  // SHA-256 of the September 8, 2026 IDS-approved title and complete body,
  // whitespace-normalized only. Locks all clauses without another policy copy.
  assert.equal(createHash("sha256").update(policy).digest("hex"), "60104335b0729ca23f80ab0654d9afffc462eca72ef6003ab0dc757db18a481e");
});

test("the policy uses a closed native dialog, a labelled button, unique IDs, and an accessible Close control", () => {
  const html = renderToStaticMarkup(<><EquipmentReturnPolicyModal /><EquipmentReturnPolicyModal /></>);
  const triggers = [...html.matchAll(/<button\b[^>]*aria-haspopup="dialog"[^>]*>/g)];
  assert.equal(triggers.length, 2);
  for (const [index, match] of [...html.matchAll(/<dialog\b[^>]*>/g)].entries()) {
    const dialogId = match[0].match(/id="([^"]+)"/)![1];
    const headingId = match[0].match(/aria-labelledby="([^"]+)"/)![1];
    assert.ok(triggers[index][0].includes(`aria-controls="${dialogId}"`));
    assert.match(triggers[index][0], /type="button".*aria-expanded="false"/);
    assert.match(match[0], /aria-modal="true"/);
    assert.doesNotMatch(match[0], /\sopen(?:\s|=|>)/);
    assert.ok(html.includes(`id="${headingId}" tabindex="-1"`));
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, 4);
  assert.match(html, /aria-label="Close equipment return and refund policy"/);
  assert.doesNotMatch(html, /<a\b|<form\b/);
});

test("equipment scope and separate service terms remain explicit alongside the existing service-refund notice", () => {
  const policy = text(renderToStaticMarkup(<EquipmentReturnPolicyModal />));
  assert.match(policy, /This policy applies to equipment purchases only\./);
  assert.match(policy, /Professional Installation, Professional Setup & Optimization, Remote Support, service work, deposits, cancellations, labor charges, travel charges, and other service-related charges are governed by their respective service terms and refund policies\./);
  const notice = text(renderToStaticMarkup(<InstallationRefundNotice />));
  assert.match(notice, /7–12 business days/);
  assert.doesNotMatch(notice, /restocking|25%/);
});
