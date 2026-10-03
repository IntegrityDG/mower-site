import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import sitemap from "../app/sitemap";

const pages = [
  ["/", "app/page.tsx", "Robot Mowers, Installation & Service | Integrity Distribution Systems"],
  ["/equipment", "app/equipment/page.tsx", "Robot Mowers for Sale | Lymow, Yarbo & Pandag | IDS"],
  ["/equipment/accessories", "app/equipment/accessories/page.tsx", "Robot Mower Accessories | Lymow & Yarbo Parts | IDS"],
  ["/professional-installation", "app/professional-installation/page.tsx", "Robot Mower Installation & Professional Setup | IDS"],
  ["/service", "app/service/page.tsx", "Robot Mower Service, Repair & Maintenance | IDS"],
  ["/remote-assistance", "app/remote-assistance/page.tsx", "Robot Mower Remote Support & Technical Assistance | IDS"],
  ["/services-scheduling", "app/services-scheduling/page.tsx", "Robot Mower Demos & Demo Parties | IDS"],
  ["/troubleshoot-your-robot", "app/troubleshoot-your-robot/page.tsx", "Robot Mower Troubleshooting & Support Guides | IDS"],
  ["/ids-in-action", "app/ids-in-action/page.tsx", "Robot Mower Demos & Installations | IDS in Action"],
  ["/reviews", "app/reviews/layout.tsx", "Robot Mower Dealer Reviews | Integrity Distribution Systems"],
  ["/referral-program", "app/referral-program/page.tsx", "Robot Mower Referral Program | Get Paid for Referrals | IDS"],
  ["/dealer-tech-resources", "app/dealer-tech-resources/page.tsx", "Robot Mower Dealer & Technician Resources | IDS"],
  ["/featured-businesses", "app/featured-businesses/page.tsx", "Supporting Small Business Spotlight | IDS"],
] as const;

const products = [
  ["lymow-one-plus", "Lymow One Plus Robot Mower | Dealer, Demo & Installation | IDS"],
  ["yarbo", "Yarbo Pro Robot Mower | Dealer, Demo & Installation | IDS"],
  ["pandag-g1", "Pandag G1 Commercial Robot Mower | IDS"],
] as const;

function objectFromVariable(source: string, name: string) {
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.ObjectLiteralExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      const initializer = ts.isAsExpression(node.initializer!) ? node.initializer!.expression : node.initializer;
      if (initializer && ts.isObjectLiteralExpression(initializer)) found = initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `${name} must be a static object`);
  return found;
}

function property(object: ts.ObjectLiteralExpression, name: string) {
  const item = object.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText().replaceAll('"', "") === name);
  assert.ok(item && ts.isPropertyAssignment(item), `${name} is required`);
  return item.initializer;
}

function stringProperty(object: ts.ObjectLiteralExpression, name: string) {
  const value = property(object, name);
  assert.ok(ts.isStringLiteral(value), `${name} must be literal for this public page`);
  return value.text;
}

test("Batch 1 public metadata is unique and retains each route's canonical", () => {
  const titles: string[] = [];
  const descriptions: string[] = [];
  for (const [route, file, expectedTitle] of pages) {
    const metadata = objectFromVariable(readFileSync(file, "utf8"), "metadata");
    const title = stringProperty(metadata, "title");
    const description = stringProperty(metadata, "description");
    const alternates = property(metadata, "alternates");
    assert.ok(ts.isObjectLiteralExpression(alternates));
    assert.equal(title, expectedTitle, route);
    assert.equal(stringProperty(alternates, "canonical"), route, route);
    assert.ok(description.length >= 80 && description.length <= 170, `${route}: description length`);
    titles.push(title);
    descriptions.push(description);
  }
  const productSource = readFileSync("app/equipment/[slug]/page.tsx", "utf8");
  const productMap = objectFromVariable(productSource, "productMetadata");
  for (const [slug, expectedTitle] of products) {
    const entry = property(productMap, slug);
    assert.ok(ts.isObjectLiteralExpression(entry));
    assert.equal(stringProperty(entry, "title"), expectedTitle);
    const description = stringProperty(entry, "description");
    assert.ok(description.length >= 80 && description.length <= 170, slug);
    titles.push(expectedTitle);
    descriptions.push(description);
  }
  assert.match(productSource, /return \{ \.\.\.productMetadata\[slug\], alternates: \{ canonical: `\/equipment\/\$\{slug\}` \} \};/);
  const quote = objectFromVariable(readFileSync("app/pandag/project-quote/layout.tsx", "utf8"), "metadata");
  assert.equal(stringProperty(quote, "title"), "Pandag G1 Project Quote Request | IDS");
  assert.equal(stringProperty(quote, "description"), "Tell IDS about a commercial mowing project to request a Pandag G1 review. IDS evaluates the site and operating needs before recommending equipment and pricing.");
  const quoteRobots = property(quote, "robots");
  assert.ok(ts.isObjectLiteralExpression(quoteRobots));
  assert.equal(property(quoteRobots, "index").kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(property(quoteRobots, "follow").kind, ts.SyntaxKind.TrueKeyword);
  assert.ok(!sitemap().some((entry) => new URL(entry.url).pathname === "/pandag/project-quote"));
  titles.push(stringProperty(quote, "title"));
  descriptions.push(stringProperty(quote, "description"));
  assert.equal(new Set(titles).size, 17);
  assert.equal(new Set(descriptions).size, 17);
  const received = objectFromVariable(readFileSync("app/pandag/project-quote/received/page.tsx", "utf8"), "metadata");
  assert.equal(stringProperty(received, "title"), "Pandag Project Request Received | IDS");
  const receivedRobots = property(received, "robots");
  assert.ok(ts.isObjectLiteralExpression(receivedRobots));
  assert.equal(property(receivedRobots, "index").kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(property(receivedRobots, "follow").kind, ts.SyntaxKind.TrueKeyword);
});

test("primary headings and contextual links support the intended journeys", () => {
  const homeDesktop = readFileSync("components/home/DesktopHomepage.tsx", "utf8");
  const homeMobile = readFileSync("components/mobile/MobileHomepage.tsx", "utf8");
  for (const home of [homeDesktop, homeMobile]) {
    assert.match(home, /<h1[^>]*>Robot mowers that give people more time back/);
    for (const destination of ["/equipment", "/equipment/lymow-one-plus", "/equipment/yarbo", "/equipment/pandag-g1", "/professional-installation", "/services-scheduling", "/service"]) {
      assert.ok(home.includes(`href="${destination}"`), destination);
    }
    for (const region of ["Missouri", "Southern Illinois", "Northeast Arkansas", "Western Kentucky", "Western Tennessee"]) {
      assert.ok(home.includes(region), region);
    }
  }
  for (const file of ["app/equipment/page.tsx", "app/professional-installation/page.tsx", "app/services-scheduling/page.tsx", "app/troubleshoot-your-robot/page.tsx", "app/ids-in-action/page.tsx", "app/dealer-tech-resources/page.tsx"]) {
    assert.equal((readFileSync(file, "utf8").match(/<h1\b/g) ?? []).length, 1, file);
  }
  const product = readFileSync("app/equipment/[slug]/page.tsx", "utf8");
  for (const destination of ["/professional-installation", "/services-scheduling", "/equipment/accessories"]) {
    assert.ok(product.includes(`href="${destination}"`), destination);
  }
  const troubleshooting = readFileSync("app/troubleshoot-your-robot/page.tsx", "utf8");
  assert.match(troubleshooting, /href="\/service"/);
  assert.match(troubleshooting, /href="\/remote-assistance"/);
});
