"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";

import ReviewCard from "@/components/reviews/ReviewCard";
import ReviewDialog from "@/components/reviews/ReviewDialog";
import {
  REVIEW_PRODUCTS,
  type PublicReview,
} from "@/lib/reviews/types";

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);

  const [filters, setFilters] = useState({
    product: "all",
    category: "overall",
    minimum: "",
    state: "all",
    sort: "newest",
  });

  const load = useCallback(
    async (nextPage = 1, append = false) => {
      const query = new URLSearchParams({
        ...filters,
        page: String(nextPage),
        limit: "9",
      });

      if (!filters.minimum) {
        query.delete("minimum");
      }

      const response = await fetch(`/api/reviews?${query}`);

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      setReviews((current) =>
        append ? [...current, ...data.reviews] : data.reviews
      );

      setStates(data.states);
      setCount(data.count);
      setHasMore(data.hasMore);
      setPage(nextPage);
    },
    [filters]
  );

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key: string, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      product: "all",
      category: "overall",
      minimum: "",
      state: "all",
      sort: "newest",
    });
  };

  const selectClass =
    "rounded-xl border border-slate-300 bg-white px-3 py-3 font-semibold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <section className="bg-slate-950 px-6 py-16 text-white md:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-400">
            Customer Experiences
          </p>

          <h1 className="mt-3 text-4xl font-black md:text-6xl">
            Real Experiences. Real Feedback.
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-200">
            Read honest feedback from customers who have purchased equipment,
            requested demonstrations, or received service and support from
            Integrity Distribution Systems.
          </p>

          <button
            onClick={() => setOpen(true)}
            className="mt-7 rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950"
          >
            Leave a Review
          </button>
        </div>
      </section>

      <section className="px-6 py-10 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1 text-sm font-bold">
                Product or Service
                <select
                  value={filters.product}
                  onChange={(event) =>
                    setFilter("product", event.target.value)
                  }
                  className={selectClass}
                >
                  <option value="all">All Reviews</option>

                  {REVIEW_PRODUCTS.map((product) => (
                    <option key={product} value={product}>
                      {product === "Equipment Demonstration"
                        ? "Equipment Demonstrations"
                        : product}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-bold">
                Rating Category
                <select
                  value={filters.category}
                  onChange={(event) =>
                    setFilter("category", event.target.value)
                  }
                  className={selectClass}
                >
                  <option value="overall">Overall Rating</option>
                  <option value="ease_rating">Ease of Purchase</option>
                  <option value="speed_rating">Speed of Service</option>
                  <option value="price_rating">
                    Price Compared to Other Retailers
                  </option>
                  <option value="support_rating">
                    Support Before &amp; After the Sale
                  </option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-bold">
                Minimum Rating
                <select
                  value={filters.minimum}
                  onChange={(event) =>
                    setFilter("minimum", event.target.value)
                  }
                  className={selectClass}
                >
                  <option value="">All Ratings</option>
                  <option value="5">5 Stars</option>
                  <option value="4">4 Stars and Up</option>
                  <option value="3">3 Stars and Up</option>
                  <option value="2">2 Stars and Up</option>
                  <option value="1">1 Star and Up</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-bold">
                State
                <select
                  value={filters.state}
                  onChange={(event) =>
                    setFilter("state", event.target.value)
                  }
                  className={selectClass}
                >
                  <option value="all">All States</option>

                  {states.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-bold">
                Sort Order
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    setFilter("sort", event.target.value)
                  }
                  className={selectClass}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Rated</option>
                  <option value="lowest">Lowest Rated</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="font-bold">
                {count} matching {count === 1 ? "review" : "reviews"}
              </p>

              <button
                onClick={clearFilters}
                className="rounded-xl border border-slate-300 px-5 py-2 font-black hover:bg-slate-100"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {reviews.length ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {reviews.map((review, index) => (
                <ReviewCard key={index} review={review} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-[2rem] bg-white p-10 text-center">
              <h2 className="text-2xl font-black">No reviews found</h2>

              <p className="mt-3 text-slate-600">
                No reviews match the selected filters. Try changing or clearing
                one or more filters.
              </p>
            </div>
          )}

          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={() => load(page + 1, true)}
                className="rounded-2xl bg-slate-950 px-7 py-4 font-black text-white"
              >
                Load More Reviews
              </button>
            </div>
          )}
        </div>
      </section>

      <ReviewDialog open={open} onClose={() => setOpen(false)} />
    </main>
  );
}