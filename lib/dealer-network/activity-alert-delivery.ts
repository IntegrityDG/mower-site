import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";
import {
  DEALER_ACTIVITY_ALERT_LABELS,
  dealerActivityAlertLocation,
  type DealerActivityAlertKind,
} from "./activity-alert-links";

export type ActivityAlertDelivery = {
  id: string;
  kind: DealerActivityAlertKind;
  source_id: string;
  context_id: string;
  lease_token: string;
};

export type ActivityAlertEmail = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export function buildActivityAlertEmail(alert: ActivityAlertDelivery, to: string): ActivityAlertEmail | null {
  const relative = dealerActivityAlertLocation({
    id: alert.id,
    kind: alert.kind,
    sourceId: alert.source_id,
    contextId: alert.context_id,
  });
  if (!relative || !to.trim()) return null;
  const subject = DEALER_ACTIVITY_ALERT_LABELS[alert.kind];
  return {
    to: to.trim(),
    subject,
    text: `${subject}.\n\nSign in to view details in the IDS Dealer Portal:\n${IDS_CANONICAL_ORIGIN}${relative}`,
    idempotencyKey: `dealer-activity-alert/${alert.id}`,
  };
}

type DeliveryDependencies = {
  claim: (limit: number) => Promise<ActivityAlertDelivery[]>;
  recipient: (alert: ActivityAlertDelivery) => Promise<string | null>;
  send: (email: ActivityAlertEmail) => Promise<unknown>;
  finish: (alert: ActivityAlertDelivery, result: "sent" | "retry" | "discarded") => Promise<boolean>;
  pause?: (ms: number) => Promise<void>;
};

export const ACTIVITY_ALERT_BATCH_LIMIT = 25;
const PROVIDER_PACE_MS = 300;

export async function deliverActivityAlertBatch(deps: DeliveryDependencies) {
  const alerts = await deps.claim(ACTIVITY_ALERT_BATCH_LIMIT);
  const counts = { claimed: alerts.length, sent: 0, retry: 0, discarded: 0, unsettled: 0 };
  const pause = deps.pause ?? ((ms) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let cursor = 0;
  // Keep launches below the provider's per-second limit in each worker invocation.
  // DB leases prevent overlapping invocations from sending the same row.
  let nextProviderSlot = 0;
  async function worker() {
    while (cursor < alerts.length) {
      const alert = alerts[cursor++];
      let result: "sent" | "retry" | "discarded" = "retry";
      try {
        const now = Date.now();
        const slot = Math.max(now, nextProviderSlot);
        nextProviderSlot = slot + PROVIDER_PACE_MS;
        if (slot > now) await pause(slot - now);
        // Resolve the address and confirm current portal visibility as close to send as possible.
        const recipient = await deps.recipient(alert);
        const email = recipient ? buildActivityAlertEmail(alert, recipient) : null;
        if (!email) result = "discarded";
        else {
          await deps.send(email);
          result = "sent";
        }
      } catch {
        // Provider/network error is ambiguous. SQL bounds retry within the provider
        // idempotency window, and every retry uses the same per-recipient event key.
      }
      try {
        if (await deps.finish(alert, result)) counts[result]++;
        else counts.unsettled++;
      } catch {
        // Do not retry a successful provider acceptance here. Let the lease expire.
        counts.unsettled++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, alerts.length) }, () => worker()));
  return counts;
}
