import {
  PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS,
  readPublicTroubleshootingEntries,
} from "@/lib/public-troubleshooting/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    const entries = await readPublicTroubleshootingEntries({
      query: parameters.get("q"),
      brand: parameters.get("brand"),
      model: parameters.get("model"),
      systemArea: parameters.get("system"),
    });
    return Response.json(
      { entries },
      { headers: PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS },
    );
  } catch (error) {
    const invalidInput =
      error instanceof Error &&
      error.message === "INVALID_PUBLIC_TROUBLESHOOTING_FILTERS";
    return Response.json(
      {
        error: invalidInput
          ? "Invalid troubleshooting search."
          : "Public troubleshooting entries are unavailable.",
      },
      {
        status: invalidInput ? 400 : 503,
        headers: PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS,
      },
    );
  }
}
