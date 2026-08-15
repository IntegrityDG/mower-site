import type {
  BrandRelationshipType,
  DirectoryFilters,
  DirectoryResult,
  MemberRole,
} from "./types";

export type PrivateDirectoryRow = {
  id: string;
  memberName: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  zipCode: string;
  websiteUrl: string | null;
  role: MemberRole;
  experience: string;
  serviceRegion: string;
  introduction: string;
  logoPath: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string;
  brands: Array<{
    id: string;
    brandId: string;
    brandName: string;
    relationshipType: BrandRelationshipType;
  }>;
};

export function haversineMiles(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(destination.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterDirectoryRows(
  rows: PrivateDirectoryRow[],
  filters: DirectoryFilters,
  origin: { latitude: number; longitude: number } | null,
) {
  const query = filters.query?.trim().toLowerCase();
  const region = filters.region?.trim().toLowerCase();
  const areaCode = filters.areaCode?.replace(/\D/g, "").slice(0, 3);
  const radius = filters.radiusMiles ?? 100;
  return rows
    .map((row) => {
      const distance =
        origin && row.latitude !== null && row.longitude !== null
          ? haversineMiles(origin, {
              latitude: row.latitude,
              longitude: row.longitude,
            })
          : null;
      return { row, distance };
    })
    .filter(({ row, distance }) => {
      if (
        query &&
        !`${row.memberName} ${row.companyName}`.toLowerCase().includes(query)
      )
        return false;
      if (filters.role && row.role !== filters.role) return false;
      if (
        region &&
        !`${row.serviceRegion} ${row.city} ${row.state}`
          .toLowerCase()
          .includes(region)
      )
        return false;
      if (filters.zipCode && !row.zipCode.startsWith(filters.zipCode))
        return false;
      if (
        areaCode &&
        row.phone.replace(/\D/g, "").replace(/^1/, "").slice(0, 3) !== areaCode
      )
        return false;
      if (
        filters.brandId &&
        !row.brands.some(
          (brand) =>
            brand.brandId === filters.brandId &&
            (!filters.relationshipType ||
              brand.relationshipType === filters.relationshipType),
        )
      )
        return false;
      if (origin && (distance === null || distance > radius)) return false;
      return true;
    })
    .sort((a, b) =>
      origin
        ? (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE)
        : a.row.companyName.localeCompare(b.row.companyName),
    );
}

export function toDirectoryResult(
  row: PrivateDirectoryRow,
  distanceMiles: number | null,
  logoUrl: string | null,
): DirectoryResult {
  return {
    id: row.id,
    memberName: row.memberName,
    companyName: row.companyName,
    phone: row.phone,
    email: row.email,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    websiteUrl: row.websiteUrl,
    role: row.role,
    experience: row.experience,
    serviceRegion: row.serviceRegion,
    introduction: row.introduction,
    logoUrl,
    brandsSold: row.brands
      .filter((brand) => brand.relationshipType === "sold")
      .map((brand) => ({ id: brand.brandId, name: brand.brandName })),
    brandsServiced: row.brands
      .filter((brand) => brand.relationshipType === "serviced")
      .map((brand) => ({ id: brand.brandId, name: brand.brandName })),
    distanceMiles:
      distanceMiles === null ? null : Math.round(distanceMiles * 10) / 10,
  };
}
