import { geocodeUsLocation, GeocodingProviderError, type GeocodeDiagnostic } from "./geocoding-adapter";

export const PUBLIC_GEOCODE_TEST_ADDRESS = "1600 Pennsylvania Avenue NW, Washington, DC 20500, United States";

/** No member reads, database writes, addresses, or points in the diagnostic result. */
export async function diagnoseDealerGeocoder(fetcher: typeof fetch = fetch,
  apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY) {
  let diagnostic: GeocodeDiagnostic = { reason: "UNAVAILABLE", httpStatus: null,
    providerStatus: null, resultCount: null, validPoint: false };
  try {
    await geocodeUsLocation(PUBLIC_GEOCODE_TEST_ADDRESS, fetcher, apiKey,
      (result) => { diagnostic = result; });
  } catch (error) {
    if (!(error instanceof GeocodingProviderError))
      diagnostic = { ...diagnostic, reason: "UNAVAILABLE" };
  }
  return { configured: Boolean(apiKey?.trim()), diagnostic };
}
