import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import AdminNav from "../components/admin/AdminNav";
import ContactInformationModal from "../components/contact/ContactInformationModal";
import HomePriceMatch, { BulletinBoardContent } from "../components/promotions/HomePriceMatch";
import { createPriceMatchAdminHandlers } from "../lib/price-match/admin-handlers";
import { DEFAULT_PRICE_MATCH, toPriceMatchConfig, validatePriceMatch } from "../lib/price-match/config";

test("Bulletin Board admin requires authentication and supports all editable fields",async()=>{let saved=DEFAULT_PRICE_MATCH;const unauthorized=createPriceMatchAdminHandlers({isAdmin:async()=>false,read:async()=>saved,save:async value=>value});assert.equal((await unauthorized.GET()).status,401);assert.equal((await unauthorized.PUT(new Request("http://local",{method:"PUT",body:JSON.stringify(saved)}))).status,401);const authorized=createPriceMatchAdminHandlers({isAdmin:async()=>true,read:async()=>saved,save:async value=>(saved=value)});assert.equal((await authorized.GET()).status,200);const updated={enabled:false,heading:"A heading",description:"A description",buttonLabel:"Ask IDS"};const response=await authorized.PUT(new Request("http://local",{method:"PUT",body:JSON.stringify(updated)}));assert.equal(response.status,200);assert.deepEqual(saved,updated)});
test("Bulletin Board validation rejects blank, invalid, and oversized plain text",()=>{assert.equal(validatePriceMatch(null).ok,false);assert.equal(validatePriceMatch({...DEFAULT_PRICE_MATCH,enabled:"yes"}).ok,false);assert.equal(validatePriceMatch({...DEFAULT_PRICE_MATCH,heading:""}).ok,false);assert.equal(validatePriceMatch({...DEFAULT_PRICE_MATCH,heading:"x".repeat(251)}).ok,false);assert.equal(validatePriceMatch({...DEFAULT_PRICE_MATCH,description:"x".repeat(1501)}).ok,false);assert.equal(validatePriceMatch({...DEFAULT_PRICE_MATCH,buttonLabel:"x".repeat(61)}).ok,false);assert.deepEqual(validatePriceMatch(null),{ok:false,error:"Invalid Bulletin Board settings."})});
test("homepage Bulletin Board renders fallback content and configured trigger while default contact triggers stay unchanged",()=>{const html=renderToStaticMarkup(<HomePriceMatch/>);assert.match(html,/We’ll Do Our Absolute Best/);assert.match(html,/Found a better price\?/);assert.match(html,/>Contact Us<\/button>/);assert.match(renderToStaticMarkup(<ContactInformationModal triggerLabel="Ask IDS"/>),/>Ask IDS<\/button>/);assert.match(renderToStaticMarkup(<ContactInformationModal/>),/>Contact Us<\/button>/)});
test("homepage can omit disabled settings and public reads have a production fallback",()=>{const component=readFileSync("components/promotions/HomePriceMatch.tsx","utf8");const server=readFileSync("lib/price-match/server.ts","utf8");assert.match(component,/if \(!settings\.enabled\) return null/);assert.match(server,/return \(await readPriceMatch\(\)\) \?\? DEFAULT_PRICE_MATCH/);assert.match(server,/catch \{ return DEFAULT_PRICE_MATCH; \}/)});
test("price match migration is a locked-down singleton seeded with current production copy",()=>{const sql=readFileSync("supabase/migrations/20260811034725_create_homepage_price_match_settings.sql","utf8");assert.match(sql,/id text PRIMARY KEY CHECK \(id = 'price-match'\)/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/REVOKE ALL.*anon, authenticated, service_role/);assert.match(sql,/GRANT SELECT, INSERT, UPDATE.*service_role/);assert.match(sql,/We’ll Do Our Absolute Best To Meet or Beat Any Verified Competitor Price/);assert.match(sql,/Found a better price\?/);assert.match(sql,/'Contact Us'/)});

test("stored Demo Party content renders unchanged with labeled contact and scheduling controls", () => {
  const settings = toPriceMatchConfig({
    enabled: true,
    heading: "TURN A DEMO INTO A PARTY AND SAVE SOME SERIOUS COIN!",
    description: "See an IDS autonomous mower work on your own property.",
    button_label: "Contact Us",
  });
  assert.ok(settings);
  const html = renderToStaticMarkup(<BulletinBoardContent settings={settings} />);
  assert.match(html, /aria-labelledby="bulletin-board-heading"/);
  assert.match(html, /id="bulletin-board-heading"[^>]*>TURN A DEMO INTO A PARTY/);
  assert.match(html, /See an IDS autonomous mower work on your own property/);
  assert.match(html, />Contact Us<\/button>/);
  assert.match(html, /href="\/services-scheduling\?service=demo&amp;source=meet_or_beat#services-top"/);
  assert.match(html, />Schedule Service\/Demo<\/a>/);
  assert.doesNotMatch(html, /We’ll Do Our Absolute Best/);
  assert.equal(renderToStaticMarkup(<BulletinBoardContent settings={{ ...settings, enabled: false }} />), "");
});

test("Bulletin Board admin labels use the existing route and APIs", async () => {
  const navigation = renderToStaticMarkup(<AdminNav />);
  const page = readFileSync("app/admin/price-match/page.tsx", "utf8");
  const publicRoute = readFileSync("app/api/price-match/route.ts", "utf8");
  const adminRoute = readFileSync("app/api/admin/price-match/route.ts", "utf8");
  const component = readFileSync("components/promotions/HomePriceMatch.tsx", "utf8");
  const server = readFileSync("lib/price-match/server.ts", "utf8");
  assert.match(navigation, /href="\/admin\/price-match"[^>]*>Bulletin Board<\/a>/);
  assert.equal((page.match(/<h1[^>]*>Bulletin Board<\/h1>/g) ?? []).length, 2);
  assert.match(page, /Bulletin Board saved successfully/);
  assert.match(page, /fetch\("\/api\/admin\/price-match"/);
  assert.match(component, /fetch\("\/api\/price-match"/);
  assert.match(publicRoute, /readPublicPriceMatch/);
  assert.match(adminRoute, /createPriceMatchAdminHandlers/);
  assert.match(server, /from\("homepage_price_match_settings"\)/);
  assert.match(server, /const ID = "price-match"/);
  const failing = createPriceMatchAdminHandlers({
    isAdmin: async () => true,
    read: async () => DEFAULT_PRICE_MATCH,
    save: async () => { throw new Error("database failure"); },
  });
  const response = await failing.PUT(new Request("http://local", { method: "PUT", body: JSON.stringify(DEFAULT_PRICE_MATCH) }));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Bulletin Board settings could not be saved." });
});
