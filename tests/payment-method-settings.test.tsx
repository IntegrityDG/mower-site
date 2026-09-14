import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PurchaseMethod from "../components/customer-paths/purchase/PurchaseMethod";
import { paymentMethodIsAvailableForNewCheckout } from "../lib/checkout/payment-method-availability";
import {
  loadPaymentMethodAvailability,
  retainAvailablePurchaseMethod,
} from "../lib/payment-method-settings/client";
import { createPaymentMethodAdminHandlers } from "../lib/payment-method-settings/admin-handlers";
import {
  createPublicPaymentMethodAvailabilityHandler,
  PAYMENT_OPTIONS_UNAVAILABLE_MESSAGE,
} from "../lib/payment-method-settings/public-handler";
import {
  customerPurchaseMethodIsAvailable,
  SEEDED_PAYMENT_METHOD_SETTINGS,
  toPublicPaymentMethodAvailability,
  type PaymentMethodAvailabilityLoadState,
  type PaymentMethodSettings,
} from "../lib/payment-method-settings/types";

const enabled: PaymentMethodSettings = {
  card: true,
  ach_debit: true,
  hearth_financing: true,
};
const ready = (
  availability = {
    card: true,
    achDebit: true,
    hearthFinancing: true,
  },
): PaymentMethodAvailabilityLoadState => ({ status: "ready", availability });
const loading: PaymentMethodAvailabilityLoadState = {
  status: "loading",
  availability: null,
};
const failed: PaymentMethodAvailabilityLoadState = {
  status: "error",
  availability: null,
};
const request = (body: unknown) =>
  new Request("http://local/api/admin/payment-methods", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const noWait = async () => undefined;

function renderMethods(
  paymentMethods: PaymentMethodAvailabilityLoadState,
  checkoutAvailable = true,
) {
  return renderToStaticMarkup(
    <PurchaseMethod
      selectedMethod=""
      checkoutAvailable={checkoutAvailable}
      configuredTotalCents={100000}
      hearthUrl="https://example.com"
      onSelectMethod={() => undefined}
      paymentMethods={paymentMethods}
      onRetry={() => undefined}
    />,
  );
}

function elementText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(elementText).join("");
  if (!isValidElement(node)) return "";
  return elementText((node.props as { children?: ReactNode }).children);
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (predicate(node)) return node;
  return findElement(
    (node.props as { children?: ReactNode }).children,
    predicate,
  );
}

test("payment method admin reads and writes require IDS authentication", async () => {
  const handlers = createPaymentMethodAdminHandlers({
    isAdmin: async () => false,
    read: async () => enabled,
    save: async (paymentMethod, value) => ({
      paymentMethod,
      enabled: value,
    }),
  });
  assert.equal((await handlers.GET()).status, 401);
  assert.equal(
    (await handlers.PATCH(request({ paymentMethod: "card", enabled: false })))
      .status,
    401,
  );
});

test("authorized IDS admin can read and change supported settings", async () => {
  let stored = { ...enabled };
  const handlers = createPaymentMethodAdminHandlers({
    isAdmin: async () => true,
    read: async () => stored,
    save: async (paymentMethod, value) => {
      stored = { ...stored, [paymentMethod]: value };
      return { paymentMethod, enabled: value };
    },
  });
  assert.deepEqual((await (await handlers.GET()).json()).settings, enabled);
  assert.equal(
    (
      await handlers.PATCH(
        request({ paymentMethod: "ach_debit", enabled: false }),
      )
    ).status,
    200,
  );
  assert.equal(stored.ach_debit, false);
  assert.equal(
    (
      await handlers.PATCH(
        request({ paymentMethod: "wire_transfer", enabled: true }),
      )
    ).status,
    400,
  );
});

test("public projection exposes only safe availability and applies ACH hard switch", () => {
  assert.deepEqual(toPublicPaymentMethodAvailability(enabled, false), {
    card: true,
    achDebit: false,
    hearthFinancing: true,
  });
  assert.deepEqual(
    Object.keys(toPublicPaymentMethodAvailability(enabled, true)).sort(),
    ["achDebit", "card", "hearthFinancing"],
  );
});

test("public availability endpoint returns authoritative settings with HTTP 200", async () => {
  const getAvailability = createPublicPaymentMethodAvailabilityHandler({
    readSettings: async () => enabled,
    achEnvironmentEnabled: () => true,
  });
  const response = await getAvailability();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    card: true,
    achDebit: true,
    hearthFinancing: true,
  });
});

test("public availability endpoint returns sanitized HTTP 503 on settings read failure", async () => {
  let logged = 0;
  const getAvailability = createPublicPaymentMethodAvailabilityHandler({
    readSettings: async () => {
      throw new Error("private database detail");
    },
    achEnvironmentEnabled: () => true,
    logReadFailure: () => {
      logged += 1;
    },
  });
  const response = await getAvailability();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body, { error: PAYMENT_OPTIONS_UNAVAILABLE_MESSAGE });
  assert.equal(logged, 1);
  assert.doesNotMatch(JSON.stringify(body), /database detail/i);

  const route = readFileSync(
    "app/api/checkout/payment-methods/route.ts",
    "utf8",
  );
  assert.match(route, /readPaymentMethodSettings/);
  assert.doesNotMatch(route, /readPaymentMethodSettingsFailSafe/);
});

test("successful first request displays Card when enabled", async () => {
  const availability = await loadPaymentMethodAvailability({
    signal: new AbortController().signal,
    fetcher: async () =>
      jsonResponse({ card: true, achDebit: false, hearthFinancing: false }),
    retryDelaysMs: [],
  });
  const html = renderMethods(ready(availability));

  assert.match(html, />Card</);
  assert.doesNotMatch(html, />ACH</);
});

test("successful first request displays ACH when settings and environment allow it", async () => {
  const getAvailability = createPublicPaymentMethodAvailabilityHandler({
    readSettings: async () => enabled,
    achEnvironmentEnabled: () => true,
  });
  const availability = await loadPaymentMethodAvailability({
    signal: new AbortController().signal,
    fetcher: async () => getAvailability(),
    retryDelaysMs: [],
  });

  assert.match(renderMethods(ready(availability)), />ACH</);
});

test("successful first request displays Hearth when enabled", async () => {
  const availability = await loadPaymentMethodAvailability({
    signal: new AbortController().signal,
    fetcher: async () =>
      jsonResponse({ card: false, achDebit: false, hearthFinancing: true }),
    retryDelaysMs: [],
  });

  assert.match(
    renderMethods(ready(availability)),
    /Explore financing through Hearth/,
  );
});

test("authoritative all-disabled response retains Contact IDS unavailable state", () => {
  const html = renderMethods(
    ready({ card: false, achDebit: false, hearthFinancing: false }),
  );

  assert.doesNotMatch(html, />Card</);
  assert.doesNotMatch(html, />ACH</);
  assert.doesNotMatch(html, /Explore financing through Hearth/);
  assert.match(
    html,
    /Online payment and financing options are temporarily unavailable/,
  );
  assert.match(html, /href="\/#contact-us"/);
});

test("unknown availability renders loading instead of intentional all-disabled state", () => {
  const html = renderMethods(loading);

  assert.match(html, /Loading payment options/);
  assert.doesNotMatch(
    html,
    /Online payment and financing options are temporarily unavailable/,
  );
});

test("first request failure automatically retries and immediately recovers", async () => {
  let calls = 0;
  const availability = await loadPaymentMethodAvailability({
    signal: new AbortController().signal,
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: PAYMENT_OPTIONS_UNAVAILABLE_MESSAGE }, 503)
        : jsonResponse({
            card: true,
            achDebit: true,
            hearthFinancing: true,
          });
    },
    wait: noWait,
  });

  assert.equal(calls, 2);
  const html = renderMethods(ready(availability));
  assert.match(html, />Card</);
  assert.match(html, />ACH</);
  assert.match(html, /Explore financing through Hearth/);
});

test("exhausted automatic retries render a retryable error, not all-disabled", async () => {
  let calls = 0;
  await assert.rejects(
    loadPaymentMethodAvailability({
      signal: new AbortController().signal,
      fetcher: async () => {
        calls += 1;
        return jsonResponse({ error: "unavailable" }, 503);
      },
      wait: noWait,
    }),
    /could not be loaded/i,
  );

  assert.equal(calls, 3);
  const html = renderMethods(failed);
  assert.match(html, /couldn&#x27;t load payment options right now/i);
  assert.match(html, /Retry Payment Options/);
  assert.match(html, /Contact IDS/);
  assert.doesNotMatch(
    html,
    /Online payment and financing options are temporarily unavailable/,
  );
});

test("manual Retry reruns loading and recovers without a page reload", async () => {
  let retryRequested = false;
  const tree = PurchaseMethod({
    selectedMethod: "",
    checkoutAvailable: true,
    configuredTotalCents: 100000,
    hearthUrl: "https://example.com",
    onSelectMethod: () => undefined,
    paymentMethods: failed,
    onRetry: () => {
      retryRequested = true;
    },
  });
  const retryButton = findElement(
    tree,
    (element) =>
      element.type === "button" &&
      elementText(
        (element.props as { children?: ReactNode }).children,
      ).includes("Retry Payment Options"),
  );

  assert.ok(retryButton);
  (retryButton.props as { onClick: () => void }).onClick();
  assert.equal(retryRequested, true);

  const availability = await loadPaymentMethodAvailability({
    signal: new AbortController().signal,
    fetcher: async () =>
      jsonResponse({ card: true, achDebit: true, hearthFinancing: true }),
    retryDelaysMs: [],
  });
  assert.match(renderMethods(ready(availability)), />Card</);
});

test("malformed payload retries, fails closed, and enables no methods", async () => {
  let calls = 0;
  await assert.rejects(
    loadPaymentMethodAvailability({
      signal: new AbortController().signal,
      fetcher: async () => {
        calls += 1;
        return jsonResponse({ card: true, achDebit: "yes" });
      },
      wait: noWait,
    }),
  );

  assert.equal(calls, 3);
  const html = renderMethods(failed);
  assert.doesNotMatch(html, />Card</);
  assert.doesNotMatch(html, />ACH</);
  assert.doesNotMatch(html, /Explore financing through Hearth/);
});

test("aborting an availability load prevents further retries and state races", async () => {
  const controller = new AbortController();
  let calls = 0;

  await assert.rejects(
    loadPaymentMethodAvailability({
      signal: controller.signal,
      fetcher: async () => {
        calls += 1;
        return jsonResponse({ error: "unavailable" }, 503);
      },
      wait: async () => {
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );

  assert.equal(calls, 1);
});

test("selected method is cleared when availability is unknown or later disables it", () => {
  assert.equal(retainAvailablePurchaseMethod("pay-in-full", loading, true), "");
  assert.equal(retainAvailablePurchaseMethod("pay-in-full", failed, true), "");
  assert.equal(
    retainAvailablePurchaseMethod(
      "pay-in-full",
      ready({ card: false, achDebit: true, hearthFinancing: true }),
      true,
    ),
    "",
  );
  assert.equal(
    retainAvailablePurchaseMethod("pay-in-full", ready(), true),
    "pay-in-full",
  );
});

test("Continue cannot proceed while payment availability is unknown or errored", () => {
  assert.equal(retainAvailablePurchaseMethod("pay-in-full", loading, true), "");
  assert.equal(retainAvailablePurchaseMethod("pay-in-full", failed, true), "");

  const flow = readFileSync(
    "components/customer-paths/purchase/NationwidePurchaseFlow.tsx",
    "utf8",
  );
  assert.match(
    flow,
    /activeStage\.key === "purchase" && selectedPurchaseMethodAvailable/,
  );
  assert.match(flow, /!selectedPurchaseMethodAvailable/);
});

test("new ACH checkout requires both database enablement and ACH_CHECKOUT_ENABLED", async () => {
  assert.equal(
    await paymentMethodIsAvailableForNewCheckout(
      "ach_debit",
      async () => enabled,
      { ACH_CHECKOUT_ENABLED: "true" },
    ),
    true,
  );
  assert.equal(
    await paymentMethodIsAvailableForNewCheckout(
      "ach_debit",
      async () => ({ ...enabled, ach_debit: false }),
      { ACH_CHECKOUT_ENABLED: "true" },
    ),
    false,
  );
  assert.equal(
    await paymentMethodIsAvailableForNewCheckout(
      "ach_debit",
      async () => enabled,
      { ACH_CHECKOUT_ENABLED: "false" },
    ),
    false,
  );
});

test("server checkout fails closed on lookup errors and actual disabled methods", async () => {
  assert.equal(
    await paymentMethodIsAvailableForNewCheckout("card", async () => enabled, {}),
    true,
  );
  assert.equal(
    await paymentMethodIsAvailableForNewCheckout(
      "card",
      async () => ({ ...enabled, card: false }),
      {},
    ),
    false,
  );
  assert.equal(
    await paymentMethodIsAvailableForNewCheckout(
      "card",
      async () => {
        throw new Error("db");
      },
      {},
    ),
    false,
  );
});

test("disabled Card, ACH, and Hearth methods are absent and wire is always absent", () => {
  const html = renderMethods(
    ready({ card: false, achDebit: false, hearthFinancing: false }),
  );
  assert.doesNotMatch(html, />Card</);
  assert.doesNotMatch(html, />ACH</);
  assert.doesNotMatch(html, /Explore financing through Hearth/);
  assert.doesNotMatch(html, /wire/i);
});

test("stale customer selections remain invalid when their method is disabled", () => {
  const off = { card: false, achDebit: false, hearthFinancing: false };
  assert.equal(customerPurchaseMethodIsAvailable("pay-in-full", off, true), false);
  assert.equal(
    customerPurchaseMethodIsAvailable(
      "ach",
      { card: true, achDebit: true, hearthFinancing: true },
      false,
    ),
    false,
  );
  assert.equal(
    customerPurchaseMethodIsAvailable("hearth-financing", off, true),
    false,
  );
});

test("migration seeds Card on, ACH off, Hearth on and keeps the table private", () => {
  assert.deepEqual(SEEDED_PAYMENT_METHOD_SETTINGS, {
    card: true,
    ach_debit: false,
    hearth_financing: true,
  });
  const sql = readFileSync(
    "supabase/migrations/20260811030746_create_checkout_payment_method_settings.sql",
    "utf8",
  );
  assert.match(
    sql,
    /check \(payment_method in \('card', 'ach_debit', 'hearth_financing'\)\)/,
  );
  assert.match(
    sql,
    /\('card', true\)[\s\S]*\('ach_debit', false\)[\s\S]*\('hearth_financing', true\)/,
  );
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all[\s\S]*from anon, authenticated/);
  assert.match(sql, /grant select, update[\s\S]*to service_role/);
});

test("new Card and ACH session routes enforce database-backed availability before processing", () => {
  for (const path of [
    "app/api/checkout/session/route.ts",
    "app/api/checkout/ach/session/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /await paymentMethodIsAvailableForNewCheckout/);
  }
  assert.doesNotMatch(
    readFileSync(
      "components/customer-paths/purchase/PurchaseMethod.tsx",
      "utf8",
    ),
    /wire_transfer|Wire Transfer/,
  );
});

test("webhook reconciliation remains independent of customer visibility settings", () => {
  const source = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
  assert.doesNotMatch(
    source,
    /payment-method-settings|paymentMethodIsAvailableForNewCheckout/,
  );
  assert.match(source, /reconcile/);
});
