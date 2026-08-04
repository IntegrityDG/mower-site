"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useReducer, useRef } from "react";
import type { RefObject } from "react";

import { SITE_CONTACT } from "@/lib/site-contact";

export type ContactDialogCloseReason = "button" | "backdrop" | "escape";

export type ContactDialogAction =
  | { type: "open" }
  | { type: "close"; reason: ContactDialogCloseReason };

export function contactDialogReducer(
  state: boolean,
  action: ContactDialogAction
) {
  return action.type === "open" ? true : false;
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-6 w-6"
    >
      <path d="M13.5 22v-8h2.75l.41-3.2H13.5V8.76c0-.93.26-1.56 1.59-1.56h1.7V4.34c-.29-.04-1.3-.13-2.47-.13-2.44 0-4.11 1.49-4.11 4.23v2.36H7.45V14h2.76v8h3.29Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      className="h-5 w-5"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function ContactInformationDialog({
  dialogId,
  headingId,
  descriptionId,
  dialogRef,
  closeButtonRef,
  onClose,
}: {
  dialogId: string;
  headingId: string;
  descriptionId: string;
  dialogRef?: RefObject<HTMLDivElement | null>;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose: (reason: ContactDialogCloseReason) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose("backdrop");
        }
      }}
    >
      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white/10 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex items-start justify-between gap-5 border-b border-slate-200 px-5 py-5 sm:px-7 sm:py-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
              Integrity Distribution Systems
            </p>
            <h2
              id={headingId}
              className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl"
            >
              Contact Us
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onClose("button")}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            aria-label="Close contact information"
          >
            <CloseIcon />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <p id={descriptionId} className="leading-7 text-slate-600">
            Call, email, or connect with our team on Facebook. We&apos;ll help
            you find the right next step for your property.
          </p>

          <div className="mt-6 space-y-3">
            <a
              href={SITE_CONTACT.phone.href}
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 transition group-hover:bg-emerald-200">
                <PhoneIcon />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Cell phone
                </span>
                <span className="mt-1 block break-words font-black text-slate-950 sm:text-lg">
                  {SITE_CONTACT.phone.display}
                </span>
              </span>
            </a>

            <a
              href={SITE_CONTACT.email.href}
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 transition group-hover:bg-emerald-200">
                <EmailIcon />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Email
                </span>
                <span className="mt-1 block break-all font-black text-slate-950 sm:text-lg">
                  {SITE_CONTACT.email.display}
                </span>
              </span>
            </a>

            <a
              href={SITE_CONTACT.facebook.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 transition group-hover:bg-blue-200">
                <FacebookIcon />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Facebook
                </span>
                <span className="mt-1 block text-sm font-black leading-6 text-slate-950 sm:text-base">
                  {SITE_CONTACT.facebook.display}
                </span>
              </span>
            </a>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center sm:px-5 sm:py-5">
              <p className="text-sm font-black text-slate-950">
                Scan to visit us on Facebook
              </p>
              <a
                href={SITE_CONTACT.facebook.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mx-auto mt-3 block w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:p-4"
              >
                <Image
                  src="/contact/facebook-qr.png"
                  alt="QR code for the Integrity Distribution Systems Facebook page"
                  width={1082}
                  height={1091}
                  sizes="(max-width: 640px) 160px, 192px"
                  loading="eager"
                  unoptimized
                  className="h-auto w-40 sm:w-48"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductBuildCta({
  supportingText,
  productSlug,
}: {
  supportingText: string;
  productSlug?: string;
}) {
  const [isContactOpen, dispatch] = useReducer(contactDialogReducer, false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const idPrefix = useId();
  const dialogId = `${idPrefix}-contact-dialog`;
  const headingId = `${idPrefix}-contact-heading`;
  const descriptionId = `${idPrefix}-contact-description`;
  const href = productSlug
    ? `/?product=${encodeURIComponent(productSlug)}#location-and-customer-path`
    : "/#location-and-customer-path";

  useEffect(() => {
    if (!isContactOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "close", reason: "escape" });
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => triggerElement?.focus());
    };
  }, [isContactOpen]);

  return (
    <div className="mt-14 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-10">
      <h2 className="text-3xl font-black">Ready to Build Your System?</h2>
      <p className="mt-3 max-w-2xl leading-7 text-slate-300">
        {supportingText}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 transition hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          Build Your System
        </Link>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => dispatch({ type: "open" })}
          aria-haspopup="dialog"
          aria-expanded={isContactOpen}
          aria-controls={dialogId}
          className="inline-flex items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-7 py-4 text-center font-black text-white transition hover:border-white/50 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          Contact Us
        </button>
      </div>

      {isContactOpen && (
        <ContactInformationDialog
          dialogId={dialogId}
          headingId={headingId}
          descriptionId={descriptionId}
          dialogRef={dialogRef}
          closeButtonRef={closeButtonRef}
          onClose={(reason) => dispatch({ type: "close", reason })}
        />
      )}
    </div>
  );
}
