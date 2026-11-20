import assert from "node:assert/strict";
import test from "node:test";
import { parseCalendarRange, validCalendarRange, CalendarParseError } from "../lib/calendar/proton";
import { calendarRangeBridge as rangeBridge } from "../lib/calendar/bridge";
const event = (id: string,...lines:string[]) => ["BEGIN:VEVENT",`UID:${id}`,"DTSTAMP:20260101T000000Z",...lines,"END:VEVENT"].join("\r\n");
const calendar = (...events:string[]) => ["BEGIN:VCALENDAR","VERSION:2.0",...events,"END:VCALENDAR", ""].join("\r\n");
const calendarRangeBridge = (request: Request, env: NodeJS.ProcessEnv, fetcher: typeof fetch) => rangeBridge(request, env, fetcher, new Date("2026-10-01T12:00:00Z"));
const token="synthetic-range-token-32-characters-minimum";
const oldToken="synthetic-today-token-32-characters-minimum";
const env={NODE_ENV:"test" as const,PROTON_CALENDAR_RANGE_TOKEN:token,PROTON_CALENDAR_BRIDGE_TOKEN:oldToken,PROTON_CALENDAR_ICS_URL:"https://calendar.proton.me/api/calendar/v1/url/synthetic/calendar.ics?key=private-key-value"};
const request=(query="start=2026-10-01&end=2026-10-02",auth=token,method="GET")=>new Request(`https://example.test/api/calendar/range?${query}`,{method,headers:{Authorization:`Bearer ${auth}`}});
const text=calendar(event("private-id","SUMMARY:Work","DTSTART:20261001T140000Z","DTEND:20261001T220000Z","LOCATION:private-location","DESCRIPTION:private-description","ATTENDEE:mailto:private@example.com"));
test("inclusive strict 1–60 calendar day limit includes DST and rejects malformed/duplicate/extra inputs",async()=>{
 assert.equal(validCalendarRange("2026-10-01","2026-11-29"),true);
 assert.equal(validCalendarRange("2026-10-01","2026-11-30"),false);
 assert.equal(validCalendarRange("2026-03-01","2026-04-29"),true);
 for(const query of ["", "start=2026-10-01", "start=2026-10-01&end=2026-09-30","start=2026-02-30&end=2026-03-01","start=2026-1-01&end=2026-01-02","start=0000-01-01&end=0000-01-02","start=2026-10-01&end=2026-11-30","start=2026-10-01&end=2026-10-02&end=2026-10-03","start=2026-10-01&end=2026-10-02&url=https://example.com"]){
  const response=await calendarRangeBridge(request(query),env,async()=>{throw Error("must not fetch")});assert.equal(response.status,400,query);
 }
 assert.throws(()=>parseCalendarRange(text,"2026-10-01","2026-11-30"),CalendarParseError);
});
test("range credential is independent, fail closed and read-only before upstream access",async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response(text)};
 assert.equal((await calendarRangeBridge(request(undefined,oldToken),env,fetcher)).status,401);
 assert.equal((await calendarRangeBridge(request(),{...env,PROTON_CALENDAR_RANGE_TOKEN:undefined},fetcher)).status,503);
 assert.equal((await calendarRangeBridge(request(),{...env,PROTON_CALENDAR_RANGE_TOKEN:oldToken},fetcher)).status,503);
 for(const method of ["POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]) assert.equal((await calendarRangeBridge(request(undefined,token,method),env,fetcher)).status,405);
 assert.equal(calls,0);
});
test("one no-store upstream read, exact minimal response, no IDs/location/details or feed text",async()=>{
 let calls=0;const response=await calendarRangeBridge(request(),env,async(input,options)=>{calls++;assert.equal(options?.redirect,"error");assert.equal(options?.cache,"no-store");return new Response(text)});
 assert.equal(calls,1);assert.equal(response.status,200);assert.match(response.headers.get("cache-control")!,/no-store/);assert.equal(response.headers.get("vercel-cdn-cache-control"),"no-store");
 const body=await response.json();assert.deepEqual(Object.keys(body).sort(),["endDate","events","fetchedAt","startDate","timeZone"]);assert.deepEqual(Object.keys(body.events[0]).sort(),["allDay","end","start","title"]);
 assert.doesNotMatch(JSON.stringify(body),/private-|BEGIN:VCALENDAR|UID|ATTENDEE/);
});
test("titles scrub URLs, HTML, encoded known secrets and credential-shaped text before truncation",()=>{
 const secret="known-very-secret-token";
 const result=parseCalendarRange(calendar(event("x",`SUMMARY:Work https://secret.example/path www.example.com plain.example/path <b>Hi</b> ${encodeURIComponent(secret).replace(/-/g,'%2D')} token&#61;hidden-password Bearer abc123`,"DTSTART:20261001T140000Z")),"2026-10-01","2026-10-01",[secret]);
 assert.match(result.events[0].title,/Work/);assert.doesNotMatch(result.events[0].title,/secret\.example|example\.com|plain\.example|<b>|known|hidden-password|abc123/);
});
test("range expands recurrences once, EXDATE/RDATE and moved/cancelled overrides without duplicates",()=>{
 const result=parseCalendarRange(calendar(
 event("series","SUMMARY:Work","DTSTART;TZID=America/Chicago:20261001T090000","DURATION:PT8H","RRULE:FREQ=DAILY;COUNT=5","EXDATE;TZID=America/Chicago:20261002T090000","RDATE;TZID=America/Chicago:20261007T090000"),
 event("series","RECURRENCE-ID;TZID=America/Chicago:20261003T090000","DTSTART;TZID=America/Chicago:20261006T110000","DURATION:PT4H","SUMMARY:Moved"),
 event("series","RECURRENCE-ID;TZID=America/Chicago:20261004T090000","STATUS:CANCELLED"),
 ),"2026-10-01","2026-10-07");
 assert.deepEqual(result.events.map(e=>e.start.slice(0,10)),["2026-10-01","2026-10-05","2026-10-06","2026-10-07"]);
 assert.equal(result.events[2].title,"Moved");
});
test("range preserves DST offsets, inclusive last day, exclusive all-day end and spanning events once",()=>{
 const result=parseCalendarRange(calendar(
 event("daily","SUMMARY:Daily","DTSTART;TZID=America/Chicago:20261031T090000","DURATION:PT1H","RRULE:FREQ=DAILY;COUNT=4"),
 event("span","SUMMARY:Trip","DTSTART;VALUE=DATE:20261030","DTEND;VALUE=DATE:20261103"),
 event("ended","SUMMARY:Ended","DTSTART;VALUE=DATE:20261029","DTEND;VALUE=DATE:20261031"),
 event("cancel","SUMMARY:Cancelled","DTSTART:20261101T140000Z","STATUS:CANCELLED")),"2026-10-31","2026-11-02");
 assert.equal(result.events.length,4);assert.equal(result.events.filter(e=>e.title==="Trip").length,1);
 assert.match(result.events[1].start,/-05:00$/);assert.match(result.events[2].start,/-06:00$/);assert.equal(result.events[3].start.slice(0,10),"2026-11-02");
});
test("spring recurrence skips nonexistent wall time and does not consume COUNT",()=>{
 const result=parseCalendarRange(calendar(event("spring","DTSTART;TZID=America/Chicago:20260307T023000","DURATION:PT30M","RRULE:FREQ=DAILY;COUNT=3")),"2026-03-07","2026-03-10");
 assert.deepEqual(result.events.map(e=>e.start.slice(0,10)),["2026-03-07","2026-03-09","2026-03-10"]);
});
test("upstream and malformed failures stay generic, never successful empty schedules",async()=>{
 for(const fetcher of [async()=>{throw Error(env.PROTON_CALENDAR_ICS_URL)},async()=>new Response("not ics"),async()=>new Response(text,{headers:{"content-length":"9999999"}})]){
 const response=await calendarRangeBridge(request(),env,fetcher);assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:"Calendar temporarily unavailable"});}
});

test("range THISANDFUTURE and newest override work across requested days",()=>{
 const result=parseCalendarRange(calendar(
 event("series","SUMMARY:Base","DTSTART;TZID=America/Chicago:20261001T090000","DURATION:PT1H","RRULE:FREQ=DAILY;COUNT=5"),
 event("series","SUMMARY:Shifted","RECURRENCE-ID;TZID=America/Chicago;RANGE=THISANDFUTURE:20261002T090000","DTSTART;TZID=America/Chicago:20261002T110000","DURATION:PT2H"),
 event("series","SUMMARY:Newest","SEQUENCE:2","RECURRENCE-ID;TZID=America/Chicago:20261003T090000","DTSTART;TZID=America/Chicago:20261003T130000","DURATION:PT1H"),
 event("series","SUMMARY:Old","SEQUENCE:1","RECURRENCE-ID;TZID=America/Chicago:20261003T090000","DTSTART;TZID=America/Chicago:20261003T140000","DURATION:PT1H")
 ),"2026-10-01","2026-10-05");
 assert.equal(result.events.length,5);assert.equal(result.events[2].title,"Newest");assert.match(result.events[3].start,/T11:00:00/);assert.match(result.events[3].end,/T13:00:00/);
});

test("range max results fails closed rather than silently truncating",()=>{
 assert.throws(()=>parseCalendarRange(calendar(event("dense","DTSTART:20261001T140000Z","RRULE:FREQ=MINUTELY;COUNT=2001")),"2026-10-01","2026-10-03"),CalendarParseError);
});

test("mixed all-day and timed events stay chronological across the range",()=>{
 const result=parseCalendarRange(calendar(
 event("future","SUMMARY:A future day","DTSTART;VALUE=DATE:20261003"),
 event("early","SUMMARY:Z earlier day","DTSTART;VALUE=DATE:20261001"),
 event("timed","SUMMARY:Middle timed","DTSTART;TZID=America/Chicago:20261002T140000"),
 event("later","SUMMARY:Same-day timed","DTSTART;TZID=America/Chicago:20261003T090000")
 ),"2026-10-01","2026-10-03");
 assert.deepEqual(result.events.map(e=>e.title),["Z earlier day","Middle timed","A future day","Same-day timed"]);
});


test("endpoint envelope is ±60 Central dates, not UTC dates; fails before fetch", async()=>{
 const now=new Date("2026-10-02T04:30:00Z"); // October 1 in Central.
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response(calendar())};
 for(const date of ["2026-08-02","2026-11-30"]) assert.equal((await rangeBridge(request(`start=${date}&end=${date}`),env,fetcher,now)).status,200);
 assert.equal(calls,2);
 for(const query of ["start=2026-08-01&end=2026-08-02","start=2026-11-30&end=2026-12-01"]){assert.equal((await rangeBridge(request(query),env,fetcher,now)).status,400);}
 assert.equal(calls,2);
});


test("malformed percent prose cannot disable credential decoding and deeply encoded text is omitted",()=>{
 const secret="known-secret-key";
 const result=parseCalendarRange(calendar(event("x",`SUMMARY:100% work known%2Dsecret%2Dkey token%3Dhidden-value https%252525253A%252525252F%252525252Fsecret.example`,"DTSTART:20261001T140000Z")),"2026-10-01","2026-10-01",[secret]);
 assert.match(result.events[0].title,/work/);assert.doesNotMatch(result.events[0].title,/known|hidden-value|secret.example|%2/i);
});
