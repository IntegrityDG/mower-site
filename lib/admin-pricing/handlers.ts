import { isPricingKind, isUuid, validatePricingPatch } from "./validation";
import type { PricingCatalog, PricingItem } from "./types";

type Dependencies = { isAdmin: () => Promise<boolean>; read: () => Promise<PricingCatalog>; update: (kind: Parameters<typeof validatePricingPatch>[0], id: string, values: Record<string, unknown>) => Promise<PricingItem> };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createPricingAdminHandlers(deps: Dependencies) {
  return {
    async GET() {
      if (!(await deps.isAdmin())) return json({ error: "Unauthorized" }, 401);
      try { return json(await deps.read()); } catch { return json({ error: "Pricing catalog is unavailable." }, 503); }
    },
    async PATCH(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
      if (!(await deps.isAdmin())) return json({ error: "Unauthorized" }, 401);
      const { kind, id } = await context.params;
      if (!isPricingKind(kind)) return json({ error: "Unknown pricing record kind." }, 400);
      if (!isUuid(id)) return json({ error: "Invalid record id." }, 400);
      const parsed = validatePricingPatch(kind, await request.json().catch(() => null));
      if (!parsed.ok) return json({ error: parsed.error }, 422);
      try { return json({ item: await deps.update(kind, id, parsed.value), success: true }); }
      catch (error) { return json({ error: error instanceof Error && error.message === "Pricing record not found." ? error.message : "Pricing update failed." }, error instanceof Error && error.message === "Pricing record not found." ? 404 : 500); }
    },
  };
}
