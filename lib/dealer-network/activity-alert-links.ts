import { validateUuid } from "./validation";

export const DEALER_ACTIVITY_ALERT_LABELS = {
  board_topic: "New Dealer Network Board topic",
  board_comment: "New Dealer Network Board comment",
  board_reply: "New Dealer Network Board reply",
  troubleshooting_issue: "New Troubleshooting issue",
  troubleshooting_comment: "New Troubleshooting comment",
  troubleshooting_update: "New Troubleshooting author update",
} as const;

export type DealerActivityAlertKind = keyof typeof DEALER_ACTIVITY_ALERT_LABELS;

export function isDealerActivityAlertKind(value: unknown): value is DealerActivityAlertKind {
  return typeof value === "string" && Object.hasOwn(DEALER_ACTIVITY_ALERT_LABELS, value);
}

export function dealerActivityAlertLocation(input: {
  id: string;
  kind: DealerActivityAlertKind;
  sourceId: string;
  contextId: string;
}): string | null {
  if (!validateUuid(input.id) || !validateUuid(input.sourceId) || !validateUuid(input.contextId) ||
      !isDealerActivityAlertKind(input.kind)) return null;

  const params = new URLSearchParams();
  switch (input.kind) {
    case "board_topic":
      if (input.sourceId !== input.contextId) return null;
      params.set("boardTopic", input.contextId);
      break;
    case "board_comment":
    case "board_reply":
      params.set("boardTopic", input.contextId);
      params.set("boardActivity", input.sourceId);
      params.set("activityAlert", input.id);
      break;
    default:
      params.set("troubleshootingEntry", input.contextId);
      if (input.kind !== "troubleshooting_issue") params.set("troubleshootingActivity", input.sourceId);
      else if (input.sourceId !== input.contextId) return null;
      params.set("activityAlert", input.id);
  }
  return `/dealer-tech-resources/member?${params}`;
}
