import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { parseBoardUploadTicketRequest, validateBoardUploadIds } from "../lib/dealer-network/board-media-validation";
import { normalizeMessageImage } from "../lib/dealer-network/image-processing";

const discussionId = "11000000-0000-4000-8000-000000000001";
const parentId = "11000000-0000-4000-8000-000000000002";
const uploadIds = [3,4,5,6].map((n) => `11000000-0000-4000-8000-00000000000${n}`);
const jpeg = { contentType: "image/jpeg", byteSize: 12 };
const files = Array.from({length:4}, () => jpeg);

test("Board ticket scopes top-level and reply photo counts", () => {
  assert.equal(parseBoardUploadTicketRequest(discussionId, { files: files.slice(0,3) })?.parentId, null);
  assert.equal(parseBoardUploadTicketRequest(discussionId, { files }), null);
  assert.equal(parseBoardUploadTicketRequest(discussionId, { parentCommentId: parentId, files: [jpeg] })?.parentId, parentId);
  assert.equal(parseBoardUploadTicketRequest(discussionId, { parentCommentId: parentId, files: [jpeg,jpeg] }), null);
  assert.equal(parseBoardUploadTicketRequest(discussionId, { parentCommentId: "bad", files: [jpeg] }), null);
  assert.equal(parseBoardUploadTicketRequest("bad", { files: [jpeg] }), null);
});
test("Board staging ignores client overrides and checks allowed types and exact byte declarations", () => {
  assert.equal(parseBoardUploadTicketRequest(discussionId, { files: [{...jpeg, byteSize: 15*1024*1024+1}] }), null);
  assert.equal(parseBoardUploadTicketRequest(discussionId, { files: [{...jpeg, byteSize: 1.2}] }), null);
  assert.equal(parseBoardUploadTicketRequest(discussionId, { files: [{...jpeg, contentType: "text/html"}] }), null);
});
test("Board rejects oversize, duplicate, or malformed upload references", () => {
  assert.equal(validateBoardUploadIds(null, uploadIds.slice(0,3)), true);
  assert.equal(validateBoardUploadIds(null, uploadIds), false);
  assert.equal(validateBoardUploadIds(null, [uploadIds[0], uploadIds[0]]), false);
  assert.equal(validateBoardUploadIds(parentId, uploadIds.slice(0,2)), false);
  assert.equal(validateBoardUploadIds(parentId, ["bad"]), false);
  assert.equal(validateBoardUploadIds(parentId, [uploadIds[0]]), true);
});
test("Board normalization decodes pixels, rejects a false declaration, and emits a metadata-free JPEG", async () => {
  const source = await sharp({create:{ width:10,height:12,channels:3,background:"red" }}).png().withMetadata().toBuffer();
  const image = await normalizeMessageImage(source,"image/png");
  const metadata = await sharp(image.buffer).metadata();
  assert.equal(metadata.format,"jpeg");
  assert.equal(metadata.exif,undefined);
  assert.deepEqual([metadata.width,metadata.height],[10,12]);
  await assert.rejects(normalizeMessageImage(source,"image/jpeg"), /INVALID_IMAGE_SIGNATURE/);
});
