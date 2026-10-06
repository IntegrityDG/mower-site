import { adminCatalogRequest } from "@/lib/catalog-management/handlers";
import { readCatalogDependencies } from "@/lib/catalog-management/server";
import { managedKind } from "@/lib/catalog-management/validation";
export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  return adminCatalogRequest(async () => {
    const { kind, id } = await context.params;
    return readCatalogDependencies(managedKind(kind), id);
  });
}
