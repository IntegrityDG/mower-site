import type { CancellationReview } from "@/lib/installations/cancellation";
import { installationMoney as money } from "./InstallationBalanceSummary";

export default function InstallationCancellationSummary({ review }: { review?: CancellationReview | null }) {
  if (!review) return null;
  return <section aria-label="Recorded cancellation review" className="mt-4 rounded-xl border bg-blue-50 p-4 text-sm">
    <h3 className="font-black">Recorded cancellation review</h3>
    <p className="mt-2">Cancellation fee: {money(review.feeCents)}.</p>
    {review.settlementFinal ? <>
      <p>Purchased materials deducted: {money(review.purchasedMaterialsCents)}. The unused materials allowance and other booking charges are not retained in addition to this settlement.</p>
      {review.purchasedMaterialsCents > 0 && <p className="mt-2">{review.materialsChoice === "pickup" ? "Customer chose to arrange pickup of the purchased materials. This does not record a completed pickup." : review.materialsChoice === "forfeit" ? "Customer chose to forfeit the purchased materials." : "Materials choice is awaiting the customer: arrange pickup or choose to forfeit the purchased materials. No automatic forfeiture is scheduled."}</p>}
      <p className="mt-2">Any customer credit / refund due shown in the balance is still owed. Only completed refunds in the payment history confirm that money was returned.</p>
    </> : <p className="mt-2">IDS-initiated cancellation has no cancellation fee. Other amounts still require separate IDS settlement review; the accounting amount is not a new payment request or a final refund decision.</p>}
  </section>;
}
