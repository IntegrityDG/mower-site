"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import type {
  CatalogPrice,
  CatalogProduct,
  CatalogVariant,
} from "@/lib/catalog/types";

import EverydayPriceDisplay from "./EverydayPriceDisplay";

type LymowPriceDisplayProps = {
  product?: CatalogProduct;
  variant?: CatalogVariant;
  className?: string;
  priceClassName?: string;
  labelClassName?: string;
  regularClassName?: string;
};

function lowestPricedVariant(product: CatalogProduct | undefined) {
  return product?.variants.reduce<CatalogVariant | null>((lowest, candidate) => {
    if (candidate.currentPriceCents === null) return lowest;
    if (!lowest || lowest.currentPriceCents === null) return candidate;

    return candidate.currentPriceCents < lowest.currentPriceCents
      ? candidate
      : lowest;
  }, null);
}

export default function LymowPriceDisplay({
  product,
  variant,
  className,
  priceClassName,
  labelClassName,
  regularClassName,
}: LymowPriceDisplayProps) {
  const [homepageProduct, setHomepageProduct] = useState<
    CatalogProduct | undefined
  >();

  useEffect(() => {
    if (product || variant) return;

    const controller = new AbortController();

    fetchCatalog({ signal: controller.signal })
      .then((catalog) => {
        setHomepageProduct(
          catalog.products.find((item) => item.slug === "lymow-one-plus")
        );
      })
      .catch(() => {
        // The homepage remains usable if catalog pricing is temporarily unavailable.
      });

    return () => controller.abort();
  }, [product, variant]);

  const item = useMemo<CatalogPrice | null>(
    () => variant ?? lowestPricedVariant(product ?? homepageProduct) ?? null,
    [homepageProduct, product, variant]
  );

  if (!item) {
    return (
      <p className={`${className ?? ""} text-sm font-bold text-slate-500`.trim()}>
        Pricing unavailable
      </p>
    );
  }

  return (
    <EverydayPriceDisplay
      item={item}
      comparisonLabel="Lymow Everyday Price"
      className={className}
      priceClassName={priceClassName}
      labelClassName={labelClassName}
      regularClassName={regularClassName}
    />
  );
}
