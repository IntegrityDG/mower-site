import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { installationBalance, ledgerSnapshot, type InstallationPayment, type InstallationAdjustment, type InstallationCashCorrection, type InstallationCashRefund } from "./accounting";
import type { PricingSnapshot } from "./policy";

export async function readInstallationLedger(id: string, db = getSupabaseServiceClient()) {
  const results = await Promise.all([
    db.from("installations").select("*").eq("id", id).single(),
    db.from("installation_adjustments").select("*").eq("installation_id", id),
    db.from("installation_payments").select("*").eq("installation_id", id),
    db.from("installation_cash_corrections").select("*").eq("installation_id", id),
    db.from("installation_cash_refunds").select("*").eq("installation_id", id),
  ]);
  for (const result of results) {
    if (result.error) throw result.error;
    if (!result.data) throw new Error("installation_read_incomplete");
  }
  const installation = results[0].data!;
  if (!installation.pricing_snapshot) throw new Error("missing_approved_pricing");
  const pricing = installation.pricing_snapshot as PricingSnapshot;
  const adjustments = results[1].data! as InstallationAdjustment[];
  const payments = results[2].data! as InstallationPayment[];
  const corrections = results[3].data! as InstallationCashCorrection[];
  const cashRefunds = results[4].data! as InstallationCashRefund[];
  return { installation, pricing, adjustments, payments, corrections, cashRefunds,
    balance: installationBalance(pricing, adjustments, payments, corrections, cashRefunds), snapshot: ledgerSnapshot(pricing, adjustments, payments, corrections, cashRefunds) };
}
