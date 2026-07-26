import { extractConservatively } from "./shared";
import type { ManufacturerAdapter } from "../types";
import { validatePandagCandidate, validatePandagSourceTarget } from "../pandag-policy";

export const pandagAdapter: ManufacturerAdapter = {
  extract: (source, fetched) => {
    const scope = validatePandagSourceTarget(source);
    const extracted = extractConservatively(source, fetched, "Pandag");
    const values = [] as typeof extracted.values;
    const notes = [...extracted.notes];
    for (const candidate of extracted.values) {
      const validation = validatePandagCandidate(source, candidate);
      if (validation.accepted && validation.value) values.push(validation.value);
      else notes.push(`Rejected ${candidate.field} candidate for ${scope}: ${validation.reason}`);
    }
    return { values, notes };
  },
};
