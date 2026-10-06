import { adminCatalogRequest } from "@/lib/catalog-management/handlers";
import { readManagedCatalog } from "@/lib/catalog-management/server";
export async function GET(request: Request) {
  return adminCatalogRequest(() => readManagedCatalog(new URL(request.url).searchParams.get("archived") === "true"));
}
