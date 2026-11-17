import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import HomepageNavigation from "../components/home/HomepageNavigation";
const source = readFileSync(new URL("../components/home/HomepageNavigation.tsx", import.meta.url), "utf8");
const html = renderToStaticMarkup(<HomepageNavigation activeView="home" onSelect={() => {}} />);

test("shared navigation shows text labels without a hamburger or modal drawer", () => {
  for (const label of ["HOME", "OUR MACHINES", "SERVICE AND SCHEDULE", "ABOUT IDS", "BUILD YOUR SYSTEM"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Open navigation|hamburger|role="dialog"|aria-modal/);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 3);
  assert.equal((html.match(/hidden=""/g) ?? []).length, 3);
});
test("all brands appear in the machines group and PAC-MAN stays nested inside Yarbo", () => {
  for (const path of ["/equipment/lymow-one-plus", "/equipment/yarbo", "/equipment/pandag-g1", "/equipment/accessories", "/equipment/yarbo-pac-man-snow-blower-gen-2", "/equipment/yarbo-pac-man-snow-blower-gen-2-mower-pro"]) assert.ok(html.includes(`href="${path}"`));
  assert.match(source, /href="\/equipment\/yarbo"[\s\S]*ml-4[\s\S]*PAC-MAN Snow Blower/);
  assert.doesNotMatch(source, /machines: "PAC-MAN"/);
});
test("original company logo stays unmodified at right with full company name beneath", () => {
  assert.match(source, /src="\/logo.png"/);
  assert.match(source, /lg:order-last/);
  assert.match(source, /<Image[\s\S]*<span[\s\S]*Integrity Distribution Systems<\/span>/);
});
test("preserves informational, service, support, scheduling, and dealer destinations", () => {
  for (const path of ["/about-us", "/professional-installation", "/service", "/remote-assistance", "/services-scheduling", "/featured-businesses", "/referral-program", "/dealer-tech-resources"]) assert.ok(html.includes(`href="${path}"`));
  for (const view of ["build", "machines", "financing", "reviews", "ids-action", "contact"]) assert.ok(html.includes(`href="/#${view}"`));
  assert.ok(html.includes("/services-scheduling?service=demo&amp;source=contact_ids#services-top"));
});
test("disclosures provide pointer, keyboard, Escape, outside focus, and history dismissal", () => {
  for (const value of ['"pointerdown"', '"Escape"', '"ArrowDown"', '"ArrowUp"', '"Home"', '"End"', '"popstate"', '"hashchange"']) assert.ok(source.includes(value));
  assert.match(source, /triggers\.current\[openMenu\]\?\.focus/);
  assert.match(source, /event\.relatedTarget instanceof Node/);
  assert.match(source, /aria-controls=/);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.doesNotMatch(source, /document\.body\.style\.overflow/);
});
