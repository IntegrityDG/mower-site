import type { ManagedCatalogItem, ManagedPackage } from './types';

/** Deliberately excludes pricing, availability, identity, and package contents. */
export function catalogImageUpdate(item: Pick<ManagedCatalogItem | ManagedPackage, 'updatedAt'>, imageUrl: string) {
  return { expectedUpdatedAt: item.updatedAt, values: { image_url: imageUrl.trim() || null } };
}
