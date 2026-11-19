import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import BuilderPriceDisplay, { matchingBuilderSaleLabel } from "../components/customer-paths/purchase/BuilderPriceDisplay";
import { priceFromRow } from "../lib/catalog/public-price";
const row = { display_msrp_price_cents: 1219900, regular_price_cents: 1149900, sale_price_cents: 999900, sale_starts_at: "2026-11-12T06:00:00Z", sale_ends_at: "2026-11-20T06:00:00Z", promotion_label: "Early Black Friday", show_public_price: true, contact_for_pricing: false };
const render = (now: string, enabled = true) => renderToStaticMarkup(<BuilderPriceDisplay item={{...priceFromRow(row, Date.parse(now), enabled), publicPromotion:{context:"ids",message:"IDS exclusive gift",imageUrl:"/ids-gift.png"}}}/>);
test("active sale displays exact effective price, crossed MSRP, phase and cutoff without IDS promotions", () => {
 const html=render("2026-11-15T00:00:00Z");
 assert.match(html,/line-through[^>]*>\$12,199/); assert.match(html,/Early Black Friday Price!/); assert.match(html,/\$9,999/);
 assert.match(html,/November 20, 2026 at 12:00 AM CST/); assert.doesNotMatch(html,/IDS|\$11,499|ids-gift/);
 assert.match(render("2026-11-15T00:00:00Z",false),/Early Black Friday Price!/);
});
test("upcoming and exclusive-end prices use effective regular price with MSRP still crossed", () => {
 for(const now of ["2026-11-12T05:59:59Z","2026-11-20T06:00:00Z"]){const html=render(now);assert.match(html,/IDS Everyday Low Price/);assert.match(html,/\$11,499/);assert.match(html,/line-through[^>]*>\$12,199/);assert.doesNotMatch(html,/Sale ends|Early Black Friday|\$9,999/);}
});
test("MSRP fallback is explicit only; title supplies missing phase without modifying price", () => {
 const item={...priceFromRow({...row,display_msrp_price_cents:null,promotion_label:null},Date.parse("2026-11-15"))};
 const html=renderToStaticMarkup(<BuilderPriceDisplay item={item} fallbackMsrp={1219900} offerName="Yarbo Year Round - Early Black Friday"/>);
 assert.match(html,/Early Black Friday Price!/);assert.match(html,/\$12,199/);
 const noMsrp=renderToStaticMarkup(<BuilderPriceDisplay item={item}/>);assert.doesNotMatch(noMsrp,/MSRP|line-through/);assert.match(noMsrp,/\$9,999/);
});
test("sale gifts retained, IDS gifts suppressed, hidden prices stay hidden, invalid end safe", () => {
 const item={...priceFromRow(row,Date.parse("2026-11-15")),saleEndsAt:"invalid",publicPromotion:{context:"sale" as const,message:"Manufacturer gift",imageUrl:null}};
 assert.match(renderToStaticMarkup(<BuilderPriceDisplay item={item}/>),/Manufacturer gift/);
 assert.doesNotMatch(renderToStaticMarkup(<BuilderPriceDisplay item={{...item,showPublicPrice:false}}/>),/MSRP|9,999|Manufacturer gift/);
});
test("family fallback requires identical active windows and one unambiguous label", () => {
 const named=priceFromRow(row,Date.parse("2026-11-15"));const blank={...named,promotionLabel:null,scheduledSaleLabel:null};
 assert.equal(matchingBuilderSaleLabel(blank,[named]),"Early Black Friday");
 assert.equal(matchingBuilderSaleLabel(blank,[{...named,saleEndsAt:"2026-12-01"}]),undefined);
 assert.equal(matchingBuilderSaleLabel(blank,[named,{...named,promotionLabel:"Other"}]),undefined);
 assert.equal(matchingBuilderSaleLabel({...blank,saleIsActive:false},[named]),undefined);
});

test("matching sale gift message and end corroborate same family campaign despite different publish starts", () => {
 const named={...priceFromRow(row,Date.parse("2026-11-15")),publicPromotion:{context:"sale" as const,message:"Exact manufacturer sale gifts",imageUrl:null}};
 const blank={...named,promotionLabel:null,scheduledSaleLabel:null,saleStartsAt:"2026-11-14T01:00:00Z"};
 assert.equal(matchingBuilderSaleLabel(blank,[named]),"Early Black Friday");
 assert.equal(matchingBuilderSaleLabel({...blank,publicPromotion:{...blank.publicPromotion,context:"ids"}},[named]),undefined);
 assert.equal(matchingBuilderSaleLabel({...blank,publicPromotion:{...blank.publicPromotion,message:"Other gifts"}},[named]),undefined);
});
