"use client";

import { useMemo, useState } from "react";

import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import EverydayPriceDisplay from "@/components/equipment/EverydayPriceDisplay";
import { priceLabel } from "@/lib/catalog/pricing";
import { catalogPackageIsAvailable } from "@/lib/catalog/availability";
import {
  builderAccessoryOptions,
  customerFacingGroupOptions,
  customerFacingUngroupedOptions,
} from "@/lib/catalog/customer-facing-options";
import type {
  CatalogOption,
  CatalogOptionGroup,
  CatalogPackage,
  CatalogProduct,
  ProductBuildSelection,
} from "@/lib/catalog/types";
import {
  YARBO_CORE_ABSENT_NOTICE,
  YARBO_CORE_EQUIPMENT_DESCRIPTION,
  YARBO_INCLUDED_PLATFORM_EQUIPMENT,
  YARBO_MODULE_ONLY_NOTICE,
  YARBO_PACKAGE_GROUPS,
  groupYarboPackages,
  isYarboProduct,
  selectedYarboIndividualModules,
  yarboCoreIsSelected,
  yarboIndividualModules,
  yarboOptionDisplayName,
  yarboPackageBestFit,
  yarboPackageDisplayName,
  yarboPackageModuleNames,
  yarboPackageMowerType,
  type YarboPackageGroupKey,
  type YarboPurchaseMode,
} from "@/lib/catalog/yarbo";

type ProductConfigurationProps = {
  product: CatalogProduct;
  selection: ProductBuildSelection;
  onSelectVariant: (variantId: string) => void;
  onSelectPackage: (packageId: string) => void;
  onChangeOptionQuantity: (optionId: string, quantity: number) => void;
  onSelectPurchaseMode: (mode: YarboPurchaseMode) => void;
  onToggleBaseProduct: (selected: boolean) => void;
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

  const searchable =
    `${catalogPackage.name} ${catalogPackage.description ?? ""}`.toLowerCase();

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

function OptionPrice({ option }: { option: CatalogOption }) {
  return (
    <p className={`mt-3 text-sm font-black ${option.isAvailable ? "text-emerald-700" : "text-amber-800"}`}>
      {!option.isAvailable ? "Unavailable" : option.isIncluded ? "Included" : priceLabel(option)}
    </p>
  );
}

export default function ProductConfiguration({
  product,
  selection,
  onSelectVariant,
  onSelectPackage,
  onChangeOptionQuantity,
  onSelectPurchaseMode,
  onToggleBaseProduct,
}: ProductConfigurationProps) {
  if (!product.isAvailable) {
    return <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-6 font-black text-amber-950">{product.name} is currently unavailable. Choose another product to continue.</p>;
  }
  if (isYarboProduct(product)) {
    return (
      <><YarboConfiguration
        product={product}
        selection={selection}
        onSelectPackage={onSelectPackage}
        onChangeOptionQuantity={onChangeOptionQuantity}
        onSelectPurchaseMode={onSelectPurchaseMode}
        onToggleBaseProduct={onToggleBaseProduct}
      />{selection.purchaseMode && <OptionalAccessories product={product} selection={selection} onChangeOptionQuantity={onChangeOptionQuantity}/>}</>
    );
  }

  return (
    <><StandardProductConfiguration
      product={product}
      selection={selection}
      onSelectVariant={onSelectVariant}
      onSelectPackage={onSelectPackage}
      onChangeOptionQuantity={onChangeOptionQuantity}
    /><OptionalAccessories product={product} selection={selection} onChangeOptionQuantity={onChangeOptionQuantity}/></>
  );
}

function OptionalAccessories({product,selection,onChangeOptionQuantity}:{product:CatalogProduct;selection:ProductBuildSelection;onChangeOptionQuantity:(id:string,q:number)=>void}){
  const [open,setOpen]=useState(false);const[search,setSearch]=useState("");const accessories=builderAccessoryOptions(product).filter(o=>o.name.toLowerCase().includes(search.toLowerCase()));
  if(!accessories.length)return null;
  return <section className="mt-8 rounded-[2rem] border border-emerald-200 bg-emerald-50/40 p-5 md:p-7"><button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="flex w-full items-center justify-between text-left"><span><span className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Optional Accessories &amp; Parts</span><span className="mt-2 block text-2xl font-black">Add Optional Accessories &amp; Parts</span></span><span className="text-2xl">{open?'−':'+'}</span></button>{open&&<div className="mt-6"><label className="block font-bold">Search accessories<input value={search} onChange={e=>setSearch(e.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"/></label><div className="mt-5 grid gap-4 lg:grid-cols-2">{accessories.map(option=>{const q=quantityForOption(selection,option);return <article key={option.id} className="rounded-2xl border bg-white p-4"><h4 className="font-black">{option.name}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{option.description}</p><OptionPrice option={option}/><div className="mt-3 flex items-center gap-3"><button type="button" disabled={!option.isAvailable} aria-label={`Decrease ${option.name} quantity`} onClick={()=>onChangeOptionQuantity(option.id,clampQuantity(option,q-1))} className="h-9 w-9 rounded-lg border font-black disabled:cursor-not-allowed disabled:opacity-40">−</button><span className="min-w-6 text-center font-black">{q}</span><button type="button" disabled={!option.isAvailable} aria-label={`Increase ${option.name} quantity`} onClick={()=>onChangeOptionQuantity(option.id,clampQuantity(option,q+1))} className="h-9 w-9 rounded-lg border font-black disabled:cursor-not-allowed disabled:opacity-40">+</button></div></article>})}</div></div>}</section>
}

function YarboConfiguration({
  product,
  selection,
  onSelectPackage,
  onChangeOptionQuantity,
  onSelectPurchaseMode,
  onToggleBaseProduct,
}: Omit<ProductConfigurationProps, "onSelectVariant">) {
  const [activeGroup, setActiveGroup] = useState<YarboPackageGroupKey>("mowing");
  const groupedPackages = groupYarboPackages(product.packages);
  const visibleGroups = groupedPackages.filter((group) => group.key === activeGroup);
  const modules = yarboIndividualModules(product);
  const coreSelected = yarboCoreIsSelected(selection);
  const selectedModules = selectedYarboIndividualModules(product, selection);
  const modulesWithoutCore = selectedModules.length > 0 && !coreSelected;
  const individualMode = selection.purchaseMode === "individual-equipment";
  const completeMode = selection.purchaseMode === "complete-system";

  function selectPackage(packageId: string) {
    const catalogPackage = product.packages.find((item) => item.id === packageId);
    if (!catalogPackage || !catalogPackageIsAvailable(catalogPackage)) return;
    onSelectPurchaseMode("complete-system");
    onSelectPackage(packageId);
  }

  function toggleCore() {
    if (!product.isAvailable) return;
    onSelectPurchaseMode("individual-equipment");
    onToggleBaseProduct(!coreSelected);
  }

  function toggleModule(option: CatalogOption) {
    if (!option.isAvailable) return;
    const selected = selectedModules.some(
      ({ option: selectedOption }) => selectedOption.id === option.id
    );

    onSelectPurchaseMode("individual-equipment");
    onChangeOptionQuantity(option.id, selected ? 0 : 1);
  }

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Yarbo Equipment
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Choose a complete system or individual Yarbo equipment.
      </h3>

      <p className="mt-4 max-w-4xl leading-7 text-slate-600">
        Complete systems use the selected package price. Individual equipment
        requests price the Yarbo Core and each selected module as separate
        standalone lines.
      </p>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelectPurchaseMode("complete-system")}
          aria-pressed={completeMode}
          className={`rounded-[2rem] border p-5 text-left transition ${
            completeMode
              ? "border-emerald-700 bg-emerald-50 shadow-lg"
              : "border-slate-300 bg-white hover:border-emerald-500"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Complete Yarbo Systems
          </p>
          <p className="mt-2 text-xl font-black text-slate-950">
            Core plus included modules in one package price
          </p>
          <p className="mt-2 leading-6 text-slate-600">
            Choose one of the active Yarbo packages. Package-item modules are
            included in the package price and are not charged separately.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelectPurchaseMode("individual-equipment")}
          aria-pressed={individualMode}
          className={`rounded-[2rem] border p-5 text-left transition ${
            individualMode
              ? "border-emerald-700 bg-emerald-50 shadow-lg"
              : "border-slate-300 bg-white hover:border-emerald-500"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Individual Yarbo Equipment
          </p>
          <p className="mt-2 text-xl font-black text-slate-950">
            Select Core and modules manually
          </p>
          <p className="mt-2 leading-6 text-slate-600">
            Choose Yarbo Core, one or more modules, or both. Manual selections
            are not converted into package discounts.
          </p>
        </button>
      </div>

      {completeMode && <section id="complete-yarbo-systems" className="mt-9">
        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-5 md:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Complete Yarbo Systems
              </p>
              <h4 className="mt-2 text-2xl font-black text-slate-950">
                Choose one complete package.
              </h4>
              <p className="mt-2 max-w-4xl leading-7 text-slate-600">
                {YARBO_CORE_EQUIPMENT_DESCRIPTION} Package prices are shown as
                current catalog package prices without calculated savings.
              </p>
            </div>
            <span className="w-fit rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
              {product.packages.length} packages
            </span>
          </div>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {YARBO_PACKAGE_GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setActiveGroup(group.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                  activeGroup === group.key
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:border-emerald-500"
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="mt-7 space-y-8">
            {visibleGroups.map((group) => (
              <div key={group.key}>
                <div className="mb-4">
                  <h5 className="text-xl font-black text-slate-950">
                    {group.label}
                  </h5>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {group.description}
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {group.packages.map((catalogPackage) => {
                    const isSelected = catalogPackage.id === selection.packageId;
                    const moduleNames = yarboPackageModuleNames(catalogPackage);
                    const available = catalogPackageIsAvailable(catalogPackage);

                    return (
                      <button
                        key={catalogPackage.id}
                        type="button"
                        disabled={!available}
                        onClick={() => selectPackage(catalogPackage.id)}
                        aria-pressed={isSelected}
                        className={`rounded-[1.5rem] border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          isSelected
                            ? "border-emerald-700 bg-white shadow-lg"
                            : "border-slate-300 bg-white hover:border-emerald-500 hover:shadow-md"
                        }`}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                              Complete System
                            </p>
                            <h6 className="mt-2 text-xl font-black text-slate-950">
                              {yarboPackageDisplayName(catalogPackage)}
                            </h6>
                            {!available && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span>}
                          </div>
                          {available && <YarboPriceDisplay
                            item={catalogPackage}
                            priceClassName="text-xl font-black text-emerald-700"
                          />}
                        </div>

                        {catalogPackage.description && (
                          <p className="mt-3 leading-6 text-slate-600">
                            {catalogPackage.description.replaceAll(
                              "Leaf Blower",
                              "Blower"
                            )}
                          </p>
                        )}

                        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
                          <div>
                            <p className="font-black text-slate-950">
                              Mower distinction
                            </p>
                            <p className="mt-1 text-slate-600">
                              {yarboPackageMowerType(catalogPackage)}
                            </p>
                          </div>
                          <div>
                            <p className="font-black text-slate-950">
                              Best fit
                            </p>
                            <p className="mt-1 text-slate-600">
                              {yarboPackageBestFit(catalogPackage)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-emerald-200 pt-4">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                            Included Equipment
                          </p>
                          <ul className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
                            {YARBO_INCLUDED_PLATFORM_EQUIPMENT.map((item) => (
                              <li key={`${catalogPackage.id}-${item}`}>
                                {item}
                              </li>
                            ))}
                            {moduleNames.map((name) => (
                              <li key={`${catalogPackage.id}-${name}`}>
                                {name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>}

      {individualMode && <section id="individual-yarbo-equipment" className="mt-8">
        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-5 md:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Individual Yarbo Equipment
              </p>
              <h4 className="mt-2 text-2xl font-black text-slate-950">
                Select standalone Yarbo equipment.
              </h4>
              <p className="mt-2 max-w-4xl leading-7 text-slate-600">
                Individual selections use standalone product and module prices.
                Existing Yarbo owners can request modules without adding a
                second Core.
              </p>
            </div>
            <span className="w-fit rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
              Max one each
            </span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <button
              type="button"
              disabled={!product.isAvailable}
              onClick={toggleCore}
              aria-pressed={coreSelected}
              className={`rounded-[1.5rem] border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                coreSelected && individualMode
                  ? "border-emerald-700 bg-white shadow-lg"
                  : "border-slate-300 bg-white hover:border-emerald-500 hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Core Platform
                  </p>
                  <h5 className="mt-2 text-xl font-black text-slate-950">
                    Yarbo Core
                  </h5>
                  <p className="mt-2 leading-6 text-slate-600">
                    The base Yarbo platform for customers assembling a custom
                    system or purchasing the Core by itself.
                  </p>
                </div>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${
                    coreSelected && individualMode
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-slate-400 bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
              </div>
              <YarboPriceDisplay
                item={product}
                className="mt-4"
                priceClassName="text-lg font-black text-emerald-700"
              />
            </button>

            {modules.map((option) => {
              const isSelected = selectedModules.some(
                ({ option: selectedOption }) => selectedOption.id === option.id
              );

              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!option.isAvailable}
                  onClick={() => toggleModule(option)}
                  aria-pressed={isSelected}
                  className={`rounded-[1.5rem] border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                    isSelected && individualMode
                      ? "border-emerald-700 bg-white shadow-lg"
                      : "border-slate-300 bg-white hover:border-emerald-500 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                        Module Only
                      </p>
                      <h5 className="mt-2 text-xl font-black text-slate-950">
                        {yarboOptionDisplayName(option)}
                      </h5>
                      {!option.isAvailable && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span>}
                      <p className="mt-2 leading-6 text-slate-600">
                        {option.description?.replaceAll(
                          "Leaf Blower",
                          "Blower"
                        ) ?? "Compatible Yarbo module."}
                      </p>
                    </div>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${
                        isSelected && individualMode
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-slate-400 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </div>
                  {option.isAvailable && <YarboPriceDisplay
                    item={option}
                    className="mt-4"
                    priceClassName="text-lg font-black text-emerald-700"
                  />}
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950">
                    {YARBO_MODULE_ONLY_NOTICE}
                  </p>
                </button>
              );
            })}
          </div>

          {individualMode && !coreSelected && selectedModules.length === 0 && (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold leading-6 text-amber-950">
              Select Yarbo Core, at least one module, or a complete system
              package before continuing.
            </p>
          )}

          {modulesWithoutCore && (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold leading-6 text-amber-950">
              {YARBO_CORE_ABSENT_NOTICE}
            </p>
          )}
        </div>
      </section>}
    </div>
  );
}

function StandardProductConfiguration({
  product,
  selection,
  onSelectVariant,
  onSelectPackage,
  onChangeOptionQuantity,
}: Pick<
  ProductConfigurationProps,
  | "product"
  | "selection"
  | "onSelectVariant"
  | "onSelectPackage"
  | "onChangeOptionQuantity"
>) {
  const [packageFilter, setPackageFilter] = useState("all");

  const selectedVariant =
    product.variants.find((variant) => variant.id === selection.variantId) ??
    null;
  const selectedPackage =
    product.packages.find(
      (catalogPackage) => catalogPackage.id === selection.packageId
    ) ?? null;

  const customerFacingUngrouped = useMemo(
    () => customerFacingUngroupedOptions(product).filter((option) => !option.accessoryListingEnabled),
    [product]
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
    if (!option.isAvailable) return;
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
    const available = option.isAvailable;

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
              {!available && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span>}
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
                  disabled={!available}
                  onClick={() =>
                    onChangeOptionQuantity(
                      option.id,
                      clampQuantity(option, quantity - 1)
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-white text-xl font-black text-slate-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Decrease ${option.name} quantity`}
                >
                  −
                </button>
                <input
                  type="number"
                  disabled={!available}
                  min={option.minimumQuantity}
                  max={option.maximumQuantity ?? undefined}
                  value={quantity}
                  onChange={(event) =>
                    onChangeOptionQuantity(
                      option.id,
                      clampQuantity(option, Number(event.target.value))
                    )
                  }
                  className="w-16 bg-transparent text-center text-lg font-black text-slate-950 outline-none disabled:opacity-50"
                  aria-label={`${option.name} quantity`}
                />
                <button
                  type="button"
                  disabled={!available}
                  onClick={() =>
                    onChangeOptionQuantity(
                      option.id,
                      clampQuantity(option, quantity + 1)
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-white text-xl font-black text-slate-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
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
        disabled={!available || isIncludedInPackage || option.isIncluded}
        onClick={() => {
          if (isSingle) {
            handleSingleGroupSelection(group, option);
            return;
          }

          onChangeOptionQuantity(option.id, isSelected ? 0 : 1);
        }}
        aria-pressed={isSelected || isIncludedInPackage || option.isIncluded}
        className={`rounded-2xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
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
            {!available && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span>}
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
                  disabled={!variant.isAvailable}
                  onClick={() => onSelectVariant(variant.id)}
                  aria-pressed={isSelected}
                  className={`rounded-2xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
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
                      {!variant.isAvailable && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span>}
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
                  {variant.isAvailable && (product.slug === "lymow-one-plus" ? (
                    <EverydayPriceDisplay
                      item={variant}
                      comparisonLabel="Lymow Everyday Price"
                      className="mt-4"
                      priceClassName="text-lg font-black text-emerald-700"
                    />
                  ) : (
                    <p className="mt-4 text-lg font-black text-emerald-700">
                      {priceLabel(variant)}
                    </p>
                  ))}
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
              const available = catalogPackageIsAvailable(catalogPackage);

              return (
                <button
                  key={catalogPackage.id}
                  type="button"
                  disabled={!available}
                  onClick={() => onSelectPackage(catalogPackage.id)}
                  aria-pressed={isSelected}
                  className={`rounded-2xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
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
                      {!available && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span>}
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
                        <p>{product.name}</p>
                        {catalogPackage.items.map((item) => (
                          <p key={`${catalogPackage.id}-${item.optionId}`}>
                            {item.option?.name ?? "Catalog option"}
                            {item.quantity > 1 ? ` x ${item.quantity}` : ""}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {available && <p className="mt-4 text-xl font-black text-emerald-700">
                    {priceLabel(catalogPackage)}
                  </p>}
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
            {selectedPackage.name} - {priceLabel(selectedPackage)}
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
              groupAppliesToVariant(group, selectedVariant?.slug ?? null)
          )
          .map((group) => {
            const visibleOptions = customerFacingGroupOptions(product, group);

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
                          {option.name}
                        </p>
                        {!option.isAvailable && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span>}
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

        {customerFacingUngrouped.length > 0 && (
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
              {customerFacingUngrouped.map((option) =>
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
                    options: customerFacingUngrouped,
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
