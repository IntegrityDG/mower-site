import { CUSTOMER_PAYMENT_METHODS, type CustomerPaymentMethod, type PaymentMethodSettings } from "./types";

type Dependencies = {
  isAdmin: () => Promise<boolean>;
  read: () => Promise<PaymentMethodSettings>;
  save: (method: CustomerPaymentMethod, enabled: boolean) => Promise<{ paymentMethod: CustomerPaymentMethod; enabled: boolean }>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createPaymentMethodAdminHandlers(dependencies: Dependencies) {
  return {
    async GET() {
      if (!(await dependencies.isAdmin())) return json({ error:"Unauthorized" }, 401);
      try { return json({ settings:await dependencies.read() }); }
      catch { return json({ error:"Payment method settings are unavailable." }, 503); }
    },
    async PATCH(request: Request) {
      if (!(await dependencies.isAdmin())) return json({ error:"Unauthorized" }, 401);
      const body = await request.json().catch(() => null) as { paymentMethod?: unknown; enabled?: unknown } | null;
      if (!body || typeof body.paymentMethod !== "string" || !CUSTOMER_PAYMENT_METHODS.includes(body.paymentMethod as CustomerPaymentMethod) || typeof body.enabled !== "boolean") return json({ error:"A supported payment method and boolean enabled value are required." }, 400);
      try { return json({ setting:await dependencies.save(body.paymentMethod as CustomerPaymentMethod, body.enabled) }); }
      catch { return json({ error:"Payment method setting could not be saved." }, 500); }
    },
  };
}
