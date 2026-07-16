"use client";

import { useMemo, useState } from "react";

import { priceLabel } from "@/lib/catalog/pricing";
import type {
  CatalogOption,
  CatalogOptionGroup,
  CatalogPackage,
  CatalogProduct,
  ProductBuildSelection,
} from "@/lib/catalog/types";

type ProductConfigurationProps = {
  product: CatalogProduct;
  selection: ProductBuildSelection;
  onSelectVariant: (variantId: string) => void;
  onSelectPackage: (packageId: string) => void;
  onChangeOptionQuantity: (optionId: string, quantity: number) => void;
};

const packageFilters = [
  { key: "all", label: "All Packages" },
  { key: "mower", label: "Mower" },
  { key: "pro", label: "Mower Pro" },
  { key: "snow", label: "Snow" },
  { key: "leaf", label: "Leaf" },
  { key: "trimmer", label: "Trimmer" },
] as const;

function packageMatchesFilter(catalogPackage: CatalogPackage, filter: string) {
  if (filter === "all") return true;

  const searchable = `${catalogPackage.name} ${catalogPackage.description ?? ""}`.toLowerCase();

  if (filter === "pro") return searchable.includes("pro");
  if (filter === "mower") {
    return searchable.includes("mower") && !searchable.includes("pro");
  }

  return searchable.includes(filter);
}

function quantityForOption(
  selection: ProductBuildSelection,
  option: CatalogOption
) {
  return selection.optionQuantities[option.id] ?? option.defaultQuantity ?? 0;
}

function clampQuantity(option: CatalogOption, value: number) {
  const minimum = Math.max(0, option.minimumQuantity);
  const maximum = option.maximumQuantity ?? Number.POSITIVE_INFINITY;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function groupAppliesToVariant(
  group: CatalogOptionGroup,
  selectedVariantSlug: string | null
) {
  if (group.slug.includes("m1500")) {
    return Boolean(selectedVariantSlug?.includes("m1500"));
  }

  if (group.slug.includes("m3000")) {
    return Boolean(selectedVariantSlug?.includes("m3000"));
  }

  return true;
}


function optionGroupIsBuiltIntoVariant(
  product: CatalogProduct,
  group: CatalogOptionGroup
) {
  return (
    product.slug === "lymow-one-plus" &&
    group.slug === "lymow-charger-config"
  );
}

function OptionPrice({ option }: { option: CatalogOption }) {
  return (
    <p className="mt-3 text-sm font-black text-emerald-700">
      {option.isIncluded ? "Included" : priceLabel(option)}
    </p>
  );
}

export default function ProductConfiguration({
  product,
  selection,
  onSelectVariant,
  onSelectPackage,
  onChangeOptionQuantity,
}: ProductConfigurationProps) {
  const [packageFilter, setPackageFilter] = useState("all");

  const selectedVariant =
    product.variants.find((variant) => variant.id === selection.variantId) ??
    null;
  const selectedPackage =
    product.packages.find(
      (catalogPackage) => catalogPackage.id === selection.packageId
    ) ?? null;

  const definingOptionIds = useMemo(
    () =>
      new Set(
        product.variants.flatMap((variant) => variant.definingOptionIds)
      ),
    [product.variants]
  );

  const packageIncludedOptionIds = useMemo(
    () =>
      new Set(
        selectedPackage?.items
          .filter((item) => item.includedInPackagePrice)
          .map((item) => item.optionId) ?? []
      ),
    [selectedPackage]
  );

  const filteredPackages = product.packages.filter((catalogPackage) =>
    packageMatchesFilter(catalogPackage, packageFilter)
  );

  function handleSingleGroupSelection(
    group: CatalogOptionGroup,
    option: CatalogOption
  ) {
    const currentQuantity = quantityForOption(selection, option);

    for (const groupOption of group.options) {
      onChangeOptionQuantity(groupOption.id, 0);
    }

    if (!group.isRequired && currentQuantity > 0) return;
    onChangeOptionQuantity(option.id, Math.max(1, option.minimumQuantity));
  }

  function renderSelectableOption(
    group: CatalogOptionGroup,
    option: CatalogOption
  ) {
    const quantity = quantityForOption(selection, option);
    const isSelected = quantity > 0;
    const isIncludedInPackage = packageIncludedOptionIds.has(option.id);

    if (group.selectionType === "quantity") {
      return (
        <div
          key={option.id}
          className={`rounded-2xl border p-5 ${
            isIncludedInPackage
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-300 bg-white"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h5 className="text-lg font-black text-slate-950">
                {option.name}
              </h5>
              <p className="mt-2 leading-6 text-slate-600">
                {option.description}
              </p>
              <OptionPrice option={option} />
            </div>

            {isIncludedInPackage ? (
              <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
                Included in Package
              </span>
            ) : (
              <div className="flex items-center rounded-2xl border border-slate-300 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() =>
                    onChangeOptionQuantity(
                      option.id,
                      clampQuantity(option, quantity - 1)
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-white text-xl font-black text-slate-950 shadow-sm"
                  aria-label={`Decrease ${option.name} quantity`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={option.minimumQuantity}
                  max={option.maximumQuantity ?? undefined}
                  value={quantity}
                  onChange={(event) =>
                    onChangeOptionQuantity(
                      option.id,
                      clampQuantity(option, Number(event.target.value))
                    )
                  }
                  className="w-16 bg-transparent text-center text-lg font-black text-slate-950 outline-none"
                  aria-label={`${option.name} quantity`}
                />
                <button
                  type="button"
                  onClick={() =>
                    onChangeOptionQuantity(
                      option.id,
                      clampQuantity(option, quantity + 1)
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-white text-xl font-black text-slate-950 shadow-sm"
                  aria-label={`Increase ${option.name} quantity`}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    const isSingle = group.selectionType === "single";

    return (
      <button
        key={option.id}
        type="button"
        disabled={isIncludedInPackage || option.isIncluded}
        onClick={() => {
          if (isSingle) {
            handleSingleGroupSelection(group, option);
            return;
          }

          onChangeOptionQuantity(option.id, isSelected ? 0 : 1);
        }}
        aria-pressed={isSelected || isIncludedInPackage || option.isIncluded}
        className={`rounded-2xl border p-5 text-left transition ${
          isIncludedInPackage || option.isIncluded
            ? "border-emerald-300 bg-emerald-50"
            : isSelected
              ? "border-emerald-700 bg-white shadow-lg"
              : "border-slate-300 bg-white hover:border-emerald-500 hover:shadow-md"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h5 className="text-lg font-black text-slate-950">{option.name}</h5>
            <p className="mt-2 leading-6 text-slate-600">
              {option.description}
            </p>
          </div>
          <span
            className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center border text-sm font-black ${
              isSingle ? "rounded-full" : "rounded-lg"
            } ${
              isSelected || isIncludedInPackage || option.isIncluded
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-slate-400 bg-white text-transparent"
            }`}
          >
            ✓
          </span>
        </div>
        <OptionPrice option={option} />
        {isIncludedInPackage && (
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            Already included in selected package
          </p>
        )}
      </button>
    );
  }

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Package, Module, and Accessory Selection
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Configure {product.name}.
      </h3>

      <p className="mt-4 max-w-4xl leading-7 text-slate-600">
        Select the main configuration or package first. Then review included
        equipment and add any compatible modules or accessories you want.
      </p>

      {product.variants.length > 0 && (
        <section className="mt-8 rounded-[2rem] border border-slate-300 bg-slate-50 p-5 md:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Required Configuration
              </p>
              <h4 className="mt-2 text-xl font-black text-slate-950">
                Choose one machine configuration
              </h4>
            </div>
            <span className="w-fit rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
              Required
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {product.variants.map((variant) => {
              const isSelected = variant.id === selection.variantId;

              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => onSelectVariant(variant.id)}
                  aria-pressed={isSelected}
                  className={`rounded-2xl border p-5 text-left transition ${
                    isSelected
                      ? "border-emerald-700 bg-white shadow-lg"
                      : "border-slate-300 bg-white hover:border-emerald-500 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h5 className="text-xl font-black text-slate-950">
                        {variant.name}
                      </h5>
                      <p className="mt-2 leading-6 text-slate-600">
                        {variant.description}
                      </p>
                    </div>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                        isSelected
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-slate-400 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </div>
                  <p className="mt-4 text-lg font-black text-emerald-700">
                    {priceLabel(variant)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {product.packages.length > 0 && (
        <section className="mt-8 rounded-[2rem] border border-slate-300 bg-slate-50 p-5 md:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Required Package
              </p>
              <h4 className="mt-2 text-xl font-black text-slate-950">
                Choose one complete package
              </h4>
              <p className="mt-2 leading-7 text-slate-600">
                Package pricing includes the base machine and every module
                listed inside the selected package.
              </p>
            </div>
            <span className="w-fit rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
              Required
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {packageFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setPackageFilter(filter.key)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  packageFilter === filter.key
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:border-emerald-500"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {filteredPackages.map((catalogPackage) => {
              const isSelected = catalogPackage.id === selection.packageId;

              return (
                <button
                  key={catalogPackage.id}
                  type="button"
                  onClick={() => onSelectPackage(catalogPackage.id)}
                  aria-pressed={isSelected}
                  className={`rounded-2xl border p-5 text-left transition ${
                    isSelected
                      ? "border-emerald-700 bg-white shadow-lg"
                      : "border-slate-300 bg-white hover:border-emerald-500 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h5 className="text-xl font-black text-slate-950">
                        {catalogPackage.name}
                      </h5>
                      <p className="mt-2 leading-6 text-slate-600">
                        {catalogPackage.description}
                      </p>
                    </div>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                        isSelected
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-slate-400 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </div>

                  {catalogPackage.items.length > 0 && (
                    <div className="mt-4 rounded-xl bg-slate-100 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Included Equipment
                      </p>
                      <div className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
                        <p>✓ Yarbo Core</p>
                        {catalogPackage.items.map((item) => (
                          <p key={`${catalogPackage.id}-${item.optionId}`}>
                            ✓ {item.option?.name ?? "Catalog option"}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="mt-4 text-xl font-black text-emerald-700">
                    {priceLabel(catalogPackage)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {selectedPackage && (
        <div className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Selected Package
          </p>
          <p className="mt-2 text-xl font-black text-slate-950">
            {selectedPackage.name} — {priceLabel(selectedPackage)}
          </p>
          <p className="mt-2 leading-7 text-slate-700">
            Modules already included in this package are marked below and will
            not be added to the price a second time.
          </p>
        </div>
      )}

      <div className="mt-8 space-y-6">
        {product.optionGroups
          .filter(
            (group) =>
              !optionGroupIsBuiltIntoVariant(product, group) &&
              groupAppliesToVariant(group, selectedVariant?.slug ?? null)
          )
          .map((group) => {
            const visibleOptions = group.options.filter(
              (option) => !definingOptionIds.has(option.id)
            );

            if (visibleOptions.length === 0) return null;

            if (group.selectionType === "included") {
              return (
                <section
                  key={group.id}
                  className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 md:p-7"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                    Included Equipment
                  </p>
                  <h4 className="mt-2 text-xl font-black text-slate-950">
                    {group.name}
                  </h4>
                  <p className="mt-2 leading-7 text-slate-600">
                    {group.description}
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {visibleOptions.map((option) => (
                      <div
                        key={option.id}
                        className="rounded-2xl border border-emerald-200 bg-white p-5"
                      >
                        <p className="font-black text-slate-950">
                          ✓ {option.name}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {option.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            }

            return (
              <section
                key={group.id}
                className="rounded-[2rem] border border-slate-300 bg-slate-50 p-5 md:p-7"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                      {group.isRequired ? "Required Selection" : "Available Options"}
                    </p>
                    <h4 className="mt-2 text-xl font-black text-slate-950">
                      {group.name}
                    </h4>
                    <p className="mt-2 leading-7 text-slate-600">
                      {group.description}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
                    {group.selectionType === "multiple"
                      ? "Choose Any"
                      : group.selectionType === "quantity"
                        ? "Choose Quantity"
                        : group.isRequired
                          ? "Choose One"
                          : "Optional"}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {visibleOptions.map((option) =>
                    renderSelectableOption(group, option)
                  )}
                </div>
              </section>
            );
          })}

        {product.ungroupedOptions.length > 0 && (
          <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-5 md:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Accessories and Replacement Items
            </p>
            <h4 className="mt-2 text-xl font-black text-slate-950">
              Add any additional equipment you need
            </h4>
            <p className="mt-2 leading-7 text-slate-600">
              Set the quantity to zero for anything you do not want included in
              the request.
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {product.ungroupedOptions.map((option) =>
                renderSelectableOption(
                  {
                    id: "ungrouped-accessories",
                    slug: "ungrouped-accessories",
                    name: "Accessories",
                    description: null,
                    selectionType: "quantity",
                    isRequired: false,
                    minimumSelections: 0,
                    maximumSelections: null,
                    sortOrder: 0,
                    options: product.ungroupedOptions,
                  },
                  option
                )
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
