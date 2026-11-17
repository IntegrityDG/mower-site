// Execute the real server resolver against read-only catalog fixtures. Never opens
// a network connection, writes an order, or creates a payment session.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as equipmentPricing from "../../lib/checkout/equipment-pricing";
import * as eligibility from "../../lib/checkout/eligibility";
import * as types from "../../lib/checkout/types";
import * as payments from "../../lib/checkout/payment-pricing";
import * as schedules from "../../lib/catalog/active-price-schedule";

export function fixturePricingResolver(rows: Record<string, Record<string, unknown>[]>) {
  const exports = {};
  const supabase = { from(table: string) {
    if (!(table in rows)) throw new Error(`Unexpected table: ${table}`);
    let data = rows[table];
    const query = {
      select() { return query; },
      in(key: string, values: unknown[]) { data = data.filter(row => values.includes(row[key])); return query; },
      eq(key: string, value: unknown) { data = data.filter(row => row[key] === value); return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data, error: null }).then(resolve); },
    };
    return query;
  } };
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "./equipment-pricing": equipmentPricing,
    "@/lib/supabase": { getSupabaseServiceClient: () => supabase },
    "./eligibility": eligibility, "./types": types, "./payment-pricing": payments,
    "@/lib/catalog/active-price-schedule": schedules,
    "@/lib/pricing-program/server": { readPricingProgramSettingsFailSafe: async () => ({ everydayLowPriceEnabled: true }) },
    "./optional-services": { addOptionalServices: (snapshot: unknown) => snapshot },
    "@/lib/service/availability": { readPublicServiceAvailability: async () => Object.fromEntries(["professional_installation", "professional_setup", "new_remote_support_subscriptions"].map(key => [key, { available: false, public_message: "Not included in fixture" }])) },
  };
  runInNewContext(ts.transpileModule(readFileSync(new URL("../../lib/checkout/pricing-resolver.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return (exports as typeof import("../../lib/checkout/pricing-resolver")).resolveAuthoritativeOrderPricing;
}
