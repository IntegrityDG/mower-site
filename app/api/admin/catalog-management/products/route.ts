import { adminCatalogRequest } from "@/lib/catalog-management/handlers";
import { createManagedProduct } from "@/lib/catalog-management/server";
export async function POST(request: Request) {
  return adminCatalogRequest(async () => ({ item: await createManagedProduct(await request.json().catch(() => null)), success: true }));
}
