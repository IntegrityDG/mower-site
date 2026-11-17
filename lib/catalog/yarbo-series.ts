import type { CatalogProduct } from "./types";

export type YarboSeries = "Y Series" | "M Series" | "C Series" | "Other Yarbo Equipment";
const existingYSeries = new Set([
  "yarbo", "yarbo-pac-man-snow-blower-gen-2", "yarbo-pac-man-snow-blower-gen-2-mower-pro",
  "yarbo-refurbished-y40-snow-blower-lawn-mower", "yarbo-refurbished-y40-snow-blower",
  "yarbo-refurbished-y40-lawn-mower", "yarbo-refurbished-core",
]);

/** Navigation only. Unknown models remain visible, never guessed into a series. */
export function yarboSeriesForProduct(product: Pick<CatalogProduct, "slug" | "name">): YarboSeries {
  if (existingYSeries.has(product.slug)) return "Y Series";
  const text = `${product.name} ${product.slug.replaceAll("-", " ")}`;
  const series = text.match(/\b([YMC])\s+Series\b/i)?.[1]
    ?? text.match(/\b([YMC])\d{1,3}[A-Z]?\b/i)?.[1];
  return series ? `${series.toUpperCase()} Series` as YarboSeries : "Other Yarbo Equipment";
}

export const yarboSeriesOrder: readonly YarboSeries[] = ["Y Series", "M Series", "C Series", "Other Yarbo Equipment"];
