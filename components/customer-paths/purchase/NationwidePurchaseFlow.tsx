"use client";

import { useEffect, useMemo, useState } from "react";

import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import { formatCents } from "@/lib/catalog/pricing";
import {
  productBuildIsComplete,
  resolveBuildSelection,
  resolveServiceSelections,
  selectedOptionNames,
} from "@/lib/catalog/selection";
import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import type {
  CatalogProduct,
  CatalogResponse,
  CatalogService,
  ProductBuildSelection,
  ServiceSelection as SelectedService,
} from "@/lib/catalog/types";
import {
  getRegionOptionsForState,
  isLocalServiceEligible,
} from "@/lib/customer-paths/service-eligibility";
import type {
  CustomerInformationValues,
  PurchaseMethodKey,
} from "@/lib/products/types";
import {
  YARBO_CORE_ABSENT_NOTICE,
  YARBO_INCLUDED_PLATFORM_EQUIPMENT,
  isYarboModuleOption,
  isYarboProduct,
  yarboOptionDisplayName,
  yarboPackageDisplayName,
  type YarboPurchaseMode,
} from "@/lib/catalog/yarbo";

import CustomerInformation from "./CustomerInformation";
import ProductConfiguration from "./ProductConfiguration";
import ProductSelection from "./ProductSelection";
import PurchaseMethod from "./PurchaseMethod";
import PurchaseSummary from "./PurchaseSummary";
import ServiceSelection from "./ServiceSelection";

type NationwidePurchaseFlowProps = {
  selectedState?: string;
  selectedRegion?: string;
};

type StageKey =
  | "product"
  | "configuration"
  | "review"
  | "location"
  | "services"
  | "purchase"
  | "customer"
  | "summary";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

const stages: { key: StageKey; label: string }[] = [
  { key: "product", label: "Browse Equipment" },
  { key: "configuration", label: "Select Equipment" },
  { key: "review", label: "Review Equipment" },
  { key: "location", label: "Availability" },
  { key: "services", label: "Eligible Services" },
  { key: "purchase", label: "Subtotal & Financing" },
  { key: "customer", label: "Contact" },
  { key: "summary", label: "Request" },
];

const purchaseMethodLabels: Record<PurchaseMethodKey, string> = {
  "pay-in-full": "Pay in full",
  "hearth-financing": "Explore financing through Hearth",
};

const quoteSubmitErrorMessage =
  "Unable to submit this request right now. Please try again or contact IDS directly.";

const states = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

const emptyBuildSelection: ProductBuildSelection = {
  variantId: "",
  packageId: "",
  optionQuantities: {},
};

export default function NationwidePurchaseFlow({
  selectedState = "",
  selectedRegion = "",
}: NationwidePurchaseFlowProps = {}) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [buildSelection, setBuildSelection] =
    useState<ProductBuildSelection>(emptyBuildSelection);
  const [serviceSelections, setServiceSelections] = useState<SelectedService[]>(
    []
  );
  const [selectedPurchaseMethod, setSelectedPurchaseMethod] = useState<
    PurchaseMethodKey | ""
  >("");
  const [customerInformation, setCustomerInformation] =
    useState<CustomerInformationValues>({
      fullName: "",
      email: "",
      phone: "",
      shippingAddress: "",
      shippingZip: "",
      shippingState: selectedState,
      shippingRegion: selectedRegion,
    });
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError("");

      try {
        const payload = await fetchCatalog();

        if (!cancelled) setCatalog(payload);
      } catch (error) {
        if (!cancelled) {
          setCatalogError(
            error instanceof Error
              ? error.message
              : "Unable to load the catalog."
          );
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [catalogReloadKey]);

  useEffect(() => {
    setCustomerInformation((currentInformation) => ({
      ...currentInformation,
      shippingState: selectedState,
      shippingRegion: selectedRegion,
    }));
  }, [selectedState, selectedRegion]);

  const activeStage = stages[stageIndex];
  const isSummaryStage = activeStage.key === "summary";
  const selectedProduct = useMemo(
    () =>
      catalog?.products.find((product) => product.id === selectedProductId) ??
      null,
    [catalog, selectedProductId]
  );
  const locationComplete = Boolean(
    customerInformation.shippingAddress.trim() &&
      customerInformation.shippingZip.trim() &&
      customerInformation.shippingState.trim() &&
      customerInformation.shippingRegion.trim()
  );
  const localServiceEligible =
    locationComplete &&
    isLocalServiceEligible(
      customerInformation.shippingState,
      customerInformation.shippingRegion
    );
  const availableServices = useMemo(
    () =>
      selectedProduct?.services.filter(
        (service) => !service.requiresLocalService || localServiceEligible
      ) ?? [],
    [selectedProduct, localServiceEligible]
  );
  const eligibleServiceSelections = useMemo(() => {
    const availableServiceIds = new Set(
      availableServices.map((service) => service.id)
    );

    return serviceSelections.filter((selection) =>
      availableServiceIds.has(selection.serviceId)
    );
  }, [availableServices, serviceSelections]);

  const buildComplete = Boolean(
    selectedProduct && productBuildIsComplete(selectedProduct, buildSelection)
  );
  const selectedServicesComplete = Boolean(
    !selectedProduct ||
      eligibleServiceSelections.every((selection) => {
        const service = availableServices.find(
          (item) => item.id === selection.serviceId
        );
        if (!service) return false;
        return (
          service.paymentOptions.length === 0 ||
          Boolean(selection.paymentOptionId)
        );
      })
  );
  const customerInformationComplete = Boolean(
    customerInformation.fullName.trim() &&
      (customerInformation.email.trim() || customerInformation.phone.trim())
  );

  const currentStageComplete =
    (activeStage.key === "product" && Boolean(selectedProductId)) ||
    (activeStage.key === "configuration" && buildComplete) ||
    (activeStage.key === "review" && buildComplete) ||
    (activeStage.key === "location" && locationComplete) ||
    (activeStage.key === "services" && selectedServicesComplete) ||
    (activeStage.key === "purchase" && Boolean(selectedPurchaseMethod)) ||
    (activeStage.key === "customer" &&
      customerInformationComplete &&
      locationComplete) ||
    activeStage.key === "summary";

  useEffect(() => {
    if (!selectedProduct) return;

    const availableServiceIds = new Set(
      availableServices.map((service) => service.id)
    );

    setServiceSelections((currentSelections) =>
      currentSelections.filter((selection) =>
        availableServiceIds.has(selection.serviceId)
      )
    );
  }, [
    availableServices,
    customerInformation.shippingAddress,
    customerInformation.shippingRegion,
    customerInformation.shippingState,
    customerInformation.shippingZip,
    selectedProduct,
  ]);

  function updateCustomerInformation(
    field: keyof CustomerInformationValues,
    value: string
  ) {
    setCustomerInformation((currentInformation) => ({
      ...currentInformation,
      [field]: value,
    }));

    if (
      field === "shippingAddress" ||
      field === "shippingZip" ||
      field === "shippingState" ||
      field === "shippingRegion"
    ) {
      setSubmitStatus("idle");
      setSubmitError("");
    }
  }

  function handleProductSelect(productId: string) {
    if (productId === selectedProductId) return;

    const product = catalog?.products.find((item) => item.id === productId);
    const includedQuantities = Object.fromEntries(
      product?.optionGroups
        .flatMap((group) => group.options)
        .filter((option) => option.isIncluded)
        .map((option) => [
          option.id,
          Math.max(1, option.defaultQuantity, option.minimumQuantity),
        ]) ?? []
    );

    setSelectedProductId(productId);
    setBuildSelection({
      variantId: "",
      packageId: "",
      optionQuantities: includedQuantities,
    });
    setServiceSelections([]);
    setSubmitStatus("idle");
    setSubmitError("");
  }

  function handleSelectVariant(variantId: string) {
    setBuildSelection((currentSelection) => ({
      ...currentSelection,
      variantId,
      optionQuantities: Object.fromEntries(
        Object.entries(currentSelection.optionQuantities).filter(
          ([optionId]) =>
            !selectedProduct?.optionGroups
              .filter((group) =>
                group.slug.includes("m1500") || group.slug.includes("m3000")
              )
              .flatMap((group) => group.options)
              .some((option) => option.id === optionId)
        )
      ),
    }));
  }

  function handleSelectPackage(packageId: string) {
    const selectedPackage = selectedProduct?.packages.find(
      (catalogPackage) => catalogPackage.id === packageId
    );

    if (selectedProduct && isYarboProduct(selectedProduct)) {
      setBuildSelection((currentSelection) => ({
        ...currentSelection,
        packageId,
        purchaseMode: "complete-system",
        includeBaseProduct: false,
        optionQuantities: {},
      }));
      return;
    }

    const includedOptionIds = new Set(
      selectedPackage?.items.map((item) => item.optionId) ?? []
    );

    setBuildSelection((currentSelection) => ({
      ...currentSelection,
      packageId,
      optionQuantities: Object.fromEntries(
        Object.entries(currentSelection.optionQuantities).filter(
          ([optionId]) => !includedOptionIds.has(optionId)
        )
      ),
    }));
  }

  function handleOptionQuantityChange(optionId: string, quantity: number) {
    const option = selectedProduct
      ? [
          ...selectedProduct.optionGroups.flatMap((group) => group.options),
          ...selectedProduct.ungroupedOptions,
        ].find((item) => item.id === optionId)
      : null;
    const maximum =
      selectedProduct &&
      option &&
      isYarboProduct(selectedProduct) &&
      isYarboModuleOption(option)
        ? 1
        : option?.maximumQuantity ?? Number.POSITIVE_INFINITY;
    const normalizedQuantity = Math.min(
      maximum,
      Math.max(0, Math.trunc(quantity))
    );

    setBuildSelection((currentSelection) => ({
      ...currentSelection,
      ...(selectedProduct && isYarboProduct(selectedProduct)
        ? { packageId: "", purchaseMode: "individual-equipment" as const }
        : {}),
      optionQuantities: {
        ...currentSelection.optionQuantities,
        [optionId]: normalizedQuantity,
      },
    }));
  }

  function handleSelectPurchaseMode(mode: YarboPurchaseMode) {
    setBuildSelection((currentSelection) => ({
      ...currentSelection,
      packageId: mode === "complete-system" ? currentSelection.packageId : "",
      purchaseMode: mode,
      includeBaseProduct:
        mode === "individual-equipment"
          ? Boolean(currentSelection.includeBaseProduct)
          : false,
      optionQuantities:
        mode === "individual-equipment"
          ? currentSelection.optionQuantities
          : {},
    }));
  }

  function handleToggleBaseProduct(selected: boolean) {
    setBuildSelection((currentSelection) => ({
      ...currentSelection,
      packageId: "",
      purchaseMode: "individual-equipment",
      includeBaseProduct: selected,
    }));
  }

  function handleToggleService(service: CatalogService) {
    if (
      service.requiresLocalService &&
      (!locationComplete || !localServiceEligible)
    ) {
      return;
    }

    if (!availableServices.some((item) => item.id === service.id)) {
      return;
    }

    setServiceSelections((currentSelections) => {
      const isSelected = currentSelections.some(
        (selection) => selection.serviceId === service.id
      );

      if (isSelected) {
        return currentSelections.filter(
          (selection) => selection.serviceId !== service.id
        );
      }

      return [
        ...currentSelections,
        {
          serviceId: service.id,
          paymentOptionId: service.paymentOptions[0]?.id ?? "",
        },
      ];
    });
  }

  function handleSelectPaymentOption(
    serviceId: string,
    paymentOptionId: string
  ) {
    setServiceSelections((currentSelections) =>
      currentSelections.map((selection) =>
        selection.serviceId === serviceId
          ? { ...selection, paymentOptionId }
          : selection
      )
    );
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

  async function submitRequest() {
    if (!selectedProduct || !selectedPurchaseMethod || !locationComplete) return;

    setSubmitStatus("submitting");
    setSubmitError("");

    const build = resolveBuildSelection(selectedProduct, buildSelection);
    const services = resolveServiceSelections(
      selectedProduct,
      eligibleServiceSelections
    );
    const selectedProductIsYarbo = isYarboProduct(selectedProduct);
    const selectedYarboPackage = selectedProductIsYarbo
      ? build.selectedPackage
      : null;
    const yarboIndividualItems = selectedProductIsYarbo
      ? [
          ...(build.yarboCoreSelected ? [selectedProduct.name] : []),
          ...build.selectedOptions.map(({ option, quantity }) =>
            quantity > 1
              ? `${yarboOptionDisplayName(option)} x ${quantity}`
              : yarboOptionDisplayName(option)
          ),
        ]
      : [];
    const yarboIncludedPackageItems = selectedYarboPackage
      ? [
          ...YARBO_INCLUDED_PLATFORM_EQUIPMENT,
          ...build.packageIncludedItems.map((item) =>
            item.option ? yarboOptionDisplayName(item.option) : "Yarbo module"
          ),
        ]
      : [];
    const yarboModulesWithoutCore =
      selectedProductIsYarbo &&
      build.isYarboIndividualEquipment &&
      !build.yarboCoreSelected &&
      build.selectedOptions.length > 0;
    const defaultConfiguration =
      build.selectedPackage?.name ??
      build.selectedVariant?.name ??
      selectedProduct.name;
    const primaryConfiguration =
      selectedYarboPackage
        ? yarboPackageDisplayName(selectedYarboPackage)
        : selectedProductIsYarbo && build.isYarboIndividualEquipment
          ? "Individual Yarbo Equipment"
          : defaultConfiguration;
    const extraOptionNames = selectedProductIsYarbo
      ? yarboIndividualItems
      : selectedOptionNames(build.selectedOptions);
    const serviceNames = services.services.map(({ service, paymentOption }) =>
      paymentOption
        ? `${service.name} — ${paymentOption.name}`
        : service.name
    );
    const purchaseMethodLabel = purchaseMethodLabels[selectedPurchaseMethod];

    const requestSummary = [
      selectedProductIsYarbo
        ? selectedYarboPackage
          ? "YARBO COMPLETE SYSTEM REQUEST"
          : "YARBO INDIVIDUAL EQUIPMENT REQUEST"
        : "NATIONWIDE EQUIPMENT PURCHASE REQUEST",
      `Machine: ${selectedProduct.name}`,
      selectedYarboPackage
        ? `Complete system: ${primaryConfiguration}`
        : `Configuration/package: ${primaryConfiguration}`,
      selectedYarboPackage
        ? `Included equipment: ${yarboIncludedPackageItems.join(", ")}`
        : build.packageIncludedItems.length
          ? `Package includes: Base machine/core, ${build.packageIncludedItems
              .map((item) => item.option?.name ?? "Catalog option")
              .join(", ")}`
          : null,
      selectedYarboPackage
        ? "No separate Core charge or package-item module charges are included."
        : null,
      selectedProductIsYarbo && build.isYarboIndividualEquipment
        ? `Selected individual equipment: ${yarboIndividualItems.join(", ")}`
        : extraOptionNames.length
          ? `Added modules/accessories: ${extraOptionNames.join(", ")}`
          : "Added modules/accessories: None",
      yarboModulesWithoutCore ? YARBO_CORE_ABSENT_NOTICE : null,
      serviceNames.length
        ? `Services/plans: ${serviceNames.join(", ")}`
        : "Services/plans: Equipment only",
      `Purchase preference: ${purchaseMethodLabel}`,
      `Delivery or installation address: ${customerInformation.shippingAddress}`,
      `ZIP code: ${customerInformation.shippingZip}`,
      `Shipping location: ${customerInformation.shippingRegion}, ${customerInformation.shippingState}`,
      `Configured equipment estimate: $${(
        build.equipmentTotalCents / 100
      ).toLocaleString("en-US")}`,
      `Configured service/plan selection: $${(
        services.serviceTotalCents / 100
      ).toLocaleString("en-US")}`,
      build.hasUnpricedEquipment || services.hasUnpricedServices
        ? "One or more selected items require final pricing confirmation."
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerInformation.fullName,
          email: customerInformation.email,
          phone: customerInformation.phone,
          preferredContactMethod: customerInformation.email
            ? "Email"
            : "Phone",
          propertyType: "Nationwide equipment purchase request",
          propertySize: `${customerInformation.shippingAddress}, ${customerInformation.shippingRegion}, ${customerInformation.shippingState} ${customerInformation.shippingZip}`,
          obstacleLevel: null,
          weedEating: null,
          purchaseType: purchaseMethodLabel,
          interests: ["Equipment purchase", ...serviceNames],
          terrain: [],
          priorities: ["Catalog configuration request"],
          productInterest: selectedProductIsYarbo
            ? [selectedProduct.name, primaryConfiguration, ...yarboIndividualItems]
            : [
                selectedProduct.name,
                primaryConfiguration,
                ...extraOptionNames,
              ],
          autoSuggestion: serviceNames,
          extraNotes: requestSummary,
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.toLowerCase().includes("application/json");

      if (!isJson) {
        throw new Error(quoteSubmitErrorMessage);
      }

      let payload: { error?: string };

      try {
        payload = (await response.json()) as { error?: string };
      } catch {
        throw new Error(quoteSubmitErrorMessage);
      }

      if (!response.ok) {
        throw new Error(payload.error ?? quoteSubmitErrorMessage);
      }

      setSubmitStatus("success");
    } catch (error) {
      setSubmitStatus("error");
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The request could not be submitted."
      );
    }
  }

  function renderStage() {
    if (activeStage.key === "product") {
      return (
        <ProductSelection
          products={catalog?.products ?? []}
          selectedProductId={selectedProductId}
          onSelectProduct={handleProductSelect}
        />
      );
    }

    if (activeStage.key === "configuration" && selectedProduct) {
      return (
        <ProductConfiguration
          product={selectedProduct}
          selection={buildSelection}
          onSelectVariant={handleSelectVariant}
          onSelectPackage={handleSelectPackage}
          onChangeOptionQuantity={handleOptionQuantityChange}
          onSelectPurchaseMode={handleSelectPurchaseMode}
          onToggleBaseProduct={handleToggleBaseProduct}
        />
      );
    }

    if (activeStage.key === "review" && selectedProduct) {
      return (
        <EquipmentSelectionReview
          selectedProduct={selectedProduct}
          buildSelection={buildSelection}
        />
      );
    }

    if (activeStage.key === "location") {
      return (
        <LocationAvailabilityCheck
          values={customerInformation}
          locationComplete={locationComplete}
          localServiceEligible={localServiceEligible}
          onChange={updateCustomerInformation}
        />
      );
    }

    if (activeStage.key === "services" && selectedProduct) {
      return (
        <ServiceSelection
          product={selectedProduct}
          availableServices={availableServices}
          selectedServices={eligibleServiceSelections}
          selectedState={customerInformation.shippingState}
          selectedRegion={customerInformation.shippingRegion}
          localServiceEligible={localServiceEligible}
          onToggleService={handleToggleService}
          onSelectPaymentOption={handleSelectPaymentOption}
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

    if (activeStage.key === "customer") {
      return (
        <CustomerInformation
          values={customerInformation}
          onChange={updateCustomerInformation}
        />
      );
    }

    if (selectedProduct) {
      return (
        <PurchaseSummary
          selectedProduct={selectedProduct}
          buildSelection={buildSelection}
          serviceSelections={eligibleServiceSelections}
          purchaseMethodLabel={
            selectedPurchaseMethod
              ? purchaseMethodLabels[selectedPurchaseMethod]
              : "Not selected"
          }
          customerInformation={customerInformation}
          submitStatus={submitStatus}
          submitError={submitError}
          onSubmit={() => void submitRequest()}
        />
      );
    }

    return null;
  }

  if (catalogLoading) {
    return (
      <div className="rounded-[2rem] border border-slate-300 bg-white p-10 text-center shadow-xl">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
        <p className="mt-5 text-lg font-black text-slate-950">
          Loading machines, packages, modules, and plans…
        </p>
      </div>
    );
  }

  if (catalogError || !catalog) {
    return (
      <div className="rounded-[2rem] border border-red-300 bg-white p-8 shadow-xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-700">
          Catalog Could Not Load
        </p>
        <h2 className="mt-3 text-2xl font-black text-slate-950">
          The website could not read the Supabase catalog.
        </h2>
        <p className="mt-4 leading-7 text-slate-600">
          {catalogError || "No catalog data was returned."}
        </p>
        <button
          type="button"
          onClick={() => setCatalogReloadKey((value) => value + 1)}
          className="mt-6 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white"
        >
          Try Loading Again
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-xl">
      <div className="border-b border-slate-200 bg-slate-50 p-5 md:p-7">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          {stages.map((stage, index) => {
            const isActive = index === stageIndex;
            const isComplete = index < stageIndex;

            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => {
                  if (index <= stageIndex) setStageIndex(index);
                }}
                disabled={index > stageIndex}
                className={`rounded-2xl border px-3 py-3 text-left text-sm font-bold transition ${
                  isActive
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : isComplete
                      ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
                      : "cursor-not-allowed border-slate-300 bg-white text-slate-600"
                }`}
              >
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-slate-950">
                  {index + 1}
                </span>
                {stage.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 md:p-10 lg:p-12">{renderStage()}</div>

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

function EquipmentSelectionReview({
  selectedProduct,
  buildSelection,
}: {
  selectedProduct: CatalogProduct;
  buildSelection: ProductBuildSelection;
}) {
  const build = resolveBuildSelection(selectedProduct, buildSelection);
  const selectedProductIsYarbo = isYarboProduct(selectedProduct);
  const selectedTitle =
    selectedProductIsYarbo && build.selectedPackage
      ? yarboPackageDisplayName(build.selectedPackage)
      : build.selectedPackage?.name ??
        build.selectedVariant?.name ??
        (build.isYarboIndividualEquipment
          ? "Individual Yarbo Equipment"
          : selectedProduct.name);

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Equipment Review
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Review the equipment selection before checking availability.
      </h3>

      <p className="mt-4 max-w-4xl leading-7 text-slate-600">
        Your machine, package, attachment, accessory, or individual equipment
        selection is saved. Next, enter the delivery or installation location so
        IDS can show only services available for that location.
      </p>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Selected Equipment
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {selectedTitle}
          </p>
          <p className="mt-2 leading-7 text-slate-600">
            {selectedProduct.name}
          </p>
          <p className="mt-4 text-2xl font-black text-emerald-700">
            {formatCents(build.equipmentTotalCents)}
            {build.hasUnpricedEquipment ? " + quote-required items" : ""}
          </p>
        </section>

        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Pricing Behavior
          </p>
          <p className="mt-2 leading-7 text-slate-700">
            {selectedProductIsYarbo && build.selectedPackage
              ? "Complete Yarbo systems use the selected package price only. The Core and package-item module prices are not added separately."
              : selectedProductIsYarbo && build.isYarboIndividualEquipment
                ? "Individual Yarbo equipment uses standalone line-item prices for the Core and selected modules."
                : "Equipment pricing uses the selected machine, package, variant, and visible add-on lines."}
          </p>
        </section>

        {build.priceItems.length > 0 && (
          <section className="rounded-[2rem] border border-slate-300 bg-white p-6 lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Visible Equipment Lines
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {build.priceItems.map((item) => (
                <div
                  key={item.name}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-black text-slate-950">
                      {item.name}
                      {item.quantity > 1 ? ` x ${item.quantity}` : ""}
                    </p>
                    {selectedProductIsYarbo ? (
                      <YarboPriceDisplay
                        item={item}
                        priceClassName="font-black text-emerald-700"
                      />
                    ) : (
                      <p className="font-black text-emerald-700">
                        {item.priceCents === null
                          ? "Contact for pricing"
                          : formatCents(item.priceCents * item.quantity)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {build.selectedPackage && build.packageIncludedItems.length > 0 && (
          <section className="rounded-[2rem] border border-slate-300 bg-white p-6 lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Included Package Equipment
            </p>
            <div className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-slate-700 md:grid-cols-2">
              {selectedProductIsYarbo &&
                YARBO_INCLUDED_PLATFORM_EQUIPMENT.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              {build.packageIncludedItems.map((item) => (
                <p key={item.optionId}>
                  {item.option
                    ? selectedProductIsYarbo
                      ? yarboOptionDisplayName(item.option)
                      : item.option.name
                    : "Catalog option"}
                  {item.quantity > 1 ? ` x ${item.quantity}` : ""}
                </p>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function LocationAvailabilityCheck({
  values,
  locationComplete,
  localServiceEligible,
  onChange,
}: {
  values: CustomerInformationValues;
  locationComplete: boolean;
  localServiceEligible: boolean;
  onChange: (field: keyof CustomerInformationValues, value: string) => void;
}) {
  const availableRegions = values.shippingState
    ? getRegionOptionsForState(values.shippingState)
    : [];

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Check service and delivery availability
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Enter the installation or delivery address.
      </h3>

      <p className="mt-4 max-w-4xl leading-7 text-slate-600">
        Enter the installation or delivery address so we can show the services
        available for your location. Equipment sales and remote support may be
        available nationwide.
      </p>

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="availability-address"
          >
            Delivery or installation address
          </label>
          <input
            id="availability-address"
            type="text"
            value={values.shippingAddress}
            onChange={(event) =>
              onChange("shippingAddress", event.target.value)
            }
            className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            autoComplete="street-address"
          />
        </div>

        <div>
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="availability-zip"
          >
            ZIP code
          </label>
          <input
            id="availability-zip"
            type="text"
            value={values.shippingZip}
            onChange={(event) => onChange("shippingZip", event.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </div>

        <div>
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="availability-state"
          >
            State
          </label>
          <select
            id="availability-state"
            value={values.shippingState}
            onChange={(event) => {
              onChange("shippingState", event.target.value);
              onChange("shippingRegion", "");
            }}
            className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            autoComplete="address-level1"
          >
            <option value="">Choose a state</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <p className="text-base font-bold text-slate-950">
            Service area region
          </p>
          {values.shippingState ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {availableRegions.map((region) => {
                const selected = values.shippingRegion === region;

                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => onChange("shippingRegion", region)}
                    aria-pressed={selected}
                    className={`rounded-2xl border px-4 py-4 text-sm font-bold transition ${
                      selected
                        ? "border-emerald-700 bg-emerald-700 text-white shadow-md"
                        : "border-slate-300 bg-slate-50 text-slate-700 hover:border-emerald-500 hover:bg-white"
                    }`}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Choose a state to see service-area regions.
            </p>
          )}
        </div>
      </div>

      {locationComplete && (
        <div
          className={`mt-7 rounded-2xl border px-5 py-4 text-sm font-semibold leading-6 ${
            localServiceEligible
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          {localServiceEligible
            ? "Professional installation, deployment, delivery support, and local service plans can be shown for this location."
            : "Local-only installation, deployment, delivery support, and service plans will not be shown for this location. Equipment sales and remote support may still be available nationwide."}
        </div>
      )}

      {!locationComplete && (
        <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950">
          Enter the address, ZIP code, state, and service-area region before
          continuing to services.
        </div>
      )}
    </div>
  );
}
