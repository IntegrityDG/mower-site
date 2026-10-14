import { isPricingKind, isUuid, validatePricingDateWindow, validatePricingPatch } from "./validation";
import type { PricingCatalog, PricingItem } from "./types";
import { Y40_RELATIONSHIP_VISIBILITY_FIELDS } from "./y40-package-controls";

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
      const { expectedUpdatedAt, expectedCoreAvailabilityUpdatedAt, core_show_public_price, core_contact_for_pricing, ...patch } = input as Record<string, unknown>;
      const relationshipPatch: Record<string, unknown> = {};
      for (const field of Y40_RELATIONSHIP_VISIBILITY_FIELDS) {
        if (!(field in input)) continue;
        const value = field === "core_show_public_price" ? core_show_public_price : core_contact_for_pricing;
        if (kind !== "packages" || typeof value !== "boolean") return json({ error: `${field} must be a boolean on a Y40 package relationship.` }, 422);
        relationshipPatch[field] = value;
      }
      const hasRelationshipPatch = Object.keys(relationshipPatch).length > 0;
      const parsed = Object.keys(patch).length || !hasRelationshipPatch
        ? validatePricingPatch(kind, patch) : { ok: true as const, value: {} as Record<string, unknown> };
      if (!parsed.ok) return json({ error: parsed.error }, 422);
      try {
        const existing = await deps.readValues(kind, id);
        if (!existing) return json({ error: "Pricing record not found." }, 404);
        if (hasRelationshipPatch && typeof existing.core_availability_expected_updated_at !== "string") return json({ error: "This package has no editable Y40 relationship." }, 422);
        const storedVersion = typeof existing.updated_at === "string" ? existing.updated_at : null;
        if (storedVersion && (typeof expectedUpdatedAt !== "string" || Number.isNaN(new Date(expectedUpdatedAt).getTime()))) return json({ error: "A valid expectedUpdatedAt version is required. Reload this item and try again." }, 422);
        const dateError = validatePricingDateWindow(kind, { ...existing, ...parsed.value });
        if (dateError) return json({ error: dateError }, 422);
        if (storedVersion && storedVersion !== expectedUpdatedAt) return json({ error: "Pricing record changed after you opened it. Reload the item and review the newer values before saving." }, 409);
        if (("public_status" in parsed.value || hasRelationshipPatch) && typeof existing.core_availability_expected_updated_at === "string") {
          if (existing.core_availability_expected_updated_at !== expectedCoreAvailabilityUpdatedAt) return json({ error: "Pricing record changed: Core availability changed after you opened it. Reload before saving." }, 409);
          parsed.value.core_availability_expected_updated_at = expectedCoreAvailabilityUpdatedAt;
        }
        Object.assign(parsed.value, relationshipPatch);
        return json({ item: await deps.update(kind, id, parsed.value, typeof expectedUpdatedAt === "string" ? expectedUpdatedAt : ""), success: true });
      }
      catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "Pricing record not found.") return json({ error: message }, 404);
        if (message.startsWith("Pricing record changed") || message.startsWith("Catalog changed") || message.startsWith("Core availability changed")) return json({ error: message }, 409);
        return json({ error: "Pricing update failed." }, 500);
      }
    },
  };
}
