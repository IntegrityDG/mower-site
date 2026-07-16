import { extractConservatively } from "./shared";
import type { ManufacturerAdapter } from "../types";
export const pandagAdapter: ManufacturerAdapter = { extract: (source, fetched) => extractConservatively(source, fetched, "Pandag") };
