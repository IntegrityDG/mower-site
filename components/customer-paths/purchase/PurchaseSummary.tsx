import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import EverydayPriceDisplay from "@/components/equipment/EverydayPriceDisplay";
import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import { resolveBuildSelection } from "@/lib/catalog/selection";
import type { CatalogProduct, ProductBuildSelection } from "@/lib/catalog/types";
import {
  YARBO_CORE_ABSENT_NOTICE,
  YARBO_INCLUDED_PLATFORM_EQUIPMENT,
  isYarboProduct,
  yarboOptionDisplayName,
  yarboPackageDisplayName,
} from "@/lib/catalog/yarbo";
import type { CustomerInformationValues } from "@/lib/products/types";
import type { CheckoutSubmissionKind } from "@/lib/checkout/handoff";
import { calculateAchDiscount } from "@/lib/checkout/payment-methods";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

type PurchaseSummaryProps = {
  selectedProduct: CatalogProduct;
  buildSelection: ProductBuildSelection;
  purchaseMethodLabel: string;
  customerInformation: CustomerInformationValues;
  submitStatus: SubmitStatus;
  submitError: string;
  submissionKind: CheckoutSubmissionKind;
  onSubmit: () => void;
};

function summaryValue(value: string) {
  return value.trim() || "Not provided";
}

function optionLinePrice(
  option: CatalogProduct["ungroupedOptions"][number],
  quantity: number
) {
  if (option.currentPriceCents === null) return priceLabel(option);
  return formatCents(option.currentPriceCents * quantity);
}

export default function PurchaseSummary({
  selectedProduct,
  buildSelection,
  purchaseMethodLabel,
  customerInformation,
  submitStatus,
  submitError,
  submissionKind,
  onSubmit,
}: PurchaseSummaryProps) {
  const build = resolveBuildSelection(selectedProduct, buildSelection);
  const configuredTotalCents = build.equipmentTotalCents;
  const hasUnpricedItems = build.hasUnpricedEquipment;
  const selectedProductIsYarbo = isYarboProduct(selectedProduct);
  const isQuote = submissionKind === "quote";
  const isAch = submissionKind === "ach_debit";
  const achDisplay = calculateAchDiscount(configuredTotalCents);
  const heading = isQuote ? "Review and submit your equipment request." : "Review and Pay";
  const intro =
    submissionKind === "card"
      ? "Review your configuration, then continue to Stripe's secure checkout to complete card payment."
      : submissionKind === "ach_debit"
        ? "Review your configuration, then continue to Stripe to authorize ACH payment. Your order remains pending until the funds clear."
        : "Nothing is charged through this form. IDS will review availability, shipping and final pricing before preparing the order.";
  const buttonLabel =
    submissionKind === "card"
      ? "Continue to Secure Payment"
      : submissionKind === "ach_debit"
        ? "Continue with ACH"
        : "Submit Complete Purchase Request";

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        {isQuote ? "Request Summary" : "Order Summary"}
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        {heading}
      </h3>

      <p className="mt-4 max-w-4xl leading-7 text-slate-600">
        {intro}
      </p>

      {selectedProductIsYarbo ? (
        <YarboSummaryGrid
          selectedProduct={selectedProduct}
          build={build}
          purchaseMethodLabel={purchaseMethodLabel}
          customerInformation={customerInformation}
        />
      ) : (
        <StandardSummaryGrid
          selectedProduct={selectedProduct}
          build={build}
          purchaseMethodLabel={purchaseMethodLabel}
          customerInformation={customerInformation}
        />
      )}

      <section className="mt-6 rounded-[2rem] bg-slate-950 p-6 text-white md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
              {isAch ? "ACH Payment Total" : "Configured Price Estimate"}
            </p>

            {isAch ? (
              <div className="mt-3 max-w-xl space-y-3">
                <div className="flex items-center justify-between gap-6 text-sm font-semibold text-slate-300">
                  <span>Configured price</span>
                  <span>{achDisplay.formattedRegularCardTotal}</span>
                </div>

                <div className="flex items-center justify-between gap-6 text-sm font-bold text-emerald-400">
                  <span>{achDisplay.discountRateLabel} ACH discount</span>
                  <span>-{achDisplay.formattedSavings}</span>
                </div>

                <div className="border-t border-slate-700 pt-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    Discounted ACH total
                  </p>
                  <p className="mt-1 text-4xl font-black text-emerald-400">
                    {achDisplay.formattedDiscountedAchTotal}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-4xl font-black">
                {formatCents(configuredTotalCents)}
                {hasUnpricedItems ? " + items requiring a quote" : ""}
              </p>
            )}

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              {isAch
                ? "Stripe will collect the discounted ACH total shown above. Taxes, shipping, and site-specific labor are not included."
                : "Taxes, shipping, site-specific labor, and quote-required items are not included until IDS reviews the request."}
            </p>
          </div>
        </div>
      </section>

      {isQuote && submitStatus === "success" ? (
        <div className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-950">
          <p className="text-xl font-black">Request submitted successfully.</p>
          <p className="mt-2 leading-7">
            IDS received the complete machine, package, module, payment, and
            contact selection.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitStatus === "submitting"}
          className="mt-8 w-full rounded-2xl bg-emerald-600 px-5 py-5 text-lg font-black text-white shadow-xl transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {submitStatus === "submitting" ? "Processing..." : buttonLabel}
        </button>
      )}

      {submitStatus === "error" && (
        <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-semibold leading-6 text-red-900">
          {submitError || "The request could not be submitted. Please try again."}
        </div>
      )}
    </div>
  );
}

function YarboSummaryGrid({
  selectedProduct,
  build,
  purchaseMethodLabel,
  customerInformation,
}: {
  selectedProduct: CatalogProduct;
  build: ReturnType<typeof resolveBuildSelection>;
  purchaseMethodLabel: string;
  customerInformation: CustomerInformationValues;
}) {
  const selectedPackage = build.selectedPackage;
  const modulesWithoutCore =
    build.isYarboIndividualEquipment &&
    !build.yarboCoreSelected &&
    build.selectedOptions.length > 0;

  return (
    <div className="mt-7 grid gap-5 lg:grid-cols-2">
      <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Request Type
        </p>
        <p className="mt-2 text-2xl font-black text-slate-950">
          {selectedPackage ? "Complete Yarbo System" : "Individual Yarbo Equipment"}
        </p>
        <p className="mt-2 leading-7 text-slate-600">
          {selectedPackage
            ? "Package price is used as the complete system price."
            : "Standalone line-item pricing is used for each selected item."}
        </p>
      </section>

      {selectedPackage ? (
        <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Complete System
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {yarboPackageDisplayName(selectedPackage)}
          </p>
          <YarboPriceDisplay
            item={selectedPackage}
            className="mt-2"
            priceClassName="text-xl font-black text-emerald-700"
          />
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            No separate Core charge and no separate package-item module charges.
          </p>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Individual Equipment Lines
          </p>
          <div className="mt-3 space-y-4">
            {build.yarboCoreSelected && (
              <div className="border-b border-slate-200 pb-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-black text-slate-950">{selectedProduct.name}</p>
                  <YarboPriceDisplay
                    item={selectedProduct}
                    priceClassName="font-black text-emerald-700"
                  />
                </div>
              </div>
            )}

            {build.selectedOptions.map(({ option, quantity }) => (
              <div
                key={option.id}
                className="border-b border-slate-200 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black text-slate-950">
                      {yarboOptionDisplayName(option)}
                      {quantity > 1 ? ` x ${quantity}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-bold text-amber-800">
                      Module only — requires a Yarbo Core to operate.
                    </p>
                  </div>
                  <YarboPriceDisplay
                    item={option}
                    priceClassName="font-black text-emerald-700"
                  />
                </div>
              </div>
            ))}

            {!build.yarboCoreSelected && build.selectedOptions.length === 0 && (
              <p className="text-lg font-black text-slate-950">
                No individual equipment selected
              </p>
            )}
          </div>
        </section>
      )}

      {selectedPackage && (
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Included in Package
          </p>
          <div className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
            {YARBO_INCLUDED_PLATFORM_EQUIPMENT.map((item) => (
              <p key={item}>{item}</p>
            ))}
            {build.packageIncludedItems.map((item) => (
              <p key={item.optionId}>
                {item.option ? yarboOptionDisplayName(item.option) : "Yarbo module"}
                {item.quantity > 1 ? ` x ${item.quantity}` : ""}
              </p>
            ))}
          </div>
        </section>
      )}

      {modulesWithoutCore && (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
            Core Required
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-amber-950">
            {YARBO_CORE_ABSENT_NOTICE}
          </p>
        </section>
      )}

      <PurchaseAndCustomerSummary
        purchaseMethodLabel={purchaseMethodLabel}
        customerInformation={customerInformation}
      />
    </div>
  );
}

function StandardSummaryGrid({
  selectedProduct,
  build,
  purchaseMethodLabel,
  customerInformation,
}: {
  selectedProduct: CatalogProduct;
  build: ReturnType<typeof resolveBuildSelection>;
  purchaseMethodLabel: string;
  customerInformation: CustomerInformationValues;
}) {
  return (
    <div className="mt-7 grid gap-5 lg:grid-cols-2">
      <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Machine
        </p>
        <p className="mt-2 text-2xl font-black text-slate-950">
          {selectedProduct.name}
        </p>
        <p className="mt-2 leading-7 text-slate-600">
          {selectedProduct.homepageSummary}
        </p>
      </section>

      <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Main Configuration
        </p>
        <p className="mt-2 text-2xl font-black text-slate-950">
          {build.selectedPackage?.name ??
            build.selectedVariant?.name ??
            selectedProduct.name}
        </p>
        {selectedProduct.slug === "lymow-one-plus" &&
        build.selectedVariant ? (
          <EverydayPriceDisplay
            item={build.selectedVariant}
            comparisonLabel="Lymow Everyday Price"
            className="mt-2"
            priceClassName="text-xl font-black text-emerald-700"
          />
        ) : (
          <p className="mt-2 text-xl font-black text-emerald-700">
            {build.selectedPackage
              ? priceLabel(build.selectedPackage)
              : build.selectedVariant
                ? priceLabel(build.selectedVariant)
                : priceLabel(selectedProduct)}
          </p>
        )}
      </section>

      {build.packageIncludedItems.length > 0 && (
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Included in Package
          </p>
          <div className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
            <p>Base machine/core</p>
            {build.packageIncludedItems.map((item) => (
              <p key={item.optionId}>
                {item.option?.name ?? "Catalog option"}
                {item.quantity > 1 ? ` x ${item.quantity}` : ""}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Added Modules and Accessories
        </p>
        {build.selectedOptions.length > 0 ? (
          <div className="mt-3 space-y-4">
            {build.selectedOptions.map(({ option, quantity }) => (
              <div
                key={option.id}
                className="border-b border-slate-200 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="font-black text-slate-950">
                    {option.name}
                    {quantity > 1 ? ` x ${quantity}` : ""}
                  </p>
                  <p className="font-black text-emerald-700">
                    {optionLinePrice(option, quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-lg font-black text-slate-950">
            No additional modules or accessories selected
          </p>
        )}
      </section>

      <PurchaseAndCustomerSummary
        purchaseMethodLabel={purchaseMethodLabel}
        customerInformation={customerInformation}
      />
    </div>
  );
}

function PurchaseAndCustomerSummary({
  purchaseMethodLabel,
  customerInformation,
}: {
  purchaseMethodLabel: string;
  customerInformation: CustomerInformationValues;
}) {
  return (
    <>
      <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Purchase Preference
        </p>
        <p className="mt-2 text-xl font-black text-slate-950">
          {purchaseMethodLabel}
        </p>
      </section>

      <section className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Customer Contact
        </p>
        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          <p>
            <span className="font-bold text-slate-950">Name:</span>{" "}
            {summaryValue(customerInformation.fullName)}
          </p>
          <p>
            <span className="font-bold text-slate-950">Email:</span>{" "}
            {summaryValue(customerInformation.email)}
          </p>
          <p>
            <span className="font-bold text-slate-950">Phone:</span>{" "}
            {summaryValue(customerInformation.phone)}
          </p>
          <p>
            <span className="font-bold text-slate-950">Address:</span>{" "}
            {summaryValue(customerInformation.shippingAddress)}
          </p>
          <p>
            <span className="font-bold text-slate-950">ZIP:</span>{" "}
            {summaryValue(customerInformation.shippingZip)}
          </p>
          <p>
            <span className="font-bold text-slate-950">Delivery location:</span>{" "}
            {summaryValue(customerInformation.shippingRegion)},{" "}
            {summaryValue(customerInformation.shippingState)}
          </p>
        </div>
      </section>
    </>
  );
}
