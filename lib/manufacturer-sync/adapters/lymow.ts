import { extractConservatively } from "./shared";
import type { ManufacturerAdapter } from "../types";
export const lymowAdapter: ManufacturerAdapter = { extract: (source, fetched) => extractConservatively(source, fetched, "Lymow") };
