import "server-only";

import { isReviewAdmin } from "@/lib/reviews/admin-auth";

export async function requireDealerNetworkAdmin() {
  if (!(await isReviewAdmin())) throw new DealerNetworkAdminError();
}

export class DealerNetworkAdminError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "DealerNetworkAdminError";
  }
}
