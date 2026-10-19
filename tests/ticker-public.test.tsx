import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_TICKER_CONFIG, type TickerConfig, type TickerMessage } from "../lib/promotions/ticker";

// Node does not evaluate CSS modules. Keep the real component and substitute only
// class-name exports; browser verification exercises the actual stylesheet.
const require = createRequire(import.meta.url);
const css = readFileSync("components/promotions/SalesTicker.module.css", "utf8");
const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => [match[1], match[1]]));
};
const { default: SalesTicker, tickerMotionLayout, tickerServerNow } = require("../components/promotions/SalesTicker") as typeof import("../components/promotions/SalesTicker");
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

const now = "2026-10-19T17:00:00.000Z";
const message = (id: string, overrides: Partial<TickerMessage> = {}): TickerMessage => ({
  id, message: `Promotion ${id}`, active: true, link: null, startsAt: null, endsAt: null, ...overrides,
});
const config = (overrides: Partial<TickerConfig> = {}): TickerConfig => ({ ...DEFAULT_TICKER_CONFIG, enabled: true, messages: [message("one")], ...overrides });
const render = (value: TickerConfig) => renderToStaticMarkup(<SalesTicker config={value} serverTime={now} />);

test("disabled or schedule-empty public tickers collapse completely", () => {
  assert.equal(render(config({ enabled: false })), "");
  assert.equal(render(config({ messages: [] })), "");
  assert.equal(render(config({ messages: [
    message("inactive", { active: false }),
    message("future", { startsAt: "2026-10-19T18:00:00Z" }),
    message("expired", { endsAt: now }),
  ] })), "");
});

test("initial server-rendered messages honor the supplied server clock and sequence", () => {
  const html = render(config({ messages: [
    message("first", { startsAt: now }),
    message("future", { startsAt: "2026-10-19T18:00:00Z" }),
    message("second", { startsAt: "2026-10-18T17:00:00Z", endsAt: "2026-10-20T17:00:00Z" }),
    message("expired", { endsAt: now }),
  ] }));
  assert.ok(html.indexOf("Promotion first") < html.indexOf("Promotion second"));
  assert.doesNotMatch(html, /Promotion future|Promotion expired/);
  assert.match(html, /role="region" aria-label="Homepage sales promotions"/);
});

test("preview schedule edits use the editor's current clock immediately", () => {
  const value = config({ messages: [message("scheduled", { startsAt: "2026-10-19T18:00:00Z" })] });
  assert.equal(renderToStaticMarkup(<SalesTicker config={value} serverTime={now} preview />), "");
  assert.match(renderToStaticMarkup(<SalesTicker config={value} serverTime="2026-10-19T18:00:00Z" preview />), /Promotion scheduled/);
});

test("runtime schedule clocks follow server time despite client clock skew and across remounts", (context) => {
  const serverTimestamp = Date.parse(now);
  const wallClock = context.mock.method(Date, "now", () => serverTimestamp + 86_400_000);
  assert.equal(tickerServerNow(now, 100, 1_100), serverTimestamp + 1_000);
  wallClock.mock.mockImplementation(() => serverTimestamp - 86_400_000);
  assert.equal(tickerServerNow(now, 100, 1_100), serverTimestamp + 1_000);
  // The Homepage retains observation time when returning from another home view.
  assert.equal(tickerServerNow(now, 100, 600_100), serverTimestamp + 600_000);
  assert.equal(tickerServerNow(now, 100, 50), serverTimestamp);
});

test("public messages escape HTML and render only safe optional links", () => {
  const html = render(config({ messages: [
    message("plain", { message: "<script>alert('sale')</script>" }),
    message("internal", { link: "/equipment/yarbo" }),
    message("external", { link: "https://example.com/sale" }),
    message("unsafe", { link: "javascript:alert(1)" }),
  ] }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(html, /href="\/equipment\/yarbo"/);
  assert.match(html, /href="https:\/\/example.com\/sale"/);
});

test("animation copies are hidden from assistive technology and add no tab stops", () => {
  const html = render(config({ messages: [message("linked", { link: "/equipment" }), message("text")] }));
  assert.equal((html.match(/data-ticker-sequence="primary"/g) ?? []).length, 1);
  assert.match(html, /class="group clone" aria-hidden="true"/);
  assert.match(html, /aria-hidden="true" data-ticker-sequence="copy"/);
  assert.equal((html.match(/href="\/equipment"/g) ?? []).length, 2);
  assert.equal((html.match(/tabindex="-1"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /aria-live|<marquee/);
  assert.match(html, /aria-label="Pause sales ticker" aria-pressed="false"/);
  assert.match(html, /tabindex="0" role="group" aria-label="Scrollable sales promotions"/);
});

test("safe appearance fallback prevents malformed CSS while preserving valid selected colors", () => {
  const valid = render(config({ backgroundColor: "#123456", textColor: "#FEDCBA", accentColor: "#abcdef", pauseOnHover: false }));
  assert.match(valid, /background-color:#123456;color:#FEDCBA;--ticker-accent:#abcdef/);
  assert.match(valid, /data-pause-on-hover="false"/);
  const malformed = render(config({ backgroundColor: "url(https://unsafe.example)", textColor: "bad", accentColor: "red;position:fixed" }));
  assert.match(malformed, /background-color:#0F172A;color:#FFFFFF;--ticker-accent:#FACC15/);
  assert.doesNotMatch(malformed, /unsafe.example|position:fixed/);
});

test("the loop fills narrow and wide viewports and always moves at configured pixels per second", () => {
  for (const width of [320, 375, 667, 768, 1440, 3840]) {
    for (const sequenceWidth of [62.25, 710.5, 5000]) {
      for (const speed of [20, 50, 120]) {
        const layout = tickerMotionLayout(sequenceWidth, width, speed);
        assert.ok(layout.distance >= width + sequenceWidth, `loop coverage at ${width}px`);
        assert.equal(layout.distance, sequenceWidth * layout.repetitions);
        assert.ok(Number.isFinite(layout.duration) && layout.duration > 0);
        assert.ok(Math.abs(layout.distance / layout.duration - speed) < 0.000001);
      }
    }
  }
  assert.deepEqual(tickerMotionLayout(0, 320, 50), { repetitions: 1, distance: 0, duration: 0 });
  assert.deepEqual(tickerMotionLayout(NaN, 320, 50), { repetitions: 1, distance: 0, duration: 0 });
  for (const invalid of [0, -1, Infinity, NaN, 1000]) assert.equal(tickerMotionLayout(100, 320, invalid).duration, 10);
});

test("both homepage variants place the shared ticker after navigation and immediately before Intro", () => {
  for (const [file, prefix] of [["components/home/DesktopHomepage.tsx", "Desktop"], ["components/mobile/MobileHomepage.tsx", "Mobile"]]) {
    const source = readFileSync(file, "utf8");
    const home = source.slice(source.indexOf('view === "home"'), source.indexOf('view !== "home"'));
    assert.match(home, new RegExp(`<SalesTicker config=\\{tickerSnapshot.ticker\\}[^>]+/><${prefix}Hero />`));
    assert.ok(source.indexOf(`<${prefix}Header `) < source.indexOf("<SalesTicker "));
    assert.ok(source.indexOf(`<${prefix}HomeNavigation `) < source.indexOf("<SalesTicker "));
    assert.equal((source.match(/<SalesTicker /g) ?? []).length, 1);
    assert.match(home, /serverObservedAt=\{tickerObservedAt\}/);
    assert.match(home, new RegExp(`${prefix}Hero /><HomeSalesSpecial /><section[\\s\\S]*BUILD YOUR SYSTEM[\\s\\S]*<HomePriceMatch /><HomeBusinessSpotlight />`));
  }
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /await connection\(\)/);
  assert.match(page, /await readPublicSalesTicker\(\)/);
  assert.match(page, /<Homepage key=\{tickerSnapshot.serverTime\} tickerSnapshot=\{tickerSnapshot\} \/>/);
  assert.match(page, /alternates: \{ canonical: "\/" \}/);
});

test("the promotional ticker is 72px tall with scaled lettering and reduced motion exposes one scrollable list", () => {
  for (const property of ["height", "min-height", "max-height"]) assert.match(css, new RegExp(`${property}: 72px;`));
  assert.match(css, /font-size: 28px;/);
  assert.match(css, /@media \(min-width: 768px\) \{ \.ticker \{ font-size: 30px; \} \}/);
  assert.match(css, /\.pause \{[^}]*flex: 0 0 72px;[^}]*width: 72px;[^}]*height: 72px;[^}]*font-size: 30px;/);
  assert.match(css, /\.separator \{ padding: 0 48px;/);
  assert.match(css, /white-space: nowrap;/);
  assert.match(css, /min-width: 0;/);
  assert.match(css, /to \{ transform: translateX\(-50%\); \}/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /data-ready="true"\] \.track \{ animation: none;/);
  assert.match(reduced, /data-ready="true"\] \.viewport \{ overflow-x: auto;/);
  assert.match(reduced, /\.repeat, \.clone, \.pause \{ display: none; \}/);
  const normalMotion = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(normalMotion, /\.ticker\[data-pause-on-hover="true"\] \.viewport:focus-within \.track \{ animation: none;/);
  assert.doesNotMatch(normalMotion, /\.ticker \.viewport:focus-within \.track \{ animation: none;/);
});
