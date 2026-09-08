import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import ts from "typescript";
import type { CheckoutPaymentMethod } from "../lib/checkout/types";
import * as stripeConfig from "../lib/stripe/config-values";
import * as webhookPolicy from "../lib/stripe/webhook-policy";
import * as demoPolicy from "../lib/demo-party/stripe-policy";
import { refundNotificationSemanticId } from "../lib/notifications/notification-keys";

// Compile the actual POST route. Only external operations are replaced below;
// Stripe signature verification and the reconciliation policies remain real.
const routeCode = ts.transpileModule(
  readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const webhookSecret = "whsec_synthetic_dispatch_only";
const paymentIntentId = "pi_synthetic_refund";
const missingInstallationTable = new Error('relation "public.installation_payments" does not exist');

function orderFixture(paymentMethod: CheckoutPaymentMethod = "card") {
  return {
    orderId: "order_synthetic", attemptId: "attempt_synthetic", sessionId: "cs_synthetic",
    totalCents: 100_000, currency: "usd", fundedAmountCents: 100_000, amountRemainingCents: 0,
    snapshot: { paymentMethod },
  };
}

function financialEvent(type = "charge.refunded", object: Record<string, unknown> = {}) {
  return {
    id: "evt_synthetic_refund", object: "event", type, livemode: false,
    api_version: null, created: Math.floor(Date.now() / 1000), pending_webhooks: 1, request: null,
    data: { object: {
      id: type === "charge.dispute.created" ? "dp_synthetic" : "ch_synthetic",
      object: type === "charge.dispute.created" ? "dispute" : "charge",
      payment_intent: paymentIntentId, livemode: false, amount: 100_000,
      currency: "usd", amount_refunded: 25_000, ...object,
    } },
  };
}

type Options = {
  order?: ReturnType<typeof orderFixture> | null;
  demo?: demoPolicy.DemoPaymentRecord;
  orderError?: Error;
  demoError?: Error;
  writeError?: Error;
  notificationError?: Error;
  installationResult?: boolean;
  installationError?: Error;
  receiptState?: string;
  receiptError?: Error;
  finishProcessedError?: Error;
  configurationError?: boolean;
};

function harness(options: Options = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const unexpected: string[] = [];
  const receipts = new Map<string, string>();
  const record = (name: string, args: unknown[]) => {
    // Normalize objects crossing the VM boundary for strict assertions.
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
  };
  const forbidden = (name: string): never => {
    unexpected.push(name);
    throw new Error(`Unexpected external operation: ${name}`);
  };
  const apply = (name: string) => async (...args: unknown[]) => {
    record(name, args);
    if (options.writeError) throw options.writeError;
  };
  const modules: Record<string, Record<string, unknown>> = {
    "next/server": { NextResponse },
    "@/lib/checkout/order-repository": {
      findByPaymentIntentId: async (id: string) => {
        record("orderRead", [id]);
        if (options.orderError) throw options.orderError;
        return options.order === undefined ? orderFixture() : options.order;
      },
      applyCardEventV2: apply("card"), applyAchEventV1: apply("ach"), applyWireEventV1: apply("wire"),
      recordWebhookReceipt: async (event: { id: string }) => {
        record("receipt", [event]);
        if (options.receiptError) throw options.receiptError;
        const state = receipts.get(event.id) ?? options.receiptState ?? "received";
        if (!["processed", "ignored", "processing"].includes(state)) receipts.set(event.id, "processing");
        return state;
      },
      finishWebhook: async (id: string, state: string, code?: string) => {
        record("finish", [id, state, code ?? null]);
        if (state === "processed" && options.finishProcessedError) throw options.finishProcessedError;
        receipts.set(id, state);
      },
    },
    "@/lib/stripe/config": {
      StripeConfigurationError: stripeConfig.StripeConfigurationError,
      getStripeMode: () => stripeConfig.getStripeMode({ STRIPE_MODE: "test", NODE_ENV: "test" }),
      getStripeWebhookSecret: () => {
        if (options.configurationError) throw new stripeConfig.StripeConfigurationError("Synthetic configuration unavailable");
        return stripeConfig.getStripeWebhookSecret({ STRIPE_WEBHOOK_SECRET: webhookSecret, NODE_ENV: "test" });
      },
    },
    "@/lib/stripe/server": {
      getStripeServerClient: () => ({ webhooks: {
        constructEvent: (payload: string, signature: string, secret: string) => {
          record("signature", [payload, signature, secret]);
          return Stripe.webhooks.constructEvent(payload, signature, secret);
        },
      } }),
    },
    "@/lib/stripe/webhook-policy": webhookPolicy,
    "@/lib/stripe/ach-webhook-policy": {},
    "@/lib/stripe/wire-webhook-policy": {},
    "@/lib/stripe/payment-intent-resolution": {},
    "@/lib/notifications/payment-notifications": {
      notifyPaymentBusinessEvent: async (...args: unknown[]) => {
        record("notification", args);
        if (options.notificationError) throw options.notificationError;
      },
    },
    "@/lib/notifications/notification-keys": { refundNotificationSemanticId },
    "@/lib/demo-party/server": {
      readDemoPaymentByIntent: async (id: string) => {
        record("demoRead", [id]);
        if (options.demoError) throw options.demoError;
        return options.demo ?? null;
      },
      reconcileDemoRefund: apply("demoRefund"),
    },
    "@/lib/demo-party/stripe-policy": demoPolicy,
    "@/lib/demo-party/security": {},
    "@/lib/demo-scheduling/server": {},
    "@/lib/demo-scheduling/notifications": {},
    "@/lib/installations/stripe": {
      handleInstallationWebhook: async () => false,
      installationEventContext: (event: {id:string;type:string;created?:number}) => ({id:event.id,type:event.type,created:event.created??null}),
      applyInstallationRefund: async (...args: unknown[]) => {
        record("installation", args);
        if (options.installationError) throw options.installationError;
        return options.installationResult ?? false;
      },
    },
  };
  const routeModule = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  runInNewContext(routeCode, {
    module: routeModule, exports: routeModule.exports, URL,
    console: { error: () => record("errorLog", []) },
    fetch: () => forbidden("fetch"),
    require: (name: string) => {
      const dependency = modules[name];
      if (!dependency) return forbidden(`module ${name}`);
      return new Proxy(dependency, {
        get: (target, key: string) => key in target ? target[key] : forbidden(`${name}.${key}`),
      });
    },
  });
  return {
    calls, receipts,
    named: (name: string) => calls.filter(call => call.name === name).map(call => call.args),
    async post(event = financialEvent(), signature?: string | null, rawBody?: string) {
      const payload = rawBody ?? JSON.stringify(event);
      const header = signature === undefined
        ? Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret }) : signature;
      const response = await routeModule.exports.POST(new Request("http://127.0.0.1/api/stripe/webhook", {
        method: "POST", body: payload, headers: header === null ? {} : { "stripe-signature": header },
      }));
      assert.deepEqual(unexpected, [], "No unstubbed external operation may run");
      return response;
    },
  };
}

function assertFinished(h: ReturnType<typeof harness>, state: "processed" | "failed" | "ignored") {
  const code = state === "failed" ? "PROCESSING_FAILED" : state === "ignored" ? "RECONCILIATION_REJECTED" : null;
  assert.deepEqual(h.named("finish"), [["evt_synthetic_refund", state, code]]);
  assert.equal(h.receipts.get("evt_synthetic_refund"), state);
}

for (const [method, handler] of [["card", "card"], ["ach_debit", "ach"], ["wire_transfer", "wire"]] as const) {
  for (const type of ["charge.refunded", "charge.dispute.created"]) {
    test(`${method} ${type} uses the existing handler without installation schema`, async () => {
      const h = harness({ order: orderFixture(method), installationError: missingInstallationTable });
      const event = financialEvent(type, type === "charge.dispute.created" ? { amount: 10_000 } : {});
      const response = await h.post(event);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { received: true });
      assert.deepEqual(h.calls.map(call => call.name), ["signature", "receipt", "demoRead", "orderRead", handler, "notification", "finish"]);
      const refund = type === "charge.refunded";
      const expected: Record<string, unknown> = {
        p_kind: refund ? "refund" : "dispute", p_session_id: "cs_synthetic", p_payment_intent_id: paymentIntentId,
        p_order_id: "order_synthetic", p_attempt_id: "attempt_synthetic",
        p_amount: method === "wire_transfer" ? 100_000 : event.data.object.amount,
        p_currency: "usd", p_stripe_session_status: null, p_stripe_payment_status: null,
        p_refunded: refund ? 25_000 : null,
      };
      if (method !== "card") expected.p_payment_intent_status = null;
      if (method === "wire_transfer") Object.assign(expected, { p_event_id: event.id, p_funded: 100_000, p_remaining: 0 });
      assert.deepEqual(h.named(handler), [[expected]]);
      assert.deepEqual(h.named("notification"), [[{
        orderId: "order_synthetic", type: refund ? "refund" : "dispute",
        semanticId: refund ? "cumulative-25000" : "dp_synthetic",
      }]]);
      assert.equal(h.named("installation").length, 0);
      assertFinished(h, "processed");
    });
  }
}

const demo = { appointmentId: "demo_synthetic", stripeCheckoutSessionId: "cs_demo", stripePaymentIntentId: paymentIntentId, amountCents: 100_000, currency: "usd" as const };

test("demo refund remains first even if the same intent could match an order", async () => {
  const h = harness({ demo, installationError: missingInstallationTable });
  assert.equal((await h.post()).status, 200);
  assert.deepEqual(h.calls.map(call => call.name), ["signature", "receipt", "demoRead", "demoRefund", "finish"]);
  assert.deepEqual(h.named("demoRefund"), [[paymentIntentId, 25_000, "evt_synthetic_refund"]]);
  assertFinished(h, "processed");
});

test("demo disputes retain intentional rejection without order or installation dispatch", async () => {
  const h = harness({ demo, installationError: missingInstallationTable });
  assert.equal((await h.post(financialEvent("charge.dispute.created"))).status, 200);
  assert.deepEqual(h.calls.map(call => call.name), ["signature", "receipt", "demoRead", "finish"]);
  assertFinished(h, "ignored");
});

test("installation refund fallback runs only after both lookups return no match", async () => {
  const h = harness({ order: null, installationResult: true });
  assert.equal((await h.post()).status, 200);
  assert.deepEqual(h.calls.map(call => call.name), ["signature", "receipt", "demoRead", "orderRead", "installation", "finish"]);
  assert.deepEqual(h.named("installation").map(args => args.slice(0,2)), [[paymentIntentId, 25_000]]);
  assert.equal((h.named("installation")[0][2] as {id:string}).id, "evt_synthetic_refund");
  assertFinished(h, "processed");
});

test("unresolved refund stays retryable", async () => {
  const h = harness({ order: null });
  assert.equal((await h.post()).status, 503);
  assert.equal(h.named("installation").length, 1);
  assertFinished(h, "failed");
});

test("unresolved dispute stays retryable without installation fallback", async () => {
  const h = harness({ order: null, installationError: missingInstallationTable });
  assert.equal((await h.post(financialEvent("charge.dispute.created"))).status, 503);
  assert.equal(h.named("installation").length, 0);
  assertFinished(h, "failed");
});

for (const [name, options, operation] of [
  ["order read", { orderError: new Error("Synthetic database read failure"), installationResult: true }, "orderRead"],
  ["demo read", { demoError: new Error("Synthetic demo read failure") }, "demoRead"],
  ["card write", { writeError: new Error("Synthetic reconciliation write failure") }, "card"],
  ["ACH write", { order: orderFixture("ach_debit"), writeError: new Error("Synthetic reconciliation write failure") }, "ach"],
  ["wire write", { order: orderFixture("wire_transfer"), writeError: new Error("Synthetic reconciliation write failure") }, "wire"],
  ["installation lookup", { order: null, installationError: missingInstallationTable }, "installation"],
  ["notification", { notificationError: new Error("Synthetic notification failure") }, "notification"],
] as const) {
  test(`${name} failure is retryable and never marked processed or ignored`, async () => {
    const h = harness(options);
    assert.equal((await h.post()).status, 503);
    assert.equal(h.named(operation).length, 1);
    if (operation !== "installation") assert.equal(h.named("installation").length, 0);
    if (operation.endsWith("Read")) assert.equal(h.named("card").length, 0);
    assertFinished(h, "failed");
  });
}

for (const object of [{ amount: 99_999 }, { currency: "eur" }, { livemode: true }]) {
  for (const isDemo of [false, true]) {
    test(`${isDemo ? "demo" : "order"} refund preserves rejection of ${Object.keys(object)[0]} mismatch`, async () => {
      const h = harness({ demo: isDemo ? demo : undefined, installationError: missingInstallationTable });
      assert.equal((await h.post(financialEvent("charge.refunded", object))).status, 200);
      assert.equal(h.named("card").length + h.named("demoRefund").length + h.named("installation").length, 0);
      assert.equal(h.named("notification").length, 0);
      assertFinished(h, "ignored");
    });
  }
}

for (const signature of [null, "t=1,v1=invalid"]) {
  test(`${signature === null ? "missing" : "invalid"} signature is rejected before receipts or dispatch`, async () => {
    const h = harness();
    assert.equal((await h.post(financialEvent(), signature)).status, 400);
    assert.equal(h.named("receipt").length + h.named("demoRead").length + h.named("finish").length, 0);
  });
}

test("correctly signed event with wrong event mode is rejected before its receipt", async () => {
  const h = harness();
  assert.equal((await h.post({ ...financialEvent(), livemode: true })).status, 400);
  assert.deepEqual(h.calls.map(call => call.name), ["signature"]);
});

test("missing webhook configuration remains unavailable", async () => {
  const h = harness({ configurationError: true });
  assert.equal((await h.post()).status, 503);
  assert.equal(h.calls.length, 0);
});

test("receipt storage failure does not reconcile the event", async () => {
  const h = harness({ receiptError: new Error("Synthetic receipt failure") });
  assert.equal((await h.post()).status, 503);
  assert.deepEqual(h.calls.map(call => call.name), ["signature", "receipt"]);
});

for (const state of ["processed", "ignored", "processing"]) {
  test(`${state} receipt does not reconcile again`, async () => {
    const h = harness({ receiptState: state });
    assert.equal((await h.post()).status, state === "processing" ? 503 : 200);
    assert.deepEqual(h.calls.map(call => call.name), ["signature", "receipt"]);
  });
}

test("failed event can retry successfully and its later duplicate is not reconciled", async () => {
  const options: Options = { writeError: new Error("Synthetic transient write failure"), installationError: missingInstallationTable };
  const h = harness(options);
  assert.equal((await h.post()).status, 503);
  assertFinished(h, "failed");
  options.writeError = undefined;
  assert.equal((await h.post()).status, 200);
  assert.equal((await h.post()).status, 200);
  assert.deepEqual(h.named("finish"), [
    ["evt_synthetic_refund", "failed", "PROCESSING_FAILED"],
    ["evt_synthetic_refund", "processed", null],
  ]);
  assert.equal(h.named("card").length, 2);
  assert.equal(h.named("notification").length, 1);
  assert.equal(h.named("installation").length, 0);
  assert.equal(h.receipts.get("evt_synthetic_refund"), "processed");
});

test("failure to finish the receipt remains retryable", async () => {
  const h = harness({ finishProcessedError: new Error("Synthetic receipt finish failure") });
  assert.equal((await h.post()).status, 503);
  assert.deepEqual(h.named("finish"), [
    ["evt_synthetic_refund", "processed", null],
    ["evt_synthetic_refund", "failed", "PROCESSING_FAILED"],
  ]);
  assert.equal(h.receipts.get("evt_synthetic_refund"), "failed");
});

// Additional cases from the reviewed IDS package, retaining the existing real
// Stripe signature verification and the original 34 local regression cases.
test("wire refund preserves stored funding values rather than substituting the order total", async () => {
  const h = harness({
    order: { ...orderFixture("wire_transfer"), fundedAmountCents: 120_000 },
    installationError: missingInstallationTable,
  });
  assert.equal((await h.post()).status, 200);
  const [write] = h.named("wire")[0] as [Record<string, unknown>];
  assert.equal(write.p_funded, 120_000);
  assert.equal(write.p_remaining, 0);
  assert.equal(h.named("installation").length, 0);
  assertFinished(h, "processed");
});

test("demo refund write failure remains retryable without order or installation fallback", async () => {
  const h = harness({ demo, writeError: new Error("Synthetic demo write failure") });
  assert.equal((await h.post()).status, 503);
  assert.equal(h.named("demoRefund").length, 1);
  assert.equal(h.named("orderRead").length + h.named("installation").length, 0);
  assertFinished(h, "failed");
});

test("installation fallback processing failure remains retryable", async () => {
  const h = harness({ order: null, installationResult: true, installationError: new Error("Synthetic installation persistence failure") });
  assert.equal((await h.post()).status, 503);
  assert.equal(h.named("installation").length, 1);
  assert.equal(h.named("card").length + h.named("notification").length, 0);
  assertFinished(h, "failed");
});

test("expanded PaymentIntent reference resolves the same existing order", async () => {
  const h = harness({ installationError: missingInstallationTable });
  assert.equal((await h.post(financialEvent("charge.refunded", { payment_intent: { id: paymentIntentId } }))).status, 200);
  assert.deepEqual(h.named("demoRead"), [[paymentIntentId]]);
  assert.deepEqual(h.named("orderRead"), [[paymentIntentId]]);
  assert.equal(h.named("installation").length, 0);
  assertFinished(h, "processed");
});

test("missing PaymentIntent stays retryable without any domain lookup", async () => {
  const h = harness();
  assert.equal((await h.post(financialEvent("charge.refunded", { payment_intent: null }))).status, 503);
  assert.equal(h.named("demoRead").length + h.named("orderRead").length + h.named("installation").length, 0);
  assertFinished(h, "failed");
});

test("signature verification receives the unmodified raw body and signature", async () => {
  const h = harness();
  const event = financialEvent();
  const payload = JSON.stringify(event, null, 2);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  assert.equal((await h.post(event, signature, payload)).status, 200);
  assert.deepEqual(h.named("signature"), [[payload, signature, webhookSecret]]);
  assertFinished(h, "processed");
});
