import { adminCatalogRequest } from "@/lib/catalog-management/handlers";
import { createManagedPackage } from "@/lib/catalog-management/server";
export async function POST(request: Request) {
  return adminCatalogRequest(async () => ({ item: await createManagedPackage(await request.json().catch(() => null)), success: true }));
}
