"use client";

import { useMemo, useState } from "react";

import {
  findProductOptionById,
  getIncludedOptionIds,
  getProductOptionConfiguration,
} from "@/lib/products/product-options";
import { nationwideProducts } from "@/lib/products/product-catalog";
import type {
  CustomerInformationValues,
  ProductConfigurationSelection,
  ProductId,
  ProductOptionId,
  PurchaseMethodKey,
  SetupPreferenceKey,
} from "@/lib/products/types";

import CustomerInformation from "./CustomerInformation";
import ProductConfiguration from "./ProductConfiguration";
import ProductSelection from "./ProductSelection";
import PurchaseMethod from "./PurchaseMethod";
import PurchaseSummary from "./PurchaseSummary";
import SetupPreference from "./SetupPreference";

type NationwidePurchaseFlowProps = {
  selectedState: string;
  selectedRegion: string;
};

type StageKey =
  | "introduction"
  | "product"
  | "configuration"
  | "purchase"
  | "setup"
  | "customer"
  | "summary";

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

const stages: { key: StageKey; label: string }[] = [
  { key: "introduction", label: "Introduction" },
  { key: "product", label: "Product" },
  { key: "configuration", label: "Configuration" },
  { key: "purchase", label: "Purchase" },
  { key: "setup", label: "Setup" },
  { key: "customer", label: "Customer" },
  { key: "summary", label: "Summary" },
];

const purchaseMethodLabels: Record<PurchaseMethodKey, string> = {
  "pay-in-full": "Pay in full",
  "hearth-financing": "Explore financing through Hearth",
};

const setupPreferenceLabels: Record<SetupPreferenceKey, string> = {
  "self-setup": "Self setup",
  "remote-guidance": "Remote setup guidance",
  "dealer-provider-help":
    "Help locating an authorized dealer or service provider, when available",
};

export default function NationwidePurchaseFlow({
  selectedState,
  selectedRegion,
}: NationwidePurchaseFlowProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<ProductId | "">("");
  const [configurationSelection, setConfigurationSelection] =
    useState<ProductConfigurationSelection>({
      selectedConfigurationId: "",
      selectedOptionIds: [],
      includedOptionIds: [],
    });
  const [selectedPurchaseMethod, setSelectedPurchaseMethod] = useState<
    PurchaseMethodKey | ""
  >("");
  const [selectedSetupPreference, setSelectedSetupPreference] = useState<
    SetupPreferenceKey | ""
  >("");
  const [customerInformation, setCustomerInformation] =
    useState<CustomerInformationValues>({
      fullName: "",
      email: "",
      phone: "",
      shippingState: selectedState,
      shippingRegion: selectedRegion,
    });

  const activeStage = stages[stageIndex];
  const isSummaryStage = activeStage.key === "summary";

  const selectedProduct = useMemo(
    () =>
      nationwideProducts.find((product) => product.id === selectedProductId) ??
      null,
    [selectedProductId]
  );

  const selectedProductConfiguration = selectedProductId
    ? getProductOptionConfiguration(selectedProductId)
    : null;

  const selectedConfigurationOption =
    configurationSelection.selectedConfigurationId
      ? findProductOptionById(configurationSelection.selectedConfigurationId)
      : null;

  const selectedOptions = configurationSelection.selectedOptionIds
    .map((optionId) => findProductOptionById(optionId))
    .filter((option) => option !== null);

  const includedOptions = configurationSelection.includedOptionIds
    .map((optionId) => findProductOptionById(optionId))
    .filter((option) => option !== null);

  const productConfigurationComplete = Boolean(
    selectedProductConfiguration &&
      selectedProductConfiguration.requiredGroups.every((group) =>
        group.options.some(
          (option) =>
            option.id === configurationSelection.selectedConfigurationId
        )
      )
  );

  const customerInformationComplete = Boolean(
    customerInformation.fullName.trim() &&
      (customerInformation.email.trim() || customerInformation.phone.trim()) &&
      customerInformation.shippingState.trim() &&
      customerInformation.shippingRegion.trim()
  );

  const currentStageComplete =
    activeStage.key === "introduction" ||
    (activeStage.key === "product" && Boolean(selectedProductId)) ||
    (activeStage.key === "configuration" && productConfigurationComplete) ||
    (activeStage.key === "purchase" && Boolean(selectedPurchaseMethod)) ||
    (activeStage.key === "setup" && Boolean(selectedSetupPreference)) ||
    (activeStage.key === "customer" && customerInformationComplete) ||
    activeStage.key === "summary";

  function updateCustomerInformation(
    field: keyof CustomerInformationValues,
    value: string
  ) {
    setCustomerInformation((currentInformation) => ({
      ...currentInformation,
      [field]: value,
    }));
  }

  function handleProductSelect(productId: ProductId) {
    if (productId === selectedProductId) return;

    setSelectedProductId(productId);
    setConfigurationSelection({
      selectedConfigurationId: "",
      selectedOptionIds: [],
      includedOptionIds: getIncludedOptionIds(productId),
    });
  }

  function handleSelectConfiguration(optionId: ProductOptionId) {
    setConfigurationSelection((currentSelection) => ({
      ...currentSelection,
      selectedConfigurationId: optionId,
    }));
  }

  function handleSelectSingleOption(
    groupOptionIds: ProductOptionId[],
    optionId: ProductOptionId
  ) {
    setConfigurationSelection((currentSelection) => {
      const selectedOptionIdsOutsideGroup =
        currentSelection.selectedOptionIds.filter(
          (selectedOptionId) => !groupOptionIds.includes(selectedOptionId)
        );

      if (currentSelection.selectedOptionIds.includes(optionId)) {
        return {
          ...currentSelection,
          selectedOptionIds: selectedOptionIdsOutsideGroup,
        };
      }

      return {
        ...currentSelection,
        selectedOptionIds: [...selectedOptionIdsOutsideGroup, optionId],
      };
    });
  }

  function handleToggleOption(optionId: ProductOptionId) {
    setConfigurationSelection((currentSelection) => {
      if (currentSelection.selectedOptionIds.includes(optionId)) {
        return {
          ...currentSelection,
          selectedOptionIds: currentSelection.selectedOptionIds.filter(
            (selectedOptionId) => selectedOptionId !== optionId
          ),
        };
      }

      return {
        ...currentSelection,
        selectedOptionIds: [...currentSelection.selectedOptionIds, optionId],
      };
    });
  }

  function goBack() {
    setStageIndex((currentIndex) => Math.max(currentIndex - 1, 0));
  }

  function goForward() {
    if (!currentStageComplete || isSummaryStage) return;
    setStageIndex((currentIndex) =>
      Math.min(currentIndex + 1, stages.length - 1)
    );
  }

  function renderStage() {
    if (activeStage.key === "introduction") {
      return (
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
            Nationwide Purchasing
          </p>

          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
            Build Your Nationwide Equipment Order
          </h2>

          <div className="mt-5 max-w-4xl space-y-4 text-lg leading-8 text-slate-600">
            <p>
              Equipment can be shipped directly throughout the United States.
              Use this path to select a primary system and prepare the next
              step of your nationwide purchase request.
            </p>

            <p>
              Hands-on IDS installation is limited to the IDS regional service
              area. Nationwide customers can still choose self setup, request
              optional remote setup guidance, or ask for help locating an
              authorized dealer or service provider when one is available.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-950">
            Your selected shipping location is {selectedState},{" "}
            {selectedRegion}. You can review those details before the summary.
          </div>
        </div>
      );
    }

    if (activeStage.key === "product") {
      return (
        <ProductSelection
          products={nationwideProducts}
          selectedProductId={selectedProductId}
          onSelectProduct={handleProductSelect}
        />
      );
    }

    if (
      activeStage.key === "configuration" &&
      selectedProduct &&
      selectedProductConfiguration
    ) {
      return (
        <ProductConfiguration
          productName={selectedProduct.name}
          configuration={selectedProductConfiguration}
          selection={configurationSelection}
          onSelectConfiguration={handleSelectConfiguration}
          onSelectSingleOption={handleSelectSingleOption}
          onToggleOption={handleToggleOption}
        />
      );
    }

    if (activeStage.key === "purchase") {
      return (
        <PurchaseMethod
          selectedMethod={selectedPurchaseMethod}
          hearthUrl={hearthFinancingUrl}
          onSelectMethod={setSelectedPurchaseMethod}
        />
      );
    }

    if (activeStage.key === "setup") {
      return (
        <SetupPreference
          selectedPreference={selectedSetupPreference}
          onSelectPreference={setSelectedSetupPreference}
        />
      );
    }

    if (activeStage.key === "customer") {
      return (
        <CustomerInformation
          values={customerInformation}
          onChange={updateCustomerInformation}
        />
      );
    }

    return (
      <PurchaseSummary
        selectedProduct={selectedProduct}
        selectedConfigurationOption={selectedConfigurationOption}
        selectedOptions={selectedOptions}
        includedOptions={includedOptions}
        purchaseMethodLabel={
          selectedPurchaseMethod
            ? purchaseMethodLabels[selectedPurchaseMethod]
            : "Not selected"
        }
        setupPreferenceLabel={
          selectedSetupPreference
            ? setupPreferenceLabels[selectedSetupPreference]
            : "Not selected"
        }
        customerInformation={customerInformation}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-xl">
      <div className="border-b border-slate-200 bg-slate-50 p-5 md:p-7">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {stages.map((stage, index) => {
            const isActive = index === stageIndex;
            const isComplete = index < stageIndex;

            return (
              <div
                key={stage.key}
                className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${
                  isActive
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : isComplete
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-slate-950">
                  {index + 1}
                </span>
                {stage.label}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-8 md:p-12">{renderStage()}</div>

      <div className="border-t border-slate-200 bg-slate-50 p-5 md:p-7">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={stageIndex === 0}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-4 text-center font-bold text-slate-950 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>

          {!isSummaryStage && (
            <button
              type="button"
              onClick={goForward}
              disabled={!currentStageComplete}
              className="rounded-2xl bg-emerald-600 px-6 py-4 text-center font-black text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
