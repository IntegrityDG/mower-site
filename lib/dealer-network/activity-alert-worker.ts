import "server-only";

import { sendServerEmail } from "@/lib/email";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { deliverActivityAlertBatch, type ActivityAlertDelivery } from "./activity-alert-delivery";

export function runDealerActivityAlerts() {
  const client = getSupabaseServiceClient();
  return deliverActivityAlertBatch({
    async claim(limit) {
      const { data, error } = await client.rpc("dealer_network_claim_activity_alert_deliveries", { p_limit: limit });
      if (error || !Array.isArray(data)) throw new Error("Dealer activity alert queue could not be read.");
      return data as ActivityAlertDelivery[];
    },
    async recipient(alert) {
      const { data, error } = await client.rpc("dealer_network_get_activity_alert_recipient", {
        p_alert_id: alert.id,
        p_lease_token: alert.lease_token,
      });
      if (error) throw new Error("Dealer activity recipient could not be checked.");
      return typeof data === "string" && data.trim() ? data : null;
    },
    send: sendServerEmail,
    async finish(alert, result) {
      const { data, error } = await client.rpc("dealer_network_finish_activity_alert_delivery", {
        p_alert_id: alert.id,
        p_lease_token: alert.lease_token,
        p_succeeded: result === "sent",
        p_discarded: result === "discarded",
      });
      if (error) throw new Error("Dealer activity delivery could not be finalized.");
      return data === true;
    },
  });
}
