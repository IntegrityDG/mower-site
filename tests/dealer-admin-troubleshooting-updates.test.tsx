import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TroubleshootingUpdates } from "../components/dealer-network/TroubleshootingActivity";
import * as activityValidation from "../lib/dealer-network/troubleshooting-activity-validation";
import * as validation from "../lib/dealer-network/validation";
import { loadInstallationModule as load } from "./helpers/installation-module";

const created = "2026-11-02T12:34:00Z";

test("admin update reader fetches complete dated notes only for the input issues and projects safe display fields", async () => {
  const entries = Array.from({length:101}, (_, i) => `issue-${i}`);
  const chunks: string[][] = [];
  const orders: string[] = [];
  const ranges: number[][] = [];
  let requested = "";
  let requestIndex = 0;
  const {readAdminTroubleshootingUpdates} = load<typeof import("../lib/dealer-network/troubleshooting-activity-server")>("lib/dealer-network/troubleshooting-activity-server.ts", {
    "./member-auth": {},
    "./troubleshooting-activity-validation": activityValidation,
    "./validation": validation,
    "@/lib/supabase": {getSupabaseServiceClient: () => ({from: (table:string) => {
      assert.equal(table,"dealer_network_troubleshooting_updates");
      const query = {
        select: (value:string) => {requested=value;return query;},
        in: (key:string,ids:string[]) => {assert.equal(key,"entry_id");chunks.push(ids);return query;},
        order: (key:string) => {orders.push(key);return query;},
        range: (start:number,end:number) => {ranges.push([start,end]);return query;},
        then: (resolve:(x:unknown)=>unknown) => {
          const current = requestIndex++;
          const size = current === 0 ? 500 : 1;
          const entry = current === 2 ? entries[100] : entries[0];
          return resolve({data:Array.from({length:size}, (_,i)=>({entry_id:entry,id:`u-${current}-${i}`,body:"Old saved note",created_at:created,member_id:"not a field"})),error:null});
        },
      };
      return query;
    }})},
  });
  assert.equal((await readAdminTroubleshootingUpdates([])).size,0);
  assert.equal(requestIndex,0);
  const result = await readAdminTroubleshootingUpdates(entries);
  assert.equal(result.get(entries[0])?.length,501);
  assert.equal(result.get(entries[1]),undefined);
  assert.equal(result.get(entries[100])?.length,1);
  assert.equal(requested,"id,entry_id,body,created_at");
  assert.deepEqual(ranges,[[0,499],[500,999],[0,499]]);
  assert.deepEqual(chunks.map(chunk=>chunk.length),[100,100,1]);
  assert.deepEqual(orders,["created_at","id","created_at","id","created_at","id"]);
  assert.equal(Object.keys(result.get(entries[0])![0]).sort().join(","),"body,createdAt,id");
  assert.equal(result.get(entries[0])![0].createdAt,created);
});

test("admin uses the saved-notes renderer on each issue, with safely rendered plain text and timestamp", () => {
  const source = readFileSync(new URL("../components/dealer-network/DealerNetworkAdmin.tsx",import.meta.url),"utf8");
  assert.match(source,/TroubleshootingUpdates updates=\{entry\.updates \?\? \[\]\}/);
  const html = renderToStaticMarkup(<TroubleshootingUpdates updates={[{id:"1",body:"Existing <script>literal</script> note",createdAt:created}]} />);
  assert.match(html, /Author Updates/);
  assert.match(html, /time dateTime="2026-11-02T12:34:00Z"/);
  assert.match(html, /Existing &lt;script&gt;literal&lt;\/script&gt; note/);
  assert.doesNotMatch(html, /<script>|<button|<form/);
  assert.equal(renderToStaticMarkup(<TroubleshootingUpdates updates={[]} />),"");
});

test("admin dashboard checks auth before reading notes and does not permit any response to be cached", async () => {
  let authorized = true;
  let reads = 0;
  const payload = {troubleshooting:[{id:"entry",updates:[{id:"note",body:"Existing private note",createdAt:created}]}]};
  const {GET} = load<{GET:()=>Promise<Response>}>("app/api/admin/dealer-network/route.ts",{
    "@/lib/dealer-network/admin-auth": {requireDealerNetworkAdmin:async()=>{if(!authorized)throw Error("Test denial");}},
    "@/lib/dealer-network/admin-server": {readDealerNetworkAdminDashboard:async()=>{reads++;return payload;}},
  });
  const successful = await GET();
  assert.equal(successful.status,200);
  assert.equal(successful.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(await successful.json(),payload);
  authorized = false;
  const failed = await GET();
  assert.ok(failed.status>=400);
  assert.equal(failed.headers.get("cache-control"),"private, no-store");
  assert.equal(reads,1);
  assert.doesNotMatch(JSON.stringify(await failed.json()),/Existing private note/);
});
