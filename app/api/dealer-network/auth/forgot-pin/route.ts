import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
import {
  consumeDealerRateLimit,
  createPinReset,
  requestClientKey,
} from "@/lib/dealer-network/member-auth";
import { notifyPinReset } from "@/lib/dealer-network/notifications";

const GENERIC_MESSAGE =
  "If the information matches an eligible member account, IDS will send a PIN reset link.";

export async function POST(request: Request) {
  try {
    const allowed = await consumeDealerRateLimit(
      "member_pin_reset",
      requestClientKey(request),
      5,
      60 * 60,
    );
    if (allowed) {
      const body = await request.json().catch(() => ({}));
      const reset = await createPinReset({
        phone: body.phone,
        email: body.email,
      });
      if (reset)
        await notifyPinReset({
          ...reset,
          origin: dealerNetworkOrigin(request),
        }).catch(() =>
          console.error("Dealer Network PIN reset notification failed", {
            memberId: reset.memberId,
          }),
        );
    }
  } catch {
    /* Always return the same non-enumerating response. */
  }
  return Response.json({ message: GENERIC_MESSAGE });
}
