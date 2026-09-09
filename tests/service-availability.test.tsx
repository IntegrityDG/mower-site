import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import OptionalServices from "../components/customer-paths/purchase/OptionalServices";
import { ServiceIntake, SupportPurchase } from "../components/service/CustomerIntake";
import { addOptionalServices, EMPTY_OPTIONAL_SERVICES, type MachineServiceAvailability } from "../lib/checkout/optional-services";
import type { CheckoutRequest, OrderPriceSnapshot } from "../lib/checkout/types";

const available = { available: true, message: "" };
const unavailable = (message: string) => ({ available: false, message });
const baseAvailability: MachineServiceAvailability = { install: available, setup: available, remoteSupport: available };
const request = (selected: Partial<typeof EMPTY_OPTIONAL_SERVICES>): CheckoutRequest => ({
  requestId: crypto.randomUUID(), paymentMethod: "card", optionalServices: { ...EMPTY_OPTIONAL_SERVICES, ...selected },
  customer: { name: "Synthetic", email: "test@example.invalid", phone: "5551234567" }, shippingAddress: { line1: "123 Test Street", line2: null, city: "Test", state: "MO", postalCode: "63967", country: "US" },
  selection: { productId: crypto.randomUUID(), variantId: null, purchaseMode: "standard", packageId: null, options: [], includeBaseProduct: true },
});
const snapshot: OrderPriceSnapshot = {
  currency: "usd", product: { id: crypto.randomUUID(), slug: "test", name: "Test" }, variant: null, purchaseMode: "standard",
  chargeableItems: [], includedPackageComponents: [], subtotalCents: 100000, discountCents: 0, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: 100000,
  paymentMethod: "card", pricedAt: new Date().toISOString(), catalogSources: [], warnings: [], safeMetadata: { phase: "4B2B", discountPolicy: "none" },
};

test("every unavailable machine service is rejected by authoritative pricing", () => {
  for (const key of ["install", "setup", "remoteSupport"] as const) {
    const services = { ...baseAvailability, [key]: unavailable(`${key} maintenance window`) };
    assert.throws(() => addOptionalServices(snapshot, request({ [key]: true, ...(key === "remoteSupport" ? { acceptedSupportTerms: true } : {}) }), services), new RegExp(`${key} maintenance window`));
  }
});

test("unavailable machine choices are visibly disabled with the public message", () => {
  const availability = { install: unavailable("Install paused"), setup: unavailable("Setup paused"), remoteSupport: unavailable("Support paused") };
  const html = renderToStaticMarkup(<OptionalServices value={EMPTY_OPTIONAL_SERVICES} onChange={() => {}} availability={availability} eligibleCheckout />);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  for (const message of ["Install paused", "Setup paused", "Support paused", "CURRENTLY UNAVAILABLE"]) assert.match(html, new RegExp(message));
});

test("warranty verification stays available while paid On-Site Service is unavailable", () => {
  const html = renderToStaticMarkup(<ServiceIntake availability={{ remote: available, onsite: unavailable("Field service paused") }} />);
  assert.match(html, /value="yes"/); assert.match(html, /value="unsure"/); assert.match(html, /No — paid Service/);
  assert.doesNotMatch(html, /<button[^>]*\sdisabled=""[^>]*>Submit request/);
  const support = renderToStaticMarkup(<SupportPurchase availability={unavailable("Subscriptions paused")} />);
  assert.match(support, /Subscriptions paused/); assert.match(support, /<button[^>]*disabled/);
});

test("migration seeds all six controls and guards every new-intake database boundary", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260909201103_service_availability_controls.sql", import.meta.url), "utf8");
  for (const key of ["professional_installation", "professional_setup", "new_remote_support_subscriptions", "existing_subscriber_assistance", "paid_remote_service", "onsite_service"]) assert.match(sql, new RegExp(`'${key}'`));
  for (const table of ["public.installations", "public.remote_support_subscriptions", "public.service_cases", "checkout_private.orders"]) assert.match(sql, new RegExp(table.replace(".", "\\.")));
  assert.match(sql, /ids_service_actor\(p_actor,true\)/);
  assert.match(sql, /service_availability_history_immutable/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /service_currently_unavailable/);
});

test("availability changes are durable, timestamped, attributed, and immutable", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260909201103_service_availability_controls.sql", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/service/AvailabilityManagement.tsx", import.meta.url), "utf8");
  for (const field of ["previous_status", "status", "changed_by", "changed_by_name", "changed_at", "previous_public_message", "public_message"]) assert.match(migration, new RegExp(field));
  assert.match(migration, /changed_at=clock_timestamp\(\)/);
  assert.match(migration, /before update or delete on public\.service_availability_events/);
  assert.match(ui, /Last changed by/);
  assert.match(ui, /Availability change history/);
  assert.match(ui, /maxLength=\{500\}/);
});

test("latest persisted state is enforced at every server write boundary", () => {
  const service = readFileSync(new URL("../lib/service/server.ts", import.meta.url), "utf8");
  const stripe = readFileSync(new URL("../lib/service/stripe.ts", import.meta.url), "utf8");
  const installation = readFileSync(new URL("../lib/installations/server.ts", import.meta.url), "utf8");
  const setupOnly = readFileSync(new URL("../lib/installations/setup-server.ts", import.meta.url), "utf8");
  const machine = readFileSync(new URL("../lib/service/machine-checkout.ts", import.meta.url), "utf8");
  for (const key of ["existing_subscriber_assistance", "paid_remote_service", "onsite_service"]) assert.match(service, new RegExp("requireServiceAvailability\\([^)]*" + key));
  assert.match(service, /input\.warranty === "no"/);
  assert.match(stripe, /requireServiceAvailability\("new_remote_support_subscriptions"\)/);
  assert.match(installation, /requireServiceAvailability\("professional_installation"\)/);
  assert.match(installation, /requireServiceAvailability\("professional_setup"\)/);
  assert.match(setupOnly, /requireServiceAvailability\("professional_setup"\)/);
  for (const key of ["professional_installation", "professional_setup", "new_remote_support_subscriptions"]) assert.match(machine, new RegExp('requireServiceAvailability\\("' + key + '"\\)'));
});

test("availability blocks only new intake and leaves existing work intact", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260909201103_service_availability_controls.sql", import.meta.url), "utf8");
  const independentSetup = readFileSync(new URL("../supabase/migrations/20260909223000_independent_setup_availability.sql", import.meta.url), "utf8");
  assert.match(migration, /before insert on public\.installations/);
  assert.match(migration, /before insert on public\.remote_support_subscriptions/);
  assert.match(migration, /before insert on public\.service_cases/);
  assert.doesNotMatch(migration, /delete from (public\.)?(installations|service_cases|remote_support_subscriptions|service_appointments)/i);
  assert.doesNotMatch(migration, /trigger[^;]*service_appointments/i);
  assert.match(independentSetup, /if new\.installation_selected then[\s\S]*professional_installation/);
  assert.match(independentSetup, /if new\.setup_selected then[\s\S]*professional_setup/);
});
