import { isUuid, validatePricingPatch } from "./validation";

export type PackageCorePriceAdminRow = {
  id: string;
  packageId: string;
  packageName: string;
  coreVariantId: string;
  coreName: string;
  coreStatus: string;
  priceMode: "package" | "core_specific";
  regularPriceCents: number | null;
  salePriceCents: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  promotionLabel: string | null;
  showPublicPrice: boolean;
  contactForPricing: boolean;
  publicStatus: string;
  effectivePriceCents?: number | null;
  checkoutPriceCents?: number | null;
  saleState?: "none" | "upcoming" | "active" | "ended";
  sourceLabel?: string;
  explanation?: string;
  updatedAt?: string;
  pricingProgramEnabled?: boolean;
};

const editable = new Set([
  "regular_price_cents", "sale_price_cents", "sale_starts_at", "sale_ends_at",
  "promotion_label", "show_public_price", "contact_for_pricing", "public_status",
]);

export function validatePackageCorePricePatch(input: unknown, existing: Record<string, unknown>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false as const, error: "A JSON object is required." };
  }
  const body = input as Record<string, unknown>;
  const unknown = Object.keys(body).find((key) => !editable.has(key));
  if (unknown) return { ok: false as const, error: `Unknown property: ${unknown}.` };
  const parsed = validatePricingPatch("packages", body);
  if (!parsed.ok) return parsed;
  const next = { ...existing, ...parsed.value };
  if (next.regular_price_cents === null) return { ok: false as const, error: "A Core-specific regular price is required." };
  if (next.sale_price_cents !== null && (!next.sale_starts_at || !next.sale_ends_at)) {
    return { ok: false as const, error: "A temporary sale requires a start and end date." };
  }
  if (next.sale_price_cents === null && (next.sale_starts_at || next.sale_ends_at)) {
    return { ok: false as const, error: "Clear sale dates when removing a temporary sale." };
  }
  if (next.sale_starts_at && next.sale_ends_at && new Date(String(next.sale_starts_at)) >= new Date(String(next.sale_ends_at))) {
    return { ok: false as const, error: "Sale start must be before sale end." };
  }
  return parsed;
}

type Dependencies = {
  isAdmin: () => Promise<boolean>;
  read: () => Promise<PackageCorePriceAdminRow[]>;
  readValues: (id: string) => Promise<Record<string, unknown> | null>;
  update: (id: string, patch: Record<string, unknown>, expectedUpdatedAt: string) => Promise<PackageCorePriceAdminRow>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createPackageCorePriceAdminHandlers(deps: Dependencies) {
  return {
    async GET() {
      if (!(await deps.isAdmin())) return json({ error: "Unauthorized" }, 401);
      try { return json({ rows: await deps.read() }); }
      catch { return json({ error: "Package/Core pricing is unavailable." }, 503); }
    },
    async PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
      if (!(await deps.isAdmin())) return json({ error: "Unauthorized" }, 401);
      const { id } = await context.params;
      if (!isUuid(id)) return json({ error: "Invalid record id." }, 400);
      const input = await request.json().catch(() => null);
      try {
        const existing = await deps.readValues(id);
        if (!existing) return json({ error: "Core-specific price was not found." }, 404);
        if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "A JSON object is required." }, 422);
        const { expectedUpdatedAt, ...patch } = input as Record<string, unknown>;
        const storedVersion = typeof existing.updated_at === "string" ? existing.updated_at : null;
        if (storedVersion && (typeof expectedUpdatedAt !== "string" || storedVersion !== expectedUpdatedAt)) return json({ error: "Pricing record changed after you opened it. Reload and review the newer values before saving." }, 409);
        const parsed = validatePackageCorePricePatch(patch, existing);
        if (!parsed.ok) return json({ error: parsed.error }, 422);
        return json({ row: await deps.update(id, parsed.value, typeof expectedUpdatedAt === "string" ? expectedUpdatedAt : "") });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.startsWith("Pricing record changed")) return json({ error: message }, 409);
        return json({ error: "Package/Core pricing update failed." }, 503);
      }
    },
  };
}
