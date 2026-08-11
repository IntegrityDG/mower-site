import { validatePriceMatch, type PriceMatchConfig } from "./config";

type Dependencies = { isAdmin: () => Promise<boolean>; read: () => Promise<PriceMatchConfig | null>; save: (config: PriceMatchConfig) => Promise<PriceMatchConfig> };
const json = (body: unknown, status = 200) => Response.json(body, { status });

export function createPriceMatchAdminHandlers(dependencies: Dependencies) {
  return {
    async GET() {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      try { const settings = await dependencies.read(); return settings ? json({ settings }) : json({ error: "Settings are unavailable." }, 503); } catch { return json({ error: "Settings are unavailable." }, 503); }
    },
    async PUT(request: Request) {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      const parsed = validatePriceMatch(await request.json().catch(() => null));
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      try { return json({ settings: await dependencies.save(parsed.value), success: true }); } catch { return json({ error: "Meet or Beat settings could not be saved." }, 500); }
    },
  };
}
