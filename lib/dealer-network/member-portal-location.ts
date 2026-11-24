import { validateUuid } from "./validation";

export type MemberPortalSelection = {
  boardTopicId: string | null;
  boardActivityId: string | null;
  troubleshootingEntryId: string | null;
  troubleshootingActivityId: string | null;
  activityAlertId: string | null;
};

export function readMemberPortalSelection(params: Record<string, unknown>): MemberPortalSelection {
  const troubleshootingEntryId = validateUuid(params.troubleshootingEntry);
  const boardTopicId = troubleshootingEntryId ? null : validateUuid(params.boardTopic);
  const boardActivityId = boardTopicId ? validateUuid(params.boardActivity) : null;
  return {
    boardTopicId,
    boardActivityId,
    troubleshootingEntryId,
    troubleshootingActivityId: troubleshootingEntryId ? validateUuid(params.troubleshootingActivity) : null,
    activityAlertId: boardActivityId || troubleshootingEntryId ? validateUuid(params.activityAlert) : null,
  };
}

export function memberPortalLocation(
  page: "login" | "member",
  selection: Partial<MemberPortalSelection>,
) {
  const resolved = readMemberPortalSelection({
    boardTopic: selection.boardTopicId,
    boardActivity: selection.boardActivityId,
    troubleshootingEntry: selection.troubleshootingEntryId,
    troubleshootingActivity: selection.troubleshootingActivityId,
    activityAlert: selection.activityAlertId,
  });
  const params = new URLSearchParams();
  if (resolved.boardTopicId) params.set("boardTopic", resolved.boardTopicId);
  if (resolved.boardActivityId) params.set("boardActivity", resolved.boardActivityId);
  if (resolved.troubleshootingEntryId) params.set("troubleshootingEntry", resolved.troubleshootingEntryId);
  if (resolved.troubleshootingActivityId) params.set("troubleshootingActivity", resolved.troubleshootingActivityId);
  if (resolved.activityAlertId) params.set("activityAlert", resolved.activityAlertId);
  return `/dealer-tech-resources/${page}${params.size ? `?${params}` : ""}`;
}
