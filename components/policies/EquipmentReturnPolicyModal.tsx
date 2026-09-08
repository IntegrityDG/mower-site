"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function EquipmentReturnPolicyModal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-returns`}
        onClick={() => {
          const dialog = dialogRef.current;
          if (!dialog) return;
          dialog.showModal();
          dialog.scrollTop = 0;
          headingRef.current?.focus();
          setOpen(true);
        }}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/60 px-4 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
      >
        Returns &amp; Refunds
      </button>

      <dialog
        ref={dialogRef}
        id={`${id}-returns`}
        aria-modal="true"
        aria-labelledby={`${id}-returns-heading`}
        onClose={() => setOpen(false)}
        className="m-auto max-h-[90dvh] w-[min(42rem,94vw)] overflow-y-auto overscroll-contain rounded-2xl bg-white p-0 text-left text-slate-700 shadow-2xl backdrop:bg-slate-950/75"
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
          <h2 ref={headingRef} id={`${id}-returns-heading`} tabIndex={-1} className="text-xl font-black leading-tight text-slate-950 outline-none sm:text-2xl">
            Equipment Return &amp; Refund Policy
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close equipment return and refund policy"
            className="min-h-11 shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Close
          </button>
        </div>
        <div className="space-y-4 px-5 py-6 text-sm leading-7 sm:px-7 sm:text-base">
          <p>Integrity Distribution Systems (“IDS”) accepts eligible returns of equipment within 30 calendar days of the customer’s receipt of the equipment, subject to the terms below.</p>
          <h3 className="font-black text-slate-950">Defective or Malfunctioning Equipment:</h3>
          <p>Equipment that is defective or malfunctioning within the applicable 30-day return period will first be evaluated for an available warranty repair or replacement when appropriate. IDS may require reasonable inspection, troubleshooting, diagnostic information, photographs, video, or other documentation necessary to verify the reported condition and determine whether warranty repair or replacement is available.</p>
          <p>When a replacement unit is provided in place of defective or malfunctioning equipment, the customer will receive a new 30-calendar-day return period beginning on the date the replacement equipment is received.</p>
          <p>If warranty repair or replacement is not reasonably available, is unsuccessful, or is otherwise determined by IDS not to be an appropriate resolution, IDS may approve a refund subject to the terms of this policy and applicable law.</p>
          <h3 className="font-black text-slate-950">All Other Returns:</h3>
          <p>Returns requested for reasons other than a confirmed defect or malfunction are subject to a 25% restocking fee, calculated from the purchase price of the equipment being returned.</p>
          <h3 className="font-black text-slate-950">Return Authorization:</h3>
          <p>All returns require prior authorization from IDS. Returned equipment must include the equipment and components reasonably associated with the original purchase unless otherwise approved by IDS. IDS may require reasonable inspection of returned equipment before a refund is finalized.</p>
          <h3 className="font-black text-slate-950">Scope of This Policy:</h3>
          <p>This policy applies to equipment purchases only. Professional Installation, Professional Setup &amp; Optimization, Remote Support, service work, deposits, cancellations, labor charges, travel charges, and other service-related charges are governed by their respective service terms and refund policies.</p>
          <p>IDS reserves the right to deny a return that falls outside this policy, subject to applicable law. Nothing in this policy is intended to limit or waive any rights or remedies that cannot legally be waived under applicable federal, state, or local law.</p>
        </div>
      </dialog>
    </>
  );
}
