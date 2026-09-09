import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceIntake, SupportPurchase } from "../components/service/CustomerIntake";
import { ServiceTerms, SupportTerms, WarrantyVerified } from "../components/service/ServiceTerms";
import FooterActions from "../components/footer/FooterActions";
import { parseIntake, parsePricing, parseServiceAction, parseWorkSheet } from "../lib/service/validation";
import { DEFAULT_SERVICE_PRICING, EMPTY_WORK_SHEET, calculateInvoice } from "../lib/service/policy";
import { servicesSchedulingPage } from "./helpers/installation-service-page";
import WorkSheetEditor from "../components/service/WorkSheetEditor";
import type { ServiceCase, ServiceInvoice } from "../lib/service/types";

test("included request collects exactly Name, Phone, Brief Issue and no upload/payment/eligibility claim", () => {
  const html = renderToStaticMarkup(<ServiceIntake included enabled />);
  assert.deepEqual([...html.matchAll(/<(?:input|textarea)\b[^>]*name="([^"]+)"/g)].map(m => m[1]).sort(), ["issue", "name", "phone"]);
  assert.doesNotMatch(html, /type="file"|type="checkbox"|type="email"|card number/i);
  assert.match(html, /does not use a session/);
});
test("paid intake begins with warranty choice, does not preselect coverage, and collects no card details", () => {
  const html = renderToStaticMarkup(<ServiceIntake enabled />);
  assert.ok(html.indexOf('name="warranty"') < html.indexOf('name="name"'));
  assert.match(html, /value="unsure"/); assert.match(html, /value="" selected=""/);
  assert.doesNotMatch(html, /type="file"|card number|guaranteed repair/i);
});
test("purchase requires affirmative recurring terms; inactive controls disable submission", () => {
  const html = renderToStaticMarkup(<SupportPurchase enabled={false} />);
  assert.match(html, /type="checkbox" required/); assert.match(html, /\$100 now and \$100 monthly/);
  assert.match(html, /<button[^>]*disabled/); assert.doesNotMatch(html, /checked=""/);
  assert.match(renderToStaticMarkup(<ServiceIntake included enabled={false} />), /<button[^>]*disabled/);
});
test("public terms retain issue-based sessions, four slots, activation, exact cancellation and suspension rules", () => {
  const html = renderToStaticMarkup(<SupportTerms />);
  for (const phrase of ["$100/month", "Four Remote Support Sessions", "Phone or Facebook Messenger", "one issue until resolved", "no 24-hour session limit", "do not roll over", "10 days", "exactly 24 hours", "next cycle", "14 days"]) assert.ok(html.includes(phrase), phrase);
});
test("Service terms retain rates, cumulative work, mapped travel and conditional warranty", () => {
  const html = renderToStaticMarkup(<ServiceTerms />);
  for (const phrase of ["$80.00", "$40.00", "$17.50", "$5.00", "central Williamsville", "60 minutes each way", "cumulative", "Repair is not guaranteed", "explicit IDS approval", "$0 customer due"]) assert.ok(html.includes(phrase), phrase);
  assert.doesNotMatch(html, /\$100.00|\$50.00/);
  assert.match(renderToStaticMarkup(<ServiceTerms pricing={{ ...DEFAULT_SERVICE_PRICING, firstHourCents: 9000 }} />), /\$90.00/);
});
test("Remote Assistance is in the shared footer immediately before the unchanged policy action", () => {
  const html = renderToStaticMarkup(<FooterActions />);
  assert.match(html, /href="\/remote-assistance"/);
  assert.ok(html.indexOf("Remote Assistance") > html.indexOf("Troubleshoot Your Robot"));
  assert.ok(html.indexOf("Returns &amp; Refunds") > html.indexOf("Remote Assistance"));
});
test("Services section has real Remote Support and paid Service destinations, preserving Demo and Install", async () => {
  const html = renderToStaticMarkup(await servicesSchedulingPage(false)({ searchParams: Promise.resolve({}) }));
  for (const href of ["/remote-assistance", "/service", "/professional-installation", "#request-demo"]) assert.ok(html.includes(`href="${href}"`), href);
});
test("browser subscriber claims and partial or invalid pricing cannot cross the server validation boundary", () => {
  const input = { key: crypto.randomUUID(), kind: "included_support", name: "Synthetic", phone: "5551234567", issue: "Test issue" };
  assert.equal(parseIntake(input).email, null);
  for (const claim of [{ eligible: true }, { subscriber: true }, { discount: 25 }, { email: "claim@example.invalid" }, { files: [] }]) assert.throws(() => parseIntake({ ...input, ...claim }));
  assert.throws(() => parsePricing({ firstHourCents: 0 }));
  assert.throws(() => parsePricing({ ...DEFAULT_SERVICE_PRICING, firstHourCents: -1 }));
  assert.deepEqual(parsePricing(DEFAULT_SERVICE_PRICING), DEFAULT_SERVICE_PRICING);
  assert.throws(() => parseServiceAction({ key: crypto.randomUUID(), version: 1, action: "start_session", data: { eligible: true } }));
});
test("valid thousandth quantities survive floating-point representation without false rejection", () => {
  const sheet = { ...structuredClone(EMPTY_WORK_SHEET), supplies: [{ id: crypto.randomUUID(), kind: "material" as const, description: "Synthetic material", partNumber: "", quantity: 1.001, unitCents: 500, authorization: "Authorized" }] };
  const parsed = parseWorkSheet(sheet);
  assert.equal(calculateInvoice(parsed, { remote: true, warranty: false, subscriberEligible: true }).materialsCents, 500);
});

test("work sheet shows cumulative labor blocks, each trip and supply amount using frozen case rates", () => {
  const sheet = { ...structuredClone(EMPTY_WORK_SHEET), labor: [{ id: "labor", date: "2026-09-09", minutes: 65, description: "Repair", technicianId: null }], travel: [{ id: "trip", date: "2026-09-09", category: "legitimate_return" as const, outboundMinutes: 60, returnMinutes: 60, mappedRoute: "Mapped route", reason: "Parts arrived" }], supplies: [{ id: "supply", kind: "part" as const, description: "Sensor", partNumber: "TEST", quantity: 2, unitCents: 900, authorization: "Authorized" }] };
  const pricing = { ...DEFAULT_SERVICE_PRICING, returnTravelHalfHourCents: 600 };
  const invoice = { id: "invoice-reference", case_id: "case", status: "finalized", sheet, pricing, subscriber_eligible: false, payment_status: "paid", totals: calculateInvoice(sheet, { remote: false, warranty: false, subscriberEligible: false, pricing }) } as ServiceInvoice;
  const job = { id: "case", case_number: "IDS-TEST", customer_name: "Synthetic", kind: "onsite_service", arrangement: "onsite", warranty_status: "not_requested" } as ServiceCase;
  const html = renderToStaticMarkup(<WorkSheetEditor job={job} invoice={invoice} actor={{ id: null, role: "master", name: "Master", canCollectPayments: true, canRecordCash: true }} sheet={sheet} setSheet={() => {}} busy={false} save={() => {}} />);
  for (const text of ["invoice-reference", "65 cumulative active minutes", "1 first-hour block at $80.00", "1 additional begun 30-minute blocks at $40.00", "4 begun 30-minute blocks", "$6.00", "$24.00", "2 × $9.00", "$18.00", "Eligible labor/travel subtotal", "Final invoice amount"]) assert.ok(html.includes(text), text);
});
test("shop drop-off has no travel editor or accepted travel charge", () => {
  const sheet = structuredClone(EMPTY_WORK_SHEET), invoice = { id: "invoice", status: "draft", sheet, pricing: DEFAULT_SERVICE_PRICING, subscriber_eligible: false, payment_status: "not_due", totals: null } as ServiceInvoice;
  const job = { case_number: "IDS-TEST", customer_name: "Synthetic", kind: "warranty", arrangement: "shop_dropoff", warranty_status: "verified" } as ServiceCase;
  const html = renderToStaticMarkup(<WorkSheetEditor job={job} invoice={invoice} actor={{ id: null, role: "master", name: "Master", canCollectPayments: true, canRecordCash: true }} sheet={sheet} setSheet={() => {}} busy={false} save={() => {}} />);
  assert.doesNotMatch(html, /Add mapped trip/);
  sheet.travel.push({ id: "trip", date: "2026-09-09", category: "initial", outboundMinutes: 90, returnMinutes: 90, mappedRoute: "Synthetic", reason: "Invalid drop-off travel" });
  assert.throws(() => calculateInvoice(sheet, { remote: false, warranty: true, subscriberEligible: false, shopDropoff: true }), /drop-off cannot include/);
});
test("verified warranty immediately displays the same prominent zero-due statement for customer and staff", () => {
  assert.match(renderToStaticMarkup(<WarrantyVerified />), /Warranty verified — Customer due \$0.00/);
});
