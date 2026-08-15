import type {
  CatalogOption,
  CatalogProduct,
  CatalogService,
  ProductBuildSelection,
  ServiceSelection,
} from "./types";
import {
  isYarboModuleOption,
  isYarboProduct,
  yarboCoreIsSelected,
  yarboHasIndividualSelection,
  yarboOptionDisplayName,
} from "./yarbo";
import { builderAccessoryOptions, customerFacingProductOptions } from "./customer-facing-options";
import { buildAvailabilityIssues } from "./availability";

export function allProductOptions(product: CatalogProduct) {
  const options = customerFacingProductOptions(product);
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
  const selectedVariant = yarboProduct
    ? null
    : product.variants.find((variant) => variant.id === selection.variantId) ??
      null;
  const selectedPackage = yarboIndividualMode
    ? null
    : product.packages.find(
        (catalogPackage) => catalogPackage.id === selection.packageId
      ) ?? null;
  const packageIncludedOptionIds = new Set(
    selectedPackage?.items
      .filter((item) => item.includedInPackagePrice)
      .map((item) => item.optionId) ?? []
  );

  const yarboAccessoryIds = new Set(builderAccessoryOptions(product).map((option) => option.id));
  const selectedOptions = (
    allProductOptions(product).map((option) => ({
          option,
          quantity: selection.optionQuantities[option.id] ?? 0,
        }))
  )
    .filter(
      ({ option, quantity }) =>
        quantity > 0 &&
        !option.isIncluded &&
        !packageIncludedOptionIds.has(option.id) &&
        (!yarboProduct ||
          (yarboCompleteSystemMode
            ? yarboAccessoryIds.has(option.id)
            : isYarboModuleOption(option) || yarboAccessoryIds.has(option.id)))
    );

  const includedOptions = allProductOptions(product).filter(
    (option) => option.isIncluded
  );

  const yarboCoreSelected =
    yarboIndividualMode && yarboCoreIsSelected(selection);
  const includeBaseProduct = !yarboIndividualMode || yarboCoreSelected;
  const baseItem = yarboIndividualMode
    ? yarboCoreSelected
      ? product
      : null
    : selectedPackage ?? selectedVariant ?? (includeBaseProduct ? product : null);
  const baseItemName = yarboIndividualMode
    ? product.name
    : selectedPackage?.name ?? selectedVariant?.name ?? product.name;
  const priceItems = [
    ...(baseItem
      ? [
          {
            name: baseItemName,
            quantity: 1,
            priceCents: baseItem.currentPriceCents,
            regularPriceCents: baseItem.regularPriceCents,
            salePriceCents: baseItem.salePriceCents,
            currentPriceCents: baseItem.currentPriceCents,
            showPublicPrice: baseItem.showPublicPrice,
            contactForPricing:
              baseItem.contactForPricing || !baseItem.showPublicPrice,
            promotionLabel: baseItem.promotionLabel,
            saleIsActive: baseItem.saleIsActive,
          },
        ]
      : []),
    ...selectedOptions.map(({ option, quantity }) => ({
      name: yarboIndividualMode ? yarboOptionDisplayName(option) : option.name,
      quantity,
      priceCents: option.currentPriceCents,
      regularPriceCents: option.regularPriceCents,
      salePriceCents: option.salePriceCents,
      currentPriceCents: option.currentPriceCents,
      showPublicPrice: option.showPublicPrice,
      contactForPricing:
        option.contactForPricing || !option.showPublicPrice,
      promotionLabel: option.promotionLabel,
      saleIsActive: option.saleIsActive,
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
    yarboCoreSelected: yarboIndividualMode ? yarboCoreSelected : undefined,
  };
}

export function resolveServiceSelections(
  product: CatalogProduct & { services: CatalogService[] },
  selections: ServiceSelection[]
) {
  const resolved = selections.flatMap((selection) => {
    const service = product.services.find(
      (item) => item.id === selection.serviceId
    );
    if (!service || !service.isAvailable) return [];

    const paymentOption =
      service.paymentOptions.find(
        (item) => item.id === selection.paymentOptionId && item.isAvailable
      ) ?? null;
    if (selection.paymentOptionId && !paymentOption) return [];
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
  return product.optionGroups.every((group) => {
    if (group.slug.includes("m1500") && !selectedVariant?.slug.includes("m1500")) {
      return true;
    }
    if (group.slug.includes("m3000") && !selectedVariant?.slug.includes("m3000")) {
      return true;
    }

    const customerFacingIds = new Set(allProductOptions(product).map((option) => option.id));
    const customerSelectableOptions = group.options.filter(
      (option) => customerFacingIds.has(option.id) && !option.isIncluded
    );
    const selectableOptions = customerSelectableOptions.filter((option) => option.isAvailable);
    if (!group.isRequired || customerSelectableOptions.length === 0) return true;
    if (selectableOptions.length === 0) return false;

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
  if (buildAvailabilityIssues(product, selection).length > 0) return false;
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
