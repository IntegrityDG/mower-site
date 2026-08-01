import "server-only";
import { getStripeServerClient } from "./server";

export async function resolveWireStripeCustomer(input: { internalCustomerId: string; existingStripeCustomerId: string | null; name: string; email: string | null; idempotencyKey: string }) {
  if (input.existingStripeCustomerId) return input.existingStripeCustomerId;
  const customer = await getStripeServerClient().customers.create({ name: input.name, ...(input.email ? { email: input.email } : {}), metadata: { ids_customer_id: input.internalCustomerId } }, { idempotencyKey: `${input.idempotencyKey}:customer` });
  return customer.id;
}
