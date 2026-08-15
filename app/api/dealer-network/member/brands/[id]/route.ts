import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { removeMemberBrand } from "@/lib/dealer-network/member-server";
import { validateUuid } from "@/lib/dealer-network/validation";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireActiveUnlockedMember();
    const id = validateUuid((await params).id);
    if (!id)
      return Response.json({ error: "Invalid affiliation." }, { status: 400 });
    await removeMemberBrand(session.memberId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Brand affiliation could not be removed.",
      },
      { status: error instanceof MemberAccessError ? error.status : 404 },
    );
  }
}
