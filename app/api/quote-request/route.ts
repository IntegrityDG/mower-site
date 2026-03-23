import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendLeadEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = body.name?.trim();
    const phone = body.phone?.trim() || null;
    const email = body.email?.trim() || null;
    const preferredContactMethod = body.preferredContactMethod?.trim() || null;
    const propertyType = body.propertyType?.trim() || null;
    const propertySize = body.propertySize?.trim() || null;
    const obstacleLevel = body.obstacleLevel?.trim() || null;
    const weedEating = body.weedEating?.trim() || null;
    const purchaseType = body.purchaseType?.trim() || null;
    const extraNotes = body.extraNotes?.trim() || null;

    const interests = Array.isArray(body.interests) ? body.interests : [];
    const terrain = Array.isArray(body.terrain) ? body.terrain : [];
    const priorities = Array.isArray(body.priorities) ? body.priorities : [];
    const productInterest = Array.isArray(body.productInterest)
      ? body.productInterest
      : [];
    const autoSuggestion = Array.isArray(body.autoSuggestion)
      ? body.autoSuggestion
      : [];

    if (!name) {
      return NextResponse.json(
        { error: "Name is required." },
        { status: 400 }
      );
    }

    if (!phone && !email) {
      return NextResponse.json(
        { error: "Phone or email is required." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("quote_requests").insert([
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
      console.error("Supabase error:", error);
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
      console.log("About to send email...");
      await sendLeadEmail(summary);
      console.log("Email send finished.");
    } catch (emailError) {
      console.error("Email error:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}