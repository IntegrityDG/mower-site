export type DealerNotificationDelivery = "sent" | "skipped";

export type DealerNotificationClaim = {
  claimed: boolean;
  eventId: string;
  claimedAt: string;
};

export class DealerNotificationLedgerError extends Error {
  constructor() {
    super("Notification ledger finalization failed.");
    this.name = "DealerNotificationLedgerError";
  }
}

export async function deliverClaimedDealerNotification(input: {
  claim: () => Promise<DealerNotificationClaim>;
  prepare?: (claim: DealerNotificationClaim) => Promise<void>;
  send: () => Promise<unknown>;
  finish: (
    claim: DealerNotificationClaim,
    status: "sent" | "failed",
    error?: unknown,
  ) => Promise<void>;
}): Promise<DealerNotificationDelivery> {
  const claim = await input.claim();
  if (!claim.claimed) return "skipped";

  try {
    await input.prepare?.(claim);
    await input.send();
  } catch (error) {
    try {
      await input.finish(claim, "failed", error);
    } catch {
      throw new DealerNotificationLedgerError();
    }
    throw error;
  }

  try {
    await input.finish(claim, "sent");
  } catch {
    throw new DealerNotificationLedgerError();
  }
  return "sent";
}

export function notificationRetryResult(delivery: DealerNotificationDelivery) {
  return { retried: delivery === "sent" } as const;
}
