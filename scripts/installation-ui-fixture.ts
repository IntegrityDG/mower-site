// Synthetic HTTP persistence double. No PostgreSQL client, database or Stripe.
// Used only by the local rendering script; never imported by the application.
import { createServer } from "node:http";
import { installationHarness } from "../tests/helpers/installation-harness";
import { installationId, receivedAt } from "../tests/helpers/installation-fixtures";

const h = installationHarness({ installation: {
  customer_name: "SYNTHETIC UI FIXTURE - Alex Sample", customer_email: "alex@example.invalid", customer_phone: "555-010-0100",
  property_address: "100 Synthetic Lane, Williamsville, MO", internet_availability: "yes",
  requested_start_at: "2026-10-20T14:00:00.000Z", requested_end_at: "2026-10-20T18:00:00.000Z",
  grounding_acknowledged_at: receivedAt, responsibilities_acknowledged_at: receivedAt, terms_acknowledged_at: receivedAt,
  approved_travel_charge_cents: 0, calculated_travel_charge_cents: 0, estimated_one_way_drive_minutes: 60,
} });
const initial = structuredClone(h.state);
Object.assign(h.state.installation_pricing_settings[0], { included_labor_minutes: 240, additional_labor_hourly_cents: 12500,
  labor_increment_minutes: 15, underground_per_segment_cents: 5000, underground_segment_feet: 10, included_one_way_travel_minutes: 120, travel_hourly_cents: 3500 });
initial.installation_pricing_settings = structuredClone(h.state.installation_pricing_settings);
let mode = "normal";
const log: { method: string; path: string }[] = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://127.0.0.1:45435");
  const send = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  let raw = ""; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (url.pathname === "/__fixture/control") {
    if (body.reset) { Object.assign(h.state, structuredClone(initial)); log.length = 0; }
    if (body.mode) mode = body.mode;
    if (body.installation) Object.assign(h.state.installations[0], body.installation);
    if (body.payments) h.state.installation_payments = body.payments;
    send(200, { mode }); return;
  }
  if (url.pathname === "/__fixture/evidence") { send(200, { mode, log, state: h.state, calls: h.calls, installationId }); return; }
  log.push({ method: req.method!, path: url.pathname });
  try {
    if (url.pathname === "/rest/v1/rpc/dealer_network_consume_rate_limit") { send(200, true); return; }
    if (mode === "not_initialized") { send(404, { code: "42P01", message: "Synthetic installation schema is not initialized" }); return; }
    if (url.pathname === "/rest/v1/rpc/ids_record_installation_cash") {
      const result = await h.db.rpc("ids_record_installation_cash", body);
      if (mode === "lost_response" && !result.error) { mode = "normal"; req.socket.destroy(); return; }
      send(result.error ? 409 : 200, result.error ?? result.data); return;
    }
    const table = url.pathname.replace("/rest/v1/", "");
    if (req.method !== "GET" || !h.state[table]) { send(400, { message: "Synthetic fixture rejects this operation" }); return; }
    const rows = h.state[table].filter(row => [...url.searchParams].every(([key, value]) => !value.startsWith("eq.") || String(row[key]) === value.slice(3)));
    send(200, req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows);
  } catch (error) { send(500, { message: String(error) }); }
});
server.listen(45435, "127.0.0.1", () => console.log("SYNTHETIC installation persistence double: http://127.0.0.1:45435 (no database)"));
