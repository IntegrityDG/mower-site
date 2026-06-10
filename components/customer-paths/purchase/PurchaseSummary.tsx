import type {
  CustomerInformationValues,
  ComingSoonProductOptionGroup,
  ProductCatalogItem,
  ProductOption,
  QuantityAccessoryOption,
} from "@/lib/products/types";

type SelectedQuantityAccessory = {
  accessory: QuantityAccessoryOption;
  quantity: number;
};

type PurchaseSummaryProps = {
  selectedProduct: ProductCatalogItem | null;
  selectedConfigurationOption: ProductOption | null;
  selectedOptions: ProductOption[];
  includedOptions: ProductOption[];
  selectedQuantityAccessories: SelectedQuantityAccessory[];
  comingSoonGroups: ComingSoonProductOptionGroup[];
  purchaseMethodLabel: string;
  setupPreferenceLabel: string;
  customerInformation: CustomerInformationValues;
};

function summaryValue(value: string) {
  return value.trim() || "Not provided";
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}

export default function PurchaseSummary({
  selectedProduct,
  selectedConfigurationOption,
  selectedOptions,
  includedOptions,
  selectedQuantityAccessories,
  comingSoonGroups,
  purchaseMethodLabel,
  setupPreferenceLabel,
  customerInformation,
}: PurchaseSummaryProps) {
  const selectedCharger =
    selectedProduct?.id === "lymow-one-plus" ? selectedConfigurationOption : null;

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Order Summary
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Review your nationwide purchase request.
      </h3>

      <p className="mt-4 max-w-3xl leading-7 text-slate-600">
        This summary is not submitted yet. The final request step will be added
        next.
      </p>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Selected Product
          </p>

          <p className="mt-2 text-xl font-black text-slate-950">
            {selectedProduct?.name ?? "Not selected"}
          </p>

          {selectedProduct && (
            <p className="mt-3 text-sm font-bold text-slate-700">
              Quantity: 1
            </p>
          )}
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Required Configuration
          </p>

          <p className="mt-2 text-xl font-black text-slate-950">
            {selectedConfigurationOption?.label ?? "Not required"}
          </p>
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Selected Charger
          </p>

          <p className="mt-2 text-xl font-black text-slate-950">
            {selectedCharger?.label ?? "Not applicable"}
          </p>
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Selected Modules or Package Options
          </p>

          {selectedOptions.length ? (
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {selectedOptions.map((option) => (
                <p key={option.id}>{option.label}</p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xl font-black text-slate-950">
              None selected
            </p>
          )}
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Quantity Accessories
          </p>

          {selectedQuantityAccessories.length ? (
            <div className="mt-3 space-y-5 text-sm leading-6 text-slate-700">
              {selectedQuantityAccessories.map(({ accessory, quantity }) => {
                const subtotalCents =
                  accessory.unitPriceCents === undefined
                    ? null
                    : accessory.unitPriceCents * quantity;

                return (
                  <div key={accessory.optionId}>
                    <p className="text-xl font-black text-slate-950">
                      {accessory.label}
                    </p>

                    <p className="mt-2">
                      <span className="font-bold text-slate-950">
                        Quantity:
                      </span>{" "}
                      {quantity}
                    </p>

                    <p>
                      <span className="font-bold text-slate-950">
                        Per-unit price:
                      </span>{" "}
                      {accessory.unitPriceCents === undefined
                        ? "To be confirmed"
                        : formatCents(accessory.unitPriceCents)}
                    </p>

                    <p>
                      <span className="font-bold text-slate-950">
                        Accessory subtotal:
                      </span>{" "}
                      {subtotalCents === null
                        ? "To be confirmed"
                        : formatCents(subtotalCents)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xl font-black text-slate-950">
              None selected
            </p>
          )}
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Included Equipment
          </p>

          {includedOptions.length ? (
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {includedOptions.map((option) => (
                <p key={option.id}>{option.label}</p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xl font-black text-slate-950">
              None listed
            </p>
          )}
        </div>

        {comingSoonGroups.length > 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 p-6 lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Future Modules
            </p>

            <div className="mt-3 space-y-4 text-sm leading-6 text-slate-700">
              {comingSoonGroups.map((group) => (
                <div key={group.id}>
                  <p className="text-lg font-black text-slate-950">
                    {group.title}
                  </p>

                  <p className="mt-2">{group.description}</p>

                  <p className="mt-2 font-bold text-slate-950">
                    Coming-soon items are not selected and are not included in
                    pricing.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Purchase Method
          </p>

          <p className="mt-2 text-xl font-black text-slate-950">
            {purchaseMethodLabel}
          </p>
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Setup Preference
          </p>

          <p className="mt-2 text-xl font-black text-slate-950">
            {setupPreferenceLabel}
          </p>
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6">
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
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-slate-50 p-6 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Shipping Location
          </p>

          <div className="mt-3 grid gap-4 text-sm leading-6 text-slate-700 md:grid-cols-2">
            <p>
              <span className="font-bold text-slate-950">State:</span>{" "}
              {summaryValue(customerInformation.shippingState)}
            </p>

            <p>
              <span className="font-bold text-slate-950">Region:</span>{" "}
              {summaryValue(customerInformation.shippingRegion)}
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled
        className="mt-8 w-full cursor-not-allowed rounded-2xl bg-slate-950 px-5 py-4 font-bold text-white opacity-60"
      >
        Submit Purchase Request — Coming Next
      </button>
    </div>
  );
}
