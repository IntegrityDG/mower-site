import { NextResponse } from "next/server";

import { sendLeadEmail } from "@/lib/email";
import { getSupabaseServiceClient } from "@/lib/supabase";

const maximumBodyBytes = 32_000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const propertyTypes = {
  solar_farm: "Solar Farm",
  golf_course: "Golf Course",
  municipal_park: "City or Municipal Park",
  private_estate: "Large Private Estate",
  aviation: "Airport or Aviation Property",
  commercial_campus: "Commercial Campus",
  agricultural_utility: "Agricultural or Utility Property",
  other_large_acreage: "Other Large-Acreage Property",
} as const;

const contactMethods = {
  email: "Email",
  phone: "Phone",
  either: "Email or phone",
} as const;

const modelInterests = {
  recommend: "Not sure — recommend a model",
  m1500_sd: "Pandag G1 M1500 SD",
  m1500_rd: "Pandag G1 M1500 RD",
  pro_m3000: "Pandag G1 PRO M3000",
} as const;

type TextRule = { required?: boolean; maximum: number };

const textRules: Record<string, TextRule> = {
  organizationName: { required: true, maximum: 160 },
  contactName: { required: true, maximum: 120 },
  email: { required: true, maximum: 254 },
  phone: { required: true, maximum: 40 },
  propertyAddress: { required: true, maximum: 240 },
  city: { required: true, maximum: 100 },
  state: { required: true, maximum: 80 },
  zipCode: { required: true, maximum: 20 },
  terrainDescription: { required: true, maximum: 2_000 },
  vegetationConditions: { required: true, maximum: 2_000 },
  mowingFrequency: { required: true, maximum: 500 },
  availablePower: { required: true, maximum: 1_000 },
  chargingStrategy: { required: true, maximum: 2_000 },
  obstaclesAndAccess: { required: true, maximum: 2_000 },
  connectivity: { required: true, maximum: 1_000 },
  deploymentTimeframe: { required: true, maximum: 500 },
  additionalNotes: { required: true, maximum: 3_000 },
  maximumSlopes: { maximum: 500 },
  currentEquipment: { maximum: 1_000 },
  currentLaborBurden: { maximum: 1_000 },
  expectedMachineCount: { maximum: 100 },
  securityRestrictions: { maximum: 1_500 },
};

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function enumLabel<T extends Record<string, string>>(
  choices: T,
  value: string
) {
  return Object.prototype.hasOwnProperty.call(choices, value)
    ? choices[value as keyof T]
    : null;
}

function acreageValue(value: unknown) {
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) && normalized > 0 && normalized <= 10_000_000
    ? normalized
    : null;
}

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > maximumBodyBytes) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > maximumBodyBytes) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    if (Object.values(input).some(Array.isArray)) {
      return NextResponse.json({ error: "Arrays are not accepted." }, { status: 400 });
    }

    const values: Record<string, string> = {};
    for (const [key, rule] of Object.entries(textRules)) {
      const value = textValue(input, key);
      if (rule.required && !value) {
        return NextResponse.json({ error: `${key} is required.` }, { status: 400 });
      }
      if (value.length > rule.maximum) {
        return NextResponse.json({ error: `${key} is too long.` }, { status: 400 });
      }
      values[key] = value;
    }

    if (!emailPattern.test(values.email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const propertyType = enumLabel(propertyTypes, textValue(input, "propertyType"));
    const preferredContactMethod = enumLabel(contactMethods, textValue(input, "preferredContactMethod"));
    const modelInterest = enumLabel(modelInterests, textValue(input, "modelInterest"));
    if (!propertyType || !preferredContactMethod || !modelInterest) {
      return NextResponse.json({ error: "Select valid project options." }, { status: 400 });
    }

    const totalAcreage = acreageValue(input.totalAcreage);
    const mowingAcreage = acreageValue(input.mowingAcreage);
    if (totalAcreage === null || mowingAcreage === null) {
      return NextResponse.json({ error: "Enter valid positive acreage values." }, { status: 400 });
    }
    if (mowingAcreage > totalAcreage) {
      return NextResponse.json({ error: "Mowing acreage cannot exceed total acreage." }, { status: 400 });
    }

    const propertyLocation = `${values.propertyAddress}, ${values.city}, ${values.state} ${values.zipCode}`;
    const details = [
      "PANDAG COMMERCIAL PROJECT REQUEST",
      `Organization/customer: ${values.organizationName}`,
      `Contact name: ${values.contactName}`,
      `Property type: ${propertyType}`,
      `Property location: ${propertyLocation}`,
      `Total property acreage: ${totalAcreage}`,
      `Approximate mowing acreage: ${mowingAcreage}`,
      `Terrain: ${values.terrainDescription}`,
      values.maximumSlopes ? `Estimated maximum slopes: ${values.maximumSlopes}` : null,
      `Vegetation/mowing conditions: ${values.vegetationConditions}`,
      `Desired mowing frequency: ${values.mowingFrequency}`,
      `Available electrical power: ${values.availablePower}`,
      `Charging location/strategy: ${values.chargingStrategy}`,
      `Obstacles/restricted areas/access: ${values.obstaclesAndAccess}`,
      `Cellular/internet availability: ${values.connectivity}`,
      `Desired deployment timeframe: ${values.deploymentTimeframe}`,
      values.currentEquipment ? `Current mowing equipment: ${values.currentEquipment}` : null,
      values.currentLaborBurden ? `Current labor/operating burden: ${values.currentLaborBurden}` : null,
      values.expectedMachineCount ? `Expected number of machines: ${values.expectedMachineCount}` : null,
      `Non-binding model interest: ${modelInterest}`,
      values.securityRestrictions ? `Security/access restrictions: ${values.securityRestrictions}` : null,
      `Additional project notes: ${values.additionalNotes}`,
    ].filter(Boolean).join("\n");

    const { error } = await getSupabaseServiceClient()
      .from("quote_requests")
      .insert([{
        name: values.organizationName,
        phone: values.phone,
        email: values.email,
        contact: values.phone || values.email,
        preferred_contact_method: preferredContactMethod,
        property_type: propertyType,
        interests: ["Pandag commercial project request"],
        property_size: `${totalAcreage} total acres; ${mowingAcreage} mowing acres`,
        terrain: [values.terrainDescription],
        obstacle_level: values.obstaclesAndAccess,
        fence_row: null,
        priorities: [values.deploymentTimeframe],
        product_interest: ["Pandag G1", modelInterest],
        purchase_type: "Commercial project quote only",
        extra_notes: details,
        auto_suggestion: ["IDS to recommend final Pandag configuration after project review"],
        property_details: details,
        status: "new",
      }]);

    if (error) {
      console.error("Pandag request storage failed");
      return NextResponse.json({ error: "Unable to save the project request." }, { status: 500 });
    }

    try {
      await sendLeadEmail(
        [
          "New Pandag Commercial Project Request",
          `Organization/customer: ${values.organizationName}`,
          `Contact: ${values.contactName}`,
          `Email: ${values.email}`,
          `Phone: ${values.phone}`,
          `Preferred contact: ${preferredContactMethod}`,
          details,
        ].join("\n"),
        "New Pandag Commercial Project Request"
      );
    } catch {
      console.error("Pandag request notification failed");
    }

    return NextResponse.json({ success: true });
  } catch {
    console.error("Pandag project request failed");
    return NextResponse.json({ error: "Unable to process the project request." }, { status: 500 });
  }
}
