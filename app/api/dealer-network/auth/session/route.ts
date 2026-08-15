import { readMemberSession } from "@/lib/dealer-network/member-auth";

export async function GET() {
  const session = await readMemberSession();
  if (!session) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true, account: session });
}
