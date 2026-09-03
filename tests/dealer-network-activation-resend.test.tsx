import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVATION_EMAIL_COOLDOWN_SECONDS,
  ActivationDeliveryError,
  deliverStagedActivation,
  type StagedActivationToken,
} from "../lib/dealer-network/activation-delivery";
import { activationResendEligibility } from "../lib/dealer-network/activation-resend";
import {
  DealerNotificationLedgerError,
  deliverClaimedDealerNotification,
  notificationRetryResult,
} from "../lib/dealer-network/notification-delivery";

const server = readFileSync("lib/dealer-network/admin-server.ts", "utf8");
const applicationRoute = readFileSync(
  "app/api/admin/dealer-network/applications/[id]/route.ts",
  "utf8",
);
const retryRoute = readFileSync(
  "app/api/admin/dealer-network/notifications/[id]/retry/route.ts",
  "utf8",
);
const ui = readFileSync(
  "components/dealer-network/DealerNetworkAdmin.tsx",
  "utf8",
);
const notifications = readFileSync(
  "lib/dealer-network/notifications.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260902120000_make_dealer_activation_resend_failure_safe.sql",
  "utf8",
);

type TokenRecord = {
  id: string;
  hash: string;
  revoked: boolean;
  used: boolean;
  expiresAt: number;
};

function activationHarness(
  overrides: Partial<{
    applicationExists: boolean;
    applicationStatus: "pending" | "approved" | "denied";
    memberExists: boolean;
    memberDeleted: boolean;
    memberStatus: "pending_activation" | "active";
    activatedAt: number | null;
    memberEmail: string;
  }> = {},
) {
  let now = Date.parse("2026-09-02T12:00:00.000Z");
  let tokenSequence = 0;
  let cooldownUntil = 0;
  const state = {
    applicationExists: true,
    applicationStatus: "approved" as "pending" | "approved" | "denied",
    applicationCount: 1,
    memberExists: true,
    memberDeleted: false,
    memberStatus: "pending_activation" as "pending_activation" | "active",
    activatedAt: null as number | null,
    memberEmail: "current-member@example.com",
    memberCount: 1,
    roles: ["dealer", "technician"],
    sentTo: [] as string[],
    attemptedEvents: [] as string[],
    tokens: [
      {
        id: "old-token-id",
        hash: "old-token-hash",
        revoked: false,
        used: false,
        expiresAt: now + 60 * 60 * 1000,
      },
    ] as TokenRecord[],
    ...overrides,
  };

  const usable = (token: TokenRecord) =>
    !token.revoked && !token.used && token.expiresAt > now;

  const deliver = (options: {
    eventKey: string;
    expectedEmail?: string;
    failProvider?: boolean;
    beforeFinalize?: () => void;
    waitForProvider?: () => Promise<void>;
  }) =>
    deliverStagedActivation({
      applicationId: "application-id",
      memberId: "member-id",
      expectedEmail: options.expectedEmail ?? state.memberEmail,
      createToken: () => {
        tokenSequence += 1;
        return {
          token: `raw-token-${tokenSequence}-${"x".repeat(32)}`,
          tokenHash: String(tokenSequence).padStart(64, "0"),
        };
      },
      stage: async ({ expectedEmail, tokenHash }) => {
        state.attemptedEvents.push(options.eventKey);
        if (!state.applicationExists)
          throw new ActivationDeliveryError("APPLICATION_NOT_FOUND");
        if (state.applicationStatus !== "approved")
          throw new ActivationDeliveryError("APPLICATION_NOT_APPROVED");
        if (!state.memberExists || state.memberDeleted)
          throw new ActivationDeliveryError("MEMBER_NOT_FOUND");
        if (state.memberStatus !== "pending_activation" || state.activatedAt)
          throw new ActivationDeliveryError("MEMBER_NOT_PENDING_ACTIVATION");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.memberEmail))
          throw new ActivationDeliveryError("INVALID_EMAIL");
        if (expectedEmail !== state.memberEmail)
          throw new ActivationDeliveryError("MEMBER_STATE_CHANGED");
        if (now < cooldownUntil)
          throw new ActivationDeliveryError("RATE_LIMIT");
        cooldownUntil = now + ACTIVATION_EMAIL_COOLDOWN_SECONDS * 1000;
        const staged: TokenRecord = {
          id: `staged-token-${tokenSequence}`,
          hash: tokenHash,
          revoked: true,
          used: false,
          expiresAt: now + 24 * 60 * 60 * 1000,
        };
        state.tokens.push(staged);
        return {
          tokenId: staged.id,
          memberId: "member-id",
          recipientEmail: state.memberEmail,
        } satisfies StagedActivationToken;
      },
      send: async ({ recipientEmail }) => {
        state.sentTo.push(recipientEmail);
        await options.waitForProvider?.();
        if (options.failProvider) throw new Error("provider rejected message");
        options.beforeFinalize?.();
      },
      finalize: async ({ tokenId, expectedEmail }) => {
        if (
          !state.memberExists ||
          state.memberDeleted ||
          state.memberStatus !== "pending_activation" ||
          state.activatedAt
        )
          return { finalized: false, reason: "member_state_changed" };
        if (state.memberEmail !== expectedEmail)
          return { finalized: false, reason: "member_email_changed" };
        const staged = state.tokens.find((token) => token.id === tokenId);
        if (!staged?.revoked || staged.used)
          return { finalized: false, reason: "token_not_staged" };
        for (const token of state.tokens)
          if (token.id !== tokenId && !token.used && !token.revoked)
            token.revoked = true;
        staged.revoked = false;
        staged.expiresAt = now + 24 * 60 * 60 * 1000;
        return { finalized: true };
      },
    });

  return {
    state,
    deliver,
    usable,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

const eligibility = (
  overrides: Partial<
    Parameters<typeof activationResendEligibility>[0]
  > = {},
) =>
  activationResendEligibility({
    applicationStatus: "approved",
    memberStatus: "pending_activation",
    activatedAt: null,
    email: "Dealer@Example.com",
    ...overrides,
  });

test("successful resend publishes the replacement only after delivery", async () => {
  const harness = activationHarness();
  const oldToken = harness.state.tokens[0];
  await harness.deliver({
    eventKey: "direct-event",
    waitForProvider: async () => {
      assert.equal(harness.usable(oldToken), true);
      assert.equal(harness.state.tokens.length, 2);
      assert.equal(harness.usable(harness.state.tokens[1]), false);
    },
  });
  assert.equal(harness.usable(oldToken), false);
  assert.equal(harness.usable(harness.state.tokens[1]), true);
  assert.deepEqual(harness.state.sentTo, ["current-member@example.com"]);
});

test("delivery failure records failed and preserves the previous usable link", async () => {
  const harness = activationHarness();
  const finishes: string[] = [];
  await assert.rejects(
    deliverClaimedDealerNotification({
      claim: async () => ({
        claimed: true,
        eventId: "event-id",
        claimedAt: "claimed-at",
      }),
      send: () =>
        harness.deliver({ eventKey: "direct-event", failProvider: true }),
      finish: async (_claim, status) => {
        finishes.push(status);
      },
    }),
    /provider rejected message/,
  );
  assert.deepEqual(finishes, ["failed"]);
  assert.equal(harness.usable(harness.state.tokens[0]), true);
  assert.equal(harness.usable(harness.state.tokens[1]), false);
});

test("a later successful resend recovers from a failed delivery", async () => {
  const harness = activationHarness();
  await assert.rejects(
    harness.deliver({ eventKey: "failed-event", failProvider: true }),
  );
  harness.advance((ACTIVATION_EMAIL_COOLDOWN_SECONDS + 1) * 1000);
  await harness.deliver({ eventKey: "recovery-event" });
  assert.equal(harness.usable(harness.state.tokens[0]), false);
  assert.equal(harness.usable(harness.state.tokens[1]), false);
  assert.equal(harness.usable(harness.state.tokens[2]), true);
});

test("direct resend and failed retry both use the current member email", async () => {
  const harness = activationHarness();
  const historicalApplicationEmail = "obsolete-application@example.com";
  assert.notEqual(historicalApplicationEmail, harness.state.memberEmail);
  await harness.deliver({ eventKey: "direct-event" });
  harness.advance((ACTIVATION_EMAIL_COOLDOWN_SECONDS + 1) * 1000);
  await harness.deliver({ eventKey: "failed-notification-id" });
  assert.deepEqual(harness.state.sentTo, [
    "current-member@example.com",
    "current-member@example.com",
  ]);
});

test("the stable member cooldown cannot be bypassed by a retry event ID", async () => {
  const harness = activationHarness();
  await harness.deliver({ eventKey: "direct-event" });
  await assert.rejects(
    harness.deliver({ eventKey: "different-failed-notification-id" }),
    (error: unknown) =>
      error instanceof ActivationDeliveryError && error.code === "RATE_LIMIT",
  );
  assert.equal(harness.state.sentTo.length, 1);
  assert.deepEqual(harness.state.attemptedEvents, [
    "direct-event",
    "different-failed-notification-id",
  ]);
});

test("near-simultaneous attempts cannot both send credentials", async () => {
  const harness = activationHarness();
  let releaseProvider!: () => void;
  let providerStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const first = harness.deliver({
    eventKey: "event-one",
    waitForProvider: async () => {
      providerStarted();
      await waiting;
    },
  });
  await started;
  await assert.rejects(
    harness.deliver({ eventKey: "event-two" }),
    (error: unknown) =>
      error instanceof ActivationDeliveryError && error.code === "RATE_LIMIT",
  );
  releaseProvider();
  await first;
  assert.equal(harness.state.sentTo.length, 1);
});

test("activation during delivery prevents replacement publication", async () => {
  const harness = activationHarness();
  const oldToken = harness.state.tokens[0];
  await assert.rejects(
    harness.deliver({
      eventKey: "racing-event",
      beforeFinalize: () => {
        oldToken.used = true;
        harness.state.memberStatus = "active";
        harness.state.activatedAt = Date.now();
      },
    }),
    (error: unknown) =>
      error instanceof ActivationDeliveryError &&
      error.code === "MEMBER_STATE_CHANGED",
  );
  assert.equal(harness.state.memberStatus, "active");
  assert.equal(harness.usable(harness.state.tokens[1]), false);
});

test("ineligible application and member states fail before send", async () => {
  for (const applicationStatus of ["pending", "denied"] as const) {
    const harness = activationHarness({ applicationStatus });
    await assert.rejects(
      harness.deliver({ eventKey: applicationStatus }),
      (error: unknown) =>
        error instanceof ActivationDeliveryError &&
        error.code === "APPLICATION_NOT_APPROVED",
    );
    assert.equal(harness.state.sentTo.length, 0);
  }
  const active = activationHarness({
    memberStatus: "active",
    activatedAt: Date.now(),
  });
  await assert.rejects(
    active.deliver({ eventKey: "active" }),
    (error: unknown) =>
      error instanceof ActivationDeliveryError &&
      error.code === "MEMBER_NOT_PENDING_ACTIVATION",
  );
});

test("missing, deleted, and invalid-email members fail closed", async () => {
  for (const overrides of [
    { memberExists: false },
    { memberDeleted: true },
  ]) {
    const harness = activationHarness(overrides);
    await assert.rejects(
      harness.deliver({ eventKey: "missing-member" }),
      (error: unknown) =>
        error instanceof ActivationDeliveryError &&
        error.code === "MEMBER_NOT_FOUND",
    );
  }
  const invalidEmail = activationHarness({ memberEmail: "not-an-email" });
  await assert.rejects(
    invalidEmail.deliver({ eventKey: "invalid-email" }),
    (error: unknown) =>
      error instanceof ActivationDeliveryError && error.code === "INVALID_EMAIL",
  );
});

test("resend changes no member, application, role, or permission records", async () => {
  const harness = activationHarness();
  const before = {
    applicationCount: harness.state.applicationCount,
    memberCount: harness.state.memberCount,
    applicationStatus: harness.state.applicationStatus,
    roles: [...harness.state.roles],
  };
  await harness.deliver({ eventKey: "direct-event" });
  assert.deepEqual(
    {
      applicationCount: harness.state.applicationCount,
      memberCount: harness.state.memberCount,
      applicationStatus: harness.state.applicationStatus,
      roles: harness.state.roles,
    },
    before,
  );
});

test("notification finalization errors are surfaced", async () => {
  await assert.rejects(
    deliverClaimedDealerNotification({
      claim: async () => ({
        claimed: true,
        eventId: "event-id",
        claimedAt: "claimed-at",
      }),
      send: async () => undefined,
      finish: async () => {
        throw new Error("database unavailable");
      },
    }),
    DealerNotificationLedgerError,
  );
});

test("a provider failure cannot hide a failed ledger finalization", async () => {
  await assert.rejects(
    deliverClaimedDealerNotification({
      claim: async () => ({
        claimed: true,
        eventId: "event-id",
        claimedAt: "claimed-at",
      }),
      send: async () => {
        throw new Error("provider rejected message");
      },
      finish: async () => {
        throw new Error("database unavailable");
      },
    }),
    DealerNotificationLedgerError,
  );
});

test("a skipped notification claim is not reported as retried", async () => {
  let sent = false;
  const result = await deliverClaimedDealerNotification({
    claim: async () => ({
      claimed: false,
      eventId: "event-id",
      claimedAt: "claimed-at",
    }),
    send: async () => {
      sent = true;
    },
    finish: async () => undefined,
  });
  assert.equal(sent, false);
  assert.deepEqual(notificationRetryResult(result), { retried: false });
});

test("eligibility normalizes email and rejects invalid state", () => {
  assert.deepEqual(eligibility(), {
    eligible: true,
    email: "dealer@example.com",
  });
  assert.deepEqual(eligibility({ applicationStatus: "pending" }), {
    eligible: false,
    reason: "APPLICATION_NOT_APPROVED",
  });
  assert.deepEqual(
    eligibility({ memberStatus: "active", activatedAt: new Date().toISOString() }),
    { eligible: false, reason: "MEMBER_NOT_PENDING_ACTIVATION" },
  );
  assert.deepEqual(eligibility({ email: "not-an-email" }), {
    eligible: false,
    reason: "INVALID_EMAIL",
  });
});

test("production paths share the staged delivery helper and current member target", () => {
  const helperCalls = server.match(/deliverDealerActivation\(\{/g) ?? [];
  assert.equal(helperCalls.length, 2);
  assert.match(server, /\.is\("deleted_at", null\)/);
  assert.match(server, /email: eligibility\.email/);
  assert.doesNotMatch(server, /dealer_network_replace_activation_token/);
  assert.match(server, /dealer_network_consume_activation_email_cooldown/);
  assert.match(migration, /'dealer_activation_email'/);
  assert.match(migration, /p_member_id::text/);
});

test("migration stages revoked hashes and atomically publishes after revalidation", () => {
  assert.match(
    migration,
    /insert into dealer_network_private\.activation_tokens[\s\S]*revoked_at[\s\S]*created_at[\s\S]*v_now[\s\S]*v_now/,
  );
  const stage = migration.slice(
    migration.indexOf("dealer_network_stage_activation_token"),
    migration.indexOf("dealer_network_finalize_activation_token"),
  );
  assert.doesNotMatch(stage, /set revoked_at = pg_catalog\.now\(\)/);
  const finalize = migration.slice(
    migration.indexOf("dealer_network_finalize_activation_token"),
    migration.indexOf("The old one-step replacement API"),
  );
  assert.match(finalize, /where m\.id = p_member_id\s+for update/);
  assert.match(finalize, /v_member\.deleted_at is not null/);
  assert.match(finalize, /v_member\.status <> 'pending_activation'/);
  assert.match(finalize, /v_member\.activated_at is not null/);
  assert.ok(
    finalize.indexOf("set revoked_at = pg_catalog.now()") <
      finalize.indexOf("revoked_at = null"),
  );
  assert.match(finalize, /expires_at = pg_catalog\.now\(\) \+ interval '24 hours'/);
});

test("activation consumption uses the same member-first lock order", () => {
  const activate = migration.slice(
    migration.indexOf("create or replace function public.dealer_network_activate_member"),
    migration.indexOf("revoke all on function"),
  );
  assert.ok(
    activate.indexOf("where m.id = v_member_id") <
      activate.indexOf("select t.*"),
  );
  assert.match(activate, /v_member\.deleted_at is not null/);
  assert.match(activate, /v_member\.status <> 'pending_activation'/);
  assert.match(activate, /v_token\.revoked_at is not null/);
});

test("migration preserves private service-role-only RPC security", () => {
  assert.doesNotMatch(migration, /security definer/i);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 5);
  assert.match(
    migration,
    /revoke all on function public\.dealer_network_stage_activation_token[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.dealer_network_stage_activation_token[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /dealer_network_replace_activation_token[\s\S]*deprecated_activation_token_flow/,
  );
});

test("admin API and UI preserve authentication, safe errors, and recipient confirmation", () => {
  assert.ok(
    applicationRoute.indexOf("requireDealerNetworkAdmin") <
      applicationRoute.indexOf('body.action === "resend_activation"'),
  );
  assert.match(applicationRoute, /"Application not found\."/);
  assert.match(applicationRoute, /\? 404/);
  assert.doesNotMatch(applicationRoute, /activationLink|secureLink/);
  assert.match(retryRoute, /status: unauthorized \? 401/);
  assert.match(ui, /Resend Activation Email/);
  assert.match(ui, /previous unused activation link remains valid unless the new email is delivered successfully/i);
  assert.match(ui, /disabled=\{resendingId !== null\}/);
});

test("notification adapter checks finish RPC errors and non-activation retries remain wired", () => {
  assert.match(notifications, /if \(finishError\) throw finishError/);
  assert.match(server, /delivery = await notifyNewDealerApplication/);
  assert.match(server, /delivery = await notifyDealerDecision/);
  assert.match(server, /delivery = await notifyNewDealerMessage/);
  assert.match(server, /delivery = await notifyDealerBroadcast/);
  assert.match(server, /delivery = await notifyDealerMemberInvitation/);
  assert.match(server, /return notificationRetryResult\(delivery\)/);
});

test("initial approval still creates and sends its original activation credential", () => {
  const approval = server.slice(
    server.indexOf("export async function approveDealerApplication"),
    server.indexOf("export async function transitionDealerApplication"),
  );
  assert.match(approval, /dealer_network_approve_application/);
  assert.match(approval, /notifyDealerActivation/);
  assert.match(approval, /readActivationDeliveryTarget/);
  assert.match(approval, /dealer_network_consume_activation_email_cooldown/);
});
