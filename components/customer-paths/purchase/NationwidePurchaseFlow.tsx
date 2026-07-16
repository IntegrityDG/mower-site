"use client";

import { useEffect, useMemo, useState } from "react";

import {
  productBuildIsComplete,
  resolveBuildSelection,
  resolveServiceSelections,
  selectedOptionNames,
} from "@/lib/catalog/selection";
import type {
  CatalogResponse,
  CatalogService,
  ProductBuildSelection,
  ServiceSelection as SelectedService,
} from "@/lib/catalog/types";
import type {
  CustomerInformationValues,
  PurchaseMethodKey,
} from "@/lib/products/types";

import CustomerInformation from "./CustomerInformation";
import ProductConfiguration from "./ProductConfiguration";
import ProductSelection from "./ProductSelection";
import PurchaseMethod from "./PurchaseMethod";
import PurchaseSummary from "./PurchaseSummary";
import ServiceSelection from "./ServiceSelection";

type NationwidePurchaseFlowProps = {
  selectedState: string;
  selectedRegion: string;
};

type StageKey =
  | "introduction"
  | "product"
  | "configuration"
  | "services"
  | "purchase"
  | "customer"
  | "summary";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

const stages: { key: StageKey; label: string }[] = [
  { key: "introduction", label: "Introduction" },
  { key: "product", label: "Machine Info" },
  { key: "configuration", label: "Packages & Options" },
  { key: "services", label: "Services & Plans" },
  { key: "purchase", label: "Purchase" },
  { key: "customer", label: "Customer" },
  { key: "summary", label: "Summary" },
];

const purchaseMethodLabels: Record<PurchaseMethodKey, string> = {
  "pay-in-full": "Pay in full",
  "hearth-financing": "Explore financing through Hearth",
};

const emptyBuildSelection: ProductBuildSelection = {
  variantId: "",
  packageId: "",
  optionQuantities: {},
};

export default function NationwidePurchaseFlow({
  selectedState,
  selectedRegion,
}: NationwidePurchaseFlowProps) {
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
        const response = await fetch("/api/catalog", { cache: "no-store" });
        const payload = (await response.json()) as CatalogResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load the catalog.");
        }

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

  const buildComplete = Boolean(
    selectedProduct && productBuildIsComplete(selectedProduct, buildSelection)
  );
  const selectedServicesComplete = Boolean(
    !selectedProduct ||
      serviceSelections.every((selection) => {
        const service = selectedProduct.services.find(
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
      (customerInformation.email.trim() || customerInformation.phone.trim()) &&
      customerInformation.shippingState.trim() &&
      customerInformation.shippingRegion.trim()
  );

  const currentStageComplete =
    activeStage.key === "introduction" ||
    (activeStage.key === "product" && Boolean(selectedProductId)) ||
    (activeStage.key === "configuration" && buildComplete) ||
    (activeStage.key === "services" && selectedServicesComplete) ||
    (activeStage.key === "purchase" && Boolean(selectedPurchaseMethod)) ||
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
    setBuildSelection((currentSelection) => ({
      ...currentSelection,
      optionQuantities: {
        ...currentSelection.optionQuantities,
        [optionId]: Math.max(0, Math.trunc(quantity)),
      },
    }));
  }

  function handleToggleService(service: CatalogService) {
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
    if (!selectedProduct || !selectedPurchaseMethod) return;

    setSubmitStatus("submitting");
    setSubmitError("");

    const build = resolveBuildSelection(selectedProduct, buildSelection);
    const services = resolveServiceSelections(
      selectedProduct,
      serviceSelections
    );
    const primaryConfiguration =
      build.selectedPackage?.name ??
      build.selectedVariant?.name ??
      selectedProduct.name;
    const extraOptionNames = selectedOptionNames(build.selectedOptions);
    const serviceNames = services.services.map(({ service, paymentOption }) =>
      paymentOption
        ? `${service.name} — ${paymentOption.name}`
        : service.name
    );
    const purchaseMethodLabel = purchaseMethodLabels[selectedPurchaseMethod];

    const requestSummary = [
      "NATIONWIDE EQUIPMENT PURCHASE REQUEST",
      `Machine: ${selectedProduct.name}`,
      `Configuration/package: ${primaryConfiguration}`,
      build.packageIncludedItems.length
        ? `Package includes: Base machine/core, ${build.packageIncludedItems
            .map((item) => item.option?.name ?? "Catalog option")
            .join(", ")}`
        : null,
      extraOptionNames.length
        ? `Added modules/accessories: ${extraOptionNames.join(", ")}`
        : "Added modules/accessories: None",
      serviceNames.length
        ? `Services/plans: ${serviceNames.join(", ")}`
        : "Services/plans: Equipment only",
      `Purchase preference: ${purchaseMethodLabel}`,
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
          propertySize: `${customerInformation.shippingRegion}, ${customerInformation.shippingState}`,
          obstacleLevel: null,
          weedEating: null,
          purchaseType: purchaseMethodLabel,
          interests: ["Equipment purchase", ...serviceNames],
          terrain: [],
          priorities: ["Catalog configuration request"],
          productInterest: [
            selectedProduct.name,
            primaryConfiguration,
            ...extraOptionNames,
          ],
          autoSuggestion: serviceNames,
          extraNotes: requestSummary,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "The request could not be submitted.");
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
    if (activeStage.key === "introduction") {
      return (
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
            Nationwide Purchasing
          </p>

          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
            Compare machines and build a complete order request.
          </h2>

          <div className="mt-5 max-w-4xl space-y-4 text-lg leading-8 text-slate-600">
            <p>
              Review detailed information for every machine, choose the exact
              configuration or package, add compatible modules and accessories,
              and select any setup or property-management services you need.
            </p>
            <p>
              This process prepares a complete request for IDS review. No
              payment is collected here, and hands-on services remain subject
              to regional availability.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-950">
            Selected location: {selectedRegion}, {selectedState}.
          </div>
        </div>
      );
    }

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
        />
      );
    }

    if (activeStage.key === "services" && selectedProduct) {
      return (
        <ServiceSelection
          product={selectedProduct}
          selectedServices={serviceSelections}
          selectedState={selectedState}
          selectedRegion={selectedRegion}
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
          serviceSelections={serviceSelections}
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
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
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
