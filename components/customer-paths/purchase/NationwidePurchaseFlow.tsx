"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import { formatCents } from "@/lib/catalog/pricing";
import {
  productBuildIsComplete,
  resolveBuildSelection,
  selectedOptionNames,
} from "@/lib/catalog/selection";
import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import { builderAccessoryOptions, customerFacingProductOptions } from "@/lib/catalog/customer-facing-options";
import { isSelfServiceProduct } from "@/lib/catalog/sales-mode";
import { isPublicEquipmentProductSlug } from "@/lib/catalog/product-routing";
import {
  checkoutEndpoint,
  checkoutSubmissionKind,
} from "@/lib/checkout/handoff";
import type { CheckoutRequest } from "@/lib/checkout/types";
import type {
  CatalogProduct,
  CatalogOption,
  CatalogResponse,
  ProductBuildSelection,
} from "@/lib/catalog/types";
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

type NationwidePurchaseFlowProps = {
  selectedState?: string;
  selectedRegion?: string;
};

type StageKey =
  | "product"
  | "configuration"
  | "review"
  | "location"
  | "purchase"
  | "customer"
  | "summary";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

const stages: { key: StageKey }[] = [
  { key: "product" },
  { key: "configuration" },
  { key: "review" },
  { key: "location" },
  { key: "purchase" },
  { key: "customer" },
  { key: "summary" },
];

export const purchaseProgressSteps = [
  { label: "Make Your Selections", stageKeys: ["product", "configuration"] },
  { label: "Review Selections", stageKeys: ["review"] },
  { label: "Pricing & Financing", stageKeys: ["location", "purchase"] },
  { label: "Delivery & Contact", stageKeys: ["customer"] },
  { label: "Checkout", stageKeys: ["summary"] },
] as const satisfies readonly {
  label: string;
  stageKeys: readonly StageKey[];
}[];

const stageIndexByKey = new Map(
  stages.map((stage, index) => [stage.key, index])
);

function progressStepStageIndexes(
  step: (typeof purchaseProgressSteps)[number]
) {
  return step.stageKeys.map((key) => stageIndexByKey.get(key) ?? 0);
}

function progressStepTargetIndex(
  step: (typeof purchaseProgressSteps)[number],
  currentStageIndex: number
) {
  const reachedIndexes = progressStepStageIndexes(step).filter(
    (index) => index <= currentStageIndex
  );

  if (reachedIndexes.length === 0) return null;
  return Math.max(...reachedIndexes);
}

const purchaseMethodLabels: Record<PurchaseMethodKey, string> = {
  "pay-in-full": "Card",
  ach: "ACH bank payment",
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

export function productRequestedByBuildSearch(
  catalog: CatalogResponse,
  search: string
) {
  const requestedSlug = new URLSearchParams(search).get("product")?.trim();
  if (!requestedSlug) return null;

  return (
    catalog.products.find(
      (product) =>
        product.slug === requestedSlug &&
        isPublicEquipmentProductSlug(product.slug) &&
        isSelfServiceProduct(product)
    ) ?? null
  );
}

export function accessoryRequestedByBuildSearch(product: CatalogProduct, search: string) {
  const slug = new URLSearchParams(search).get("accessory")?.trim();
  return slug ? builderAccessoryOptions(product).find((option) => option.slug === slug) ?? null : null;
}

function initialBuildSelection(product: CatalogProduct): ProductBuildSelection {
  return {
    variantId: "",
    packageId: "",
    optionQuantities: Object.fromEntries(
      customerFacingProductOptions(product)
        .filter((option) => option.isIncluded)
        .map((option) => [
          option.id,
          Math.max(1, option.defaultQuantity, option.minimumQuantity),
        ])
    ),
  };
}

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
      referrerName: "",
      referrerEmail: "",
    });
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState("");
  const submissionInProgress = useRef(false);
  const urlPreselectionApplied = useRef(false);

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
    if (!catalog || urlPreselectionApplied.current) return;
    urlPreselectionApplied.current = true;

    const requestedProduct = productRequestedByBuildSearch(
      catalog,
      window.location.search
    );
    if (!requestedProduct) return;

    setSelectedProductId(requestedProduct.id);
    const initial = initialBuildSelection(requestedProduct);
    const accessory = accessoryRequestedByBuildSearch(requestedProduct, window.location.search);
    setBuildSelection(accessory ? { ...initial, optionQuantities: { ...initial.optionQuantities, [accessory.id]: 1 } } : initial);
  }, [catalog]);

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
      catalog?.products.find(
        (product) =>
          product.id === selectedProductId && isSelfServiceProduct(product)
      ) ??
      null,
    [catalog, selectedProductId]
  );
  const accessoryMode = selectedProductId === "accessories";
  const accessoryChoices = useMemo(() => (catalog?.products ?? []).flatMap((product) => {
    const purchasable = builderAccessoryOptions(product);
    const aftermarket = customerFacingProductOptions(product).filter(
      (option) => option.accessoryListingEnabled && option.accessoryTab === "aftermarket"
    );
    return [...purchasable, ...aftermarket].map((option) => ({ product, option }));
  }), [catalog]);
  const selectedAccessoryChoices = accessoryChoices.filter(({ option }) => (buildSelection.optionQuantities[option.id] ?? 0) > 0);
  const configurationRequiresQuote = Boolean(
    selectedProduct &&
      resolveBuildSelection(selectedProduct, buildSelection)
        .hasUnpricedEquipment
  );
  const submissionKind =
    accessoryMode && selectedPurchaseMethod
      ? selectedPurchaseMethod === "ach"
        ? "ach_debit"
        : selectedPurchaseMethod === "pay-in-full"
          ? "card"
          : "quote"
      : selectedProduct && selectedPurchaseMethod
      ? checkoutSubmissionKind(
          selectedProduct,
          selectedPurchaseMethod,
          configurationRequiresQuote
        )
      : "quote";

  useEffect(() => {
    if (!catalog || !selectedProductId) return;
    if (selectedProductId === "accessories") return;

    const product = catalog.products.find(
      (item) => item.id === selectedProductId
    );
    if (!product || !isSelfServiceProduct(product)) {
      setSelectedProductId("");
      setBuildSelection(emptyBuildSelection);
      setStageIndex(0);
    }
  }, [catalog, selectedProductId]);
  const locationComplete = Boolean(
    customerInformation.shippingAddress.trim() &&
      customerInformation.shippingZip.trim() &&
      customerInformation.shippingState.trim() &&
      customerInformation.shippingRegion.trim()
  );
  const buildComplete = Boolean(
    accessoryMode ? selectedAccessoryChoices.length > 0 : selectedProduct && productBuildIsComplete(selectedProduct, buildSelection)
  );
  const customerInformationComplete = Boolean(
    customerInformation.fullName.trim() &&
      (customerInformation.email.trim() || customerInformation.phone.trim()) &&
      (Boolean(customerInformation.referrerName.trim()) ===
        Boolean(customerInformation.referrerEmail.trim()))
  );

  const currentStageComplete =
    (activeStage.key === "product" && (Boolean(selectedProduct) || accessoryMode)) ||
    (activeStage.key === "configuration" && buildComplete) ||
    (activeStage.key === "review" && buildComplete) ||
    (activeStage.key === "location" && locationComplete) ||
    (activeStage.key === "purchase" && Boolean(selectedPurchaseMethod)) ||
    (activeStage.key === "customer" &&
      customerInformationComplete &&
      locationComplete) ||
    activeStage.key === "summary";

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

    if (productId === "accessories") {
      setSelectedProductId(productId);
      setBuildSelection(emptyBuildSelection);
      setSubmitStatus("idle");
      setSubmitError("");
      return;
    }
    const product = catalog?.products.find((item) => item.id === productId);
    if (!product || !isSelfServiceProduct(product)) {
      setSelectedProductId("");
      setBuildSelection(emptyBuildSelection);
      return;
    }
    setSelectedProductId(productId);
    setBuildSelection(initialBuildSelection(product));
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
        optionQuantities: Object.fromEntries(Object.entries(currentSelection.optionQuantities).filter(([id])=>builderAccessoryOptions(selectedProduct).some(option=>option.id===id))),
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
    const option = accessoryMode
      ? accessoryChoices.find((item) => item.option.id === optionId)?.option ?? null
      : selectedProduct
      ? customerFacingProductOptions(selectedProduct).find(
          (item) => item.id === optionId
        )
      : null;
    const maximum =
      !accessoryMode && selectedProduct &&
      option &&
      isYarboProduct(selectedProduct) &&
      isYarboModuleOption(option)
        ? 1
        : option?.maximumQuantity ?? Number.POSITIVE_INFINITY;
    const normalizedQuantity = Math.min(
      maximum,
      Math.max(0, Math.trunc(quantity))
    );

    const yarboModule = Boolean(selectedProduct && isYarboProduct(selectedProduct) && option && isYarboModuleOption(option));
    setBuildSelection((currentSelection) => ({
      ...currentSelection,
      ...(yarboModule
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
          : Object.fromEntries(Object.entries(currentSelection.optionQuantities).filter(([id])=>selectedProduct?builderAccessoryOptions(selectedProduct).some(option=>option.id===id):false)),
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

  function handleSelectPurchaseMethod(method: PurchaseMethodKey) {
    submissionInProgress.current = false;
    setSelectedPurchaseMethod(method);
    setSubmitStatus("idle");
    setSubmitError("");
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
    if (
      (!accessoryMode && (!selectedProduct || !isSelfServiceProduct(selectedProduct))) ||
      !selectedPurchaseMethod ||
      !locationComplete ||
      submissionInProgress.current
    ) {
      return;
    }

    submissionInProgress.current = true;
    setSubmitStatus("submitting");
    setSubmitError("");

    if (accessoryMode) {
      const anchor = selectedAccessoryChoices[0]?.product;
      if (!anchor || submissionKind === "quote") { submissionInProgress.current = false; setSubmitStatus("error"); setSubmitError("Choose a card or ACH payment method for eligible accessories."); return; }
      const checkoutRequest: CheckoutRequest = { requestId: crypto.randomUUID(), paymentMethod: submissionKind, selection: { productId: anchor.id, variantId: null, purchaseMode: "accessories", packageId: null, options: selectedAccessoryChoices.map(({ option }) => ({ optionId: option.id, quantity: buildSelection.optionQuantities[option.id] })), includeBaseProduct: false }, customer: { name: customerInformation.fullName, email: customerInformation.email.trim() || null, phone: customerInformation.phone.trim() || null }, referral: null, shippingAddress: { line1: customerInformation.shippingAddress, line2: null, city: customerInformation.shippingRegion, state: customerInformation.shippingState, postalCode: customerInformation.shippingZip, country: "US" } };
      try { const response = await fetch(checkoutEndpoint(submissionKind), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checkoutRequest) }); const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() as { checkoutUrl?: string; error?: string } : null; if (!response.ok) throw new Error(payload?.error ?? "Unable to start secure checkout."); const redirectUrl = response.redirected ? response.url : payload?.checkoutUrl; if (!redirectUrl) throw new Error("The checkout service did not return a payment URL."); window.location.assign(redirectUrl); } catch (error) { submissionInProgress.current = false; setSubmitStatus("error"); setSubmitError(error instanceof Error ? error.message : "Unable to start secure checkout."); }
      return;
    }
    if (!selectedProduct) return;
    const build = resolveBuildSelection(selectedProduct, buildSelection);
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
    const purchaseMethodLabel = purchaseMethodLabels[selectedPurchaseMethod];

    if (submissionKind !== "quote") {
      const checkoutRequest: CheckoutRequest = {
        requestId: crypto.randomUUID(),
        paymentMethod: submissionKind,
        selection: {
          productId: selectedProduct.id,
          variantId: build.selectedVariant?.id ?? null,
          purchaseMode: build.isYarboCompleteSystem
            ? "complete-system"
            : build.isYarboIndividualEquipment
              ? "individual-equipment"
              : "standard",
          packageId: build.selectedPackage?.id ?? null,
          options: build.selectedOptions.map(({ option, quantity }) => ({
            optionId: option.id,
            quantity,
          })),
          includeBaseProduct: Boolean(build.yarboCoreSelected),
        },
        customer: {
          name: customerInformation.fullName,
          email: customerInformation.email.trim() || null,
          phone: customerInformation.phone.trim() || null,
        },
        referral:
          customerInformation.referrerName.trim() &&
          customerInformation.referrerEmail.trim()
            ? {
                referrerName: customerInformation.referrerName.trim(),
                referrerEmail: customerInformation.referrerEmail.trim(),
              }
            : null,
        shippingAddress: {
          line1: customerInformation.shippingAddress,
          line2: null,
          city: customerInformation.shippingRegion,
          state: customerInformation.shippingState,
          postalCode: customerInformation.shippingZip,
          country: "US",
        },
      };

      try {
        const response = await fetch(checkoutEndpoint(submissionKind), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(checkoutRequest),
        });
        const payload = response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("application/json")
          ? ((await response.json()) as {
              checkoutUrl?: string;
              error?: string;
            })
          : null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to start secure checkout.");
        }

        const redirectUrl = response.redirected
          ? response.url
          : payload?.checkoutUrl;
        if (!redirectUrl) {
          throw new Error("The checkout service did not return a payment URL.");
        }

        window.location.assign(redirectUrl);
      } catch (error) {
        submissionInProgress.current = false;
        setSubmitStatus("error");
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Unable to start secure checkout."
        );
      }
      return;
    }

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
      `Purchase preference: ${purchaseMethodLabel}`,
      `Delivery or installation address: ${customerInformation.shippingAddress}`,
      `ZIP code: ${customerInformation.shippingZip}`,
      `Shipping location: ${customerInformation.shippingRegion}, ${customerInformation.shippingState}`,
      `Configured equipment estimate: $${(
        build.equipmentTotalCents / 100
      ).toLocaleString("en-US")}`,
      build.hasUnpricedEquipment
        ? "One or more selected items require final pricing confirmation."
        : null,
      customerInformation.referrerName.trim() && customerInformation.referrerEmail.trim()
        ? `Referred by: ${customerInformation.referrerName.trim()}`
        : null,
      customerInformation.referrerName.trim() && customerInformation.referrerEmail.trim()
        ? `Referrer email: ${customerInformation.referrerEmail.trim()}`
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
          interests: ["Equipment purchase"],
          terrain: [],
          priorities: ["Catalog configuration request"],
          productSlug: selectedProduct.slug,
          productInterest: selectedProductIsYarbo
            ? [selectedProduct.name, primaryConfiguration, ...yarboIndividualItems]
            : [
                selectedProduct.name,
                primaryConfiguration,
                ...extraOptionNames,
              ],
          autoSuggestion: [],
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
      submissionInProgress.current = false;
    } catch (error) {
      submissionInProgress.current = false;
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
          products={catalog?.products.filter(isSelfServiceProduct) ?? []}
          selectedProductId={selectedProductId}
          onSelectProduct={handleProductSelect}
        />
      );
    }

    if (activeStage.key === "configuration" && accessoryMode) {
      return <AccessoryPurchaseConfiguration choices={accessoryChoices} quantities={buildSelection.optionQuantities} onChange={handleOptionQuantityChange} />;
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

    if (activeStage.key === "review" && accessoryMode) {
      return <AccessoryOnlyReview choices={selectedAccessoryChoices} quantities={buildSelection.optionQuantities} />;
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
          onChange={updateCustomerInformation}
        />
      );
    }

    if (activeStage.key === "purchase") {
      const configuredTotalCents = accessoryMode
        ? selectedAccessoryChoices.reduce((sum, { option }) => sum + (option.currentPriceCents ?? 0) * buildSelection.optionQuantities[option.id], 0)
        : selectedProduct
        ? resolveBuildSelection(selectedProduct, buildSelection)
            .equipmentTotalCents
        : 0;

      return (
        <PurchaseMethod
          selectedMethod={selectedPurchaseMethod}
          checkoutAvailable={!configurationRequiresQuote}
          configuredTotalCents={configuredTotalCents}
          hearthUrl={hearthFinancingUrl}
          onSelectMethod={handleSelectPurchaseMethod}
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

    if (accessoryMode) {
      return <AccessoryOnlySummary choices={selectedAccessoryChoices} quantities={buildSelection.optionQuantities} purchaseMethodLabel={selectedPurchaseMethod ? purchaseMethodLabels[selectedPurchaseMethod] : "Not selected"} customerInformation={customerInformation} submitStatus={submitStatus} submitError={submitError} onSubmit={() => void submitRequest()} />;
    }

    if (selectedProduct) {
      return (
        <PurchaseSummary
          selectedProduct={selectedProduct}
          buildSelection={buildSelection}
          purchaseMethodLabel={
            selectedPurchaseMethod
              ? purchaseMethodLabels[selectedPurchaseMethod]
              : "Not selected"
          }
          customerInformation={customerInformation}
          submitStatus={submitStatus}
          submitError={submitError}
          submissionKind={submissionKind}
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
          Loading machines, packages, and modules…
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
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
          {purchaseProgressSteps.map((step, index) => {
            const stepStageIndexes = progressStepStageIndexes(step);
            const targetStageIndex = progressStepTargetIndex(step, stageIndex);
            const isActive = (step.stageKeys as readonly StageKey[]).includes(
              activeStage.key
            );
            const isComplete =
              !isActive &&
              stepStageIndexes.every((stepIndex) => stepIndex < stageIndex);
            const isReachable = targetStageIndex !== null;

            return (
              <button
                key={step.label}
                type="button"
                onClick={() => {
                  if (targetStageIndex !== null) {
                    setStageIndex(targetStageIndex);
                  }
                }}
                disabled={!isReachable}
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
                {step.label}
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

type AccessoryChoice = { product: CatalogProduct; option: CatalogOption };

function AccessoryPurchaseConfiguration(props: { choices: AccessoryChoice[]; quantities: Record<string, number>; onChange: (id: string, quantity: number) => void }) {
  const purchasable = props.choices.filter(({ option }) => option.accessoryTab !== "aftermarket" || option.showInBuilder === true);
  const aftermarket = props.choices.filter(({ option }) => option.accessoryTab === "aftermarket" && option.showInBuilder !== true);
  return <><AccessoryOnlyConfiguration {...props} choices={purchasable} />{aftermarket.length > 0 && <section className="mt-8"><h3 className="text-2xl font-black">Aftermarket Products</h3><p className="mt-2 text-slate-600">These products are sold by their manufacturers and cannot be added to IDS checkout.</p><div className="mt-5 grid gap-4 lg:grid-cols-2">{aftermarket.map(({ option }) => <article key={option.id} className="rounded-2xl border border-slate-300 p-5"><p className="text-xs font-black uppercase text-emerald-700">{option.manufacturerName || "Aftermarket"}</p><h4 className="mt-2 text-lg font-black">{option.name}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{option.description}</p>{option.accessoryActionUrl && <a href={option.accessoryActionUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-3 font-black text-white">{option.accessoryActionLabel || "Go to Manufacturer's Site"}</a>}</article>)}</div></section>}</>;
}

function AccessoryOnlyConfiguration({ choices, quantities, onChange }: { choices: AccessoryChoice[]; quantities: Record<string, number>; onChange: (id: string, quantity: number) => void }) {
  const [search, setSearch] = useState("");
  const visible = choices.filter(({ option, product }) => `${product.brand} ${option.name}`.toLowerCase().includes(search.toLowerCase()));
  return <div><p className="text-sm font-bold uppercase tracking-[.25em] text-emerald-700">Accessories &amp; Parts</p><h3 className="mt-3 text-3xl font-black">Choose eligible accessories and quantities.</h3><p className="mt-4 leading-7 text-slate-600">Only active, catalog-priced Lymow and Yarbo items approved for IDS checkout appear here. Aftermarket informational links and contact-only items are not checkout items.</p><label className="mt-6 block font-bold">Search accessories<input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><div className="mt-6 grid gap-4 lg:grid-cols-2">{visible.map(({ product, option }) => { const quantity = quantities[option.id] ?? 0; return <article key={option.id} className={`rounded-2xl border p-5 ${quantity ? "border-emerald-700 bg-emerald-50" : "border-slate-300"}`}><p className="text-xs font-black uppercase text-emerald-700">{product.brand}</p><h4 className="mt-2 text-lg font-black">{option.name}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{option.description}</p><p className="mt-3 font-black text-emerald-700">{option.currentPriceCents === null ? "Unavailable" : formatCents(option.currentPriceCents)}</p><div className="mt-4 flex items-center gap-3"><button type="button" aria-label={`Decrease ${option.name} quantity`} onClick={() => onChange(option.id, Math.max(0, quantity - 1))} className="h-10 w-10 rounded-xl border bg-white font-black">−</button><span className="min-w-8 text-center font-black">{quantity}</span><button type="button" aria-label={`Increase ${option.name} quantity`} onClick={() => onChange(option.id, quantity + 1)} className="h-10 w-10 rounded-xl border bg-white font-black">+</button></div></article>; })}</div></div>;
}

function AccessoryOnlyReview({ choices, quantities }: { choices: AccessoryChoice[]; quantities: Record<string, number> }) {
  const total = choices.reduce((sum, { option }) => sum + (option.currentPriceCents ?? 0) * quantities[option.id], 0);
  return <div><p className="text-sm font-bold uppercase tracking-[.25em] text-emerald-700">Review Selections</p><h3 className="mt-3 text-3xl font-black">Review your accessories and parts.</h3><div className="mt-7 space-y-3">{choices.map(({ product, option }) => <div key={option.id} className="flex justify-between gap-5 rounded-2xl border p-4"><span><strong>{option.name}</strong><span className="ml-2 text-slate-500">{product.brand} × {quantities[option.id]}</span></span><strong>{formatCents((option.currentPriceCents ?? 0) * quantities[option.id])}</strong></div>)}</div><p className="mt-5 text-right text-2xl font-black">Catalog subtotal: {formatCents(total)}</p></div>;
}

function AccessoryOnlySummary({ choices, quantities, purchaseMethodLabel, customerInformation, submitStatus, submitError, onSubmit }: { choices: AccessoryChoice[]; quantities: Record<string, number>; purchaseMethodLabel: string; customerInformation: CustomerInformationValues; submitStatus: SubmitStatus; submitError: string; onSubmit: () => void }) {
  const total = choices.reduce((sum, { option }) => sum + (option.currentPriceCents ?? 0) * quantities[option.id], 0);
  return <div><p className="text-sm font-bold uppercase tracking-[.25em] text-emerald-700">Order Summary</p><h3 className="mt-3 text-3xl font-black">Review and Pay</h3><p className="mt-4 text-slate-600">The checkout server will reload every item and current price from the catalog before creating the order.</p><div className="mt-7 rounded-2xl border p-5">{choices.map(({ option }) => <p key={option.id} className="mb-2 flex justify-between"><span>{option.name} × {quantities[option.id]}</span><strong>{formatCents((option.currentPriceCents ?? 0) * quantities[option.id])}</strong></p>)}<p className="mt-4 flex justify-between border-t pt-4 text-xl font-black"><span>Catalog subtotal</span><span>{formatCents(total)}</span></p></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><p><strong>Payment:</strong> {purchaseMethodLabel}</p><p><strong>Customer:</strong> {customerInformation.fullName}</p><p><strong>Delivery:</strong> {customerInformation.shippingAddress}</p><p><strong>Location:</strong> {customerInformation.shippingRegion}, {customerInformation.shippingState} {customerInformation.shippingZip}</p></div>{submitError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{submitError}</p>}<button type="button" disabled={submitStatus === "submitting"} onClick={onSubmit} className="mt-7 w-full rounded-2xl bg-emerald-600 px-6 py-4 font-black text-white disabled:opacity-60">{submitStatus === "submitting" ? "Starting secure checkout..." : "Continue to Secure Payment"}</button></div>;
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
        selection is saved. Next, enter the delivery or installation location
        for this request.
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
  onChange,
}: {
  values: CustomerInformationValues;
  locationComplete: boolean;
  onChange: (field: keyof CustomerInformationValues, value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Delivery Information
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Enter the installation or delivery address.
      </h3>

      <p className="mt-4 max-w-4xl leading-7 text-slate-600">
        Enter the installation or delivery address for the equipment request.
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
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="availability-region"
          >
            City, county, or region
          </label>
          <input
            id="availability-region"
            type="text"
            value={values.shippingRegion}
            onChange={(event) => onChange("shippingRegion", event.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            autoComplete="address-level2"
          />
        </div>
      </div>

      {locationComplete && (
        <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold leading-6 text-emerald-950">
          Delivery information is complete for this equipment request.
        </div>
      )}

      {!locationComplete && (
        <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950">
          Enter the address, ZIP code, state, and city, county, or region before
          continuing.
        </div>
      )}
    </div>
  );
}
