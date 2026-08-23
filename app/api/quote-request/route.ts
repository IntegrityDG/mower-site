import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { sendLeadEmail } from "@/lib/email";
import { salesModeForProductSlug } from "@/lib/catalog/sales-mode";
import { validateGeneralQuoteRequest } from "@/lib/leads/quote-validation";
import { LeadRequestError, readLimitedJson, requireLeadRateLimit } from "@/lib/leads/request-security";

export async function POST(req: Request) {
  try {
    await requireLeadRateLimit(req, "general_quote_request");
    const {
      name, phone, email, preferredContactMethod, propertyType, propertySize,
      obstacleLevel, weedEating, purchaseType, extraNotes, productSlug,
      interests, terrain, priorities, productInterest, autoSuggestion,
    } = validateGeneralQuoteRequest(await readLimitedJson(req));

    const identifiesPandag = productInterest.some(
      (item) => typeof item === "string" && item.toLowerCase().includes("pandag")
    );
    if (
      salesModeForProductSlug(productSlug) === "quote_only" ||
      identifiesPandag
    ) {
      return NextResponse.json(
        { error: "Pandag projects must use the commercial project request form." },
        { status: 400 }
      );
    }

    const { error } = await getSupabaseServiceClient()
      .from("quote_requests")
      .insert([
        {
          name,
          phone,
          email,
          contact: phone || email,
          preferred_contact_method: preferredContactMethod,
          property_type: propertyType,
          interests: interests.length ? interests : null,
          property_size: propertySize,
          terrain: terrain.length ? terrain : null,
          obstacle_level: obstacleLevel,
          fence_row: weedEating,
          priorities: priorities.length ? priorities : null,
          product_interest: productInterest.length ? productInterest : null,
          purchase_type: purchaseType,
          extra_notes: extraNotes,
          auto_suggestion: autoSuggestion.length ? autoSuggestion : null,
          property_details: extraNotes,
          status: "new",
        },
      ]);

    if (error) {
      console.error("Quote request storage failed");
      return NextResponse.json(
        { error: "Failed to save request." },
        { status: 500 }
      );
    }

    const summary = [
      `NEW LEAD: ${name}`,
      phone ? `Phone: ${phone}` : null,
      email ? `Email: ${email}` : null,
      preferredContactMethod ? `Preferred: ${preferredContactMethod}` : null,
      propertyType ? `Type: ${propertyType}` : null,
      propertySize ? `Size: ${propertySize}` : null,
      obstacleLevel ? `Obstacles: ${obstacleLevel}` : null,
      weedEating ? `Weed eating needed: ${weedEating}` : null,
      purchaseType ? `Buy/Finance: ${purchaseType}` : null,
      interests.length ? `Interests: ${interests.join(", ")}` : null,
      terrain.length ? `Terrain: ${terrain.join(", ")}` : null,
      priorities.length ? `Priorities: ${priorities.join(", ")}` : null,
      productInterest.length
        ? `Products: ${productInterest.join(", ")}`
        : null,
      autoSuggestion.length
        ? `Suggested: ${autoSuggestion.join(", ")}`
        : null,
      extraNotes ? `Notes: ${extraNotes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await sendLeadEmail(summary);
    } catch {
      console.error("Quote request notification failed");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof LeadRequestError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && /Invalid|Unknown|field|list|contact/i.test(error.message))
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    console.error("Quote request failed");
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
