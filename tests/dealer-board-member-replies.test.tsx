import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as member from "../lib/dealer-network/board-member";
import * as formula from "../lib/dealer-network/board-validation";
import * as validation from "../lib/dealer-network/validation";
import { loadInstallationModule as load } from "./helpers/installation-module";

const ids = [
  "a9a5fed0-c314-4e45-8c64-a4aaf5566801",
  "99b7be14-f739-424a-8c71-92365cc13ae0",
  "38ee92b5-f96a-42d4-95eb-4e54e6d06d90",
  "0c9b0bf0-5557-445d-9615-be8f3cea3232",
];
const topic = {id:ids[0],title:"Archived workshop topic",status:"archived",isRead:true,announcement:null,
  poll:null,discussion:null, options:[],myVoteOptionId:null,responseCount:0,recipientCount:1,comments:[]} satisfies member.BoardMemberTopic;
const row = {id:ids[1],parentCommentId:null,body:"original",createdAt:"2026-01-01T00:00:00Z",edited:false,
  hidden:false,canEdit:false,author:null,attachments:[]} satisfies member.BoardMemberComment;

test("old Archive search never hides read active/closed topics or unanswered required polls", () => {
  const active: member.BoardMemberTopic = {...topic,id:ids[1],status:"active",title:"Read current topic"};
  const closed: member.BoardMemberTopic = {...topic,id:ids[2],status:"closed",title:"Closed retained topic"};
  const due: member.BoardMemberTopic = {...active,id:ids[3],poll:{id:"poll", question:"Question", explanation:"", closes_at:null,effectiveOpen:true,allow_vote_change:false}};
  const all=[topic, active,closed,due];
  assert.deepEqual(member.filterBoardTopics(all,"active","workshop",null).map(t=>t.id),[active.id,closed.id,due.id]);
  assert.deepEqual(member.filterBoardTopics(all,"needs","workshop",null).map(t=>t.id),[due.id]);
  assert.deepEqual(member.filterBoardTopics(all,"archived","workshop",topic.id).map(t=>t.id),[topic.id]);
  assert.equal(member.boardTopicFilter(topic),"archived");
  assert.equal(member.boardTopicFilter(closed),"active");
});

test("a hidden branch reserves quota only while living immediate replies remain", () => {
  const a={...row,id:ids[0],hidden:true};
  const b={...row,id:ids[1],parentCommentId:a.id};
  const c={...row,id:ids[2],parentCommentId:a.id,hidden:true};
  const d={...row,id:ids[3]};
  assert.equal(member.boardVisibleBranchCount([a,b,c,d]),2);
  assert.equal(member.boardVisibleBranchCount([a,{...b,hidden:true},c,d]),1);
});

test("text and image quotas use Unicode and reject forged ownership or repeated upload ids", () => {
  assert.ok(formula.validateNewBoardComment({body:"😀".repeat(200),uploadIds:[ids[1],ids[2],ids[3]]}));
  assert.equal(formula.validateNewBoardComment({body:"😀".repeat(201)}),null);
  assert.ok(formula.validateNewBoardComment({body:"😀".repeat(150),parentCommentId:ids[0],uploadIds:[ids[1]]}));
  assert.equal(formula.validateNewBoardComment({body:"😀".repeat(151),parentCommentId:ids[0]}),null);
  assert.equal(formula.validateNewBoardComment({body:"Reply",parentCommentId:ids[0],uploadIds:[ids[1],ids[2]]}),null);
  assert.equal(formula.validateNewBoardComment({body:"Comment",uploadIds:[ids[1],ids[1]]}),null);
  assert.equal(formula.validateNewBoardComment({body:"Comment",memberId:ids[0]}),null);
  assert.equal(formula.validateNewBoardComment({body:"Comment",p_body:"Alternate"}),null);
  assert.equal(formula.validateNewBoardComment({body:" "}),null);
});

function serverWith(rpc: (name:string,args:Record<string,unknown>)=>unknown, verify: (...input:unknown[])=>unknown = () => {}) {
  return load<typeof import("../lib/dealer-network/board-server")>("lib/dealer-network/board-server.ts",{
    "node:crypto": {},
    "@/lib/supabase": {getSupabaseServiceClient:()=>({rpc})},
    "./member-auth": {consumeDealerRateLimit:async()=>true},
    "./notifications": {},
    "./security": {privateIdentifierHash:(id:string)=>id},
    "./board-validation": formula,
    "./board-media-server": {verifyBoardUploads:verify},
    "./validation": validation,
  });
}

test("member projection omits full names, removal reasons and any photos or PM link of removed content", () => {
  const server=serverWith(()=>{});
  const dbComment={id:ids[1],parent_comment_id:null,author_member_id:ids[2],body:"Original response",created_at:"2026-01-01T00:00:00Z",edited_at:null,deleted_at:null,removed_at:null,removed_reason:"private moderation note",storage_path:"private key"};
  const author={id:ids[2],member_name:"Jamie Private-Surname",company_name:"Synthetic Shop",deleted_at:null,status:"active",account_locked:false,email:"private@example.invalid"};
  const photo={id:ids[3],url:"/api/dealer-network/member/board/photos/"+ids[3],width:20,height:30};
  const visible=server.projectBoardMemberComment(dbComment,author,ids[0],true,[photo]);
  assert.equal(visible.author?.firstName,"Jamie");
  assert.equal(visible.author?.messageMemberId,ids[2]);
  assert.equal(visible.canEdit,false);
  assert.equal(visible.attachments[0].url,photo.url);
  assert.doesNotMatch(JSON.stringify(visible),/Surname|removed_reason|private moderation note|storage_path|private key|example.invalid/);
  const hidden=server.projectBoardMemberComment({...dbComment,removed_at:"2026-01-02"},author,ids[0],true,[photo]);
  assert.equal(hidden.hidden,true);
  assert.equal(hidden.author,null);
  assert.equal(hidden.attachments.length,0);
  assert.doesNotMatch(JSON.stringify(hidden),/Original response|Jamie|photos/);
});

test("server verification runs before binding signed photo IDs and does not write when verification fails", async () => {
  const events: string[] = [];
  const server=serverWith((name,args)=>{
    events.push(name); assert.equal(args.p_member_id,ids[0]);
    assert.equal(args.p_discussion_id,ids[1]);
    assert.equal(args.p_parent_id,ids[2]);
    assert.equal((args.p_upload_ids as string[]).join(),ids[3]);
    return {data:ids[0],error:null};
  }, (...args)=>{
    events.push("verify"); assert.equal(args.slice(0,3).join(),ids.slice(0,3).join());
  });
  assert.equal(await server.addBoardComment(ids[0],ids[1],{body:"reply",parentCommentId:ids[2],uploadIds:[ids[3]]}),ids[0]);
  assert.deepEqual(events,["verify","dealer_network_add_board_comment"]);
  const blocked=serverWith(()=>{assert.fail("RPC must not run");},()=>{throw Error("UNVERIFIED");});
  await assert.rejects(blocked.addBoardComment(ids[0],ids[1],{body:"reply",parentCommentId:ids[2],uploadIds:[ids[3]]}),/UNVERIFIED/);
});

test("stable member link restores the authenticated Board route and existing private-message destination", () => {
  const read = (p:string) => readFileSync(new URL("../"+p,import.meta.url),"utf8");
  assert.match(read("app/dealer-tech-resources/member/page.tsx"),/searchParams[\s\S]*\.boardTopic[\s\S]*initialBoardTopicId/);
  assert.match(read("components/dealer-network/MemberPortal.tsx"),/initialBoardTopicId \? "announcements"/);
  assert.match(read("components/dealer-network/MemberPortal.tsx"),/onPrivateMessage=\{[\s\S]*startMessage\(memberId\)/);
  assert.match(read("app/dealer-tech-resources/login/page.tsx"),/validateUuid\(boardTopic\)/);
  assert.match(read("components/dealer-network/MemberLogin.tsx"), /member\?boardTopic=\$\{encodeURIComponent\(boardTopicId\)\}/);
  const panelSource=read("components/dealer-network/DealerNetworkBoardPanel.tsx");
  assert.match(panelSource,/setFilter\(boardTopicFilter\(topic\)\);\s*setSearch\(""\)/);
  assert.match(panelSource,/history.replaceState[\s\S]*boardLink\(topic.id\)/);
  assert.match(panelSource,/id=\{\x60board-topic-\$\{topic.id\}/);
});
