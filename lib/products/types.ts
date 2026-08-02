export type ProductId = "lymow-one-plus" | "yarbo-pro" | "pandag-g1";

export type ProductOptionId =
  | "lymow-one-plus-5a-charger"
  | "lymow-one-plus-10a-charger"
  | "yarbo-pro-primary-configuration"
  | "yarbo-pro-module-options-placeholder"
  | "yarbo-pro-package-options-placeholder"
  | "pandag-g1-charging-cable"
  | "pandag-g1-charging-dock"
  | "pandag-g1-additional-modules-placeholder";

export type ProductCatalogItem = {
  id: ProductId;
  name: string;
  imageSrc: string;
  imageAlt: string;
  description: string;
};

export type ProductOptionStatus =
  | "available"
  | "included"
  | "coming-soon";

export type ProductOption = {
  id: ProductOptionId;
  label: string;
  description: string;
  status: ProductOptionStatus;
  futurePriceReady?: boolean;
};

export type QuantityAccessoryOption = {
  optionId: ProductOptionId;
  label: string;
  description: string;
  required: boolean;
  minimumQuantity: number;
  defaultQuantity: number;
  maximumQuantity?: number;
  unitPriceCents?: number;
  futurePriceReady?: boolean;
};

export type QuantityAccessorySelection = {
  optionId: ProductOptionId;
  quantity: number;
};

export type RequiredProductOptionGroup = {
  id: string;
  title: string;
  description: string;
  type: "required-single";
  required: true;
  options: ProductOption[];
};

export type SingleSelectProductOptionGroup = {
  id: string;
  title: string;
  description: string;
  type: "single-select";
  required: boolean;
  options: ProductOption[];
};

export type MultiSelectProductOptionGroup = {
  id: string;
  title: string;
  description: string;
  type: "multi-select";
  required: boolean;
  options: ProductOption[];
};

export type IncludedEquipmentGroup = {
  id: string;
  title: string;
  description: string;
  type: "included";
  required: false;
  options: ProductOption[];
};

export type ComingSoonProductOptionGroup = {
  id: string;
  title: string;
  description: string;
  type: "coming-soon";
  required: false;
  options: ProductOption[];
};

export type QuantityAccessoryGroup = {
  id: string;
  title: string;
  description: string;
  type: "quantity-accessory";
  required: boolean;
  accessories: QuantityAccessoryOption[];
};

export type ProductOptionGroup =
  | RequiredProductOptionGroup
  | SingleSelectProductOptionGroup
  | MultiSelectProductOptionGroup
  | IncludedEquipmentGroup
  | ComingSoonProductOptionGroup;

export type ProductOptionConfiguration = {
  productId: ProductId;
  intro: string;
  requiredGroups: RequiredProductOptionGroup[];
  optionalGroups: (
    | SingleSelectProductOptionGroup
    | MultiSelectProductOptionGroup
  )[];
  quantityAccessoryGroups: QuantityAccessoryGroup[];
  includedEquipment: IncludedEquipmentGroup[];
  comingSoonGroups: ComingSoonProductOptionGroup[];
};

export type ProductConfigurationSelection = {
  selectedConfigurationId: ProductOptionId | "";
  selectedOptionIds: ProductOptionId[];
  includedOptionIds: ProductOptionId[];
  quantityAccessorySelections: QuantityAccessorySelection[];
};

export type PurchaseMethodKey =
  | "pay-in-full"
  | "ach"
  | "hearth-financing";

export type SetupPreferenceKey =
  | "self-setup"
  | "remote-guidance"
  | "dealer-provider-help";

export type CustomerInformationValues = {
  fullName: string;
  email: string;
  phone: string;
  shippingAddress: string;
  shippingZip: string;
  shippingState: string;
  shippingRegion: string;
};
