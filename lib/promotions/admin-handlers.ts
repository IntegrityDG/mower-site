import { isSalesSpecialsSlot, type SalesSpecialsConfig, type SalesSpecialsSlot, type SalesSpecialsSlots } from "./config";
import { validateSalesSpecials } from "./validation";

type Dependencies = {
  isAdmin: () => Promise<boolean>;
  read: () => Promise<SalesSpecialsSlots | null>;
  save: (slot: SalesSpecialsSlot, config: SalesSpecialsConfig) => Promise<SalesSpecialsConfig>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

export function createSalesSpecialsAdminHandlers(dependencies: Dependencies) {
  return {
    async GET() {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      try {
        const promotions = await dependencies.read();
        return promotions ? json({ promotions }) : json({ error: "Settings are unavailable." }, 503);
      } catch {
        return json({ error: "Settings are unavailable." }, 503);
      }
    },
    async PUT(request: Request) {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      const body = await request.json().catch(() => null);
      if (!body || !isSalesSpecialsSlot(body.slot)) return json({ error: "Invalid promotion slot." }, 400);
      const parsed = validateSalesSpecials(body.promotion);
      if (!parsed.ok) return json({ errors: parsed.errors }, 400);
      try {
        return json({ slot: body.slot, promotion: await dependencies.save(body.slot, parsed.value), success: true });
      } catch {
        return json({ error: "Sales & Specials settings could not be saved." }, 500);
      }
    },
  };
}
