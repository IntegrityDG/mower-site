import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  detectMessageImageType,
  inspectHeicContainer,
  normalizeMessageImage,
} from "../lib/dealer-network/image-processing";
import {
  MESSAGE_BATCH_BYTES,
  MESSAGE_PHOTO_BYTES,
  validateMessageFiles,
  validateReport,
  validateSendMessage,
  validateUploadTicketRequest,
} from "../lib/dealer-network/messaging-validation";
import {
  conversationIncludesMember,
  otherConversationMember,
} from "../lib/dealer-network/messaging-policy";
import { sendNewMessageEmail } from "../lib/dealer-network/new-message-email";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260815190234_add_dealer_network_friends_messaging.sql",
).toLowerCase();
const messagingServer = source("lib/dealer-network/messaging-server.ts");

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const image = (type: string, size = 100, name = "photo.jpg") => ({
  type,
  size,
  name,
});

test("message photo validation accepts one, two, or three supported files and rejects four", () => {
  for (const count of [1, 2, 3])
    assert.equal(
      validateMessageFiles(
        Array.from({ length: count }, () => image("image/jpeg")) as File[],
      ),
      null,
    );
  assert.match(
    validateMessageFiles(
      Array.from({ length: 4 }, () => image("image/jpeg")) as File[],
    ) ?? "",
    /three/i,
  );
});

test("photo limits accept exactly 15 MB per original and bound the aggregate", () => {
  assert.equal(
    validateMessageFiles([
      image("image/jpeg", MESSAGE_PHOTO_BYTES),
      image("image/png", MESSAGE_PHOTO_BYTES, "photo.png"),
      image("image/webp", MESSAGE_PHOTO_BYTES, "photo.webp"),
    ] as File[]),
    null,
  );
  assert.equal(MESSAGE_BATCH_BYTES, 45 * 1024 * 1024);
  assert.match(
    validateMessageFiles([
      image("image/jpeg", MESSAGE_PHOTO_BYTES + 1),
    ] as File[]) ?? "",
    /15 mb/i,
  );
});

test("normal phone HEIC and HEIF extensions are accepted when the browser omits MIME", () => {
  assert.equal(
    validateMessageFiles([
      image("", 500, "IMG_1001.HEIC"),
      image("application/octet-stream", 500, "IMG_1002.heif"),
    ] as File[]),
    null,
  );
  assert.match(
    validateMessageFiles([image("", 500, "script.exe")] as File[]) ?? "",
    /jpeg, png, webp, heic, or heif/i,
  );
});

test("message, ticket, and report payloads fail closed", () => {
  assert.ok(
    validateSendMessage({
      conversationId: uuid(1),
      clientMessageId: uuid(2),
      body: "Hello",
      uploadIds: [],
    }),
  );
  assert.ok(
    validateSendMessage({
      conversationId: uuid(1),
      clientMessageId: uuid(2),
      body: "",
      uploadIds: [uuid(3)],
    }),
  );
  assert.equal(
    validateSendMessage({
      conversationId: uuid(1),
      clientMessageId: uuid(2),
      body: "",
      uploadIds: [],
    }),
    null,
  );
  const forged = validateSendMessage({
    conversationId: uuid(1),
    clientMessageId: uuid(2),
    senderMemberId: uuid(999),
    body: "<script>alert('xss')</script>",
    uploadIds: [],
  });
  assert.ok(forged);
  assert.equal("senderMemberId" in forged, false);
  assert.match(forged.body ?? "", /<script>/);
  assert.equal(
    validateSendMessage({
      conversationId: uuid(1),
      clientMessageId: uuid(2),
      body: "x".repeat(5_001),
      uploadIds: [],
    }),
    null,
  );
  assert.ok(
    validateUploadTicketRequest({
      conversationId: uuid(1),
      files: [{ contentType: "image/heic", byteSize: 499 }],
    }),
  );
  assert.equal(
    validateUploadTicketRequest({
      conversationId: uuid(1),
      files: [{ contentType: "image/svg+xml", byteSize: 499 }],
    }),
    null,
  );
  assert.ok(
    validateReport({
      conversationId: uuid(1),
      clientReportId: uuid(4),
      reason: "Unwanted repeated contact",
    }),
  );
  assert.equal(
    validateReport({
      conversationId: uuid(1),
      clientReportId: uuid(4),
      reason: "no",
    }),
    null,
  );
});

// Real HEVC HEIC from strukturag/libheif's LGPL-3.0 fuzz corpus:
// fuzzing/data/corpus/colors-no-alpha.heic at 1a3583bcce77de6d3f8701c0758e3954863681ba.
const realHeic = Buffer.from(
  "AAAAGGZ0eXBoZWljAAAAAG1pZjFoZWljAAABLm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAADnBpdG0AAAAAAAEAAAAiaWxvYwAAAABEQAABAAEAAAAAAU4AAQAAAAAAAAClAAAAI2lpbmYAAAAAAAEAAAAVaW5mZQIAAAAAAQAAaHZjMQAAAACuaXBycAAAAJFpcGNvAAAAdWh2Y0MBA3AAAAAAAAAAAAAe8AD8/fj4AAAPAyAAAQAYQAEMAf//A3AAAAMAkAAAAwAAAwAeugJAIQABAChCAQEDcAAAAwCQAAADAAADAB6gIIEFlupJKa5sCAAAAwAIAAADAAhAIgABAAdEAcFysCJAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAVaXBtYQAAAAAAAAABAAECgQIAAACtbWRhdAAAAKEmAa8TgIGSEXXAGM2sfMMD8HKXsBNBYjkEW6//QKl1HfLCc/SN/bWOG2ARaa8rk4JsxRuKJFz/vIlnrSBv0Pk7pYMv503LniUfVt0RGOMyTBZVcbnDhlXs0nsTVObq7679Fh7MfXPARYndCrwpKWSNTQcCjNVYWPVOenDxU81lLBnE070xnN107IoLiTNywdiNWzedf/q6zzV3iwZflrO94A==",
  "base64",
);

test("real HEIC is decoded server-side and normalized to metadata-free JPEG", async () => {
  assert.ok(inspectHeicContainer(realHeic));
  assert.equal(detectMessageImageType(realHeic, "image/heic"), "heic");
  const output = await normalizeMessageImage(realHeic, "image/heic");
  assert.equal(output.contentType, "image/jpeg");
  assert.equal(output.width, 64);
  assert.equal(output.height, 64);
  assert.deepEqual([...output.buffer.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  const metadata = await sharp(output.buffer).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test("JPEG orientation is applied and metadata is stripped during normalization", async () => {
  const oriented = await sharp({
    create: {
      width: 10,
      height: 20,
      channels: 3,
      background: { r: 20, g: 120, b: 220 },
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const output = await normalizeMessageImage(oriented, "image/jpeg");
  assert.equal(output.width, 20);
  assert.equal(output.height, 10);
  const metadata = await sharp(output.buffer).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test("PNG and WebP normalize while MIME spoofing and fake HEIC are rejected", async () => {
  const raw = sharp({
    create: {
      width: 32,
      height: 16,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 0.5 },
    },
  });
  for (const [bytes, type] of [
    [await raw.clone().png().toBuffer(), "image/png"],
    [await raw.clone().webp().toBuffer(), "image/webp"],
  ] as const) {
    const output = await normalizeMessageImage(bytes, type);
    assert.equal(output.contentType, "image/jpeg");
    assert.equal(output.width, 32);
    assert.equal(output.height, 16);
  }
  await assert.rejects(
    normalizeMessageImage(Buffer.from("not a jpeg"), "image/jpeg"),
    /INVALID_IMAGE_SIGNATURE/,
  );
  await assert.rejects(
    normalizeMessageImage(Buffer.from("0000ftypheicfake"), "image/heic"),
    /INVALID_IMAGE_SIGNATURE/,
  );
});

test("HEIC preflight rejects excessive declared pixel dimensions before decode", () => {
  const oversized = Buffer.from(realHeic);
  const ispe = oversized.indexOf(Buffer.from("ispe"));
  assert.ok(ispe > 0);
  oversized.writeUInt32BE(9_001, ispe + 8);
  assert.equal(inspectHeicContainer(oversized), null);
  assert.equal(detectMessageImageType(realHeic, "image/heif"), "heic");
});

test("the shared participant predicate rejects unrelated Member C", () => {
  const conversation = {
    member_low_id: uuid(10),
    member_high_id: uuid(20),
  };
  assert.equal(conversationIncludesMember(conversation, uuid(10)), true);
  assert.equal(conversationIncludesMember(conversation, uuid(20)), true);
  assert.equal(conversationIncludesMember(conversation, uuid(30)), false);
  assert.equal(otherConversationMember(conversation, uuid(10)), uuid(20));
  assert.equal(otherConversationMember(conversation, uuid(30)), null);
  assert.match(messagingServer, /conversationIncludesMember\(conversation, memberId\)/);
});

test("migration keeps friends one-way and private with self and duplicate guards", () => {
  assert.match(migration, /create table public\.dealer_network_friends/);
  assert.match(migration, /unique \(owner_member_id, friend_member_id\)/);
  assert.match(migration, /check \(owner_member_id <> friend_member_id\)/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all on table public\.%i from public, anon, authenticated, service_role/,
  );
  assert.match(migration, /grant select, insert, update, delete on table public\.%i to service_role/);
});

test("conversation uniqueness, idempotent messages, unread mutation, and block checks are atomic", () => {
  assert.match(migration, /unique \(member_low_id, member_high_id\)/);
  assert.match(migration, /least\(p_member_id,p_other_member_id\)/);
  assert.match(migration, /greatest\(p_member_id,p_other_member_id\)/);
  assert.match(migration, /unique \(sender_member_id, client_message_id\)/);
  assert.match(migration, /starts_unread_streak/);
  assert.match(migration, /set unread_count=unread_count\+1/);
  assert.match(migration, /set unread_count=0,last_read_message_id/);
  assert.match(migration, /p_last_visible_message_id uuid/);
  assert.match(migration, /remaining_unread/);
  assert.match(
    migration,
    /perform 1 from public\.dealer_network_conversations[\s\S]*?for update/,
  );
  assert.match(migration, /from public\.dealer_network_blocks/);
  const sendFunction = migration.match(
    /create function public\.dealer_network_send_message[\s\S]*?end \$\$;/,
  )?.[0] ?? "";
  assert.doesNotMatch(sendFunction, /dealer_network_friends/);
  assert.match(migration, /for update/);
  assert.match(migration, /status='active' and account_locked=false and messaging_enabled=true/);
  assert.match(migration, /body is not null or attachment_count > 0/);
  assert.match(migration, /char_length\(body\) between 1 and 5000/);
  assert.match(messagingServer, /order\("created_at", \{ ascending: false \}\)[\s\S]*?order\("id", \{ ascending: false \}\)/);
  assert.match(messagingServer, /created_at\.eq\.\$\{before\.createdAt\},id\.lt\.\$\{before\.id\}/);
});

test("friend mutations derive the owner from session and cannot touch messages", () => {
  const route = source("app/api/dealer-network/member/friends/route.ts");
  assert.match(route, /requireActiveUnlockedMember/);
  assert.match(route, /setFriend\(session\.memberId/);
  const removeFunction = migration.match(
    /create function public\.dealer_network_remove_friend[\s\S]*?end \$\$;/,
  )?.[0] ?? "";
  assert.match(removeFunction, /delete from public\.dealer_network_friends/);
  assert.doesNotMatch(removeFunction, /messages|conversations/);
  const notifications = source("lib/dealer-network/notifications.ts");
  assert.doesNotMatch(notifications, /friend_(added|removed)|new_friend/);
});

test("message photos use a private bucket, signed participant reads, and report-scoped admin reads", () => {
  assert.match(
    migration,
    /'dealer-network-messages-private',[\s\S]*?false,[\s\S]*?15728640/,
  );
  assert.match(messagingServer, /conversationForMember\(String\(message\.conversation_id\), memberId\)/);
  assert.match(messagingServer, /createSignedUrl\([\s\S]*?MESSAGE_SIGNED_READ_SECONDS/);
  const memberAttachmentRoute = source(
    "app/api/dealer-network/member/messages/attachments/[id]/route.ts",
  );
  assert.match(memberAttachmentRoute, /requireActiveUnlockedMember/);
  assert.match(memberAttachmentRoute, /signedMemberAttachment\(session\.memberId, id\)/);
  const adminServer = source("lib/dealer-network/admin-server.ts");
  assert.match(adminServer, /eq\("conversation_id", report\.conversation_id\)/);
  assert.match(adminServer, /readReportedConversation/);
});

test("storage processing verifies bytes, normalizes originals, and cleans staging and failed finals", () => {
  assert.match(messagingServer, /bytes\.byteLength !== upload\.declared_byte_size/);
  assert.match(messagingServer, /normalizeMessageImage/);
  assert.match(messagingServer, /status: "processing"/);
  assert.match(messagingServer, /status: "consumed"/);
  assert.match(messagingServer, /status: "failed"/);
  assert.match(messagingServer, /remove\(finalPaths\)/);
  assert.match(messagingServer, /remove\(stagingPaths\)/);
  assert.match(migration, /invalid_attachment_path/);
});

test("messaging disablement preserves reads and gates starts, tickets, and sends", () => {
  const auth = source("lib/dealer-network/member-auth.ts");
  assert.match(auth, /requireMessagingEnabledMember/);
  assert.match(auth, /Existing messages remain available/);
  for (const route of [
    "app/api/dealer-network/member/messages/route.ts",
    "app/api/dealer-network/member/messages/uploads/route.ts",
    "app/api/dealer-network/member/messages/conversations/route.ts",
  ])
    assert.match(source(route), /requireMessagingEnabledMember/);
  assert.match(
    source("app/api/dealer-network/member/messages/conversations/[id]/route.ts"),
    /requireActiveUnlockedMember/,
  );
});

test("all abusive write surfaces use database-backed rate limits", () => {
  const cases = [
    ["app/api/dealer-network/member/messages/conversations/route.ts", "conversation_start", "30"],
    ["app/api/dealer-network/member/messages/route.ts", "message_send", "60"],
    ["app/api/dealer-network/member/messages/uploads/route.ts", "message_upload_prepare", "30"],
    ["app/api/dealer-network/member/reports/route.ts", "member_report", "5"],
    ["app/api/dealer-network/member/friends/route.ts", "friend_change", "60"],
    ["app/api/dealer-network/member/blocks/route.ts", "member_block_change", "30"],
  ] as const;
  for (const [path, scope, maximum] of cases) {
    const route = source(path);
    assert.match(route, /consumeDealerRateLimit/);
    assert.ok(route.includes(`"${scope}"`));
    assert.match(route, new RegExp(`\\n\\s*${maximum},`));
  }
});

test("new-message email is coalesced, retryable, and excludes private content", () => {
  const notifications = source("lib/dealer-network/notifications.ts");
  const email = source("lib/dealer-network/new-message-email.ts");
  assert.match(migration, /coalesce\(prior_unread,0\)=0/);
  assert.match(notifications, /dealer-message:\$\{input\.messageId\}:first-unread/);
  assert.match(email, /does not include the message or photos/);
  assert.doesNotMatch(
    notifications.match(/export function notifyNewDealerMessage[\s\S]*?^}/m)?.[0] ?? "",
    /input\.(body|attachments|photos)/,
  );
  assert.match(source("lib/dealer-network/admin-server.ts"), /member_new_message/);
  assert.match(messagingServer, /\.catch\(\(error\) =>[\s\S]*Dealer message email failed after send/);
});

test("new-message email uses a mocked provider without private content and surfaces provider failure", async () => {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  await sendNewMessageEmail(
    {
      recipientName: "Recipient",
      recipientEmail: "recipient@example.com",
      senderName: "Sender",
      origin: "https://integrityautomowers.com",
      body: "PRIVATE_BODY_SENTINEL",
      photos: ["PRIVATE_PHOTO_SENTINEL"],
    } as Parameters<typeof sendNewMessageEmail>[0] & {
      body: string;
      photos: string[];
    },
    async (message) => sent.push(message),
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "recipient@example.com");
  assert.equal(
    sent[0].subject,
    "You Have a New Message in the IDS Dealer & Tech Network",
  );
  assert.doesNotMatch(JSON.stringify(sent[0]), /PRIVATE_BODY_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(sent[0]), /PRIVATE_PHOTO_SENTINEL/);
  await assert.rejects(
    sendNewMessageEmail(
      {
        recipientName: "Recipient",
        recipientEmail: "recipient@example.com",
        senderName: "Sender",
        origin: "https://integrityautomowers.com",
      },
      async () => {
        throw new Error("MOCK_PROVIDER_FAILURE");
      },
    ),
    /MOCK_PROVIDER_FAILURE/,
  );
});

test("member UI includes responsive friends, message polling, unread, block, report, and upload controls", () => {
  const portal = source("components/dealer-network/MemberPortal.tsx");
  assert.match(portal, /My Friends/);
  assert.match(portal, /Messages\$\{unreadTotal/);
  assert.match(portal, /30_000/);
  assert.match(portal, /md:grid-cols-\[18rem_minmax\(0,1fr\)\]/);
  assert.match(portal, /Load Older Messages/);
  assert.match(portal, /Submit Private Report/);
  assert.match(portal, /Unblock/);
  assert.match(portal, /Loading private photo/);
  assert.match(portal, /Private photo unavailable/);
  assert.match(portal, /3 photos · 15 MB each/);
});

test("admin can disable messaging and sees content only through report workflow", () => {
  const admin = source("components/dealer-network/DealerNetworkAdmin.tsx");
  assert.match(admin, /Disable.*Enable.*Messaging/s);
  assert.match(admin, /Reports \(/);
  assert.match(admin, /report-scoped conversation view/);
  assert.match(
    source("app/api/admin/dealer-network/reports/[id]/route.ts"),
    /requireDealerNetworkAdmin/,
  );
  assert.doesNotMatch(
    source("lib/dealer-network/admin-server.ts").split("export async function readReportedConversation")[0],
    /dealer_network_messages"\)\s*\.select\("id,sender_member_id,body/,
  );
});

test("block and report records are private, history-preserving, and lifecycle constrained", () => {
  assert.match(migration, /unique \(blocker_member_id, blocked_member_id\)/);
  assert.match(migration, /check \(blocker_member_id <> blocked_member_id\)/);
  assert.match(migration, /status in \('new','reviewed','resolved'\)/);
  assert.match(migration, /reported_through_message_id uuid references public\.dealer_network_messages/);
  const blockFunction = migration.match(
    /create function public\.dealer_network_set_block[\s\S]*?end \$\$;/,
  )?.[0] ?? "";
  assert.doesNotMatch(blockFunction, /delete from public\.dealer_network_messages/);
  assert.doesNotMatch(blockFunction, /notification/);
  assert.match(blockFunction, /delete from public\.dealer_network_blocks/);
  const blockRoute = source("app/api/dealer-network/member/blocks/route.ts");
  assert.match(blockRoute, /readBlockedMembers\(session\.memberId\)/);
  assert.doesNotMatch(blockRoute, /blockerMemberId|ownerMemberId/);
  const reportRoute = source("app/api/dealer-network/member/reports/route.ts");
  assert.match(reportRoute, /session\.memberId/);
  const adminRoute = source("app/api/admin/dealer-network/reports/[id]/route.ts");
  assert.match(adminRoute, /requireDealerNetworkAdmin/);
  assert.match(adminRoute, /updateDealerReport/);
  assert.match(
    source("lib/dealer-network/admin-server.ts"),
    /new: \["new", "reviewed", "resolved"\][\s\S]*reviewed: \["reviewed", "resolved"\][\s\S]*resolved: \["resolved"\]/,
  );
});
