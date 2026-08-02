import type { PurchaseMethodKey } from "@/lib/products/types";
import { calculateAchDiscount } from "@/lib/checkout/payment-methods";

type PurchaseMethodProps = {
  selectedMethod: PurchaseMethodKey | "";
  checkoutAvailable: boolean;
  configuredTotalCents: number;
  hearthUrl: string;
  onSelectMethod: (method: PurchaseMethodKey) => void;
};

export default function PurchaseMethod({
  selectedMethod,
  checkoutAvailable,
  configuredTotalCents,
  hearthUrl,
  onSelectMethod,
}: PurchaseMethodProps) {
  const payInFullSelected = selectedMethod === "pay-in-full";
  const achSelected = selectedMethod === "ach";
  const hearthSelected = selectedMethod === "hearth-financing";
  const achDisplay = calculateAchDiscount(configuredTotalCents);

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Purchase Method
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Choose how you want to continue.
      </h3>

      <p className="mt-4 max-w-3xl leading-7 text-slate-600">
        {checkoutAvailable
          ? "Card and ACH selections continue to Stripe's secure payment flow. Financing requests continue through the existing request process."
          : "This configuration requires final review. Choose a purchase preference to include with the request; no payment is collected here."}
      </p>

      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelectMethod("pay-in-full")}
          aria-pressed={payInFullSelected}
          className={`rounded-[2rem] border p-6 text-left transition ${
            payInFullSelected
              ? "border-emerald-700 bg-emerald-50 shadow-xl"
              : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
          }`}
        >
          <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
            Direct Purchase
          </span>

          <h4 className="mt-5 text-2xl font-black text-slate-950">
            Card
          </h4>

          <p className="mt-4 leading-7 text-slate-600">
            {checkoutAvailable
              ? "Continue to Stripe Checkout to pay securely by card."
              : "Record a pay-in-full preference with the equipment request."}
          </p>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Configured total
            </p>
            <p className="mt-1 text-2xl font-black text-slate-950">
              {achDisplay.formattedRegularCardTotal}
            </p>
          </div>

          <p className="mt-6 text-sm font-bold text-emerald-700">
            {payInFullSelected ? "Selected" : "Select this method"}
          </p>
        </button>

        {checkoutAvailable && <button
          type="button"
          onClick={() => onSelectMethod("ach")}
          aria-pressed={achSelected}
          className={`rounded-[2rem] border p-6 text-left transition ${
            achSelected
              ? "border-emerald-700 bg-emerald-50 shadow-xl"
              : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
          }`}
        >
          <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
            Bank Payment
          </span>
          <h4 className="mt-5 text-2xl font-black text-slate-950">ACH</h4>
          <p className="mt-4 leading-7 text-slate-600">
            Continue to Stripe to authorize an ACH payment. The order remains
            pending until the funds clear.
          </p>
          <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Save {achDisplay.formattedSavings}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-700">
                {achDisplay.discountRateLabel} ACH discount
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  ACH total
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-700">
                  {achDisplay.formattedDiscountedAchTotal}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Card total
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {achDisplay.formattedRegularCardTotal}
                </p>
              </div>
            </div>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-950">
              Clearing can take several business days. Fulfillment stays pending
              until ACH payment succeeds.
            </p>
          </div>
          <p className="mt-6 text-sm font-bold text-emerald-700">
            {achSelected ? "Selected" : "Select this method"}
          </p>
        </button>}

        <a
          href={hearthUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onSelectMethod("hearth-financing")}
          className={`rounded-[2rem] border p-6 text-left transition ${
            hearthSelected
              ? "border-emerald-700 bg-emerald-50 shadow-xl"
              : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
          }`}
        >
          <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
            Hearth
          </span>

          <h4 className="mt-5 text-2xl font-black text-slate-950">
            Explore financing through Hearth
          </h4>

          <p className="mt-4 leading-7 text-slate-600">
            Open the IDS Hearth financing page in a new tab to explore
            potential options from participating lending partners.
          </p>

          <p className="mt-6 text-sm font-bold text-emerald-700">
            {hearthSelected ? "Selected and opened in new tab" : "Open Hearth"}
          </p>
        </a>
      </div>
    </div>
  );
}
