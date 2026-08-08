"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { PublicReview } from "@/lib/reviews/types";
import ReviewCard from "./ReviewCard";
import ReviewDialog from "./ReviewDialog";

export default function HomeReviews() {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/reviews?limit=3&sort=newest")
      .then((response) =>
        response.ok ? response.json() : Promise.reject()
      )
      .then((data) => setReviews(data.reviews))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <section className="border-y border-slate-200 bg-slate-50 px-6 py-20 md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
              Customer Experiences
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              Real Experiences. Real Feedback.
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              See what customers have shared about their experience with
              Integrity Distribution Systems—or tell us about your own. We
              welcome honest feedback about our purchasing process,
              responsiveness, competitive pricing, and customer support.
            </p>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-2xl bg-emerald-600 px-7 py-4 font-black text-white hover:bg-emerald-700"
          >
            Leave a Review
          </button>
        </div>

        {loaded && reviews.length > 0 ? (
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {reviews.map((review, index) => (
              <ReviewCard key={index} review={review} />
            ))}
          </div>
        ) : loaded ? (
          <div className="mt-10 rounded-[2rem] border border-dashed border-emerald-300 bg-white p-10 text-center">
            <h3 className="text-2xl font-black">
              Be the first to share your experience.
            </h3>
            <p className="mt-3 text-slate-600">
              Your honest feedback helps future customers understand what to
              expect from IDS.
            </p>
          </div>
        ) : (
          <p className="mt-10 text-slate-600">
            Loading customer experiences…
          </p>
        )}

        <div className="mt-9 text-center">
          <Link
            href="/reviews"
            className="inline-flex rounded-2xl bg-slate-950 px-7 py-4 font-black text-white hover:bg-emerald-700"
          >
            View All Reviews
          </Link>
        </div>
      </div>

      <ReviewDialog open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
