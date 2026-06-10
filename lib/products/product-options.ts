import type {
  ProductId,
  ProductOptionConfiguration,
  ProductOptionId,
  QuantityAccessorySelection,
} from "./types";

export const productOptionsByProductId: Record<
  ProductId,
  ProductOptionConfiguration
> = {
  "lymow-one-plus": {
    productId: "lymow-one-plus",
    intro:
      "Select the charger configuration for the Lymow One Plus equipment package. The charger selection affects the final equipment package, and final pricing will be confirmed before purchase.",
    requiredGroups: [
      {
        id: "lymow-one-plus-charger",
        title: "Required Charger Configuration",
        description:
          "Choose one charger configuration for the Lymow One Plus package.",
        type: "required-single",
        required: true,
        options: [
          {
            id: "lymow-one-plus-5a-charger",
            label: "Lymow One Plus with 5A Charger",
            description:
              "Required charger configuration. Final equipment details and pricing will be confirmed before purchase.",
            status: "available",
            futurePriceReady: true,
          },

          {
            id: "lymow-one-plus-10a-charger",
            label: "Lymow One Plus with 10A Charger",
            description:
              "Required charger configuration. Final equipment details and pricing will be confirmed before purchase.",
            status: "available",
            futurePriceReady: true,
          },
        ],
      },
    ],
    optionalGroups: [],
    quantityAccessoryGroups: [],
    includedEquipment: [],
    comingSoonGroups: [],
  },

  "yarbo-pro": {
    productId: "yarbo-pro",
    intro:
      "Yarbo module and package options will be finalized before checkout. The structure below is ready for exact IDS package information, compatibility rules, and future pricing.",
    requiredGroups: [
      {
        id: "yarbo-pro-primary-configuration",
        title: "Required Primary Mower Configuration",
        description:
          "A primary Yarbo Pro mower configuration is required before continuing.",
        type: "required-single",
        required: true,
        options: [
          {
            id: "yarbo-pro-primary-configuration",
            label: "Yarbo Pro Primary Mower Configuration",
            description:
              "Placeholder for the final IDS primary mower configuration. Final package details will be confirmed before checkout.",
            status: "available",
            futurePriceReady: true,
          },
        ],
      },
    ],
    optionalGroups: [
      {
        id: "yarbo-pro-package-options",
        title: "Optional Package Selection",
        description:
          "Placeholder package options can be replaced with final IDS package information later.",
        type: "single-select",
        required: false,
        options: [
          {
            id: "yarbo-pro-package-options-placeholder",
            label: "Yarbo Package Options Placeholder",
            description:
              "Yarbo module and package options will be finalized before checkout.",
            status: "available",
            futurePriceReady: true,
          },
        ],
      },

      {
        id: "yarbo-pro-compatible-modules",
        title: "Optional Compatible Modules",
        description:
          "This multi-select group is ready for compatible Yarbo modules when final IDS options are supplied.",
        type: "multi-select",
        required: false,
        options: [
          {
            id: "yarbo-pro-module-options-placeholder",
            label: "Yarbo Compatible Module Options Placeholder",
            description:
              "Yarbo module and package options will be finalized before checkout.",
            status: "available",
            futurePriceReady: true,
          },
        ],
      },
    ],
    quantityAccessoryGroups: [],
    includedEquipment: [],
    comingSoonGroups: [],
  },

  "pandag-g1": {
    productId: "pandag-g1",
    intro:
      "The Pandag G1 comes standard with a charging cable. Charging docks are optional accessories that charge the machine significantly faster than the included cable and can be added in the quantity needed for the property.",
    requiredGroups: [],
    optionalGroups: [],
    quantityAccessoryGroups: [
      {
        id: "pandag-g1-optional-accessories",
        title: "Recommended Optional Accessory",
        description:
          "Charging docks are separate optional accessories. A dock is strongly recommended for commercial use, large properties, frequent mowing schedules, and faster turnaround. Dock pricing will remain separate from the Pandag G1 base unit when pricing is added.",
        type: "quantity-accessory",
        required: false,
        accessories: [
          {
            optionId: "pandag-g1-charging-dock",
            label: "Pandag G1 Charging Dock",
            description:
              "Optional charging dock accessory for faster charging than the included cable. Per-unit dock pricing will be added separately when available.",
            required: false,
            minimumQuantity: 0,
            defaultQuantity: 0,
            futurePriceReady: true,
          },
        ],
      },
    ],
    includedEquipment: [
      {
        id: "pandag-g1-included-equipment",
        title: "Included Equipment",
        description:
          "Standard equipment included with the Pandag G1 base unit.",
        type: "included",
        required: false,
        options: [
          {
            id: "pandag-g1-charging-cable",
            label: "Pandag G1 Charging Cable \u2014 Included",
            description:
              "Standard charging cable included with the Pandag G1 base unit.",
            status: "included",
            futurePriceReady: true,
          },
        ],
      },
    ],
    comingSoonGroups: [
      {
        id: "pandag-g1-additional-modules",
        title: "Additional Modules \u2014 Coming Soon",
        description:
          "Future Pandag modules can be added here when final options are available.",
        type: "coming-soon",
        required: false,
        options: [
          {
            id: "pandag-g1-additional-modules-placeholder",
            label: "Future Pandag Module Options",
            description:
              "Additional Pandag module options are coming soon and cannot be selected yet.",
            status: "coming-soon",
            futurePriceReady: true,
          },
        ],
      },
    ],
  },
};

export function getProductOptionConfiguration(productId: ProductId) {
  return productOptionsByProductId[productId];
}

export function getIncludedOptionIds(productId: ProductId): ProductOptionId[] {
  return productOptionsByProductId[productId].includedEquipment.flatMap(
    (group) => group.options.map((option) => option.id)
  );
}

export function getDefaultQuantityAccessorySelections(
  productId: ProductId
): QuantityAccessorySelection[] {
  return productOptionsByProductId[productId].quantityAccessoryGroups.flatMap(
    (group) =>
      group.accessories
        .map((accessory) => ({
          optionId: accessory.optionId,
          quantity: accessory.defaultQuantity,
        }))
  );
}

export function findProductOptionById(optionId: ProductOptionId) {
  for (const configuration of Object.values(productOptionsByProductId)) {
    const groups = [
      ...configuration.requiredGroups,
      ...configuration.optionalGroups,
      ...configuration.includedEquipment,
      ...configuration.comingSoonGroups,
    ];

    for (const group of groups) {
      const option = group.options.find(
        (groupOption) => groupOption.id === optionId
      );

      if (option) {
        return option;
      }
    }
  }

  return null;
}

export function findQuantityAccessoryById(optionId: ProductOptionId) {
  for (const configuration of Object.values(productOptionsByProductId)) {
    for (const group of configuration.quantityAccessoryGroups) {
      const accessory = group.accessories.find(
        (groupAccessory) => groupAccessory.optionId === optionId
      );

      if (accessory) {
        return accessory;
      }
    }
  }

  return null;
}
