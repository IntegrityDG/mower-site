import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import OptionalServices from "../components/customer-paths/purchase/OptionalServices";
import { servicesSchedulingPage } from "./helpers/installation-service-page";

const normalize = (text: string) => text.replace(/\s+/g, " ");
const source = (path: string) => normalize(readFileSync(path, "utf8"));

for (const intakeEnabled of [false, true]) {
  test(`service overview distinguishes nationwide sales and remote assistance from regional physical work (intake=${intakeEnabled})`, async () => {
    const html = renderToStaticMarkup(await servicesSchedulingPage(intakeEnabled)({ searchParams: Promise.resolve({}) }));
    assert.match(html, /Equipment sales are nationwide\./);
    assert.match(html, /Demos, installation, setup, and physical service or repair are available only within the IDS regional service area\./);
    assert.match(html, /Remote assistance is our only nationwide service, subject to eligibility and availability\./);
    const cards = html.match(/<article[\s\S]*?<\/article>/g)!;
    for (const destination of ['href="#request-demo"', 'href="/professional-installation"', 'href="/service"']) {
      const card = cards.find(value => value.includes(destination));
      assert.ok(card, destination);
      assert.match(card, /only within the IDS regional service area/);
    }
    const remote = cards.find(value => value.includes('href="/remote-assistance"'))!;
    assert.match(remote, /Available nationwide, subject to subscription eligibility and current availability/);
    assert.match(remote, /Two issue-based sessions per billing cycle for each covered machine/);
    assert.match(remote, /\$100\/month per machine/);
  });
}

for (const eligibleCheckout of [false, true]) {
  test(`nationwide builder clarifies Install and Setup without changing checkout availability (eligible=${eligibleCheckout})`, () => {
    const html = renderToStaticMarkup(<OptionalServices
      value={{ install: false, setup: false, remoteSupport: false, acceptedSupportTerms: false }}
      onChange={() => {}}
      eligibleCheckout={eligibleCheckout}
    />);
    assert.match(html, /Install and Setup are available only within the IDS regional service area, subject to IDS approval and current availability/);
    assert.match(html, /Remote Support is available nationwide, subject to subscription eligibility and current availability/);
    assert.match(html, /Install and Setup add \$0 at checkout; their separate pricing, deposit, approval and scheduling policies still apply/);
    assert.match(html, /They are not free services/);
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
    assert.equal((html.match(/disabled=""/g) ?? []).length, eligibleCheckout ? 0 : 1);
  });
}

test("desktop and mobile footer descriptions use the same geographic distinction and retain existing regional boundaries", () => {
  const description = "Nationwide autonomous mower sales. Demos, installation, setup, and physical service or repair are available only within the IDS regional service area. Remote assistance is our only nationwide service, subject to eligibility and availability.";
  for (const path of ["components/home/DesktopHomepage.tsx", "components/mobile/MobileHomepage.tsx"]) {
    const text = source(path);
    assert.ok(text.includes(description), path);
    assert.match(text, /Missouri &bull; Southern Illinois &bull; Northeast Arkansas/);
    assert.match(text, /Western Kentucky &bull; Western Tennessee/);
  }
});

test("dedicated service pages state regional physical work and qualified nationwide remote assistance before their terms", () => {
  const installation = source("app/professional-installation/page.tsx");
  assert.match(installation, /Professional Installation and Professional Setup &amp; Optimization are available only within the IDS regional service area, subject to IDS approval and current availability/);
  const service = source("app/service/page.tsx");
  assert.match(service, /Physical service and repair, including on-site work and shop drop-off, are available only within the IDS regional service area/);
  assert.match(service, /Remote assistance is our only nationwide service, subject to eligibility and current availability/);
  assert.ok(service.indexOf("Physical service and repair, including") < service.indexOf("<ServiceTerms"));
  const remote = source("app/remote-assistance/page.tsx");
  assert.match(remote, /Remote assistance is our only nationwide service\. Remote Support is available by phone or Facebook Messenger, subject to subscription eligibility and current availability/);
  assert.match(remote, /physical service or repair are available only within the IDS regional service area/);
  assert.ok(remote.indexOf("Remote assistance is our only nationwide service") < remote.indexOf("<SupportTerms"));
});
