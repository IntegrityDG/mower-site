import { adminCatalogRequest } from "@/lib/catalog-management/handlers";
import { retireManagedRecord, updateManagedRecord } from "@/lib/catalog-management/server";
import { managedKind } from "@/lib/catalog-management/validation";
type Context = { params: Promise<{ kind: string; id: string }> };
export async function PATCH(request: Request, context: Context) {
  return adminCatalogRequest(async () => {
    const { kind, id } = await context.params;
    return { item: await updateManagedRecord(managedKind(kind), id, await request.json().catch(() => null)), success: true };
  });
}
export async function DELETE(request: Request, context: Context) {
  return adminCatalogRequest(async () => {
    const { kind, id } = await context.params;
    return { ...(await retireManagedRecord(managedKind(kind), id, await request.json().catch(() => null))), success: true };
  });
}
