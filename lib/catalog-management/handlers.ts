import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { CatalogManagementError } from "./validation";

export const catalogJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function adminCatalogRequest(action: () => Promise<unknown>) {
  if (!(await isReviewAdmin())) return catalogJson({ error: "Unauthorized" }, 401);
  try { return catalogJson(await action()); }
  catch (error) {
    return error instanceof CatalogManagementError
      ? catalogJson({ error: error.message }, error.status)
      : catalogJson({ error: "Catalog management is unavailable." }, 503);
  }
}
