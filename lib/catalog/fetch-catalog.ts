import type { CatalogResponse } from "./types";

const catalogUnavailableMessage =
  "The equipment catalog is temporarily unavailable.";

function errorFromPayload(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return payload.error;
  }

  return catalogUnavailableMessage;
}

function isCatalogResponse(payload: unknown): payload is CatalogResponse {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    Array.isArray((payload as CatalogResponse).products) &&
    typeof (payload as CatalogResponse).generatedAt === "string"
  );
}

export async function fetchCatalog(init?: RequestInit) {
  const response = await fetch("/api/catalog", {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (!isJson) {
    throw new Error(catalogUnavailableMessage);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error(catalogUnavailableMessage);
  }

  if (!response.ok) {
    throw new Error(errorFromPayload(payload));
  }

  if (!isCatalogResponse(payload)) {
    throw new Error(catalogUnavailableMessage);
  }

  return payload;
}
