import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { searchDealerDirectory } from "@/lib/dealer-network/member-server";
import type {
  BrandRelationshipType,
  DirectoryFilters,
  MemberRole,
} from "@/lib/dealer-network/types";
import { validateUuid } from "@/lib/dealer-network/validation";

const radii = new Set([25, 50, 100, 250]);
const roles = new Set<MemberRole>(["dealer", "repair_tech", "both"]);
const relationships = new Set<BrandRelationshipType>(["sold", "serviced"]);
export async function GET(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const search = new URL(request.url).searchParams;
    const radius = Number(search.get("radius") ?? 100);
    const role = search.get("role") || undefined;
    const relationshipType = search.get("relationshipType") || undefined;
    const brandValue = search.get("brandId") || undefined;
    const zipCode = search.get("zip")?.trim() || undefined;
    const areaCode = search.get("areaCode")?.trim() || undefined;
    const nearZip = search.get("nearZip")?.trim() || undefined;
    const near = search.get("near") || undefined;
    const latitude = search.has("latitude")
      ? Number(search.get("latitude"))
      : undefined;
    const longitude = search.has("longitude")
      ? Number(search.get("longitude"))
      : undefined;
    if (
      (latitude !== undefined &&
        (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== undefined &&
        (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    )
      return Response.json(
        { error: "Location coordinates are invalid." },
        { status: 400 },
      );
    if (
      (role && !roles.has(role as MemberRole)) ||
      (relationshipType &&
        !relationships.has(relationshipType as BrandRelationshipType)) ||
      (brandValue && !validateUuid(brandValue))
    )
      return Response.json(
        { error: "One or more directory filters are invalid." },
        { status: 400 },
      );
    if (
      (zipCode && !/^\d{1,5}(?:-\d{1,4})?$/.test(zipCode)) ||
      (areaCode && !/^\d{3}$/.test(areaCode)) ||
      (nearZip && !/^\d{5}(?:-\d{4})?$/.test(nearZip))
    )
      return Response.json(
        { error: "Enter valid U.S. ZIP and area-code filters." },
        { status: 400 },
      );
    if (near && !["business", "coordinates", "zip"].includes(near))
      return Response.json(
        { error: "The location-search option is invalid." },
        { status: 400 },
      );
    if (
      near === "coordinates" &&
      (latitude === undefined || longitude === undefined)
    )
      return Response.json(
        { error: "Location coordinates are required." },
        { status: 400 },
      );
    if (near === "zip" && !nearZip)
      return Response.json(
        { error: "Enter a ZIP code for this distance search." },
        { status: 400 },
      );
    const filters: DirectoryFilters = {
      query: search.get("query")?.slice(0, 160),
      role: role as MemberRole | undefined,
      brandId: brandValue,
      relationshipType: relationshipType as BrandRelationshipType | undefined,
      region: search.get("region")?.slice(0, 160),
      zipCode,
      areaCode,
      near: near as DirectoryFilters["near"],
      latitude,
      longitude,
      nearZip,
      radiusMiles: (radii.has(radius)
        ? radius
        : 100) as DirectoryFilters["radiusMiles"],
    };
    return Response.json({
      results: await searchDealerDirectory(session.memberId, filters),
    });
  } catch (error) {
    const unavailable =
      error instanceof Error && error.message === "LOCATION_UNAVAILABLE";
    return Response.json(
      {
        error: unavailable
          ? "That location could not be resolved. Try another ZIP code or a non-distance search."
          : error instanceof MemberAccessError
            ? error.message
            : "Directory search failed.",
      },
      {
        status: unavailable
          ? 422
          : error instanceof MemberAccessError
            ? error.status
            : 500,
      },
    );
  }
}
