import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  sendDealerMemberInvitationEmail,
} from "../lib/dealer-network/member-invitation-email";


const migrationPath =
  "supabase/migrations/20260818045219_add_dealer_member_invitations.sql";

const migration =
  readFileSync(migrationPath, "utf8");

const ambiguityFixMigration = readFileSync(
  "supabase/migrations/20260823004600_fix_dealer_network_invitation_email_ambiguity.sql",
  "utf8",
);

test("invitation email ambiguity fix uses collision-safe local variables", () => {
  assert.match(
    ambiguityFixMigration,
    /create or replace function public\.dealer_network_create_member_invitation/,
  );
  for (const variable of [
    "v_invitation_id",
    "v_normalized_name",
    "v_normalized_email",
    "v_normalized_message",
  ])
    assert.match(ambiguityFixMigration, new RegExp(`\\b${variable}\\b`));
  assert.match(
    ambiguityFixMigration,
    /where lower\(m\.email\) = v_normalized_email/,
  );
  assert.match(
    ambiguityFixMigration,
    /where lower\(i\.invitee_email\) = v_normalized_email/,
  );
  assert.doesNotMatch(
    ambiguityFixMigration,
    /\b(?:invitation_id|normalized_name|normalized_email|normalized_message)\s+(?:uuid|text)\s*;/,
  );
  assert.doesNotMatch(
    ambiguityFixMigration,
    /=\s*normalized_email\b/,
  );
});

test("ambiguity fix preserves invitation guards, limits, insert and message", () => {
  for (const behavior of [
    "m.status = 'active'",
    "m.account_locked = false",
    "m.deleted_at is null",
    "already_member",
    "pg_advisory_xact_lock",
    "invitation_recipient_cooldown",
    "now() - interval '7 days'",
    "'member_invitation_24h'",
    "invitation_daily_limit",
    "p_personal_message",
    "insert into public.dealer_network_member_invitations",
  ])
    assert.ok(ambiguityFixMigration.includes(behavior), behavior);
  assert.match(ambiguityFixMigration, /10,\s*86400/);
});

test("ambiguity fix preserves invoker security, search path and ACLs", () => {
  assert.match(ambiguityFixMigration, /security invoker/);
  assert.match(ambiguityFixMigration, /set search_path = pg_catalog, public/);
  assert.match(
    ambiguityFixMigration,
    /revoke all[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    ambiguityFixMigration,
    /grant execute[\s\S]*to service_role/,
  );
  assert.doesNotMatch(ambiguityFixMigration, /security definer/i);
});


test(
  "member invitation email identifies the inviter, includes the optional message, and sends the recipient to the application",
  async () => {
    const sent: Array<{
      to: string;
      subject: string;
      text: string;
    }> = [];

    await sendDealerMemberInvitationEmail(
      {
        invitationId:
          "10000000-0000-4000-8000-000000000001",

        inviterMemberId:
          "20000000-0000-4000-8000-000000000001",

        inviterName:
          "Jordan Smith",

        inviterCompanyName:
          "Midwest Robotics",

        inviteeName:
          "Alex Technician",

        inviteeEmail:
          "alex@example.com",

        personalMessage:
          "I think this network would be useful for your shop.",

        origin:
          "https://example.com",
      },
      async (message) => {
        sent.push(message);
        return {};
      },
    );

    assert.equal(
      sent.length,
      1,
    );

    assert.equal(
      sent[0]?.to,
      "alex@example.com",
    );

    assert.equal(
      sent[0]?.subject,
      "You Have Been Invited to the IDS Dealer & Tech Community",
    );

    assert.match(
      sent[0]?.text ?? "",
      /Jordan Smith of Midwest Robotics/,
    );

    assert.match(
      sent[0]?.text ?? "",
      /I think this network would be useful for your shop\./,
    );

    assert.match(
      sent[0]?.text ?? "",
      /https:\/\/example\.com\/dealer-tech-resources\/apply/,
    );

    assert.match(
      sent[0]?.text ?? "",
      /does not guarantee approval or provide immediate portal access/,
    );
  },
);


test(
  "invitation schema is private and service-role only",
  () => {
    assert.match(
      migration,
      /create table public\.dealer_network_member_invitations/,
    );

    assert.match(
      migration,
      /enable row level security/,
    );

    assert.match(
      migration,
      /force row level security/,
    );

    assert.match(
      migration,
      /revoke all[\s\S]*dealer_network_member_invitations[\s\S]*from public, anon, authenticated/,
    );

    assert.match(
      migration,
      /grant select, insert, update[\s\S]*dealer_network_member_invitations[\s\S]*to service_role/,
    );

    assert.doesNotMatch(
      migration,
      /grant (?:select|insert|update|delete)[^;]*dealer_network_member_invitations[^;]*to (?:anon|authenticated)/i,
    );
  },
);


test(
  "invitation creation enforces active inviter, existing-member rejection, global seven-day cooldown and ten-per-day limit",
  () => {
    const body =
      migration.match(
        /create function public\.dealer_network_create_member_invitation[\s\S]*?\$\$;/,
      )?.[0] ?? "";

    assert.notEqual(
      body,
      "",
    );

    assert.match(
      body,
      /status = 'active'/,
    );

    assert.match(
      body,
      /account_locked = false/,
    );

    assert.match(
      body,
      /deleted_at is null/,
    );

    assert.match(
      body,
      /already_member/,
    );

    assert.match(
      body,
      /pg_advisory_xact_lock/,
    );

    assert.match(
      body,
      /now\(\) - interval '7 days'/,
    );

    assert.match(
      body,
      /invitation_recipient_cooldown/,
    );

    assert.match(
      body,
      /'member_invitation_24h'/,
    );

    assert.match(
      body,
      /10,\s*86400/,
    );

    assert.match(
      body,
      /invitation_daily_limit/,
    );

    const cooldownIndex =
      body.indexOf(
        "invitation_recipient_cooldown",
      );

    const limiterIndex =
      body.indexOf(
        "'member_invitation_24h'",
      );

    const insertIndex =
      body.indexOf(
        "insert into public.dealer_network_member_invitations",
      );

    assert.ok(
      cooldownIndex >= 0,
    );

    assert.ok(
      limiterIndex >
        cooldownIndex,
      "recipient cooldown must be checked before consuming the member quota",
    );

    assert.ok(
      insertIndex >
        limiterIndex,
      "the invitation must be inserted only after all limits pass",
    );
  },
);


test(
  "an invitation does not create or approve a Dealer Network account",
  () => {
    const body =
      migration.match(
        /create function public\.dealer_network_create_member_invitation[\s\S]*?\$\$;/,
      )?.[0] ?? "";

    assert.doesNotMatch(
      body,
      /insert into public\.dealer_network_members/i,
    );

    assert.doesNotMatch(
      body,
      /insert into public\.dealer_network_applications/i,
    );

    assert.doesNotMatch(
      body,
      /dealer_network_approve_application/i,
    );

    const server =
      readFileSync(
        "lib/dealer-network/member-invitation-server.ts",
        "utf8",
      );

    assert.doesNotMatch(
      server,
      /\.from\("dealer_network_applications"\)/,
    );

    assert.doesNotMatch(
      server,
      /dealer_network_approve_application/,
    );
  },
);


test(
  "member invitation API derives ownership only from the authenticated session",
  () => {
    const route =
      readFileSync(
        "app/api/dealer-network/member/invitations/route.ts",
        "utf8",
      );

    assert.match(
      route,
      /requireActiveUnlockedMember/,
    );

    assert.match(
      route,
      /createMemberInvitation\(\s*session\.memberId/,
    );

    assert.match(
      route,
      /readMemberInvitations\(\s*session\.memberId/,
    );

    assert.doesNotMatch(
      route,
      /body\.memberId|searchParams\.get\(["']memberId/,
    );
  },
);


test(
  "invitation history is scoped to the authenticated inviter",
  () => {
    const server =
      readFileSync(
        "lib/dealer-network/member-invitation-server.ts",
        "utf8",
      );

    assert.match(
      server,
      /\.eq\(\s*"inviter_member_id",\s*memberId,\s*\)/,
    );

    assert.match(
      server,
      /dealer_network_create_member_invitation/,
    );

    assert.match(
      server,
      /That email address already belongs to a Dealer & Tech Network member\./,
    );

    assert.match(
      server,
      /already been invited within the last 7 days/,
    );

    assert.match(
      server,
      /limit of 10 invitations in a 24-hour period/,
    );
  },
);


test(
  "member invitation notifications use the Dealer Network retry ledger and retain invitation context",
  () => {
    const notifications =
      readFileSync(
        "lib/dealer-network/notifications.ts",
        "utf8",
      );

    assert.match(
      notifications,
      /invitationId\?: string \| null/,
    );

    assert.match(
      notifications,
      /invitation_id: context\.invitationId \?\? null/,
    );

    assert.match(
      notifications,
      /eventType: "member_invitation"/,
    );

    assert.match(
      notifications,
      /memberId: input\.inviterMemberId/,
    );

    assert.match(
      notifications,
      /dealer-member-invitation:\$\{input\.invitationId\}/,
    );

    assert.match(
      migration,
      /'member_invitation'/,
    );

    assert.match(
      migration,
      /invitation_id uuid[\s\S]*references public\.dealer_network_member_invitations/,
    );
  },
);


test(
  "admin notification retry reconstructs and resends failed member invitations",
  () => {
    const admin =
      readFileSync(
        "lib/dealer-network/admin-server.ts",
        "utf8",
      );

    assert.match(
      admin,
      /broadcast_id,invitation_id,status/,
    );

    assert.match(
      admin,
      /event\.event_type === "member_invitation"/,
    );

    assert.match(
      admin,
      /\.from\("dealer_network_member_invitations"\)/,
    );

    assert.match(
      admin,
      /\.eq\(\s*"inviter_member_id",\s*event\.member_id,\s*\)/,
    );

    assert.match(
      admin,
      /notifyDealerMemberInvitation/,
    );
  },
);


test(
  "member portal exposes invitation controls and preserves IDS announcements",
  () => {
    const portal =
      readFileSync(
        "components/dealer-network/MemberPortal.tsx",
        "utf8",
      );

    const invitations =
      readFileSync(
        "components/dealer-network/MemberInvitationPanel.tsx",
        "utf8",
      );

    const announcements =
      readFileSync(
        "components/dealer-network/AnnouncementsPanel.tsx",
        "utf8",
      );

    assert.match(
      portal,
      /\["invite", "Invite Someone"\]/,
    );

    assert.match(
      portal,
      /IDS Announcements/,
    );

    assert.match(
      invitations,
      /\/api\/dealer-network\/member\/invitations/,
    );

    assert.match(
      invitations,
      /up to 10 invitations[\s\S]*24-hour period/,
    );

    assert.match(
      invitations,
      /once within 7 days/,
    );

    assert.match(
      invitations,
      /maxLength=\{500\}/,
    );

    assert.match(
      invitations,
      /Invitations do not[\s\S]*create an account[\s\S]*guarantee approval/,
    );

    assert.match(
      announcements,
      /Official IDS Communication/,
    );

    assert.match(
      announcements,
      /read-only/,
    );
  },
);
