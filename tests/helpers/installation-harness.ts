/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import * as accounting from "../../lib/installations/accounting";
import * as validation from "../../lib/installations/cash-validation";
import * as policy from "../../lib/installations/policy";
import * as stripeConfig from "../../lib/stripe/config-values";
import * as adminPolicy from "../../lib/installations/admin-policy";
import * as intakeValidation from "../../lib/installations/validation";
import * as stripePolicy from "../../lib/installations/stripe-policy";
import * as nodeCrypto from "node:crypto";
import * as nodeUtil from "node:util";
import { loadInstallationModule as load } from "./installation-module";
import { installation, installationId, payment, receivedAt } from "./installation-fixtures";
import {processorFixture} from './installation-stripe-fixtures';

// In-memory boundary double ONLY. This does not execute the proposed SQL and
// cannot prove PostgreSQL permissions, atomicity, locking, or concurrency.
export function installationHarness(options: { authorized?: boolean; installation?: Record<string, unknown>; payments?: any[]; adjustments?: any[]; corrections?: any[]; env?: Record<string, string>; stripeMode?: string } = {}) {
  const state: Record<string, any[]> = {
    service_installation_customers: [],
    installations: [installation(options.installation)], installation_payments: options.payments ?? [{ ...payment(), installation_id: installationId, created_at: receivedAt }],
    installation_cash_corrections: options.corrections ?? [], installation_cash_refunds: [], installation_adjustments: options.adjustments ?? [], installation_work_sessions: [], installation_audit_events: [],
    installation_admin_operations:[],installation_pricing_history:[],installation_processor_events:[],
    installation_pricing_settings: [{ id: true, labor_cents: 80000, materials_allowance_cents: 20000, deposit_cents: 25000,included_labor_minutes:240,additional_labor_hourly_cents:12500,labor_increment_minutes:15,underground_per_segment_cents:5000,underground_segment_feet:10,included_one_way_travel_minutes:120,travel_hourly_cents:3500 }],
  };
  const calls: { table: string; verb: string; payload?: any }[] = [];
  const external: string[] = [];
  const processor=processorFixture((options.payments?.[0]?.amount_cents)??25000,options.payments?.[0]);
  const processorRefunds: any[]=[];
  const processorSessions: any[]=[processor.session];
  const adminState=()=>{
    const pricing=state.installations[0].pricing_snapshot;
    const ledger=accounting.ledgerSnapshot(pricing??{laborCents:0,materialsAllowanceCents:0},state.installation_adjustments,state.installation_payments,state.installation_cash_corrections,state.installation_cash_refunds);
    // SQL returns nullable pricing for an unapproved request. Keep that RPC
    // shape while using the shared normalizer for the ledger's record arrays.
    return {installation:structuredClone(state.installations[0]),payments:structuredClone(state.installation_payments),adjustments:structuredClone(state.installation_adjustments),corrections:structuredClone(state.installation_cash_corrections),cashRefunds:structuredClone(state.installation_cash_refunds),sessions:structuredClone(state.installation_work_sessions),ledger:pricing?ledger:{...ledger,pricing:{laborCents:null,materialsAllowanceCents:null}}};
  };
  let failure: { table: string; verb: string; error: any } | null = null;
  let incompleteRpc = false;
  const auth = { isReviewAdmin: async () => options.authorized !== false };
  const db = {
    from(table: string) {
      let verb = "select", payload: any, single = false, maybe = false, shouldThrow = false;
      const filters: [string, unknown][] = [];
      const q: any = {
        select() { return q; }, order() { return q; }, eq(key: string, value: unknown) { filters.push([key, value]); return q; },
        insert(value: any) { verb = "insert"; payload = value; return q; },
        update(value: any) { verb = "update"; payload = value; return q; },
        upsert(value: any) { verb = "upsert"; payload = value; return q; },
        single() { single = true; return q; }, maybeSingle() { single = true; maybe = true; return q; },
        throwOnError() { shouldThrow = true; return q; },
        then(resolve: any, reject: any) {
          return Promise.resolve().then(() => {
            calls.push({ table, verb, payload });
            if (failure?.table === table && failure.verb === verb) { if (shouldThrow) throw failure.error; return { data: null, error: failure.error }; }
            if (!state[table]) throw new Error(`Unexpected table: ${table}`);
            let rows = state[table].filter(row => filters.every(([key, value]) => row[key] === value));
            if (verb === "update") rows.forEach(row => Object.assign(row, payload));
            if (verb === "insert" || verb === "upsert") { const row = { id: `synthetic-${state[table].length}`, ...payload }; state[table].push(row); rows = [row]; }
            if (single && !rows.length && !maybe) return { data: null, error: { code: "PGRST116", message: "synthetic missing row" } };
            return { data: structuredClone(single ? rows[0] ?? null : rows), error: null };
          }).then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(name: string, p: any) {
      calls.push({ table: name, verb: "rpc", payload: structuredClone(p) });
      if (failure?.table === name) return { data: null, error: failure.error };
      if (incompleteRpc) return { data: null, error: null };
      if(name==='ids_installation_admin_state')return {data:adminState(),error:null};
      if(name==='ids_apply_installation_admin'){
        assert.deepEqual(p.p_expected,adminState());Object.assign(state.installations[0],p.p_patch);
        state.installation_work_sessions.push(...p.p_sessions.map((s:any)=>({id:nodeCrypto.randomUUID(),...s})));
        state.installation_adjustments.push(...p.p_adjustments);
        const result={ok:true,replayed:false};state.installation_admin_operations.push({operation_key:p.p_key,installation_id:p.p_id,payload:p.p_payload,result});return {data:result,error:null};
      }
      if(name==='ids_reserve_installation_checkout'){
        const row={id:p.p_payment_id,installation_id:p.p_id,purpose:p.p_purpose,method:'stripe',amount_cents:p.p_amount,refunded_cents:0,status:'pending',paid_at:null,currency:'usd',livemode:false,processor_request:p.p_request,processor_state:'reserved',idempotency_key:`ids-installation-checkout:${p.p_payment_id}`,created_at:new Date().toISOString()};
        state.installation_payments.push(row);return {data:structuredClone(row),error:null};
      }
      if(name==='ids_attach_installation_checkout'){
        const row=state.installation_payments.find(r=>r.id===p.p_payment_id)!;row.stripe_session_id=p.p_session_id;return {data:structuredClone(row),error:null};
      }
      if(name==='ids_reconcile_installation_stripe'){
        const row=state.installation_payments.find(r=>r.id===p.p_payment_id)!;
        Object.assign(row,{paid_at:p.p_evidence.paymentOccurredAt,refunded_cents:p.p_evidence.refundedCents,status:p.p_evidence.paid?(p.p_evidence.refundedCents===row.amount_cents?'refunded':p.p_evidence.refundedCents?'partially_refunded':'paid'):'pending'});
        for(const r of p.p_refunds){const old=state.installation_payments.find(x=>x.id===r.id);if(old)Object.assign(old,r);else state.installation_payments.push(r);}
        state.installation_processor_events.push({event_id:p.p_event.id,payment_id:row.id,payload_hash:p.p_event.hash});
        state.installations[0].payment_status=accounting.financialPaymentStatus(p.p_balance_after);return {data:{ok:true},error:null};
      }
      const kind = name === "ids_confirm_installation_cash" ? p.p_kind : name === "ids_correct_installation_cash" ? "correction" : "receipt";
      const correction = kind === "correction";
      const payload = name === "ids_confirm_installation_cash" ? p.p_payload : correction ? {
        installationId: p.p_installation_id, operationKey: p.p_operation_key, originalPaymentId: p.p_original_payment_id,
        amountCents: p.p_amount_cents, reason: p.p_reason, actor: p.p_actor,
      } : { installationId: p.p_installation_id, operationKey: p.p_operation_key, amountCents: p.p_amount_cents,
        receivedAt: p.p_received_at, reference: p.p_reference, notes: p.p_notes, confirmOverpayment: p.p_confirm_overpayment, actor: p.p_actor };
      const key = (correction ? "cash-correction:" : "cash:") + p.p_operation_key;
      const table = correction ? state.installation_cash_corrections : state.installation_payments;
      const existing = table.find(row => row.idempotency_key === key);
      const result = (row: any, replayed: boolean) => ({ paymentId: correction ? row.original_payment_id : row.id,
        ...(correction ? { correctionId: row.id } : {}), recordedAt: row.created_at, replayed,
        balanceAtRecording: correction ? row.balance_after : row.cash_balance_after });
      if (existing) {
        if (existing.installation_id !== p.p_installation_id || JSON.stringify(correction ? existing.operation_payload : existing.cash_operation_payload) !== JSON.stringify(payload)) return { data: null, error: { message: "cash_operation_conflict" } };
        return { data: result(existing, true), error: null };
      }
      if (name === "ids_confirm_installation_cash") return { data: null, error: null };
      assert.ok(["ids_record_installation_cash", "ids_correct_installation_cash"].includes(name));
      const i = state.installations.find(row => row.id === p.p_installation_id)!;
      const snapshot = accounting.ledgerSnapshot(i.pricing_snapshot, state.installation_adjustments, state.installation_payments, state.installation_cash_corrections);
      if (JSON.stringify(p.p_expected_ledger) !== JSON.stringify(snapshot)) return { data: null, error: { message: "installation_ledger_changed" } };
      if (!correction && p.p_amount_cents > p.p_balance_before.balanceDueCents && !p.p_confirm_overpayment) return { data: null, error: { message: "cash_overpayment_confirmation_required" } };
      const base = { id: "44444444-4444-4444-8444-" + String(table.length).padStart(12, "0"), installation_id: p.p_installation_id,
        amount_cents: p.p_amount_cents, created_at: "2026-09-07T18:00:00.000Z", idempotency_key: key, recorded_by: p.p_actor };
      const row = correction ? { ...base, original_payment_id: p.p_original_payment_id, reason: p.p_reason, operation_payload: payload, balance_after: p.p_balance_after } : {
        ...base, purpose: "cash", method: "cash", status: "paid", refunded_cents: 0, paid_at: p.p_received_at, cash_operation_payload: payload, cash_balance_after: p.p_balance_after };
      table.push(row);
      if (i.payment_status !== "forfeited") i.payment_status = p.p_payment_status;
      state.installation_audit_events.push({ event_type: correction ? "cash_receipt_corrected" : "cash_received", actor: p.p_actor, payment_id: correction ? p.p_original_payment_id : row.id, correction_id: correction ? row.id : null });
      return { data: result(row, false), error: null };
    },
  };
  const controls = load<typeof import("../../lib/installations/controls")>("lib/installations/controls.ts", { "@/lib/stripe/config-values": stripeConfig }, options.env ?? {});
  const ledger = load<typeof import("../../lib/installations/ledger")>("lib/installations/ledger.ts", { "@/lib/supabase": { getSupabaseServiceClient: () => db }, "./accounting": accounting });
  const subscriberEligibility = load<typeof import("../../lib/installations/subscriber-eligibility")>("lib/installations/subscriber-eligibility.ts", { "@/lib/supabase": { getSupabaseServiceClient: () => db } }, options.env ?? {});
  const modules = { "./subscriber-eligibility":subscriberEligibility, "node:crypto":nodeCrypto,"node:util":nodeUtil,"./admin-policy":adminPolicy,"./stripe-policy":stripePolicy,"./validation":intakeValidation,"@/lib/supabase": { getSupabaseServiceClient: () => db }, "@/lib/reviews/admin-auth": auth, "@/lib/service/availability": { requireServiceAvailability: async () => {} }, "./accounting": accounting, "./cash-validation": validation, "./ledger": ledger, "./policy": policy, "./controls": controls };
  const cash = load<typeof import("../../lib/installations/cash")>("lib/installations/cash.ts", modules);
  const operations = load<typeof import("../../lib/installations/operations")>("lib/installations/operations.ts", modules);
  const server = load<typeof import("../../lib/installations/server")>("lib/installations/server.ts", { ...modules, "./operations": operations });
  const stripe = load<typeof import("../../lib/installations/stripe")>("lib/installations/stripe.ts", { ...modules,
    "@/lib/stripe/config": { getStripeMode: () => options.stripeMode ?? "test", getStripeConfiguration: () => ({ appBaseUrl: "http://localhost" }) },
    "@/lib/stripe/server": { getStripeServerClient: () => ({ checkout: { sessions: {
      retrieve: async (id:string) => { external.push("stripe-retrieve"); return processorSessions.find(s=>s.id===id); },
      list: () => ({autoPagingToArray:async()=>processorSessions}),
      create: async (payload: any) => { external.push("stripe-create"); calls.push({ table: "stripe", verb: "create", payload }); const s={...processor.session,id:'cs_test_created',status:'open',payment_status:'unpaid',payment_intent:null,amount_total:payload.line_items[0].price_data.unit_amount,metadata:payload.metadata,client_reference_id:payload.client_reference_id,url:'http://localhost/synthetic-checkout'};processorSessions.push(s);return s; },
    } },paymentIntents:{retrieve:async()=>processor.intent},charges:{retrieve:async()=>processor.charge},refunds:{list:()=>({autoPagingToArray:async()=>processorRefunds})} }) },
  });
  return { db, state, calls, external, auth, cash, ledger, operations, server, stripe, controls,processor,processorRefunds,
    fail(table: string, verb: string, error: any = { message: "synthetic failure" }) { failure = { table, verb, error }; },
    incompleteRpc() { incompleteRpc = true; }, clearFailure() { failure = null; },
  };
}
