export type GeocodePoint = { latitude: number; longitude: number };
export type GeocodeFailureReason =
  | "NOT_CONFIGURED"
  | "NO_RESULTS"
  | "REQUEST_DENIED"
  | "OVER_QUERY_LIMIT"
  | "INVALID_REQUEST"
  | "UNAVAILABLE";

export class GeocodingProviderError extends Error {
  constructor(public readonly reason: Exclude<GeocodeFailureReason, "NO_RESULTS">) {
    super(`GEOCODER_${reason}`);
    this.name = "GeocodingProviderError";
  }
}
type GoogleGeocodeResponse = {
  status?: string;
  results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
};

export async function geocodeUsLocation(
  query: string,
  fetcher: typeof fetch = fetch,
  apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY,
): Promise<GeocodePoint | null> {
  if (!apiKey?.trim()) throw new GeocodingProviderError("NOT_CONFIGURED");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", apiKey);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new GeocodingProviderError("UNAVAILABLE");
  }
  if (!response.ok) throw new GeocodingProviderError("UNAVAILABLE");
  let payload: GoogleGeocodeResponse;
  try {
    payload = (await response.json()) as GoogleGeocodeResponse;
  } catch {
    throw new GeocodingProviderError("UNAVAILABLE");
  }
  if (payload.status === "ZERO_RESULTS") return null;
  if (payload.status === "REQUEST_DENIED")
    throw new GeocodingProviderError("REQUEST_DENIED");
  if (payload.status === "OVER_QUERY_LIMIT")
    throw new GeocodingProviderError("OVER_QUERY_LIMIT");
  if (payload.status === "INVALID_REQUEST")
    throw new GeocodingProviderError("INVALID_REQUEST");
  if (payload.status !== "OK")
    throw new GeocodingProviderError("UNAVAILABLE");
  const location = payload.results?.[0]?.geometry?.location;
  if (
    !location ||
    typeof location.lat !== "number" ||
    typeof location.lng !== "number"
  )
    return null;
  return { latitude: location.lat, longitude: location.lng };
}
