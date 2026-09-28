"use client";

export default function AccessoriesError({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-950 sm:px-8"><div role="alert" className="mx-auto max-w-7xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"><h1 className="text-xl font-black">Accessories are temporarily unavailable.</h1><p className="mt-2">Please try again in a moment.</p><button type="button" onClick={reset} className="mt-5 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700">Try again</button></div></main>;
}
