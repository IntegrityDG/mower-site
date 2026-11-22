import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OwnerTroubleshootingActivity,
  TroubleshootingComments,
  TroubleshootingUpdates,
} from "../components/dealer-network/TroubleshootingActivity";
import * as activityValidator from "../lib/dealer-network/troubleshooting-activity-validation";
import type { MemberTroubleshootingEntry } from "../lib/dealer-network/types";
import * as validation from "../lib/dealer-network/validation";
import { loadInstallationModule as load } from "./helpers/installation-module";

const entryId = "fb37a89e-ef7a-4cf8-be3e-327647a5aece";
const ownId = "5a95a93f-3b88-4873-b626-73a47b9473e6";
const peerId = "e0dd7d74-0088-4a40-895b-ae2b8001c508";
const approvedId = "cbe16df0-5060-46e3-a4f5-c0ca663762b0";
const inaccessibleId = "110db246-6b16-4cd5-b8d7-650656e2088d";
const instant = "2026-09-01T13:02:00Z";
const source = {
  title: "Check the GPS module", brand: "Yarbo", model: "Y40", issueDate: "2026-08-31",
  firmwareSoftwareVersion: "1.0", systemArea: "GPS", badPart: null,
  issueDescription: "Position inaccurate", fixDescription: "Reset module",
};
const base: MemberTroubleshootingEntry = {
  id: entryId, memberId: ownId, memberName: "Author", companyName: "Dealer",
  ...source, status: "approved", photos: [], approvedAt: instant, createdAt: instant,
  isOwner: true, updates: [], comments: [],
};
const comment = {
  id: "comment", body: "<img src=x onerror=alert(1)>", createdAt: instant, memberName: "First Tech", companyName: "Dealer Two",
};
type Api = { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
class MemberAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

test("activity validation counts Unicode code points and rejects forged identity or HTML-only submission wrappers", () => {
  assert.equal(activityValidator.troubleshootingCharacterCount("😀".repeat(250)), 250);
  assert.deepEqual(activityValidator.validateTroubleshootingActivity({kind:"comment",body:` ${"😀".repeat(250)}\n`}), {kind:"comment",body:"😀".repeat(250)});
  for (const raw of [
    {kind:"comment",body:"😀".repeat(251)},
    {kind:"comment",body:" \t\n "},
    {kind:"comment",body:"hello\u0000world"},
    {kind:"comment",body:"valid",memberId:ownId},
    {kind:"update",body:"x".repeat(1001)},
    {kind:"publicRead",body:"no"},
  ]) assert.equal(activityValidator.validateTroubleshootingActivity(raw),null);
  assert.equal(activityValidator.validateTroubleshootingActivity({kind:"update",body:"x".repeat(1000)})?.body.length,1000);
});

test("original text editing normalizes the nine allowed fields and cannot change owner, moderation, or attachments", () => {
  const patch = activityValidator.validateTroubleshootingTextEdit({...source,title:" Trim this "});
  assert.ok(patch);
  assert.equal(patch.title,"Trim this");
  assert.equal(patch.issue_date,"2026-08-31");
  assert.equal(patch.bad_part,null);
  assert.equal(Object.keys(patch).length,9);
  for (const extra of [{uploadIds:[entryId]},{memberId:peerId},{publiclyPublished:true},{status:"approved"}]) {
    assert.equal(activityValidator.validateTroubleshootingTextEdit({...source,...extra}),null);
  }
  assert.equal(activityValidator.validateTroubleshootingTextEdit({...source,issueDate:"2026-02-30"}),null);
  assert.equal(activityValidator.validateTroubleshootingTextEdit({...source,title:"x\u0000yz"}),null);
});

function activityRoute(session: (() => Promise<{memberId:string}>), failure?: string) {
  const calls: {name: string; args: Record<string, unknown>}[] = [];
  const server = load<typeof import("../lib/dealer-network/troubleshooting-activity-server")>("lib/dealer-network/troubleshooting-activity-server.ts", {
    "@/lib/supabase": {getSupabaseServiceClient: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({name,args});
        return {data:name.endsWith("_text") ? "pending_review" : "generated-id",error:failure ? {message:failure} : null};
      },
    })},
    "./member-auth": {MemberAccessError},
    "./troubleshooting-activity-validation": activityValidator,
    "./validation": validation,
  });
  const route = load<Api & {PATCH:Api["POST"]}>("app/api/dealer-network/member/troubleshooting/[id]/activity/route.ts", {
    "@/lib/dealer-network/member-auth": {MemberAccessError, requireActiveUnlockedMember: session, consumeDealerRateLimit: async()=>true},
    "@/lib/dealer-network/security": {privateIdentifierHash:(v:string)=>v},
    "@/lib/dealer-network/troubleshooting-activity-server": server,
  });
  return {route,calls};
}

function write(method: "PATCH" | "POST", body: unknown) {
  return new Request(`https://local.test/api/dealer-network/member/troubleshooting/${entryId}/activity`, {method, body:JSON.stringify(body)});
}
const context = {params:Promise.resolve({id:entryId})};

test("activity routes derive identity from session, return private no-store, and distinguish staged text from append", async () => {
  const {route,calls}=activityRoute(async()=>({memberId:ownId}));
  const staged=await route.PATCH(write("PATCH",source),context);
  assert.equal(staged.status,200);
  assert.equal(staged.headers.get("cache-control"),"private, no-store");
  assert.equal((await staged.json()).status,"pending_review");
  const append=await route.POST(write("POST",{kind:"update",body:" New fix confirmed "}),context);
  assert.equal(append.status,201);
  assert.equal(append.headers.get("cache-control"),"private, no-store");
  assert.equal((await append.json()).kind,"update");
  assert.equal(calls.length,2);
  assert.equal(calls[0].name,"dealer_network_update_troubleshooting_text");
  assert.equal(calls[0].args.p_member_id,ownId);
  assert.equal(calls[1].name,"dealer_network_append_troubleshooting_update");
  assert.equal(calls[1].args.p_body,"New fix confirmed");
  assert.equal(calls[1].args.p_member_id,ownId);
});

test("authentication, locked accounts, forged membership, and atomic fifth-slot conflicts have explicit errors", async () => {
  for (const status of [401,403]) {
    const {route,calls}=activityRoute(async()=>{throw new MemberAccessError(status,"Denied");});
    assert.equal((await route.POST(write("POST",{kind:"comment",body:"Allowed shape"}),context)).status,status);
    assert.equal(calls.length,0);
  }
  const {route,calls}=activityRoute(async()=>({memberId:peerId}),"troubleshooting_comment_limit");
  const forged=await route.POST(write("POST",{kind:"comment",body:"Allowed shape",memberId:ownId}),context);
  assert.equal(forged.status,400);
  assert.equal(calls.length,0);
  const full=await route.POST(write("POST",{kind:"comment",body:"Post my result"}),context);
  assert.equal(full.status,409);
  assert.match((await full.json()).error,/already has five comments/i);
  assert.equal(calls[0].args.p_member_id,peerId);
});

test("data enrichment does not fetch hidden entries or reveal another author's staged text", async () => {
  const approved={...base,id:approvedId,memberId:peerId,isOwner:false};
  const own={...base,status:"pending" as const};
  const hidden={...base,id:inaccessibleId,memberId:peerId,status:"denied" as const};
  const selects: {table:string;column:string;ids:string[]}[]=[];
  const staged=activityValidator.validateTroubleshootingTextEdit(source);
  let confirmedCurrentApproval=false;
  let confirmedCurrentOwnerOrApproval=false;
  const rows: Record<string,unknown[]> = {
    dealer_network_troubleshooting_updates:[{id:"update",entry_id:entryId,body:"Dated",created_at:instant}],
    dealer_network_troubleshooting_comments:[{id:"comment",entry_id:approvedId,body:"Relevant",created_at:instant,member_name_snapshot:"A Peer",company_name_snapshot:"Shop"}],
    dealer_network_troubleshooting_revisions:[{id:"rev",entry_id:entryId,created_at:instant,patch:staged}],
  };
  const {addTroubleshootingActivity}=load<typeof import("../lib/dealer-network/troubleshooting-activity-server")>("lib/dealer-network/troubleshooting-activity-server.ts", {
    "@/lib/supabase": {getSupabaseServiceClient:()=>({from:(table:string)=>{
      const query = {
        select: ()=>query,
        in: (column: string, ids:string[])=>{selects.push({table,column,ids});return query;},
        eq: (column:string,value:string)=>{if (column==="parent.status"&&value==="approved") confirmedCurrentApproval=true;return query;},
        or: (value:string)=>{if (value===`status.eq.approved,member_id.eq.${ownId}`) confirmedCurrentOwnerOrApproval=true;return query;},
        order: ()=>query,
        range: ()=>query,
        then: (resolve:(v:unknown)=>unknown)=>resolve({data:rows[table],error:null}),
      };
      return query;
    }})},
    "./member-auth":{MemberAccessError},"./validation":validation,"./troubleshooting-activity-validation":activityValidator,
  });
  const payload=await addTroubleshootingActivity(ownId,[approved,hidden],[own,hidden]);
  assert.equal(payload.entries.length,1);
  assert.equal(payload.ownEntries.length,1);
  assert.equal(payload.entries[0].comments[0].memberName,"A Peer");
  assert.equal(payload.entries[0].pendingRevision,undefined);
  assert.equal(payload.ownEntries[0].pendingRevision?.id,"rev");
  assert.equal(payload.ownEntries[0].updates[0].createdAt,instant);
  assert.ok(confirmedCurrentApproval && confirmedCurrentOwnerOrApproval);
  assert.ok(selects.every(({ids})=>!ids.includes(inaccessibleId)));
  assert.ok(selects.find(({table})=>table.endsWith("_revisions"))?.ids.every(id=>id===entryId));
});

test("member cards collapse comments, omit the author form and show the hard cap and safe content", () => {
  const peer = {...base,isOwner:false,comments:[comment]};
  const html=renderToStaticMarkup(<TroubleshootingComments entry={peer} onSaved={()=>{}}/>);
  assert.match(html,/<details class=/);
  assert.doesNotMatch(html,/<details[^>]*\bopen=/);
  assert.match(html,/Comments 1\/5/);
  assert.match(html,/0\/250 characters/);
  assert.match(html,/Keep it relevant to this issue/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img/);
  const full=renderToStaticMarkup(<TroubleshootingComments entry={{...peer,comments:Array.from({length:5},(_,i)=>({...comment,id:`c${i}`}))}} onSaved={()=>{}}/>);
  assert.match(full,/Comments 5\/5/);
  assert.doesNotMatch(full,/Post Comment/);
  assert.match(full,/reached its five-comment limit/);
  assert.doesNotMatch(renderToStaticMarkup(<TroubleshootingComments entry={base} onSaved={()=>{}}/>),/Post Comment/);
});

test("My Submissions retains an ownership gated Update; notes render separate, dated and uncounted", () => {
  const updates=[{id:"note",body:"Rechecked after firmware update.",createdAt:instant}];
  const html=renderToStaticMarkup(<OwnerTroubleshootingActivity entry={{...base,updates}} onSaved={()=>{}}/>);
  assert.match(html,/>Update<\/summary>/);
  assert.match(html,/Edit original issue text/);
  assert.match(html,/Add a dated update/);
  assert.match(html,/do not use comment slots/);
  assert.match(html,/Send Edit for Review/);
  assert.match(html,/>Author Updates<\/h4>/);
  assert.match(html,/<time dateTime="2026-09-01T13:02:00Z"/);
  assert.equal(renderToStaticMarkup(<OwnerTroubleshootingActivity entry={{...base,isOwner:false}} onSaved={()=>{}}/>),"");
  assert.equal(renderToStaticMarkup(<TroubleshootingUpdates updates={[]} />),"");
});
