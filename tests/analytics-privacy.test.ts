import assert from "node:assert/strict";
import test from "node:test";
import { beforeSendAnalytics } from "../lib/analytics/privacy";

const origin = "https://integrityautomowers.com";

test("public page views retain their page path without query data or fragments", () => {
  for (const path of ["/", "/equipment", "/equipment/yarbo", "/services-scheduling", "/service", "/remote-assistance", "/professional-installation", "/referral-program", "/dealer-tech-resources", "/dealer-tech-resources/login", "/featured-businesses"]) {
    const event = { type: "pageview" as const, url: `${origin}${path}?email=synthetic%40example.test&ref=private-referral&q=synthetic-name#private-fragment` };
    assert.deepEqual(beforeSendAnalytics(event), { type: "pageview", url: `${origin}${path}` });
    assert.ok(event.url.includes("synthetic"), "The original event is not mutated.");
  }
});

test("checkout page views never include Stripe session IDs or signed cancel tokens", () => {
  for (const [path, query] of [["/checkout/success", "session_id=cs_test_synthetic"], ["/checkout/cancel", "token=synthetic-signed-state"]]) {
    assert.deepEqual(beforeSendAnalytics({ type: "pageview", url: `${origin}${path}?${query}` }), {
      type: "pageview", url: `${origin}${path}`,
    });
  }
});

test("private portal, activation, member, staff and admin page views are discarded", () => {
  for (const path of [
    "/service/manage/synthetic-token", "/services-scheduling/manage/synthetic-token",
    "/remote-assistance/manage/synthetic-token", "/professional-installation/synthetic-token",
    "/staff/service/activate/synthetic-token", "/staff/service", "/admin", "/admin/dealer-network",
    "/dealer-tech-resources/member", "/dealer-tech-resources/activate", "/dealer-tech-resources/reset-pin",
    "/services-scheduling/%6danage/synthetic-token",
  ]) {
    assert.equal(beforeSendAnalytics({ type: "pageview", url: `${origin}${path}?token=synthetic-token&payment=return` }), null, path);
    assert.equal(beforeSendAnalytics({ type: "pageview", url: `${origin}${path}/` }), null, `${path}/`);
  }
});

test("invalid URLs fail closed", () => {
  for (const url of ["not a URL", "/relative-path", `${origin}/%ZZ`]) {
    assert.equal(beforeSendAnalytics({ type: "pageview", url }), null);
  }
});
