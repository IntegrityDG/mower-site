export type GeocodePoint = { latitude: number; longitude: number };
export type GeocodeFailureReason =
  | "NOT_CONFIGURED" | "NO_RESULTS" | "REQUEST_DENIED" | "OVER_QUERY_LIMIT"
  | "OVER_DAILY_LIMIT" | "INVALID_REQUEST" | "UNAVAILABLE" | "TIMEOUT"
  | "HTTP_ERROR" | "BAD_PROVIDER_RESPONSE" | "NETWORK_ERROR"
  | "INCOMPLETE_ADDRESS" | "MALFORMED_ADDRESS" | "DATABASE_READ_FAILED"
  | "DATABASE_SAVE_FAILED" | "ADDRESS_CHANGED";
export type GeocodeDiagnosticReason = GeocodeFailureReason | "SUCCESS" | "ZERO_RESULTS";
const providerStatuses = ["OK", "ZERO_RESULTS", "REQUEST_DENIED", "OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT", "INVALID_REQUEST", "UNKNOWN_ERROR"] as const;
export type GoogleProviderStatus = typeof providerStatuses[number] | "OTHER";
export type GeocodeDiagnostic = {
  reason: GeocodeDiagnosticReason;
  httpStatus: number | null;
  providerStatus: GoogleProviderStatus | null;
  resultCount: number | null;
  validPoint: boolean;
  configurationIssue?: "API_DISABLED" | "BILLING" | "IP_RESTRICTION" | "APPLICATION_RESTRICTION" | "API_RESTRICTION" | "INVALID_KEY" | "PROJECT_MISMATCH" | "UNKNOWN";
};

/** Never log provider text, request URLs, keys, or geographic points. */
export function logGeocodeDiagnostic(diagnostic: GeocodeDiagnostic) {
  const message = JSON.stringify({ event: "dealer_geocode_provider", reason: diagnostic.reason,
    httpStatus: diagnostic.httpStatus, providerStatus: diagnostic.providerStatus,
    resultCount: diagnostic.resultCount, validPoint: diagnostic.validPoint,
    configurationIssue: diagnostic.configurationIssue });
  if (diagnostic.reason === "SUCCESS") console.info(message);
  else console.warn(message);
}

export class GeocodingProviderError extends Error {
  constructor(public readonly reason: Exclude<GeocodeFailureReason, "NO_RESULTS">,
    public readonly diagnostic?: GeocodeDiagnostic) {
    super(`GEOCODER_${reason}`);
    this.name = "GeocodingProviderError";
  }
}

export function validGeocodePoint(point: unknown): point is GeocodePoint {
  if (!point || typeof point !== "object") return false;
  const candidate = point as GeocodePoint;
  return typeof candidate.latitude === "number" && Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 && candidate.latitude <= 90 &&
    typeof candidate.longitude === "number" && Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 && candidate.longitude <= 180;
}

function configurationIssue(value: unknown): GeocodeDiagnostic["configurationIssue"] {
  if (typeof value !== "string") return "UNKNOWN";
  if (/not (?:been )?(?:enabled|activated)|api.*disabled/i.test(value)) return "API_DISABLED";
  if (/billing|payment|credit card/i.test(value)) return "BILLING";
  if (/ip address|ip restriction/i.test(value)) return "IP_RESTRICTION";
  if (/referer|referrer|browser|application restriction/i.test(value)) return "APPLICATION_RESTRICTION";
  if (/not authorized.*(?:api|service)|api restriction/i.test(value)) return "API_RESTRICTION";
  if (/invalid.*key|key.*invalid|expired.*key/i.test(value)) return "INVALID_KEY";
  if (/project/i.test(value)) return "PROJECT_MISMATCH";
  return "UNKNOWN";
}

export async function geocodeUsLocation(query: string, fetcher: typeof fetch = fetch,
  apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY,
  report: (diagnostic: GeocodeDiagnostic) => void = logGeocodeDiagnostic): Promise<GeocodePoint | null> {
  let httpStatus: number | null = null;
  let providerStatus: GoogleProviderStatus | null = null;
  let resultCount: number | null = null;
  const fail = (reason: Exclude<GeocodeFailureReason, "NO_RESULTS">,
    detail: GeocodeDiagnosticReason = reason, issue?: GeocodeDiagnostic["configurationIssue"]): never => {
    const diagnostic: GeocodeDiagnostic = { reason: detail, httpStatus, providerStatus, resultCount, validPoint: false,
      ...(issue ? { configurationIssue: issue } : {}) };
    report(diagnostic);
    throw new GeocodingProviderError(reason, diagnostic);
  };
  if (!apiKey?.trim()) fail("NOT_CONFIGURED");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", apiKey!.trim());
  const signal = AbortSignal.timeout(8000);
  let response: Response;
  try {
    response = await fetcher(url, { headers: { accept: "application/json" }, signal });
  } catch (error) {
    const timeout = signal.aborted || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
    return fail("UNAVAILABLE", timeout ? "TIMEOUT" : "NETWORK_ERROR");
  }
  httpStatus = response.status;
  if (!response.ok) fail("UNAVAILABLE", "HTTP_ERROR");
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("UNAVAILABLE", "BAD_PROVIDER_RESPONSE");
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GeocodingProviderError) throw error;
    return fail("UNAVAILABLE", signal.aborted ? "TIMEOUT" : "BAD_PROVIDER_RESPONSE");
  }
  providerStatus = providerStatuses.includes(payload.status as typeof providerStatuses[number])
    ? payload.status as GoogleProviderStatus : "OTHER";
  resultCount = Array.isArray(payload.results) ? payload.results.length : null;
  if (providerStatus === "ZERO_RESULTS") {
    report({ reason: "ZERO_RESULTS", httpStatus, providerStatus, resultCount, validPoint: false });
    return null;
  }
  if (["REQUEST_DENIED", "OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT", "INVALID_REQUEST"].includes(providerStatus))
    fail(providerStatus as Exclude<GeocodeFailureReason, "NO_RESULTS">, providerStatus as GeocodeDiagnosticReason,
      ["REQUEST_DENIED", "OVER_DAILY_LIMIT"].includes(providerStatus) ? configurationIssue(payload.error_message) : undefined);
  if (providerStatus !== "OK") fail("UNAVAILABLE", providerStatus === "OTHER" ? "BAD_PROVIDER_RESPONSE" : "UNAVAILABLE");
  const results = payload.results as Array<{ geometry?: { location?: { lat?: unknown; lng?: unknown } } }> | undefined;
  const location = Array.isArray(results) ? results[0]?.geometry?.location : undefined;
  const point = { latitude: location?.lat, longitude: location?.lng };
  if (!validGeocodePoint(point)) fail("UNAVAILABLE", "BAD_PROVIDER_RESPONSE");
  report({ reason: "SUCCESS", httpStatus, providerStatus, resultCount, validPoint: true });
  return point as GeocodePoint;
}
