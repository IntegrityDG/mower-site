import { type TickerConfig, type TickerRecord, validateTickerConfig } from "./ticker";

type Dependencies = {
  isAdmin: () => Promise<boolean>;
  read: () => Promise<TickerRecord | null>;
  save: (ticker: TickerConfig, revision: number) => Promise<TickerRecord | null>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createTickerAdminHandlers(dependencies: Dependencies) {
  return {
    async GET() {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      try {
        const record = await dependencies.read();
        return record ? json(record) : json({ error: "Ticker settings are unavailable." }, 503);
      } catch {
        return json({ error: "Ticker settings are unavailable." }, 503);
      }
    },
    async PUT(request: Request) {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      const body = await request.json().catch(() => null);
      if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0) return json({ error: "A valid saved ticker revision is required. Reload settings and try again." }, 400);
      const parsed = validateTickerConfig(body.ticker);
      if (!parsed.ok) return json({ errors: parsed.errors }, 400);
      try {
        const record = await dependencies.save(parsed.value, body.revision);
        return record ? json({ ...record, success: true }) : json({ error: "Ticker changed in another Admin session. Reload settings before saving again." }, 409);
      } catch {
        return json({ error: "Homepage Sales Ticker settings could not be saved." }, 500);
      }
    },
  };
}
