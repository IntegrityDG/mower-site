import {
  PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS,
  readPublicTroubleshootingEntry,
} from "@/lib/public-troubleshooting/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const entry = await readPublicTroubleshootingEntry((await params).id);
    if (!entry) throw new Error("NOT_FOUND");
    return Response.json(
      { entry },
      { headers: PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "Troubleshooting entry not found." },
      { status: 404, headers: PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS },
    );
  }
}
