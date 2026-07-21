import type {
  CatalogOption,
  CatalogProduct,
  ProductBuildSelection,
  ServiceSelection,
} from "./types";
import {
  isYarboModuleOption,
  isYarboProduct,
  selectedYarboIndividualModules,
  yarboCoreIsSelected,
  yarboHasIndividualSelection,
} from "./yarbo";


function optionGroupIsBuiltIntoVariant(
  product: CatalogProduct,
  groupSlug: string
) {
  return (
    product.slug === "lymow-one-plus" &&
    groupSlug === "lymow-charger-config"
  );
}

export function allProductOptions(product: CatalogProduct) {
  const options = [
    ...product.optionGroups.flatMap((group) => group.options),
    ...product.ungroupedOptions,
  ];

  return Array.from(new Map(options.map((option) => [option.id, option])).values());
}

export function resolveBuildSelection(
  product: CatalogProduct,
  selection: ProductBuildSelection
) {
  const yarboProduct = isYarboProduct(product);
  const yarboIndividualMode =
    yarboProduct && selection.purchaseMode === "individual-equipment";
  const yarboCompleteSystemMode =
    yarboProduct && selection.purchaseMode === "complete-system";
  const selectedVariant =
    product.variants.find((variant) => variant.id === selection.variantId) ??
    null;
  const selectedPackage =
    product.packages.find(
      (catalogPackage) => catalogPackage.id === selection.packageId
    ) ?? null;
  const packageIncludedOptionIds = new Set(
    selectedPackage?.items
      .filter((item) => item.includedInPackagePrice)
      .map((item) => item.optionId) ?? []
  );
  const definingOptionIds = new Set(
    product.variants.flatMap((variant) => variant.definingOptionIds)
  );

  const selectedOptions = (
    yarboIndividualMode
      ? selectedYarboIndividualModules(product, selection)
      : allProductOptions(product).map((option) => ({
          option,
          quantity: selection.optionQuantities[option.id] ?? 0,
        }))
  )
    .filter(
      ({ option, quantity }) =>
        quantity > 0 &&
        !option.isIncluded &&
        !yarboCompleteSystemMode &&
        !packageIncludedOptionIds.has(option.id) &&
        !definingOptionIds.has(option.id) &&
        (!yarboIndividualMode || isYarboModuleOption(option))
    );

  const includedOptions = allProductOptions(product).filter(
    (option) => option.isIncluded
  );

  const includeBaseProduct =
    !yarboIndividualMode || yarboCoreIsSelected(selection);
  const baseItem = selectedPackage ?? selectedVariant ?? (includeBaseProduct ? product : null);
  const priceItems = [
    ...(baseItem
      ? [
          {
            name: selectedPackage?.name ?? selectedVariant?.name ?? product.name,
            quantity: 1,
            priceCents: baseItem.currentPriceCents,
            contactForPricing:
              baseItem.contactForPricing || !baseItem.showPublicPrice,
          },
        ]
      : []),
    ...selectedOptions.map(({ option, quantity }) => ({
      name: option.name,
      quantity,
      priceCents: option.currentPriceCents,
      contactForPricing:
        option.contactForPricing || !option.showPublicPrice,
    })),
  ];

  const equipmentTotalCents = priceItems.reduce(
    (total, item) => total + (item.priceCents ?? 0) * item.quantity,
    0
  );
  const hasUnpricedEquipment = priceItems.some(
    (item) => item.contactForPricing || item.priceCents === null
  );

  return {
    selectedVariant,
    selectedPackage,
    selectedBaseProduct: includeBaseProduct ? product : null,
    selectedOptions,
    includedOptions,
    packageIncludedItems: selectedPackage?.items ?? [],
    priceItems,
    equipmentTotalCents,
    hasUnpricedEquipment,
    isYarboIndividualEquipment: yarboIndividualMode,
    isYarboCompleteSystem: yarboCompleteSystemMode,
    yarboCoreSelected: yarboIndividualMode && yarboCoreIsSelected(selection),
  };
}

export function resolveServiceSelections(
  product: CatalogProduct,
  selections: ServiceSelection[]
) {
  const resolved = selections.flatMap((selection) => {
    const service = product.services.find(
      (item) => item.id === selection.serviceId
    );
    if (!service) return [];

    const paymentOption =
      service.paymentOptions.find(
        (item) => item.id === selection.paymentOptionId
      ) ?? null;
    const priceSource = paymentOption ?? service;

    return [
      {
        service,
        paymentOption,
        priceCents: priceSource.currentPriceCents,
        contactForPricing:
          priceSource.contactForPricing || !priceSource.showPublicPrice,
      },
    ];
  });

  return {
    services: resolved,
    serviceTotalCents: resolved.reduce(
      (total, item) => total + (item.priceCents ?? 0),
      0
    ),
    hasUnpricedServices: resolved.some(
      (item) => item.contactForPricing || item.priceCents === null
    ),
  };
}

export function optionGroupIsComplete(
  product: CatalogProduct,
  selection: ProductBuildSelection
) {
  const selectedVariant = product.variants.find(
    (variant) => variant.id === selection.variantId
  );
  const definingOptionIds = new Set(
    product.variants.flatMap((variant) => variant.definingOptionIds)
  );

  return product.optionGroups.every((group) => {
    if (optionGroupIsBuiltIntoVariant(product, group.slug)) {
      return true;
    }

    if (group.slug.includes("m1500") && !selectedVariant?.slug.includes("m1500")) {
      return true;
    }
    if (group.slug.includes("m3000") && !selectedVariant?.slug.includes("m3000")) {
      return true;
    }

    const selectableOptions = group.options.filter(
      (option) => !definingOptionIds.has(option.id) && !option.isIncluded
    );
    if (!group.isRequired || selectableOptions.length === 0) return true;

    const selectedCount = selectableOptions.filter(
      (option) => (selection.optionQuantities[option.id] ?? 0) > 0
    ).length;

    return selectedCount >= Math.max(1, group.minimumSelections);
  });
}

export function productBuildIsComplete(
  product: CatalogProduct,
  selection: ProductBuildSelection
) {
  if (isYarboProduct(product)) {
    if (selection.purchaseMode === "complete-system") {
      return Boolean(selection.packageId);
    }

    if (selection.purchaseMode === "individual-equipment") {
      return yarboHasIndividualSelection(product, selection);
    }

    return false;
  }

  const variantComplete =
    product.variants.length === 0 || Boolean(selection.variantId);
  const packageComplete =
    product.packages.length === 0 || Boolean(selection.packageId);

  return variantComplete && packageComplete && optionGroupIsComplete(product, selection);
}

export function selectedOptionNames(
  selectedOptions: { option: CatalogOption; quantity: number }[]
) {
  return selectedOptions.map(({ option, quantity }) =>
    quantity > 1 ? `${option.name} × ${quantity}` : option.name
  );
}
