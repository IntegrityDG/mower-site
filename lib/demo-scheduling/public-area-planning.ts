import type { DemoRegionColor, PublicDemoAreaPlan } from "./types";

export const CUSTOM_DEMO_AREA_ID = "10000000-0000-4000-8000-000000000099";
export const CUSTOM_DEMO_AREA_NAME = "Custom / Out-of-Area";

export const NORMAL_DEMO_REGION_COLORS = [
  "blue", "purple", "orange", "cyan", "teal", "indigo", "pink", "amber", "lime", "violet", "sky",
] as const satisfies readonly Exclude<DemoRegionColor, "red">[];

export const DEMO_REGION_MARKER_CLASSES: Record<DemoRegionColor, string> = {
  blue: "bg-blue-600", purple: "bg-purple-600", orange: "bg-orange-500",
  cyan: "bg-cyan-600", teal: "bg-teal-600", indigo: "bg-indigo-600",
  pink: "bg-pink-600", amber: "bg-amber-500", lime: "bg-lime-600",
  violet: "bg-violet-600", sky: "bg-sky-600", red: "bg-red-600",
};

export function demoRegionColor(regionId: string): Exclude<DemoRegionColor, "red"> {
  let hash = 2166136261;
  for (const character of regionId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return NORMAL_DEMO_REGION_COLORS[(hash >>> 0) % NORMAL_DEMO_REGION_COLORS.length];
}

type PublicAssignmentRow = { service_date: string; region_id: string; city_id: string | null; custom_city: string | null };
type PublicAreaRow = { id: string; name: string };
type PublicCityRow = { id: string; name: string; state_abbreviation: string | null };

export function toPublicDemoAreaPlanning(
  assignments: PublicAssignmentRow[],
  areas: PublicAreaRow[],
  cities: PublicCityRow[],
): PublicDemoAreaPlan[] {
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const cityById = new Map(cities.map((city) => [city.id, city]));
  return assignments.flatMap((assignment) => {
    const area = areaById.get(assignment.region_id);
    if (!area) return [];
    const isCustom = assignment.region_id === CUSTOM_DEMO_AREA_ID;
    const city = assignment.city_id ? cityById.get(assignment.city_id) : null;
    const locationLabel = isCustom
      ? assignment.custom_city?.trim() || null
      : city ? `${city.name}${city.state_abbreviation ? `, ${city.state_abbreviation}` : ""}` : assignment.custom_city?.trim() || null;
    return [{
      serviceDate: assignment.service_date,
      regionName: area.name,
      locationLabel,
      color: isCustom ? "red" : demoRegionColor(assignment.region_id),
      isCustom,
    }];
  });
}

export function publicDemoAreaLabel(plan: PublicDemoAreaPlan): string {
  if (plan.isCustom) return plan.locationLabel ? `Demo Area: ${plan.locationLabel}` : "Demo Area: Custom / Out-of-Area";
  return `Demo Area: ${plan.regionName}${plan.locationLabel ? ` — ${plan.locationLabel}` : ""}`;
}

export function publicDemoAreaAccessibleLabel(plan: PublicDemoAreaPlan): string {
  if (plan.isCustom) return `Custom location${plan.locationLabel ? ` ${plan.locationLabel}` : ""}`;
  return `${plan.regionName}${plan.locationLabel ? `, ${plan.locationLabel}` : ""}`;
}

export function publicDemoAreaLegend(plans: PublicDemoAreaPlan[]): PublicDemoAreaPlan[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const key = plan.isCustom ? CUSTOM_DEMO_AREA_ID : `${plan.regionName}:${plan.color}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
