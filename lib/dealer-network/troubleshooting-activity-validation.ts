import { validateTroubleshootingEntry } from "./troubleshooting-validation";
import type { TroubleshootingTextFields } from "./types";

export const TROUBLESHOOTING_COMMENT_LIMIT = 5;
export const TROUBLESHOOTING_COMMENT_LENGTH = 250;
export const TROUBLESHOOTING_UPDATE_LENGTH = 1_000;

export const troubleshootingTextFields = {
  title: "title",
  brand: "brand",
  model: "model",
  issueDate: "issue_date",
  firmwareSoftwareVersion: "firmware_software_version",
  systemArea: "system_area",
  badPart: "bad_part",
  issueDescription: "issue_description",
  fixDescription: "fix_description",
} as const satisfies Record<keyof TroubleshootingTextFields, string>;

const fields = Object.entries(troubleshootingTextFields) as [
  keyof TroubleshootingTextFields,
  (typeof troubleshootingTextFields)[keyof TroubleshootingTextFields],
][];

export function troubleshootingCharacterCount(value: string) {
  return Array.from(value).length;
}

function record(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null;
}

export function validateTroubleshootingTextEdit(input: unknown) {
  const data = record(input);
  if (!data || Object.keys(data).length !== fields.length ||
    fields.some(([key]) => !Object.hasOwn(data, key))) return null;
  const edit = validateTroubleshootingEntry(data);
  if (!edit || fields.some(([key]) => edit[key]?.includes("\u0000"))) return null;
  return Object.fromEntries(fields.map(([key, column]) => [column, edit[key]]));
}

export function troubleshootingTextFromDatabase(input: unknown): TroubleshootingTextFields | null {
  const data = record(input);
  if (!data) return null;
  const decoded: Record<string, string | null> = {};
  for (const [key, column] of fields) {
    const value = data[column];
    if (typeof value !== "string" && !(key === "badPart" && value === null)) return null;
    decoded[key] = value;
  }
  return decoded as TroubleshootingTextFields;
}

export function validateTroubleshootingActivity(input: unknown) {
  const data = record(input);
  if (!data || Object.keys(data).length !== 2 ||
    (data.kind !== "update" && data.kind !== "comment") || typeof data.body !== "string") return null;
  const body = data.body.trim();
  // PostgreSQL char_length and this counter both count Unicode code points.
  const limit = data.kind === "comment" ? TROUBLESHOOTING_COMMENT_LENGTH : TROUBLESHOOTING_UPDATE_LENGTH;
  return body && !body.includes("\u0000") && troubleshootingCharacterCount(body) <= limit ? { kind: data.kind, body } as const : null;
}
