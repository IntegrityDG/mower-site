import type { Metadata } from "next";
import Link from "next/link";
import { findBySessionId, safeProjection } from "@/lib/checkout/order-repository";
import { SITE_CONTACT } from "@/lib/site-contact";
import { getStripeServerClient } from "@/lib/stripe/server";

export const metadata: Metadata = {
  title: "Order Confirmation | Integrity Distribution Systems",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PaymentMethod = "card" | "ach" | "unknown";
type View = ReturnType<typeof safeProjection>;
type Presentation = {
  tone: "success" | "processing" | "problem" | "neutral";
  eyebrow: string;
  title: string;
  message: string;
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

function paymentMethodFromSession(types: string[]): PaymentMethod {
  if (types.includes("us_bank_account")) return "ach";
  if (types.includes("card")) return "card";
  return "unknown";
}

function presentationFor(
  view: View,
  paymentMethod: PaymentMethod
): Presentation {
  if (view.attemptStatus === "expired") {
    return {
      tone: "neutral",
      eyebrow: "Checkout Expired",
      title: "This checkout session has expired.",
      message:
        "No new payment was confirmed from this checkout session. Please return to the site if you would like to start a new order.",
    };
  }

  if (view.attemptStatus === "failed" || view.paymentStatus === "failed") {
    return {
      tone: "problem",
      eyebrow: "Payment Problem",
      title: "We could not confirm this payment.",
      message:
        "Please do not submit another payment for this order. Contact Integrity Distribution Systems and include your order number so we can review the payment status with you.",
    };
  }

  if (view.paymentStatus === "paid") {
    return {
      tone: "success",
      eyebrow: "Payment Successful!",
      title: "Thank you for your order!",
      message:
        "Your payment has been successfully received and your order has been confirmed. Integrity Distribution Systems will begin processing your order and will contact you if any additional information is needed.",
    };
  }

  if (paymentMethod === "ach" && view.paymentStatus === "processing") {
    return {
      tone: "processing",
      eyebrow: "Bank Payment Submitted",
      title: "Thank you for your order!",
      message:
        "Your ACH bank payment has been successfully submitted and is currently processing. Your order will be confirmed once the payment clears.",
    };
  }

  if (
    paymentMethod === "ach" &&
    view.paymentStatus === "awaiting_customer_action"
  ) {
    return {
      tone: "processing",
      eyebrow: "Bank Authorization Pending",
      title: "Your order has been started.",
      message:
        "Your bank payment still requires authorization or final confirmation. Your order will be confirmed after the bank payment enters processing and successfully clears.",
    };
  }

  if (
    view.paymentStatus === "refunded" ||
    view.paymentStatus === "partially_refunded"
  ) {
    return {
      tone: "neutral",
      eyebrow: "Payment Status Updated",
      title:
        view.paymentStatus === "refunded"
          ? "This payment has been refunded."
          : "This payment has been partially refunded.",
      message:
        "The current payment status shown here comes from the IDS order system. Contact Integrity Distribution Systems if you have any questions about this order.",
    };
  }

  if (view.paymentStatus === "disputed") {
    return {
      tone: "problem",
      eyebrow: "Payment Status Updated",
      title: "This payment is currently disputed.",
      message:
        "Please contact Integrity Distribution Systems if you have questions about the current status of this order.",
    };
  }

  return {
    tone: "processing",
    eyebrow: "Payment Processing",
    title: "Thank you for your order!",
    message:
      "Your checkout was received and the payment is still being processed. Your order status will update after payment confirmation is received.",
  };
}

function iconClasses(tone: Presentation["tone"]) {
  if (tone === "success") return "bg-emerald-100 text-emerald-700";
  if (tone === "processing") return "bg-amber-100 text-amber-700";
  if (tone === "problem") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function eyebrowClasses(tone: Presentation["tone"]) {
  if (tone === "success") return "text-emerald-700";
  if (tone === "processing") return "text-amber-700";
  if (tone === "problem") return "text-red-700";
  return "text-slate-600";
}

function StatusIcon({ tone }: { tone: Presentation["tone"] }) {
  if (tone === "success") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-10 w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m5 12 4 4L19 6"
        />
      </svg>
    );
  }

  if (tone === "problem") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-10 w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden="true"
      >
        <path strokeLinecap="round" d="M12 7v6" />
        <path strokeLinecap="round" d="M12 17h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-10 w-10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v5l3 2" />
    </svg>
  );
}

export default async function Success({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  let view: View | null = null;
  let paymentMethod: PaymentMethod = "unknown";
  let testMode = false;

  if (
    sessionId &&
    /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(sessionId)
  ) {
    try {
      const session =
        await getStripeServerClient().checkout.sessions.retrieve(sessionId);
      const record = await findBySessionId(session.id);

      if (
        record &&
        session.client_reference_id === record.orderId &&
        session.metadata?.order_id === record.orderId &&
        session.metadata?.attempt_id === record.attemptId
      ) {
        view = safeProjection(record);
        paymentMethod = paymentMethodFromSession(
          session.payment_method_types ?? []
        );
        testMode = !session.livemode;
      }
    } catch {
      // Render the safe invalid-session state for configuration, Stripe,
      // and lookup failures.
    }
  }

  if (!view) {
    return (
      <main className="min-h-[70vh] bg-slate-50 px-6 py-16 sm:py-24">
        <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 sm:p-12">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <StatusIcon tone="processing" />
          </div>

          <p className="mt-7 text-sm font-black uppercase tracking-[0.22em] text-amber-700">
            Unable to Verify Order
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            We could not verify this Checkout Session.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            If you just completed a payment, please do not submit it again. No
            payment or order status was changed by this page. Contact Integrity
            Distribution Systems so we can verify the order for you.
          </p>

          <a
            href={SITE_CONTACT.email.href}
            className="mt-6 inline-block font-bold text-emerald-700 underline decoration-2 underline-offset-4 hover:text-emerald-800"
          >
            {SITE_CONTACT.email.display}
          </a>

          <div className="mt-9">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-7 py-3.5 text-base font-black text-white shadow-lg transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300"
            >
              Return to Integrity Auto Mowers
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const presentation = presentationFor(view, paymentMethod);

  return (
    <main className="min-h-[70vh] bg-slate-50 px-6 py-16 sm:py-24">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="p-8 text-center sm:p-12">
          <div
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${iconClasses(
              presentation.tone
            )}`}
          >
            <StatusIcon tone={presentation.tone} />
          </div>

          <p
            className={`mt-7 text-sm font-black uppercase tracking-[0.22em] ${eyebrowClasses(
              presentation.tone
            )}`}
          >
            {presentation.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {presentation.title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            {presentation.message}
          </p>

          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Order Number
            </p>
            <p className="mt-1 text-xl font-black tracking-tight text-slate-950">
              {view.publicReference}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Keep this order number for your records.
            </p>

            <div className="my-5 h-px bg-slate-200" />

            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold text-slate-600">Order total</span>
              <strong className="text-lg text-slate-950">
                {money(view.totalCents)}
              </strong>
            </div>
          </div>

          {testMode ? (
            <p className="mx-auto mt-5 max-w-xl rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Test mode — no live payment was processed.
            </p>
          ) : null}

          {presentation.tone === "problem" ? (
            <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-slate-600">
              Need help? Email{" "}
              <a
                className="font-bold text-emerald-700 underline underline-offset-4"
                href={SITE_CONTACT.email.href}
              >
                {SITE_CONTACT.email.display}
              </a>
              .
            </p>
          ) : null}

          <div className="mt-9">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-7 py-3.5 text-base font-black text-white shadow-lg transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300"
            >
              Return to Integrity Auto Mowers
            </Link>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-8 py-6 sm:px-12">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
            Order Summary
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {view.items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex items-start justify-between gap-4"
              >
                <span>
                  {item.quantity} × {item.name}
                  {item.included ? " (included)" : ""}
                </span>
              </li>
            ))}
          </ul>

          {view.paymentStatus === "partially_funded" &&
          view.fundedAmountCents !== null &&
          view.amountRemainingCents !== null ? (
            <p className="mt-4 text-sm font-semibold text-slate-700">
              Received: {money(view.fundedAmountCents)}. Remaining:{" "}
              {money(view.amountRemainingCents)}.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
