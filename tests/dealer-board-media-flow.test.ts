import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import * as mediaValidation from "../lib/dealer-network/board-media-validation";
import * as messageValidation from "../lib/dealer-network/messaging-validation";
import * as imageProcessing from "../lib/dealer-network/image-processing";
import * as validation from "../lib/dealer-network/validation";
import { loadInstallationModule as load } from "./helpers/installation-module";

type Row = Record<string, unknown>;
const owner="b0c877b0-a25b-48b3-85d4-aa86b12a3571", peer="ab9c7422-ac7b-48c0-964b-f97bf31851e1";
const outsider="14aa7858-ed22-43ce-8abd-6129ead6d683", discussion="b79d3633-9d87-4639-b012-3b74c4a47da5";
const topic="84d04a5a-dc58-4ef8-af1b-ab17fdab1882", parent="9e1aef74-a199-47fc-b59d-00046b46dc33";
const photo="efa98820-d37b-4bc5-8672-d62432663825";
const updates="dealer_network_board_comment_uploads";

function fixture() {
  const tables: Record<string, Row[]> = {
    [updates]: [], dealer_network_board_comment_attachments: [],
    dealer_network_discussions: [{id:discussion,topic_id:topic,status:"open"}],
    dealer_network_board_topics: [{id:topic,status:"active"}],
    dealer_network_board_topic_recipients: [{topic_id:topic,member_id:owner},{topic_id:topic,member_id:peer}],
    dealer_network_discussion_comments: [{id:parent,discussion_id:discussion,parent_comment_id:null,removed_at:null,deleted_at:null}],
  };
  const blobs = new Map<string, Blob>();
  let downloads=0;
  const storage = {
    from(name:string) {
      assert.equal(name,"dealer-network-board-private");
      return {
        createSignedUploadUrl: async (key:string) => ({data:{token:`synthetic:${key}`},error:null}),
        download: async (key:string) => {downloads++;return {data:blobs.get(key),error:null};},
        upload: async (key:string, bytes:ArrayBuffer) => {
          assert.ok(key.startsWith("verified/"));
          blobs.set(key,new Blob([bytes]));
          return {data:{path:key},error:null};
        },
        info: async (key:string) => ({data:{size:blobs.get(key)?.size},error:null}),
        remove: async (keys:string[]) => {keys.forEach(key=>blobs.delete(key));return {error:null};},
      };
    },
  };
  function query(table: string) {
    assert.ok(tables[table],table);
    const filters: ((row: Row) => boolean)[]=[];
    let change:Row|null=null, action="select";
    function value(single=false) {
      let records=tables[table].filter(row=>filters.every(f=>f(row)));
      if(action==="update" && change) records=records.map(row=>Object.assign(row,change));
      if(action==="delete") tables[table]=tables[table].filter(row=>!records.includes(row));
      return {data:single ? records[0] ?? null : records,error:null};
    }
    const q={
      select:()=>q, limit:()=>q,
      eq:(key:string,wanted:unknown)=>{filters.push(r=>r[key]===wanted);return q;},
      neq:(key:string,wanted:unknown)=>{filters.push(r=>r[key]!==wanted);return q;},
      is:(key:string,wanted:unknown)=>{filters.push(r=>r[key]===wanted);return q;},
      in:(key:string,wanted:unknown[])=>{filters.push(r=>wanted.includes(r[key]));return q;},
      gt:(key:string,wanted:string)=>{filters.push(r=>String(r[key])>wanted);return q;},
      lt:(key:string,wanted:string)=>{filters.push(r=>String(r[key])<wanted);return q;},
      update:(patch:Row)=>{action="update";change=patch;return q;},
      insert:async (rows:Row[])=>{tables[table].push(...rows.map(row=>({status:"prepared",verified_path:null,...row})));return {error:null};},
      delete:()=>{action="delete";return q;},
      maybeSingle:async()=>value(true),
      then:(resolve:(input:unknown)=>unknown)=>resolve(value()),
    };
    return q;
  }
  const backend=load<typeof import("../lib/dealer-network/board-media-server")>("lib/dealer-network/board-media-server.ts",{
    "node:crypto":{randomUUID}, "@/lib/supabase":{getSupabaseServiceClient:()=>({from:query,storage}),getSupabaseUrl:()=>"https://test-fixture.supabase.co"},
    "./board-media-validation":mediaValidation,"./messaging-validation":messageValidation,
    "./image-processing":imageProcessing,"./validation":validation,
  });
  return {backend,tables,blobs,downloads:()=>downloads};
}

test("private Board media server verifies actual fixture bytes, matches exact author and reply, and denies removed/unpermitted reads",async()=>{
  const {backend,tables,blobs,downloads}=fixture();
  const png=await sharp({create:{width:8,height:9,channels:3,background:"yellow"}}).png().toBuffer();
  const issued=await backend.prepareBoardUploads(owner,discussion,{parentCommentId:parent,files:[{contentType:"image/png",byteSize:png.length}]});
  assert.equal(issued.tickets.length,1);
  const ticket=issued.tickets[0];
  assert.match(ticket.signedUrl,/^https:\/\/test-fixture\.storage\.supabase\.co\//);
  const upload=tables[updates][0];
  assert.equal(upload.owner_member_id,owner);
  assert.equal(upload.parent_comment_id,parent);
  const bytes=imageProcessing.exactStorageArrayBuffer(png);
  blobs.set(ticket.path,new Blob([bytes]));
  // Substitute the Storage service at the boundary, not the actual decode function.
  await assert.rejects(backend.verifyBoardUploads(peer,discussion,parent,[ticket.id]),/UPLOAD_UNAVAILABLE/);
  await assert.rejects(backend.verifyBoardUploads(owner,discussion,null,[ticket.id]),/UPLOAD_UNAVAILABLE/);
  assert.equal(downloads(),0);
  await backend.verifyBoardUploads(owner,discussion,parent,[ticket.id]);
  assert.equal(upload.status,"ready");
  assert.equal(blobs.has(ticket.path),false);
  const dest=String(upload.verified_path);
  const verified=Buffer.from(await blobs.get(dest)!.arrayBuffer());
  assert.equal((await sharp(verified).metadata()).format,"jpeg");
  assert.equal(upload.width,8);
  assert.equal(upload.height,9);

  tables.dealer_network_board_comment_attachments.push({id:photo,comment_id:parent,storage_path:dest});
  const readByPeer=await backend.readBoardPhoto(photo,peer);
  assert.equal(readByPeer.headers.get("cache-control"),"private, no-store");
  assert.equal(readByPeer.headers.get("content-type"),"image/jpeg");
  assert.equal(readByPeer.headers.get("cross-origin-resource-policy"),"same-origin");
  assert.deepEqual(Buffer.from(await readByPeer.arrayBuffer()),verified);
  tables.dealer_network_board_topics[0].status="archived";
  assert.equal((await backend.readBoardPhoto(photo,peer)).status,200);
  assert.equal((await backend.readBoardPhoto(photo,null)).status,200);
  const beforeDenials=downloads();
  await assert.rejects(backend.readBoardPhoto(photo,outsider),/DISCUSSION_UNAVAILABLE/);
  tables.dealer_network_discussion_comments[0].removed_at="2026-11-03";
  await assert.rejects(backend.readBoardPhoto(photo,peer),/PHOTO_UNAVAILABLE/);
  await assert.rejects(backend.readBoardPhoto(photo,null),/PHOTO_UNAVAILABLE/);
  assert.equal(downloads(),beforeDenials);
});
