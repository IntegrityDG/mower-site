import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import Gallery from "../components/ids-action/IdsActionGallery";
import Reviews from "../components/reviews/ReviewsPageContent";
import { PUBLIC_REVIEW_COLUMNS, toPublicReview } from "../lib/reviews/public";
import type { IdsActionEntry } from "../lib/ids-action/types";
import { homeViewFromHash } from "../lib/homepage-navigation";
import LocalizedDate, { formatLocalizedDate } from "../components/LocalizedDate";

const source = (file: string) => readFileSync(file, "utf8");
const entry: IdsActionEntry = { id: "public-gallery-record", title: "A real property demonstration", description: "Published demonstration description", category: "Equipment Demo", location: "Missouri", eventDate: "2026-09-01", featured: false, published: true, sortOrder: 100, createdAt: "2026-09-01", updatedAt: "2026-09-01", media: [{ id: "photo", entryId: "public-gallery-record", mediaType: "image", mediaUrl: "https://example.com/demo.jpg", storagePath: null, thumbnailUrl: null, altText: "Demonstration mower", sortOrder: 0, createdAt: "2026-09-01" }] };
const row = { first_name: "Alex", last_initial: "G.", state: "Missouri", product: "Yarbo", ease_rating: 5, speed_rating: 4, price_rating: 5, support_rating: null, overall_rating: 4.67, written_review: "Approved buyer experience visible before JavaScript", published_at: "2026-09-01T12:00:00Z", ids_response: "Thank you", ids_response_at: "2026-09-02", email: "private@example.com", last_name: "Private full name", status: "approved", moderation_note: "Private moderation" };

test("gallery records, media and category controls render in initial markup", () => {
  const html = renderToStaticMarkup(<Gallery initialEntries={[entry]} />);
  for (const text of [entry.title, entry.description!, "demo.jpg", "Demonstration mower", "Equipment Demo"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Loading IDS in Action/);
  assert.equal((html.match(/<h2\b/g) ?? []).length, 1);
});
test("successful empty gallery and failed initial load retain distinct fallbacks", () => {
  assert.match(renderToStaticMarkup(<Gallery initialEntries={[]} />), /New demonstrations, deliveries/);
  assert.doesNotMatch(renderToStaticMarkup(<Gallery initialEntries={[]} />), /Loading IDS in Action/);
  assert.match(renderToStaticMarkup(<Gallery />), /Loading IDS in Action/);
});
test("approved review text, counts and filter options render before JavaScript", () => {
  const html = renderToStaticMarkup(<Reviews initialData={{ reviews: [toPublicReview(row)], states: ["Missouri"], count: 1, page: 1, hasMore: false }} />);
  for (const text of [row.written_review, "Alex", "1 matching", "Missouri", "Category ratings", "Customer reviews", "Leave a Review"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /No reviews found|private@example.com|Private full name|Private moderation/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(html.indexOf("Customer reviews</h2>") < html.indexOf("Alex"));
});
test("review pagination and empty states remain available", () => {
  assert.match(renderToStaticMarkup(<Reviews initialData={{reviews:[toPublicReview(row)], states:[], count:10, page:1, hasMore:true}} />), /Load More Reviews/);
  assert.match(renderToStaticMarkup(<Reviews initialData={{reviews:[], states:[], count:0, page:1, hasMore:false}} />), /No reviews found/);
});

function readerFixture(error: unknown = null) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "not", "order", "range"]) chain[method] = (...args: unknown[]) => { calls.push([method, ...args]); return chain; };
  chain.then = (resolve: (value: unknown) => void) => resolve({data: [row], error, count: 1});
  const client = { from: (...args: unknown[]) => { calls.push(["from", ...args]); return chain; } };
  const exports: Record<string, (params?: URLSearchParams) => Promise<{reviews: unknown[];count:number;hasMore:boolean}>> = {};
  const compiled = ts.transpileModule(source("lib/reviews/server.ts"), {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled, { exports, URLSearchParams, require: (id: string) => {
    if (id === "server-only") return {};
    if (id === "@/lib/supabase") return {getSupabaseServiceClient:()=>client};
    if (id === "./public") return {PUBLIC_REVIEW_COLUMNS,toPublicReview};
    throw Error("Unexpected dependency "+id);
  }});
  return { read: exports.readPublicReviews, calls };
}
test("shared initial/API review reader queries approved records and public fields only", async () => {
  const {read,calls}=readerFixture();const result=await read();
  assert.ok(calls.some(c=>c[0]==="select" && c[1]===PUBLIC_REVIEW_COLUMNS));
  assert.equal(calls.filter(c=>c[0]==="eq"&&c[1]==="status"&&c[2]==="approved").length,2);
  assert.ok(calls.some(c=>c[0]==="range"&&c[1]===0&&c[2]===8));
  assert.equal(result.count,1);assert.equal(result.hasMore,false);
  assert.doesNotMatch(JSON.stringify(result), /private@example.com|Private full name|Private moderation/);
});
test("shared review reader preserves filters, category ratings, sort and pagination", async () => {
  const {read,calls}=readerFixture();await read(new URLSearchParams({product:"Equipment Demonstrations",state:"Missouri",minimum:"4",category:"support_rating",sort:"lowest",page:"2",limit:"9"}));
  for(const expected of [["eq","product","Equipment Demonstration"],["eq","state","Missouri"],["gte","support_rating",4],["not","support_rating","is",null],["range",9,17]])assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(expected)),JSON.stringify(expected));
  assert.ok(calls.some(c=>c[0]==="order"&&c[1]==="support_rating"&&JSON.stringify(c[2])===JSON.stringify({ascending:true,nullsFirst:false})));
});
test("failed initial review query remains an error, not fabricated review data", async () => {
  const {read}=readerFixture(new Error("offline"));await assert.rejects(read(), /offline/);
});
test("admin layout is noindex without changing access controls", () => {
  assert.match(source("app/admin/layout.tsx"), /robots: \{ index: false, follow: false \}/);
  assert.match(source("app/admin/layout.tsx"), /<AdminNav \/>/);
});
test("homepage links expose all previously orphaned public routes in both layouts", () => {
  for(const file of ["components/home/DesktopHomepage.tsx","components/mobile/MobileHomepage.tsx"]){
    for(const href of ["/ids-in-action","/reviews","/featured-businesses","/dealer-tech-resources","/referral-program"])assert.ok(source(file).includes(`href="${href}"`), `${file}: ${href}`);
  }
});
test("server wrappers use existing public readers and recover through existing clients", () => {
  assert.match(source("app/ids-in-action/page.tsx"), /readPublicEntries\(\{limit:24\}\)/);
  assert.match(source("app/ids-in-action/page.tsx"), /catch\(\(\)=>undefined\)/);
  assert.match(source("app/reviews/page.tsx"), /readPublicReviews\(\)\.catch\(\(\) => undefined\)/);
  assert.match(source("app/api/reviews/route.ts"), /readPublicReviews\(request.nextUrl.searchParams\)/);
});

test("legacy contact redirect resolves the existing contact view without changing current hashes", () => {
  assert.match(source("app/contact/page.tsx"), /redirect\("\/#contact-us"\)/);
  assert.equal(homeViewFromHash("#contact-us"), "contact");
  assert.equal(homeViewFromHash("#contact"), "contact");
  assert.equal(homeViewFromHash("#location-and-customer-path"), "build");
});

test("initial publication dates are identical across server time zones", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Chicago", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      const html = renderToStaticMarkup(<LocalizedDate value="2026-08-13T02:09:57.286+00:00" locale="en-US" options={{year:"numeric", month:"long", day:"numeric"}} />);
      assert.match(html, /August 13, 2026/);
      assert.match(html, /dateTime="2026-08-13T02:09:57.286\+00:00"/);
      assert.equal(formatLocalizedDate({value:"2026-08-13",dateOnly:true},true), "8/13/2026");
    }
    process.env.TZ = "America/Chicago";
    assert.equal(formatLocalizedDate({value:"2026-08-13T02:09:57.286+00:00",locale:"en-US",options:{year:"numeric",month:"long",day:"numeric"}}), "August 12, 2026");
    assert.equal(formatLocalizedDate({value:"2026-08-13",dateOnly:true,locale:"en-GB"}), "13/08/2026");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
