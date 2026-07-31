import { NextResponse } from "next/server";

import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await loadPublicCatalog();

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The equipment catalog is temporarily unavailable." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
