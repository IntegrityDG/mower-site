import type { ReviewStatus } from "./types";
export function moderationUpdate(current: ReviewStatus, action: "approve"|"reject"|"hide"|"restore", now: string) {
  if (action === "approve" && current === "pending") return { status: "approved" as const, published_at: now, moderated_at: now };
  if (action === "reject" && current === "pending") return { status: "rejected" as const, moderated_at: now };
  if (action === "hide" && current === "approved") return { status: "hidden" as const, moderated_at: now };
  if (action === "restore" && current === "hidden") return { status: "approved" as const, moderated_at: now };
  return null;
}
