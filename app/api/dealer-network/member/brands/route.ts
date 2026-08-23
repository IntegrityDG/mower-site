import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { addMemberBrand } from "@/lib/dealer-network/member-server";

export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json(
      {
        brand: await addMemberBrand(
          session.memberId,
          await request.json().catch(() => null),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Brand affiliation could not be added.",
      },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
