import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import HomepageSlidesEditor from "../components/admin/HomepageSlidesEditor";
import { slideSchedule, slideIsActive, validateSlideInput, safeSlideLink, validSlideUploadPath } from "../lib/homepage-slides/policy";
const input = {title:"Winter",altText:"Snow blower sale ends November 30",buttonLabel:"View machines",buttonHref:"/equipment/yarbo",startDate:"2026-11-19",endDate:"2026-11-30",sortOrder:10,dwellSeconds:8,enabled:false};
test("slide dates use Chicago 00:01 start and exclusive 23:59 stop",()=>{
 assert.deepEqual(slideSchedule(input.startDate,input.endDate),{startsAt:"2026-11-19T06:01:00.000Z",endsAt:"2026-12-01T05:59:00.000Z"});
 assert.deepEqual(slideSchedule("2026-07-01","2026-07-01"),{startsAt:"2026-07-01T05:01:00.000Z",endsAt:"2026-07-02T04:59:00.000Z"});
 assert.deepEqual(slideSchedule("2026-11-01","2026-11-01"),{startsAt:"2026-11-01T05:01:00.000Z",endsAt:"2026-11-02T05:59:00.000Z"});
 assert.throws(()=>slideSchedule("2026-02-30","2026-03-01"));assert.throws(()=>slideSchedule("2026-11-30","2026-11-19"));
});
test("schedule equality, disabled state, and missing image fail closed",()=>{
 const schedule=slideSchedule(input.startDate,input.endDate);const row={enabled:true,image_path:"image.webp",starts_at:schedule.startsAt,ends_at:schedule.endsAt};
 assert.equal(slideIsActive(row,Date.parse(row.starts_at)-1),false);assert.equal(slideIsActive(row,Date.parse(row.starts_at)),true);assert.equal(slideIsActive(row,Date.parse(row.ends_at)-1),true);assert.equal(slideIsActive(row,Date.parse(row.ends_at)),false);assert.equal(slideIsActive({...row,enabled:false},Date.parse(row.starts_at)),false);assert.equal(slideIsActive({...row,image_path:null},Date.parse(row.starts_at)),false);
});
test("labels and safe internal destinations must be paired",()=>{
 assert.deepEqual(validateSlideInput(input),input);
 for(const href of ["https://evil.test","//evil.test","/\\evil.test","/%2f/evil.test","/x%0a","javascript:alert(1)","/%5cevil.test"])assert.equal(safeSlideLink(href),false,href);
 assert.equal(safeSlideLink("/?product=yarbo#location-and-customer-path"),true);
 assert.throws(()=>validateSlideInput({...input,buttonLabel:null}));assert.throws(()=>validateSlideInput({...input,altText:""}));assert.throws(()=>validateSlideInput({...input,imageUrl:"https://evil.test"}));
});
test("dwell and display order use bounded whole numbers",()=>{for(const dwellSeconds of [3,31,4.5,"8",null])assert.throws(()=>validateSlideInput({...input,dwellSeconds}));for(const dwellSeconds of [4,8,30])assert.equal(validateSlideInput({...input,dwellSeconds}).dwellSeconds,dwellSeconds);assert.throws(()=>validateSlideInput({...input,sortOrder:-1}));});
test("upload paths cannot cross slide boundaries or attach arbitrary objects",()=>{const id="11111111-1111-4111-8111-111111111111";const path=`uploads/${id}/22222222-2222-4222-8222-222222222222.png`;assert.equal(validSlideUploadPath(id,path),true);assert.equal(validSlideUploadPath(id,path.replace(id,"33333333-3333-4333-8333-333333333333")),false);assert.equal(validSlideUploadPath(id,path+"/../evil.svg"),false);});
test("editor offers image, dates, accessible description and speed slider",()=>{const html=renderToStaticMarkup(<HomepageSlidesEditor/>);for(const label of ["Homepage Slideshow","America/Chicago","Start date","Stop date","Image description","Seconds on screen","Save slide","Internal site path only"])assert.ok(html.includes(label),label);assert.ok(html.includes('type="range"'));assert.ok(html.includes('min="4"'));assert.ok(html.includes('max="30"'));});
test("admin mount replaces ticker without removing existing promotions",()=>{const source=readFileSync(new URL("../app/admin/sales-specials/page.tsx",import.meta.url),"utf8");assert.ok(source.includes("<HomepageSlidesEditor"));assert.ok(!source.includes("HomepageSalesTickerEditor"));assert.ok(source.includes("<PromotionEditor"));});
test("every admin handler authenticates, and public images enforce schedule",()=>{for(const file of ["route.ts","[id]/route.ts","[id]/upload/route.ts","[id]/image/route.ts"]){const source=readFileSync(new URL(`../app/api/admin/homepage-slides/${file}`,import.meta.url),"utf8");assert.ok(source.includes("await isReviewAdmin()"),file);}const image=readFileSync(new URL("../lib/homepage-slides/image-server.ts",import.meta.url),"utf8");assert.ok(image.includes("!slideIsActive(data)"));assert.ok(image.includes('"private, no-store"'));assert.ok(image.includes('eq("updated_at", expectedUpdatedAt)'));assert.ok(image.includes("normalizeHomepageSlideImage(bytes)"));});

test("image processing decodes bytes, preserves aspect ratio and rejects disguised SVG",async()=>{
 const {default:sharp}=await import("sharp"); const {normalizeHomepageSlideImage}=await import("../lib/homepage-slides/image-processing");
 const png=await sharp({create:{width:3200,height:1800,channels:3,background:"#005522"}}).png().toBuffer();
 const webp=await normalizeHomepageSlideImage(png);const meta=await sharp(webp).metadata();assert.equal(meta.format,"webp");assert.equal(meta.width,2560);assert.equal(meta.height,1440);assert.equal(meta.exif,undefined);
 await assert.rejects(()=>normalizeHomepageSlideImage(Buffer.from("not an image")));
 await assert.rejects(()=>normalizeHomepageSlideImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')));
 await assert.rejects(()=>normalizeHomepageSlideImage(Buffer.alloc(10*1024*1024+1)));
});
