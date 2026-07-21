"use client";

import { priceLabel } from "@/lib/catalog/pricing";
import type {
  CatalogProduct,
  CatalogService,
  ServiceSelection as SelectedService,
} from "@/lib/catalog/types";

type ServiceSelectionProps = {
  product: CatalogProduct;
  availableServices: CatalogService[];
  selectedServices: SelectedService[];
  selectedState: string;
  selectedRegion: string;
  localServiceEligible: boolean;
  onToggleService: (service: CatalogService) => void;
  onSelectPaymentOption: (serviceId: string, paymentOptionId: string) => void;
};

function billingLabel(billingType: string) {
  return billingType.replaceAll("_", " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );
}

export default function ServiceSelection({
  product,
  availableServices,
  selectedServices,
  selectedState,
  selectedRegion,
  localServiceEligible,
  onToggleService,
  onSelectPaymentOption,
}: ServiceSelectionProps) {
  const hiddenLocalServices = product.services.filter(
    (service) => service.requiresLocalService && !localServiceEligible
  );
  const recurringServices = availableServices.filter(
    (service) => service.paymentOptions.length > 0
  );
  const oneTimeServices = availableServices.filter(
    (service) => service.paymentOptions.length === 0
  );

  function serviceCard(service: CatalogService) {
    const selected = selectedServices.find(
      (selection) => selection.serviceId === service.id
    );
    const isSelected = Boolean(selected);

    return (
      <article
        key={service.id}
        className={`rounded-[2rem] border p-5 transition md:p-6 ${
          isSelected
            ? "border-emerald-700 bg-emerald-50 shadow-lg"
            : "border-slate-300 bg-white shadow-sm"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
                {billingLabel(service.billingType)}
              </span>
              {service.isRecommended && (
                <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
                  Recommended
                </span>
              )}
              {service.requiresLocalService && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-900">
                  Regional Service
                </span>
              )}
            </div>

            <h5 className="mt-4 text-xl font-black text-slate-950">
              {service.name}
            </h5>
            <p className="mt-3 leading-7 text-slate-600">
              {service.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-700">
              {service.estimatedHours !== null && (
                <span>Estimated time: {service.estimatedHours} hours</span>
              )}
              {service.maximumVisitHours !== null && (
                <span>Visit limit: {service.maximumVisitHours} hours</span>
              )}
              {service.requiresPropertyReview && (
                <span>Property review required</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleService(service)}
            className={`shrink-0 rounded-2xl px-5 py-3 font-black transition ${
              isSelected
                ? "bg-emerald-700 text-white"
                : "border border-slate-300 bg-white text-slate-950 hover:border-emerald-500"
            }`}
          >
            {isSelected ? "Selected ✓" : "Add Service"}
          </button>
        </div>

        {service.requiresLocalService && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            This hands-on service is shown because the checked delivery or
            installation location is eligible: {selectedRegion}, {selectedState}.
          </div>
        )}

        {service.paymentOptions.length === 0 && (
          <p className="mt-5 text-xl font-black text-emerald-700">
            {priceLabel(service)}
          </p>
        )}

        {isSelected && service.paymentOptions.length > 0 && (
          <div className="mt-5 border-t border-emerald-200 pt-5">
            <p className="text-sm font-black text-slate-950">
              Choose a payment option:
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {service.paymentOptions.map((paymentOption) => {
                const paymentSelected =
                  selected?.paymentOptionId === paymentOption.id;

                return (
                  <button
                    key={paymentOption.id}
                    type="button"
                    onClick={() =>
                      onSelectPaymentOption(service.id, paymentOption.id)
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      paymentSelected
                        ? "border-emerald-700 bg-white shadow-md"
                        : "border-slate-300 bg-white hover:border-emerald-500"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">
                          {paymentOption.name}
                        </p>
                        <p className="mt-2 text-lg font-black text-emerald-700">
                          {priceLabel(paymentOption)}
                        </p>
                        {paymentOption.savingsLabel &&
                          paymentOption.savingsLabel !== "$0 savings" && (
                            <p className="mt-1 text-sm font-bold text-emerald-700">
                              {paymentOption.savingsLabel}
                            </p>
                          )}
                        {paymentOption.notes && (
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {paymentOption.notes}
                          </p>
                        )}
                      </div>
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                          paymentSelected
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-slate-400 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Setup, Care, and Property Management
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Add services or a support plan.
      </h3>

      <p className="mt-4 max-w-4xl leading-7 text-slate-600">
        Services are optional. This list is filtered for the delivery or
        installation location you entered, so local-only delivery,
        installation, deployment, and service plans are shown only when they
        are available for that location.
      </p>

      {localServiceEligible ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold leading-6 text-emerald-950">
          Professional installation and local support are available for{" "}
          {selectedRegion}, {selectedState}.
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950">
          Professional installation and local support are not shown for this
          location. Equipment sales and remote support may still be available
          nationwide.
        </div>
      )}

      {recurringServices.length > 0 && (
        <section className="mt-8">
          <div className="rounded-2xl bg-slate-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
              Ongoing Plans
            </p>
            <h4 className="mt-2 text-2xl font-black">
              Monthly or season-prepay options
            </h4>
            <p className="mt-2 leading-7 text-slate-300">
              Select a plan, then choose monthly billing or the available
              discounted season prepay.
            </p>
          </div>
          <div className="mt-5 space-y-5">
            {recurringServices.map(serviceCard)}
          </div>
        </section>
      )}

      {oneTimeServices.length > 0 && (
        <section className="mt-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Setup and Additional Services
          </p>
          <h4 className="mt-2 text-2xl font-black text-slate-950">
            One-time and request-based support
          </h4>
          <div className="mt-5 space-y-5">
            {oneTimeServices.map(serviceCard)}
          </div>
        </section>
      )}

      {hiddenLocalServices.length > 0 && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm leading-6 text-slate-700">
          {hiddenLocalServices.length} local-only service{" "}
          {hiddenLocalServices.length === 1 ? "option is" : "options are"} not
          shown because the current delivery or installation location is
          outside the IDS local service area.
        </div>
      )}

      {availableServices.length === 0 && (
        <div className="mt-8 rounded-2xl border border-slate-300 bg-slate-50 p-6 text-slate-700">
          No eligible services are currently available for this machine and
          location. You can still continue with an equipment-only request.
        </div>
      )}
    </div>
  );
}
