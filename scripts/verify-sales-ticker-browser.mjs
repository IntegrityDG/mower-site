import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { startTickerLocalData } from "./sales-ticker-local-data.mjs";
import { tickerLocalEnvironment } from "./sales-ticker-local-command.mjs";

const qa = createRequire(resolve(".ticker-qa/package.json"));
const { chromium } = qa("playwright");
const { default: AxeBuilder } = await import(pathToFileURL(qa.resolve("@axe-core/playwright")).href);
const origin = "http://127.0.0.1:3047";
const evidence = [];
const pass = (check, detail) => { evidence.push({ check, detail }); console.log(`PASS ${check}`); };
// Let the real CSS animation advance naturally. Seeking is reserved for the
// separate geometric loop-boundary check below and is never motion evidence.
const sampleMotion = (ticker) => ticker.evaluate(async (element) => {
  const primary = element.querySelector('[data-ticker-sequence="primary"]');
  const track = primary.parentElement.parentElement;
  // Synchronize the interaction's style change with the rendered/composited
  // animation before taking the first observation, including a pause action.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const startedAt = performance.now();
  const samples = [];
  for (const target of [0, 500, 1500]) {
    const remaining = target - (performance.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    const style = getComputedStyle(track);
    const trackBounds = track.getBoundingClientRect();
    const viewportBounds = track.parentElement.getBoundingClientRect();
    samples.push({
      elapsed: performance.now() - startedAt,
      transform: style.transform,
      x: style.transform === "none" ? 0 : new DOMMatrixReadOnly(style.transform).m41,
      animationName: style.animationName,
      duration: parseFloat(style.animationDuration),
      playState: style.animationPlayState,
      iterations: style.animationIterationCount,
      distance: primary.parentElement.getBoundingClientRect().width,
      viewportScrollLeft: track.parentElement.scrollLeft,
      covered: trackBounds.left <= viewportBounds.left + 1 && trackBounds.right >= viewportBounds.right - 1,
    });
  }
  return {
    ready: element.dataset.ready, paused: element.dataset.paused,
    pauseOnHover: element.dataset.pauseOnHover,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    primaryWidth: primary.getBoundingClientRect().width,
    viewportWidth: track.parentElement.getBoundingClientRect().width,
    repetitions: primary.parentElement.children.length,
    samples,
  };
});
const expectMotion = async (ticker, speed, label) => {
  const observation = await sampleMotion(ticker);
  assert.equal(observation.ready, "true", `${label}: valid measurement required`);
  assert.equal(observation.reducedMotion, false, `${label}: normal motion preference`);
  const velocities = [];
  for (let index = 0; index < observation.samples.length; index++) {
    const sample = observation.samples[index];
    assert.notEqual(sample.animationName, "none", `${label}: animation enabled`);
    assert.equal(sample.playState, "running", `${label}: animation running`);
    assert.equal(sample.iterations, "infinite", `${label}: continuous loop`);
    assert.equal(sample.covered, true, `${label}: moving track covers viewport`);
    assert.ok(Number.isFinite(sample.duration) && sample.duration > 0, `${label}: finite positive duration`);
    assert.ok(Math.abs(sample.distance / sample.duration - speed) < 0.1, `${label}: configured duration`);
    if (!index) continue;
    const previous = observation.samples[index - 1];
    // A reset advances to the identical content in the other equal group.
    const distance = (previous.x - sample.x + sample.distance) % sample.distance;
    const velocity = distance * 1000 / (sample.elapsed - previous.elapsed);
    assert.ok(distance > 0, `${label}: transform must advance naturally ${JSON.stringify(observation)}`);
    assert.ok(Math.abs(velocity - speed) < Math.max(3, speed * 0.12), `${label}: measured ${velocity}px/sec, expected ${speed}`);
    velocities.push(velocity);
  }
  return { ...observation, measuredPixelsPerSecond: velocities };
};
const expectStationary = async (ticker, label) => {
  const observation = await sampleMotion(ticker);
  const positions = observation.samples.map((sample) => sample.x);
  assert.ok(Math.max(...positions) - Math.min(...positions) < 0.25, `${label}: transform remains stationary ${JSON.stringify(observation)}`);
  return observation;
};
const local = await startTickerLocalData();
const logs = [];
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", process.argv.includes("--dev") ? "dev" : "start", "--hostname", "127.0.0.1", "--port", "3047"], {
  env: tickerLocalEnvironment(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
next.stdout.on("data", (chunk) => logs.push(chunk.toString()));
next.stderr.on("data", (chunk) => logs.push(chunk.toString()));
let browser;
try {
  await mkdir(".ticker-qa/screenshots", { recursive: true });
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(`${origin}/api/sales-specials/ticker`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (attempt === 89) throw new Error(`Local Next server did not start: ${logs.join("")}`);
  }
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || url.protocol === "data:" ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const read = async () => { const response = await context.request.get(`${origin}/api/admin/sales-specials/ticker`); assert.equal(response.status(), 200); return response.json(); };
  const save = async (ticker) => {
    const { revision } = await read();
    const response = await context.request.put(`${origin}/api/admin/sales-specials/ticker`, { data: { ticker, revision } });
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  await page.goto(origin);
  assert.equal(await page.locator("[data-sales-ticker]").count(), 0);
  assert.equal((await context.request.get(`${origin}/api/admin/sales-specials/ticker`)).status(), 401);
  assert.equal((await context.request.put(`${origin}/api/admin/sales-specials/ticker`, { data: {} })).status(), 401);
  pass("Disabled default collapses; unauthenticated reads and writes rejected");

  await page.goto(`${origin}/admin/sales-specials`);
  await page.getByLabel("Admin password").fill("synthetic-local-admin");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const admin = page.locator("[data-ticker-admin]");
  await admin.getByRole("button", { name: "Add Message", exact: true }).waitFor();
  await admin.getByLabel("Ticker Enabled", { exact: true }).check();
  await admin.getByLabel("Background Color", { exact: true }).fill("#064E3B");
  await admin.getByLabel("Text Color", { exact: true }).fill("#FFFFFF");
  await admin.getByLabel("Separator / Accent Color", { exact: true }).fill("#FACC15");
  await admin.getByRole("slider").focus();
  await admin.getByRole("slider").press("Home");
  for (let step = 0; step < 40; step++) await admin.getByRole("slider").press("ArrowRight");
  const cards = admin.locator("[data-ticker-message-id]");
  await admin.getByRole("button", { name: "Add Message", exact: true }).click();
  await cards.nth(0).getByLabel("Message text", { exact: true }).fill("LOCAL CHECK — EQUIPMENT OPTIONS");
  await cards.nth(0).getByLabel("Optional link", { exact: true }).fill("/equipment");
  await admin.getByRole("button", { name: "Add Message", exact: true }).click();
  await cards.nth(1).getByLabel("Message text", { exact: true }).fill("LOCAL CHECK — INSTALLATION DETAILS");
  await admin.locator("[data-sales-ticker]").waitFor();
  assert.equal((await read()).ticker.enabled, false);
  await admin.getByRole("button", { name: "Duplicate message 1", exact: true }).click();
  assert.equal(await cards.count(), 3);
  await cards.nth(1).getByLabel("Message text", { exact: true }).fill("LOCAL COPY");
  page.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Delete message 2", exact: true }).click();
  assert.equal(await cards.count(), 2);
  await admin.getByRole("button", { name: "Move Up: message 2", exact: true }).click();
  await admin.getByRole("button", { name: "Save Ticker Changes", exact: true }).click();
  await admin.getByText("Homepage Sales Ticker saved successfully.", { exact: true }).waitFor();
  let stored = await read();
  assert.deepEqual(stored.ticker.messages.map((message) => message.message), ["LOCAL CHECK — INSTALLATION DETAILS", "LOCAL CHECK — EQUIPMENT OPTIONS"]);
  assert.equal(stored.ticker.speed, 60);
  assert.equal(stored.ticker.backgroundColor, "#064E3B");
  pass("Admin create, edit, duplicate, confirmed delete, accessible reorder, local preview and save persist through real PostgreSQL");

  await page.setViewportSize({ width: 1280, height: 2200 });
  await admin.getByRole("button", { name: "Drag message 2 to reorder", exact: true }).dragTo(cards.nth(0), { targetPosition: { x: 15, y: 15 } });
  await admin.getByRole("button", { name: "Save Ticker Changes", exact: true }).click();
  await admin.getByText("Homepage Sales Ticker saved successfully.", { exact: true }).waitFor();
  stored = await read();
  assert.equal(stored.ticker.messages[0].message, "LOCAL CHECK — EQUIPMENT OPTIONS");
  await page.reload();
  await admin.getByRole("button", { name: "Add Message", exact: true }).waitFor();
  assert.equal(await cards.nth(0).getByLabel("Message text", { exact: true }).inputValue(), stored.ticker.messages[0].message);
  await admin.getByLabel("Text Color", { exact: true }).fill("#064E3B");
  await admin.getByText(/Low text contrast/).waitFor();
  assert.equal((await read()).ticker.textColor, "#FFFFFF");
  await admin.getByLabel("Text Color", { exact: true }).fill("#FFFFFF");
  await admin.getByRole("slider").focus();
  for (let step = 0; step < 20; step++) await admin.getByRole("slider").press("ArrowRight");
  assert.equal((await read()).ticker.speed, 60);
  const previewSpeed = await admin.locator('[data-ticker-sequence="primary"]').evaluate((element) => {
    const group = element.parentElement;
    return group.getBoundingClientRect().width / parseFloat(getComputedStyle(group.parentElement).animationDuration);
  });
  assert.ok(Math.abs(previewSpeed - 80) < 0.1);
  const previewTicker = admin.locator("[data-sales-ticker][data-ready='true']");
  await previewTicker.waitFor();
  await page.mouse.move(1, 1);
  const previewMotion = await expectMotion(previewTicker, 80, "Unsaved Admin Live Preview");
  pass("Unsaved Admin Live Preview naturally scrolls at its edited 80px/sec", previewMotion);
  await page.screenshot({ path: ".ticker-qa/screenshots/admin-preview.png", fullPage: true });
  const adminAxe = await new AxeBuilder({ page }).include("[data-ticker-admin]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  await writeFile(".ticker-qa/admin-axe.json", JSON.stringify(adminAxe.violations, null, 2));
  await page.setViewportSize({ width: 375, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  pass("Native drag reorder persists after refresh; preview speed/colors do not publish; contrast warning appears");

  const config = stored.ticker;
  // Add a second linked item so keyboard and reduced-motion tests traverse both.
  config.messages.push({ id: "10000000-0000-4000-8000-000000000003", message: "LOCAL CHECK — SERVICE OPTIONS", active: true, link: "/service", startsAt: null, endsAt: null });
  await save(config);
  for (const slot of ["primary", "secondary"]) {
    const response = await context.request.put(`${origin}/api/admin/sales-specials`, { data: { slot, promotion: {
      enabled: true, cartoonKey: "none", headline: `LOCAL EXISTING PROMOTION ${slot.toUpperCase()}`, description: "Local regression fixture only.",
    } } });
    assert.equal(response.status(), 200);
  }
  for (const width of [320, 375, 667, 768, 1280, 1920, 2560]) {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 900 });
    await page.goto(origin);
    const ticker = page.locator("[data-sales-ticker][data-ready='true']");
    await ticker.waitFor();
    await page.getByText("LOCAL EXISTING PROMOTION PRIMARY", { exact: true }).waitFor();
    await page.getByText("LOCAL EXISTING PROMOTION SECONDARY", { exact: true }).waitFor();
    await page.locator("#bulletin-board-heading").waitFor();
    await page.mouse.move(width - 5, 1);
    const geometry = await ticker.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const header = document.querySelector("header").getBoundingClientRect();
      const hero = element.nextElementSibling.getBoundingClientRect();
      const primary = element.querySelector('[data-ticker-sequence="primary"]');
      const track = primary.parentElement.parentElement;
      const groups = [...track.children].map((group) => group.getBoundingClientRect());
      const textNodes = [...primary.querySelectorAll(':scope > span > a, :scope > span > span:first-child')];
      const textBounds = textNodes.map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const bounds = range.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
      });
      const pause = element.querySelector("button").getBoundingClientRect();
      return { height: rect.height, width: rect.width, headerGap: rect.top - header.bottom, heroGap: hero.top - rect.bottom,
        pageOverflow: document.documentElement.scrollWidth - innerWidth, groupDifference: Math.abs(groups[0].width - groups[1].width),
        textWrap: getComputedStyle(primary).whiteSpace, fontSize: parseFloat(getComputedStyle(element).fontSize),
        minHeight: parseFloat(getComputedStyle(element).minHeight), maxHeight: parseFloat(getComputedStyle(element).maxHeight),
        background: getComputedStyle(element).backgroundColor,
        primaryMessages: textNodes.map((node) => node.textContent),
        textClipped: textBounds.some((bounds) => bounds.top < rect.top - 1 || bounds.bottom > rect.bottom + 1 || bounds.height > rect.height),
        internalHeights: [track, ...track.children, primary, ...primary.children].map((node) => node.getBoundingClientRect().height),
        pauseWidth: pause.width, pauseHeight: pause.height,
        cloneFocusables: element.querySelectorAll('[aria-hidden="true"] a:not([tabindex="-1"])').length,
        duration: parseFloat(getComputedStyle(track).animationDuration), distance: groups[0].width,
      };
    });
    assert.equal(geometry.height, 72);
    assert.equal(geometry.minHeight, 72);
    assert.equal(geometry.maxHeight, 72);
    assert.equal(geometry.fontSize, width < 768 ? 28 : 30);
    assert.ok(geometry.internalHeights.every((height) => height === 72));
    assert.equal(geometry.pauseWidth, 72);
    assert.equal(geometry.pauseHeight, 72);
    assert.equal(geometry.textClipped, false);
    assert.ok(Math.abs(geometry.headerGap) <= 1 && Math.abs(geometry.heroGap) <= 1, JSON.stringify(geometry));
    assert.ok(geometry.pageOverflow <= 0, JSON.stringify(geometry));
    assert.equal(geometry.textWrap, "nowrap");
    assert.ok(geometry.groupDifference < 0.01);
    assert.ok(Math.abs(geometry.distance / geometry.duration - 60) < 0.1);
    assert.equal(geometry.cloneFocusables, 0);
    assert.equal(geometry.background, "rgb(6, 78, 59)");
    assert.deepEqual(geometry.primaryMessages, config.messages.map((message) => message.message));
    const motion = await expectMotion(ticker, 60, `Multi-message ticker at ${width}px`);
    // Probe the entire CSS loop, including either side of its reset.
    const coverage = await ticker.evaluate((element) => {
      const primary = element.querySelector('[data-ticker-sequence="primary"]');
      const track = primary.parentElement.parentElement;
      const animation = track.getAnimations()[0];
      const bounds = track.parentElement.getBoundingClientRect();
      const duration = animation.effect.getTiming().duration;
      const covered = [0, 0.1, 0.5, 0.9, 0.9999, 1, 1.0001].map((fraction) => {
        animation.currentTime = duration * fraction;
        const rect = track.getBoundingClientRect();
        return rect.left <= bounds.left + 1 && rect.right >= bounds.right - 1;
      });
      animation.currentTime = 0;
      const initial = primary.getBoundingClientRect().left;
      const sequences = [...track.querySelectorAll('[data-ticker-sequence]')];
      const adjacent = sequences.every((sequence, index) => !index || Math.abs(sequences[index - 1].getBoundingClientRect().right - sequence.getBoundingClientRect().left) < 0.01);
      animation.currentTime = duration * (1 - 0.000001);
      const clone = track.children[1].firstElementChild;
      const boundaryDifference = Math.abs(clone.getBoundingClientRect().left - initial);
      const sameLoopContent = primary.textContent === clone.textContent;
      animation.currentTime = 0;
      return { covered, adjacent, boundaryDifference, sameLoopContent };
    });
    assert.ok(coverage.covered.every(Boolean), `Loop coverage at ${width}`);
    assert.equal(coverage.adjacent, true, `Adjacent sequences at ${width}`);
    assert.ok(coverage.boundaryDifference < 1, `Seamless boundary at ${width}: ${JSON.stringify(coverage)}`);
    assert.equal(coverage.sameLoopContent, true);
    if ([320, 375, 768, 1280].includes(width)) {
      await page.locator("header img, .ids-purpose-background img").evaluateAll((images) => Promise.all(images.map((image) => image.decode().catch(() => {}))));
      await page.screenshot({ path: `.ticker-qa/screenshots/home-${width}.png` });
    }
    pass(`Responsive ${width}px: header > 72px ticker > Intro; natural 60px/sec motion; no clipping, wrapping, overflow or loop gap`, { geometry, motion, coverage });
  }

  await save({ ...config, pauseOnHover: false, messages: [config.messages[0]] });
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    const single = page.locator("[data-sales-ticker][data-ready='true']");
    await single.waitFor();
    await page.mouse.move(1, 1);
    pass(`Single-message ticker naturally scrolls at ${width}px`, await expectMotion(single, 60, `Single-message ticker at ${width}px`));
  }
  await save(config);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin);
  const ticker = page.locator("[data-sales-ticker][data-ready='true']");
  await ticker.waitFor();
  const track = ticker.locator('[data-ticker-sequence="primary"]').locator("..").locator("..");
  await ticker.hover();
  assert.equal(await track.evaluate((element) => getComputedStyle(element).animationPlayState), "paused");
  const hoverPaused = await expectStationary(ticker, "Pause-on-hover ON");
  await page.mouse.move(1, 1);
  assert.equal(await track.evaluate((element) => getComputedStyle(element).animationPlayState), "running");
  const hoverResumed = await expectMotion(ticker, 60, "Pointer leaving resumes");
  await ticker.getByRole("button", { name: "Pause sales ticker", exact: true }).click();
  await page.mouse.move(1, 1);
  assert.equal(await track.evaluate((element) => getComputedStyle(element).animationPlayState), "paused");
  const manualPaused = await expectStationary(ticker, "Manual Pause");
  await ticker.getByRole("button", { name: "Resume sales ticker", exact: true }).click();
  // The focused button is a real focus interaction while this setting is ON.
  await ticker.getByRole("button", { name: "Pause sales ticker", exact: true }).blur();
  await page.mouse.move(1, 1);
  const manualResumed = await expectMotion(ticker, 60, "Manual Resume after leaving interaction");
  const primaryLinks = ticker.locator('[data-ticker-sequence="primary"] a');
  await ticker.getByRole("group", { name: "Scrollable sales promotions", exact: true }).focus();
  const viewportFocused = await expectStationary(ticker, "Pause-on-focus ON viewport");
  await primaryLinks.nth(1).focus();
  assert.equal(await track.evaluate((element) => getComputedStyle(element).animationName), "none");
  const linkFocused = await expectStationary(ticker, "Pause-on-focus ON link");
  const focusVisible = await primaryLinks.nth(1).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = element.closest('[data-sales-ticker]').getBoundingClientRect();
    return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1;
  });
  assert.equal(focusVisible, true);
  await primaryLinks.nth(1).blur();
  await page.mouse.move(1, 1);
  const focusResumed = await expectMotion(ticker, 60, "Leaving focused ticker resumes");
  const publicAxe = await new AxeBuilder({ page }).include("[data-sales-ticker]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(publicAxe.violations.map(({ id, nodes }) => ({ id, count: nodes.length })), []);
  pass("Real transforms confirm hover/focus pause and resume, manual pause/resume, visible keyboard focus; public axe passes", { hoverPaused, hoverResumed, manualPaused, manualResumed, viewportFocused, linkFocused, focusResumed });

  // Exercise both navigation drawers and their existing demo link, then return home.
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin); await ticker.waitFor();
    await page.getByRole("button", { name: width < 768 ? "Open navigation" : "Open desktop navigation", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: width < 768 ? "Mobile navigation" : "Desktop navigation", exact: true });
    assert.match(await drawer.getByRole("link", { name: "Schedule Service/Demo", exact: true }).getAttribute("href"), /^\/services-scheduling\?service=demo/);
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    const footer = page.locator("footer");
    assert.match(await footer.getByRole("link", { name: "Schedule Service/Demo", exact: true }).getAttribute("href"), /^\/services-scheduling\?service=demo/);
    await footer.getByRole("button", { name: "Returns & Refunds", exact: true }).click();
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
  }
  pass("Both header navigation drawers, Schedule Service/Demo links, footer policy actions, existing promotion saves and Bulletin Board remain functional");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin);
  await ticker.waitFor();
  assert.equal(await track.evaluate((element) => getComputedStyle(element).animationName), "none");
  const reducedMotion = await expectStationary(ticker, "Reduced motion");
  assert.equal(reducedMotion.reducedMotion, true);
  assert.ok(reducedMotion.samples.every((sample) => sample.animationName === "none"));
  assert.equal(await ticker.getByRole("button").count(), 0);
  for (let index = 0; index < await primaryLinks.count(); index++) {
    await primaryLinks.nth(index).focus();
    assert.equal(await primaryLinks.nth(index).evaluate((element) => element === document.activeElement), true);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: ".ticker-qa/screenshots/reduced-motion-320.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  pass("Reduced motion: measured stationary transform, single semantic sequence, accessible links and internal scroll, no page overflow", reducedMotion);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await save({ ...config, pauseOnHover: false });
  await page.goto(origin); await ticker.waitFor(); await ticker.hover();
  assert.equal(await track.evaluate((element) => getComputedStyle(element).animationPlayState), "running");
  const hoverOff = await expectMotion(ticker, 60, "Pause-on-hover OFF while hovered");
  await ticker.getByRole("group", { name: "Scrollable sales promotions", exact: true }).focus();
  const viewportFocusOff = await expectMotion(ticker, 60, "Pause-on-focus OFF viewport");
  await page.mouse.move(1, 1);
  const stillFocused = await expectMotion(ticker, 60, "Pause-on-focus OFF after pointer leaves");
  await primaryLinks.first().focus();
  const firstLinkFocusOff = await expectMotion(ticker, 60, "Pause-on-focus OFF first link");
  await primaryLinks.last().focus();
  const lastLinkFocusOff = await expectMotion(ticker, 60, "Pause-on-focus OFF last link");
  // Native focus scrolling must not expose a gap later in the same loop. This
  // geometric probe is separate from the elapsed-motion evidence above.
  const focusedLoopCoverage = await ticker.evaluate((element) => {
    const primary = element.querySelector('[data-ticker-sequence="primary"]');
    const track = primary.parentElement.parentElement;
    const animation = track.getAnimations()[0];
    const originalTime = animation.currentTime;
    const duration = animation.effect.getTiming().duration;
    const bounds = track.parentElement.getBoundingClientRect();
    try {
      return [0, 0.9, 0.99999, 1.00001].map((fraction) => {
        animation.currentTime = duration * fraction;
        const rect = track.getBoundingClientRect();
        return { fraction, viewportScrollLeft: track.parentElement.scrollLeft, trackLeft: rect.left, trackRight: rect.right,
          viewportLeft: bounds.left, viewportRight: bounds.right,
          covered: rect.left <= bounds.left + 1 && rect.right >= bounds.right - 1 };
      });
    } finally {
      animation.currentTime = originalTime;
    }
  });
  assert.ok(focusedLoopCoverage.every((phase) => phase.covered), `Focused last link leaves no loop gap: ${JSON.stringify(focusedLoopCoverage)}`);
  await primaryLinks.last().blur();
  // With hover/focus disabled, the manual control must still stop and restart.
  await ticker.getByRole("button", { name: "Pause sales ticker", exact: true }).click();
  const manualOffPaused = await expectStationary(ticker, "Manual Pause with hover/focus OFF");
  await ticker.getByRole("button", { name: "Resume sales ticker", exact: true }).click();
  const manualOffResumed = await expectMotion(ticker, 60, "Manual Resume with hover/focus OFF");
  pass("Hover/focus OFF keeps viewport and both endpoint links moving; no focused loop gap; manual pause/resume still works", { hoverOff, viewportFocusOff, stillFocused, firstLinkFocusOff, lastLinkFocusOff, focusedLoopCoverage, manualOffPaused, manualOffResumed });
  await save({ ...config, enabled: false });
  await page.goto(origin); assert.equal(await page.locator("[data-sales-ticker]").count(), 0);
  await save({ ...config, messages: config.messages.map((message) => ({ ...message, active: false })) });
  await page.goto(origin); assert.equal(await page.locator("[data-sales-ticker]").count(), 0);
  pass("Disabled ticker and zero eligible messages collapse completely");

  const timing = Date.now();
  await save({ ...config, messages: [{ ...config.messages[0], message: "LOCAL SCHEDULE CHECK", startsAt: new Date(timing + 2500).toISOString(), endsAt: new Date(timing + 6500).toISOString() }] });
  await page.goto(origin);
  assert.equal(await page.locator("[data-sales-ticker]").count(), 0);
  await page.locator("[data-sales-ticker]").waitFor({ timeout: 6000 });
  await page.locator("[data-sales-ticker]").waitFor({ state: "detached", timeout: 7000 });
  pass("An already-open page activates and expires a scheduled message at runtime without cron");

  for (const skew of [-86_400_000, 86_400_000]) {
    const time = Date.now();
    await save({ ...config, messages: [{ ...config.messages[0], startsAt: new Date(time + 1600).toISOString(), endsAt: new Date(time + 3600).toISOString() }] });
    const skewContext = await browser.newContext({ viewport: { width: 375, height: 740 }, reducedMotion: "no-preference" });
    await skewContext.addInitScript((offset) => { const realNow = Date.now.bind(Date); Date.now = () => realNow() + offset; }, skew);
    const skewPage = await skewContext.newPage();
    let refreshes = 0;
    skewPage.on("request", (request) => { if (request.url().endsWith("/api/sales-specials/ticker")) refreshes++; });
    await skewPage.goto(origin);
    assert.equal(await skewPage.locator("[data-sales-ticker]").count(), 0);
    await skewPage.locator("[data-sales-ticker]").waitFor({ timeout: 5000 });
    await skewPage.locator("[data-sales-ticker]").waitFor({ state: "detached", timeout: 5000 });
    assert.ok(refreshes <= 3, `No refresh loop with clock offset ${skew}: ${refreshes}`);
    await skewContext.close();
  }
  pass("Visitor clocks 24 hours ahead/behind still activate and expire on server schedule without refresh loops");

  await save({ ...config, messages: [{ ...config.messages[0], endsAt: new Date(Date.now() + 1800).toISOString() }] });
  await page.goto(origin); await page.locator("[data-sales-ticker]").waitFor();
  await page.route("**/api/sales-specials/ticker", (route) => route.abort());
  await page.locator("[data-sales-ticker]").waitFor({ state: "detached", timeout: 5000 });
  await page.unroute("**/api/sales-specials/ticker");
  pass("Expired claims disappear even when the scheduled refresh request fails");

  await save(config); await page.goto(origin); await ticker.waitFor();
  await primaryLinks.first().focus();
  await primaryLinks.first().click();
  await page.waitForURL(`${origin}/equipment`);
  for (const path of ["/", "/equipment", "/service", "/services-scheduling", "/api/sales-specials", "/api/price-match"]) {
    const response = await context.request.get(`${origin}${path}`);
    assert.equal(response.status(), 200, `${path}: ${response.status()}`);
  }
  assert.deepEqual(adminAxe.violations.map(({ id, nodes }) => ({ id, count: nodes.length })), []);
  assert.deepEqual(pageErrors, []);
  pass("Ticker link navigation, homepage/catalog/service/demo/Sales & Specials/Bulletin routes smoke check; no browser exceptions");
  const storedRow = (await local.db.query("select ticker_updated_by,ticker_updated_at,ticker_revision from public.homepage_sales_specials where id='homepage'")).rows[0];
  assert.equal(storedRow.ticker_updated_by, "IDS Administrator");
  assert.ok(storedRow.ticker_updated_at && Number(storedRow.ticker_revision) > 0);
  pass("Browser-to-API-to-real-PostgreSQL saves carry shared Admin attribution and revision");
  await writeFile(".ticker-qa/browser-results.json", JSON.stringify({ passed: true, evidence, pageErrors, storedRow, dataRequests: local.requests }, null, 2));
  console.log(`Browser verification passed (${evidence.length} checks).`);
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await writeFile(".ticker-qa/browser-server.log", logs.join(""));
  await browser?.close();
  next.kill();
  await local.close();
}
