import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { createDealerBrandRequest } from "@/lib/dealer-network/member-server";

export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const brandRequest = await createDealerBrandRequest(
      session.memberId,
      await request.json().catch(() => null),
    );
    return Response.json({ brandRequest }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message =
      code === "INVALID_BRAND_NAME"
        ? "Enter a valid brand name."
        : code === "BRAND_ALREADY_EXISTS"
          ? "That brand is already available. Select it from the list."
          : code === "BRAND_REQUEST_EXISTS"
            ? "That brand has already been requested and is awaiting review."
            : error instanceof MemberAccessError
              ? error.message
              : "Brand request could not be submitted.";
    return Response.json(
      { error: message },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
