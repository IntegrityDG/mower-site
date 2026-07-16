import type { ExtractedValue } from "./types";

function normalized(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }

export function compareValue(candidate: ExtractedValue, current: Record<string, unknown>) {
  const column = candidate.field === "name"
    ? "name"
    : candidate.field === "short_description"
      ? ("homepage_summary" in current ? "homepage_summary" : "description")
      : undefined;
  const currentValue = column ? current[column] : null;
  if (normalized(currentValue) === normalized(candidate.value)) return null;
  return { fieldName: column ?? candidate.field, currentValue: currentValue === null || currentValue === undefined ? null : String(currentValue), suggestedValue: candidate.value };
}
