import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import {
  removeMemberLogo,
  uploadMemberLogo,
} from "@/lib/dealer-network/member-server";

export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json({ error: "Choose a logo image." }, { status: 400 });
    return Response.json({
      logoUrl: await uploadMemberLogo(session.memberId, file),
    });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "INVALID_LOGO";
    return Response.json(
      {
        error: invalid
          ? "Upload a JPEG, PNG, or WebP image up to 5 MB."
          : error instanceof MemberAccessError
            ? error.message
            : "Logo upload failed.",
      },
      {
        status: invalid
          ? 400
          : error instanceof MemberAccessError
            ? error.status
            : 500,
      },
    );
  }
}

export async function DELETE() {
  try {
    const session = await requireActiveUnlockedMember();
    await removeMemberLogo(session.memberId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Logo could not be removed.",
      },
      { status: error instanceof MemberAccessError ? error.status : 500 },
    );
  }
}
