"use client";
import { useState } from 'react';
import type { CatalogCardImageValue } from '@/lib/catalog/card-image';

function ImageSlot({ image, className }: { image: CatalogCardImageValue; className: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={`mb-4 flex aspect-[4/3] min-w-0 w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100 ${className}`}>
    {image.src && !failed ? (
      // Plain images support catalog-admin public CDN URLs without a server-side fetch proxy.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image.src} alt={image.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain p-3" />
    ) : <span className="px-4 text-center text-sm font-medium text-slate-500">Image unavailable for {image.alt}</span>}
  </span>;
}
/** A changed saved URL gets a fresh load, including returning to a previously failed URL. */
export default function CatalogCardImage({ image, className = '' }: { image: CatalogCardImageValue | null; className?: string }) {
  return image ? <ImageSlot key={image.src ?? 'missing'} image={image} className={className}/> : null;
}
