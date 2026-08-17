import { NextResponse } from "next/server";

import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import {
  readPricingProgramSettings,
  saveEverydayLowPriceEnabled,
} from "@/lib/pricing-program/server";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  if (!(await isReviewAdmin())) {
    return json({ error: "Unauthorized." }, 401);
  }

  try {
    const settings = await readPricingProgramSettings();
    return json({ settings });
  } catch {
    return json({ error: "Pricing program settings are unavailable." }, 503);
  }
}

export async function PATCH(request: Request) {
  if (!(await isReviewAdmin())) {
    return json({ error: "Unauthorized." }, 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).length !== 1 ||
    !("enabled" in body) ||
    typeof body.enabled !== "boolean"
  ) {
    return json({ error: "enabled must be a boolean." }, 422);
  }

  try {
    const settings = await saveEverydayLowPriceEnabled(body.enabled);
    return json({ settings });
  } catch {
    return json({ error: "Pricing program setting could not be saved." }, 503);
  }
}
