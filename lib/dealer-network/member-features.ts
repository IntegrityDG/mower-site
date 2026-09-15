// Re-enable this source flag to restore member location controls and labels.
// Backend geocoding, private storage, and admin diagnostics remain available.
export const DEALER_NETWORK_GEOLOCATION_UI_ENABLED = false;

/** Ordinary member searches never request an origin or radius. */
export function memberDirectorySearchParams(
  data: Pick<FormData, "get">,
  near?: "business" | "zip" | "coordinates",
  coordinates?: Pick<GeolocationCoordinates, "latitude" | "longitude">,
) {
  const params = new URLSearchParams();
  for (const key of ["query", "role", "brandId", "relationshipType", "region", "zip", "areaCode"]) {
    const value = String(data.get(key) ?? "").trim();
    if (value) params.set(key, value);
  }
  if (DEALER_NETWORK_GEOLOCATION_UI_ENABLED && near) {
    params.set("near", near);
    for (const key of ["nearZip", "radius"]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    if (coordinates) {
      params.set("latitude", String(coordinates.latitude));
      params.set("longitude", String(coordinates.longitude));
    }
  }
  return params;
}
