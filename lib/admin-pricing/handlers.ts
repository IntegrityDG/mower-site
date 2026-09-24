import { isPricingKind, isUuid, validatePricingDateWindow, validatePricingPatch } from "./validation";
import type { PricingCatalog, PricingItem } from "./types";

type Dependencies = { isAdmin: () => Promise<boolean>; read: () => Promise<PricingCatalog>; readValues: (kind: Parameters<typeof validatePricingPatch>[0], id: string) => Promise<Record<string, unknown> | null>; update: (kind: Parameters<typeof validatePricingPatch>[0], id: string, values: Record<string, unknown>, expectedUpdatedAt: string) => Promise<PricingItem> };
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
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "A JSON object is required." }, 422);
      const { expectedUpdatedAt, ...patch } = input as Record<string, unknown>;
      const parsed = validatePricingPatch(kind, patch);
      if (!parsed.ok) return json({ error: parsed.error }, 422);
      try {
        const existing = await deps.readValues(kind, id);
        if (!existing) return json({ error: "Pricing record not found." }, 404);
        const storedVersion = typeof existing.updated_at === "string" ? existing.updated_at : null;
        if (storedVersion && (typeof expectedUpdatedAt !== "string" || Number.isNaN(new Date(expectedUpdatedAt).getTime()))) return json({ error: "A valid expectedUpdatedAt version is required. Reload this item and try again." }, 422);
        const dateError = validatePricingDateWindow(kind, { ...existing, ...parsed.value });
        if (dateError) return json({ error: dateError }, 422);
        if (storedVersion && storedVersion !== expectedUpdatedAt) return json({ error: "Pricing record changed after you opened it. Reload the item and review the newer values before saving." }, 409);
        return json({ item: await deps.update(kind, id, parsed.value, typeof expectedUpdatedAt === "string" ? expectedUpdatedAt : ""), success: true });
      }
      catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "Pricing record not found.") return json({ error: message }, 404);
        if (message.startsWith("Pricing record changed")) return json({ error: message }, 409);
        return json({ error: "Pricing update failed." }, 500);
      }
    },
  };
}
