import type { PurchaseMethodKey } from "@/lib/products/types";

type PurchaseMethodProps = {
  selectedMethod: PurchaseMethodKey | "";
  checkoutAvailable: boolean;
  hearthUrl: string;
  onSelectMethod: (method: PurchaseMethodKey) => void;
};

export default function PurchaseMethod({
  selectedMethod,
  checkoutAvailable,
  hearthUrl,
  onSelectMethod,
}: PurchaseMethodProps) {
  const payInFullSelected = selectedMethod === "pay-in-full";
  const achSelected = selectedMethod === "ach";
  const wireSelected = selectedMethod === "wire";
  const hearthSelected = selectedMethod === "hearth-financing";

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
          ? "Card, ACH, and wire selections continue to Stripe's secure payment flow. Financing requests continue through the existing request process."
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
            Pay in full
          </h4>

          <p className="mt-4 leading-7 text-slate-600">
            {checkoutAvailable
              ? "Continue to Stripe Checkout to pay securely by card."
              : "Record a pay-in-full preference with the equipment request."}
          </p>

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
          <p className="mt-6 text-sm font-bold text-emerald-700">
            {achSelected ? "Selected" : "Select this method"}
          </p>
        </button>}

        {checkoutAvailable && <button
          type="button"
          onClick={() => onSelectMethod("wire")}
          aria-pressed={wireSelected}
          className={`rounded-[2rem] border p-6 text-left transition ${
            wireSelected
              ? "border-emerald-700 bg-emerald-50 shadow-xl"
              : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
          }`}
        >
          <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
            Bank Payment
          </span>
          <h4 className="mt-5 text-2xl font-black text-slate-950">
            Wire transfer
          </h4>
          <p className="mt-4 leading-7 text-slate-600">
            Continue to Stripe for wire instructions. The order remains pending
            until the transferred funds clear.
          </p>
          <p className="mt-6 text-sm font-bold text-emerald-700">
            {wireSelected ? "Selected" : "Select this method"}
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
