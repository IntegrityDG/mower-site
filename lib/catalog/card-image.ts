import { yarboComponentContent } from "@/components/equipment/yarboBrochureContent";
import { pandagModelContent } from "@/components/equipment/pandagBrochureContent";
/** Ordinary product imagery only. Promotion creative is never an image fallback. */
export type CatalogCardImageValue = { src: string | null; alt: string };
type ImageRecord = { optionGroupId?: string | null; definingOptionIds?: string[]; slug?: string; name?: string; imageUrl?: string | null; imageAlt?: string | null; accessoryImageUrl?: string | null; accessoryImageAlt?: string | null; publicPromotion?: unknown; corePrices?: ImageRecord[]; variants?: ImageRecord[]; packages?: ImageRecord[]; optionGroups?: { options: ImageRecord[] }[]; ungroupedOptions?: ImageRecord[] };
export function safeCatalogImageUrl(value: unknown): string | null {
  const url = typeof value === 'string' ? value.trim() : null;
  if (!url || /[\\\u0000-\u001f\u007f]/.test(url)) return null;
  try {
    const relative = url.startsWith('/') && !url.startsWith('//');
    const parsed = new URL(url, relative ? 'https://catalog.invalid' : undefined);
    if ((!relative && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.hash) return null;
    const host = parsed.hostname.toLowerCase();
    if (!relative && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('['))) return null;
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    if (/[\\\u0000-\u001f\u007f]/.test(path) || path.startsWith('//')) return null;
    if (/(^|\/)(api|admin|auth|login|signin|sign-in|sign|signed|private|authenticated)(\/|$)/.test(path)) return null;
    if ([...parsed.searchParams.keys()].some(key => /token|signature|credential|secret|password|authorization|(?:^|[-_])(?:auth|key|sig)(?:$|[-_])|^x-amz-|^x-goog-/i.test(key))) return null;
    return url;
  } catch { return null; }
}
export function hasCatalogPromotion(item: ImageRecord | undefined): boolean {
  return Boolean(item && (item.publicPromotion || item.corePrices?.some(hasCatalogPromotion) || item.variants?.some(hasCatalogPromotion) || item.packages?.some(hasCatalogPromotion) || item.ungroupedOptions?.some(hasCatalogPromotion) || item.optionGroups?.some(group => group.options.some(hasCatalogPromotion))));
}
export function catalogCardImage(item: ImageRecord, parent?: ImageRecord, fallback?: { src: string; alt: string }): CatalogCardImageValue | null {
  // Keep newly introduced ordinary imagery separate from active promotion cards.
  if (hasCatalogPromotion(item) || hasCatalogPromotion(parent)) return null;
  const exact = item.slug && 'optionGroupId' in item && parent?.slug === 'yarbo' ? yarboComponentContent[item.slug]?.image : item.slug && 'definingOptionIds' in item && parent?.slug === 'pandag-g1' ? pandagModelContent[item.slug as keyof typeof pandagModelContent]?.image : undefined;
  fallback ??= exact && parent?.slug === 'yarbo' ? {src: exact.src, alt: `${item.slug === 'yarbo-trimmer-module' ? 'Yarbo Trimmer Module' : item.name || 'Yarbo module'}, shown attached to a Yarbo Core`} : exact;
  return { src: safeCatalogImageUrl(item.imageUrl ?? item.accessoryImageUrl) ?? safeCatalogImageUrl(fallback?.src), alt: item.imageAlt?.trim() || item.accessoryImageAlt?.trim() || fallback?.alt || item.name || 'Product image' };
}
