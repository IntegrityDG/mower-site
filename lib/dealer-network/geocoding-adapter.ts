export type GeocodePoint = { latitude: number; longitude: number };
type GoogleGeocodeResponse = {
  status?: string;
  results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
};

export async function geocodeUsLocation(
  query: string,
  fetcher: typeof fetch = fetch,
  apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY,
): Promise<GeocodePoint | null> {
  if (!apiKey) throw new Error("GEOCODER_NOT_CONFIGURED");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", apiKey);
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("GEOCODER_UNAVAILABLE");
  const payload = (await response.json()) as GoogleGeocodeResponse;
  if (payload.status === "ZERO_RESULTS") return null;
  if (payload.status !== "OK") throw new Error("GEOCODER_UNAVAILABLE");
  const location = payload.results?.[0]?.geometry?.location;
  if (
    !location ||
    typeof location.lat !== "number" ||
    typeof location.lng !== "number"
  )
    return null;
  return { latitude: location.lat, longitude: location.lng };
}
