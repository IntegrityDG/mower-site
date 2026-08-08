import type { CustomerInformationValues } from "@/lib/products/types";

type CustomerInformationProps = {
  values: CustomerInformationValues;
  onChange: (field: keyof CustomerInformationValues, value: string) => void;
};

const inputClassName =
  "mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function CustomerInformation({
  values,
  onChange,
}: CustomerInformationProps) {
  const hasName = Boolean(values.fullName.trim());
  const hasContact = Boolean(values.email.trim() || values.phone.trim());
  const hasLocation = Boolean(
    values.shippingAddress.trim() &&
      values.shippingZip.trim() &&
      values.shippingState.trim() &&
      values.shippingRegion.trim()
  );
  const hasPartialReferral =
    Boolean(values.referrerName.trim()) !== Boolean(values.referrerEmail.trim());

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Customer Information
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Add contact details and confirm the delivery location.
      </h3>

      <p className="mt-4 max-w-3xl leading-7 text-slate-600">
        Provide your name and at least one contact method. You can also confirm
        or adjust the delivery or installation address before submitting.
      </p>

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <div>
          <label className="text-base font-bold text-slate-950" htmlFor="full-name">
            Full name
          </label>

          <input
            id="full-name"
            type="text"
            value={values.fullName}
            onChange={(event) => onChange("fullName", event.target.value)}
            className={inputClassName}
            autoComplete="name"
          />
        </div>

        <div>
          <label className="text-base font-bold text-slate-950" htmlFor="email">
            Email
          </label>

          <input
            id="email"
            type="email"
            value={values.email}
            onChange={(event) => onChange("email", event.target.value)}
            className={inputClassName}
            autoComplete="email"
          />
        </div>

        <div>
          <label className="text-base font-bold text-slate-950" htmlFor="phone">
            Phone
          </label>

          <input
            id="phone"
            type="tel"
            value={values.phone}
            onChange={(event) => onChange("phone", event.target.value)}
            className={inputClassName}
            autoComplete="tel"
          />
        </div>

        <div className="md:col-span-2">
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="shipping-address"
          >
            Delivery or installation address
          </label>

          <input
            id="shipping-address"
            type="text"
            value={values.shippingAddress}
            onChange={(event) =>
              onChange("shippingAddress", event.target.value)
            }
            className={inputClassName}
            autoComplete="street-address"
          />
        </div>

        <div>
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="shipping-zip"
          >
            ZIP code
          </label>

          <input
            id="shipping-zip"
            type="text"
            value={values.shippingZip}
            onChange={(event) => onChange("shippingZip", event.target.value)}
            className={inputClassName}
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </div>

        <div>
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="shipping-state"
          >
            Shipping state
          </label>

          <input
            id="shipping-state"
            type="text"
            value={values.shippingState}
            onChange={(event) => onChange("shippingState", event.target.value)}
            className={inputClassName}
            autoComplete="address-level1"
          />
        </div>

        <div>
          <label
            className="text-base font-bold text-slate-950"
            htmlFor="shipping-region"
          >
            Shipping region
          </label>

          <input
            id="shipping-region"
            type="text"
            value={values.shippingRegion}
            onChange={(event) => onChange("shippingRegion", event.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6">
        <h4 className="text-xl font-black text-slate-950">Referred by someone?</h4>
        <p className="mt-2 leading-7 text-slate-600">
          Optional — help us make sure they get credit.
        </p>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-base font-bold text-slate-950" htmlFor="referrer-name">Referrer&apos;s Name</label>
            <input id="referrer-name" type="text" value={values.referrerName} onChange={(event) => onChange("referrerName", event.target.value)} className={inputClassName} autoComplete="off" />
          </div>
          <div>
            <label className="text-base font-bold text-slate-950" htmlFor="referrer-email">Referrer&apos;s Email</label>
            <input id="referrer-email" type="email" value={values.referrerEmail} onChange={(event) => onChange("referrerEmail", event.target.value)} className={inputClassName} autoComplete="off" />
          </div>
        </div>
        {hasPartialReferral && <p className="mt-4 text-sm font-semibold text-amber-900">Provide both the referrer&apos;s name and email, or leave both fields blank.</p>}
      </div>

      {(!hasName || !hasContact) && (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          Full name is required. Please provide either an email address or a
          phone number before continuing.
        </div>
      )}

      {!hasLocation && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          Delivery or installation address, ZIP code, state, and service-area
          region are required before submitting.
        </div>
      )}
    </div>
  );
}
