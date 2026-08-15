import { readActiveDealerBrands } from "@/lib/dealer-network/applications-server";

export async function GET() {
  try {
    return Response.json({ brands: await readActiveDealerBrands() });
  } catch {
    return Response.json(
      { error: "Brand choices are temporarily unavailable." },
      { status: 503 },
    );
  }
}
