import {
  requireDealerNetworkAdmin,
} from "@/lib/dealer-network/admin-auth";

import {
  dealerNetworkOrigin,
} from "@/lib/dealer-network/api";

import {
  createDealerBroadcast,
  readAdminBroadcasts,
} from "@/lib/dealer-network/broadcast-server";


export async function GET() {
  try {
    await requireDealerNetworkAdmin();

    return Response.json({
      broadcasts:
        await readAdminBroadcasts(),
    });
  } catch (error) {
    const unauthorized =
      error instanceof Error &&
      error.name ===
        "DealerNetworkAdminError";

    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : "Broadcast history is unavailable.",
      },
      {
        status:
          unauthorized
            ? 401
            : 500,
      },
    );
  }
}


export async function POST(
  request: Request,
) {
  try {
    await requireDealerNetworkAdmin();

    const result =
      await createDealerBroadcast(
        await request
          .json()
          .catch(() => null),

        dealerNetworkOrigin(
          request,
        ),
      );

    return Response.json(
      result,
      {
        status: 201,
      },
    );
  } catch (error) {
    const unauthorized =
      error instanceof Error &&
      error.name ===
        "DealerNetworkAdminError";

    const invalid =
      error instanceof Error &&
      error.message ===
        "INVALID_BROADCAST";

    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : invalid
            ? "Enter a subject and message within the allowed limits."
            : "The IDS broadcast could not be sent.",
      },
      {
        status:
          unauthorized
            ? 401
            : invalid
              ? 400
              : 500,
      },
    );
  }
}
