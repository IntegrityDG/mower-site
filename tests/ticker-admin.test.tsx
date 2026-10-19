import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_TICKER_CONFIG, type TickerConfig } from "../lib/promotions/ticker";
import { chicagoInputCandidates, chicagoInputToIso, duplicateTickerEditorMessage, isoToChicagoInput, moveTickerMessage, newTickerEditorMessage, tickerContrastRatio, tickerEditorPreview, tickerToEditor, validateTickerEditor } from "../lib/promotions/ticker-editor";

// Exercise the real preview component; Node needs only CSS class exports replaced.
const require = createRequire(import.meta.url);
const css = readFileSync(new URL("../components/promotions/SalesTicker.module.css", import.meta.url), "utf8");
const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => { module.exports = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => [match[1], match[1]])); };
const { default: HomepageSalesTickerEditor } = require("../components/admin/HomepageSalesTickerEditor") as typeof import("../components/admin/HomepageSalesTickerEditor");
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const ticker: TickerConfig = { ...DEFAULT_TICKER_CONFIG, messages: [{ id, message: "Local preview example", active: true, link: "/products", startsAt: null, endsAt: null }] };

test("editor maps optional fields to editable inputs and saves only allowlisted ticker fields", () => {
  const draft = tickerToEditor(ticker);
  assert.equal(draft.messages[0].link, "/products");
  assert.equal(draft.messages[0].startsAt, "");
  assert.equal(draft.messages[0].endsAt, "");
  draft.messages[0].message = "Edited promotion";
  draft.messages[0].link = "";
  draft.pauseOnHover = false;
  draft.speed = 120;
  const result = validateTickerEditor(draft);
  assert.ok(result.ok);
  assert.equal(result.value.messages[0].message, "Edited promotion");
  assert.equal(result.value.messages[0].link, null);
  assert.equal(result.value.pauseOnHover, false);
  assert.equal(result.value.speed, 120);
  assert.equal("originalStartsAt" in result.value.messages[0], false);
  assert.equal(ticker.messages[0].message, "Local preview example");
});

test("new and duplicated editor messages receive separate identities without audit fields", () => {
  const created = newTickerEditorMessage(id);
  assert.equal(created.message, "");
  assert.equal(created.active, true);
  assert.equal(created.startsAt, "");
  const source = { ...created, message: "Editable copy", createdAt: "private audit", updatedBy: "private actor" };
  const duplicate = duplicateTickerEditorMessage(source, id2);
  assert.equal(duplicate.id, id2);
  assert.equal(duplicate.message, source.message);
  assert.equal("createdAt" in duplicate, false);
  assert.equal("updatedBy" in duplicate, false);
  duplicate.message = "Changed copy";
  assert.equal(source.message, "Editable copy");
});

test("move up/down and drag destinations preserve sequence and message identity", () => {
  const original = [id, id2, "third"];
  assert.deepEqual(moveTickerMessage(original, 0, 2), [id2, "third", id]);
  assert.deepEqual(moveTickerMessage(original, 2, 0), ["third", id, id2]);
  assert.deepEqual(moveTickerMessage(moveTickerMessage(original, 0, 1), 1, 0), original);
  assert.equal(moveTickerMessage(original, 0, -1), original);
  assert.equal(moveTickerMessage(original, 2, 3), original);
  assert.deepEqual(original, [id, id2, "third"]);
});

test("Chicago input converts winter/summer wall times independently of host timezone", () => {
  assert.equal(chicagoInputToIso("2026-01-15T09:30"), "2026-01-15T15:30:00.000Z");
  assert.equal(chicagoInputToIso("2026-07-15T09:30"), "2026-07-15T14:30:00.000Z");
  assert.equal(isoToChicagoInput("2026-07-15T14:30:00.000Z"), "2026-07-15T09:30");
  assert.equal(isoToChicagoInput("2026-01-15T15:30:00.000Z"), "2026-01-15T09:30");
  assert.equal(chicagoInputToIso(""), null);
  assert.equal(isoToChicagoInput(null), "");
  assert.throws(() => chicagoInputToIso("2026-02-30T12:00"), /valid date and time/);
});

test("Chicago daylight-saving gap is rejected and repeated hour requires an explicit occurrence", () => {
  assert.equal(chicagoInputToIso("2026-03-08T01:59"), "2026-03-08T07:59:00.000Z");
  assert.throws(() => chicagoInputToIso("2026-03-08T02:30"), /does not exist/);
  assert.equal(chicagoInputToIso("2026-03-08T03:00"), "2026-03-08T08:00:00.000Z");
  assert.deepEqual(chicagoInputCandidates("2026-11-01T01:30"), ["2026-11-01T06:30:00.000Z", "2026-11-01T07:30:00.000Z"]);
  assert.throws(() => chicagoInputToIso("2026-11-01T01:30"), /occurs twice/);
  assert.equal(chicagoInputToIso("2026-11-01T01:30", "2026-11-01T06:30:00.000Z"), "2026-11-01T06:30:00.000Z");
  assert.equal(chicagoInputToIso("2026-11-01T01:30", "2026-11-01T07:30:00.000Z"), "2026-11-01T07:30:00.000Z");
});

test("saved instants retain sub-minute precision and repeated-hour identity across unrelated edits", () => {
  const saved = { ...ticker, messages: [{ ...ticker.messages[0], startsAt: "2026-11-01T07:30:45.123Z", endsAt: "2026-11-01T08:45:13.010Z" }] };
  const draft = tickerToEditor(saved);
  draft.textColor = "#ABCDEF";
  const result = validateTickerEditor(draft);
  assert.ok(result.ok);
  assert.equal(result.value.messages[0].startsAt, saved.messages[0].startsAt);
  assert.equal(result.value.messages[0].endsAt, saved.messages[0].endsAt);
});

test("editor validation identifies time field errors and rejects invalid ranges, links, colors and empty messages", () => {
  const draft = tickerToEditor(ticker);
  draft.messages[0].startsAt = "2026-03-08T02:30";
  let result = validateTickerEditor(draft);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors["messages.0.startsAt"], /does not exist/);
  draft.messages[0].startsAt = "2026-07-15T12:00";
  draft.messages[0].endsAt = "2026-07-15T11:00";
  result = validateTickerEditor(draft);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors["messages.0.endsAt"], /after/);
  draft.messages[0].startsAt = "";
  draft.messages[0].endsAt = "";
  draft.messages[0].message = " ";
  draft.messages[0].link = "javascript:alert(1)";
  draft.backgroundColor = "red";
  draft.speed = -1;
  result = validateTickerEditor(draft);
  assert.equal(result.ok, false);
  if (!result.ok) for (const key of ["messages.0.message", "messages.0.link", "backgroundColor", "speed"]) assert.ok(result.errors[key]);
});

test("live preview uses only local edits with safe color and link fallbacks", () => {
  const draft = tickerToEditor(ticker);
  draft.backgroundColor = "invalid";
  draft.textColor = "#123456";
  draft.messages[0].message = "Unsaved preview";
  draft.messages[0].link = "data:text/html,unsafe";
  const preview = tickerEditorPreview(draft);
  assert.equal(preview.enabled, true);
  assert.equal(preview.backgroundColor, DEFAULT_TICKER_CONFIG.backgroundColor);
  assert.equal(preview.textColor, "#123456");
  assert.equal(preview.messages[0].message, "Unsaved preview");
  assert.equal(preview.messages[0].link, null);
  assert.equal(draft.backgroundColor, "invalid");
  assert.equal(ticker.messages[0].message, "Local preview example");
  draft.messages[0].startsAt = "2026-03-08T02:30";
  assert.equal(tickerEditorPreview(draft).messages.length, 0);
});

test("contrast calculation flags unreadable choices without modifying selected colors", () => {
  assert.equal(tickerContrastRatio("#FFFFFF", "#FFFFFF"), 1);
  assert.equal(tickerContrastRatio("#FFFFFF", "#000000"), 21);
  assert.equal(tickerContrastRatio("garbage", "#FFFFFF"), null);
  assert.ok(tickerContrastRatio("#777777", "#FFFFFF")! < 4.5);
});

test("admin markup exposes labeled appearance, preview, links, dates and accessible sequence controls", () => {
  const html = renderToStaticMarkup(<HomepageSalesTickerEditor initialSnapshot={{ ticker, revision: 3 }} />);
  for (const text of ["Homepage Sales Ticker", "Ticker Enabled", "Scroll Speed", "50 pixels/second", "Background Color", "Text Color", "Separator / Accent Color", "Pause on Hover / Focus", "Live Preview", "Add Message", "Move Up", "Move Down", "Optional link", "America/Chicago", "Save Ticker Changes", "Duplicate", "Delete"]) assert.ok(html.includes(text), text);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Move Up: message 1"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Move Down: message 1"/);
  assert.match(html, /type="range" min="20" max="120"/);
  assert.match(html, /type="datetime-local"/);
  assert.match(html, /maxLength="400"/);
  assert.equal((html.match(/type="color"/g) ?? []).length, 3);
  assert.match(html, /Your|Changes stay in this form until you save/);
});

test("repeated Chicago hour has an accessible occurrence choice preserving the saved instant", () => {
  const config = { ...ticker, messages: [{ ...ticker.messages[0], startsAt: "2026-11-01T07:30:45.123Z" }] };
  const html = renderToStaticMarkup(<HomepageSalesTickerEditor initialSnapshot={{ ticker: config, revision: 0 }} />);
  assert.match(html, /Repeated hour — choose occurrence/);
  assert.match(html, /First occurrence/);
  assert.match(html, /Second occurrence/);
  assert.match(html, /value="2026-11-01T07:30:00.000Z" selected=""/);
});

test("editor character count agrees with server Unicode limits and keeps oversize edits visible for correction", () => {
  const config = { ...ticker, messages: [{ ...ticker.messages[0], message: "🌱".repeat(200) }] };
  let html = renderToStaticMarkup(<HomepageSalesTickerEditor initialSnapshot={{ ticker: config, revision: 0 }} />);
  assert.match(html, /200\/200 characters/);
  assert.doesNotMatch(html, /400\/200 characters/);
  assert.equal(validateTickerEditor(tickerToEditor(config)).ok, true);
  config.messages[0].message = "x".repeat(201);
  html = renderToStaticMarkup(<HomepageSalesTickerEditor initialSnapshot={{ ticker: config, revision: 0 }} />);
  assert.match(html, /Shorten it before saving/);
  assert.equal(validateTickerEditor(tickerToEditor(config)).ok, false);
  assert.ok(html.includes("x".repeat(201)));
});

test("ticker section is mounted after authentication inside the existing Sales & Specials workspace", () => {
  const page = readFileSync(new URL("../app/admin/sales-specials/page.tsx", import.meta.url), "utf8");
  assert.ok(page.indexOf("if (!authed)") < page.indexOf("<HomepageSalesTickerEditor"));
  assert.ok(page.indexOf("<PromotionEditor key=") < page.indexOf("<HomepageSalesTickerEditor"));
  const source = readFileSync(new URL("../components/admin/HomepageSalesTickerEditor.tsx", import.meta.url), "utf8");
  assert.match(source, /window\.confirm\(`Delete message/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /JSON\.stringify\(\{ ticker: result\.value, revision \}\)/);
  assert.match(source, /response\.status === 409/);
  assert.match(source, /Your edits have been kept/);
  assert.match(source, /signal: controller\.signal/);
});
