"use client";
import type { CancellationReview } from "@/lib/installations/cancellation";
import InstallationAdminAction from "./InstallationAdminAction";

export default function InstallationCancellationReview({ installationId, closed, review, disabled, onSaved }: {
  installationId: string; closed: boolean; review?: CancellationReview | null; disabled: boolean; onSaved: () => Promise<void>;
}) {
  return <section className="space-y-3 rounded-xl border p-4 lg:col-span-3">
    <h4 className="font-black">Pre-work cancellation review</h4>
    <p className="text-sm">An authorized IDS administrator must review the request and record the reason. Consider notice and actual impact; no 24/48-hour schedule determines the fee. Defaults are $0, not automatic retention. This records accounting only and never charges or returns money.</p>
    <p className="text-sm">For a customer cancellation, enter only the verified actual cost of materials already purchased for this job using the customer’s payment, with purchase evidence. Do not enter the $200 allowance, a markup, travel, or unspent funds. Materials are counted once; the fee is capped at $250 and the collected amount remaining after materials. The rest is refundable. Resolve pending refunds first.</p>
    <p className="text-sm">If IDS cancels, enter $0 for both fields here: there is no cancellation fee, and other amounts need separate review. If a full refund is required by law, enter $0 for both fields and document the confirmed requirement; this tool does not determine legal rights. Cash-failure and safety/work terminations use their separate controls.</p>
    {!closed && <InstallationAdminAction installationId={installationId} action="cancel" title="Record reviewed cancellation" disabled={disabled} onSaved={onSaved} fields={[
      {name:"cancellationCause",label:"Who is cancelling / applicable decision",kind:"select",options:[{value:"customer",label:"Customer-requested cancellation before work"},{value:"ids",label:"IDS-initiated cancellation: no fee, other settlement reviewed separately"},{value:"full_refund_required",label:"Confirmed applicable-law full refund: no deductions"}]},
      {name:"purchasedMaterialsCents",label:"Verified purchased materials paid from customer funds ($)",kind:"money",value:"0.00"},
      {name:"materialsPurchaseEvidence",label:"Purchase evidence and which materials are available (required above $0)",optional:true},
      {name:"cancellationFeeCents",label:"Reviewed cancellation fee ($0–$250; capped to remaining collected funds)",kind:"money",value:"0.00"},
      {name:"cancellationReviewed",label:"I am authorized to record this IDS review and have verified the reason and any purchased-material cost",kind:"checkbox"},
    ]}/>}
    {closed && review && review.cause !== "full_refund_required" && <InstallationAdminAction installationId={installationId} action="cancellation_full_refund" title="Record confirmed full-refund requirement" disabled={disabled} onSaved={onSaved} fields={[
      {name:"cancellationReviewed",label:"I verified that applicable law requires a full refund; record the basis in the reason. This removes all settlement deductions but does not return money.",kind:"checkbox"},
    ]}/>}
    {closed && review?.cause === "customer" && review.purchasedMaterialsCents > 0 && <>
      <p className="text-sm">Leave materials awaiting choice until the customer tells IDS whether to arrange pickup or forfeit them. No deadline or automatic forfeiture applies. Recording the choice does not change the settlement.</p>
      <InstallationAdminAction installationId={installationId} action="cancellation_materials_choice" title="Record customer materials choice" disabled={disabled} onSaved={onSaved} fields={[
        {name:"materialsChoice",label:"Customer’s stated choice",kind:"select",options:[{value:"pickup",label:"Arrange pickup"},{value:"forfeit",label:"Forfeit the purchased materials"}]},
        {name:"customerChoiceConfirmed",label:"The customer explicitly communicated this choice to IDS; record the evidence in the reason",kind:"checkbox"},
      ]}/>
    </>}
  </section>;
}
