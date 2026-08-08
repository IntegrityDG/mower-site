import { Stars } from "./Stars";
import type { PublicReview } from "@/lib/reviews/types";
const Rating = ({ label, value }: { label: string; value: number }) => <div className="flex items-center justify-between gap-3 border-t border-slate-200 py-2 text-sm"><span className="text-slate-600">{label}</span><span className="font-black text-slate-900">{value} / 5</span></div>;
export default function ReviewCard({ review }: { review: PublicReview }) {
  const display = review.product === "Other" ? review.otherDescription ?? "Other" : review.product;
  return <article className="flex h-full flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-black text-slate-950">{review.firstName} {review.lastInitial}</h3><p className="mt-1 text-sm text-slate-600">{review.state} · {new Date(review.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">✓ Verified Purchase</span></div>
    <p className="mt-5 text-sm font-black uppercase tracking-[0.12em] text-emerald-700">{display}</p>
    <div className="mt-3 flex items-center gap-3"><Stars value={Math.round(review.overallRating)} /><strong className="text-xl text-slate-950">{Number.isInteger(review.overallRating) ? review.overallRating : review.overallRating.toFixed(1)}</strong></div>
    <p className="mt-5 whitespace-pre-wrap text-base leading-7 text-slate-700">{review.writtenReview}</p>
    <details className="mt-5"><summary className="cursor-pointer font-bold text-slate-700">Category ratings</summary><div className="mt-2"><Rating label="Ease of Purchase" value={review.easeRating}/><Rating label="Speed of Service" value={review.speedRating}/><Rating label="Price Compared to Other Retailers" value={review.priceRating}/>{review.supportRating != null && <Rating label="Support Before & After the Sale" value={review.supportRating}/>}</div></details>
    {review.idsResponse && <div className="mt-6 rounded-2xl border-l-4 border-emerald-600 bg-emerald-50 p-5"><p className="text-sm font-black uppercase tracking-[0.12em] text-emerald-800">IDS Response</p><p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">{review.idsResponse}</p></div>}
  </article>;
}
