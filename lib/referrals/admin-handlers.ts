import { hasQualificationConfirmations } from "./admin";
import type { AdminReferral } from "./admin";

type Dependencies = {
  isAdmin: () => Promise<boolean>;
  list: () => Promise<AdminReferral[]>;
  mutate: (id: string, action: string, reason: string | null) => Promise<AdminReferral>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createReferralAdminHandlers(dependencies: Dependencies) {
  return {
    async GET() {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      try { return json({ referrals: await dependencies.list() }); }
      catch { return json({ error: "Referral records are unavailable." }, 503); }
    },
    async PATCH(request: Request, id: string) {
      if (!(await dependencies.isAdmin())) return json({ error: "Unauthorized" }, 401);
      if (!uuid.test(id)) return json({ error: "Invalid referral identifier." }, 400);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const action = typeof body?.action === "string" ? body.action : "";
      if (!["qualify", "paid", "disqualify", "restore"].includes(action)) return json({ error: "Invalid referral action." }, 400);
      if (action === "qualify" && !hasQualificationConfirmations(body?.confirmations)) return json({ error: "All eligibility confirmations are required before qualification." }, 400);
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      if (action === "disqualify" && !reason) return json({ error: "A disqualification reason is required." }, 400);
      if (reason.length > 500) return json({ error: "The disqualification reason is too long." }, 400);
      try { return json({ referral: await dependencies.mutate(id, action, reason || null), success: true }); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Referral update failed." }, 409); }
    },
  };
}
