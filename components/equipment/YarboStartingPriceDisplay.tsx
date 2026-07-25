"use client";

import { useEffect, useState } from "react";

import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import type { CatalogProduct } from "@/lib/catalog/types";

import YarboPriceDisplay from "./YarboPriceDisplay";

type YarboStartingPriceDisplayProps = {
  product?: CatalogProduct;
  className?: string;
  priceClassName?: string;
  labelClassName?: string;
  regularClassName?: string;
};

export default function YarboStartingPriceDisplay({
  product,
  className,
  priceClassName,
  labelClassName,
  regularClassName,
}: YarboStartingPriceDisplayProps) {
  const [homepageProduct, setHomepageProduct] = useState<
    CatalogProduct | undefined
  >();

  useEffect(() => {
    if (product) return;

    const controller = new AbortController();

    fetchCatalog({ signal: controller.signal })
      .then((catalog) => {
        setHomepageProduct(
          catalog.products.find((item) => item.slug === "yarbo")
        );
      })
      .catch(() => {
        // The homepage remains usable if catalog pricing is temporarily unavailable.
      });

    return () => controller.abort();
  }, [product]);

  const item = product ?? homepageProduct;

  if (!item) {
    return (
      <p className={`${className ?? ""} text-sm font-bold text-slate-500`.trim()}>
        Pricing unavailable
      </p>
    );
  }

  return (
    <YarboPriceDisplay
      item={item}
      className={className}
      priceClassName={priceClassName}
      labelClassName={labelClassName}
      regularClassName={regularClassName}
    />
  );
}
