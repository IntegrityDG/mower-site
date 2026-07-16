import { extractConservatively } from "./shared";
import type { ManufacturerAdapter } from "../types";
export const yarboAdapter: ManufacturerAdapter = { extract: (source, fetched) => extractConservatively(source, fetched, "Yarbo") };
