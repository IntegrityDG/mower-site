import {
  completePinReset,
  MemberAccessError,
} from "@/lib/dealer-network/member-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    await completePinReset(body.token, body.pin);
    return Response.json({
      message: "Your PIN has been reset. You may sign in now.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "This reset link is invalid or expired.",
      },
      { status: 400 },
    );
  }
}
