import type { SalesSpecialsConfig } from "./config";
import { validateSalesSpecials } from "./validation";

type Dependencies = {
  isAdmin: () => Promise<boolean>;
  read: () => Promise<SalesSpecialsConfig | null>;
  save: (config: SalesSpecialsConfig) => Promise<SalesSpecialsConfig>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

export function createSalesSpecialsAdminHandlers(dependencies: Dependencies) {
  return {
    async GET() {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      try {
        const promotion = await dependencies.read();
        return promotion ? json({ promotion }) : json({ error: "Settings are unavailable." }, 503);
      } catch {
        return json({ error: "Settings are unavailable." }, 503);
      }
    },
    async PUT(request: Request) {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      const parsed = validateSalesSpecials(await request.json().catch(() => null));
      if (!parsed.ok) return json({ errors: parsed.errors }, 400);
      try {
        return json({ promotion: await dependencies.save(parsed.value), success: true });
      } catch {
        return json({ error: "Sales & Specials settings could not be saved." }, 500);
      }
    },
  };
}
