"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import BusinessCard, { INDEPENDENT_BUSINESS_DISCLAIMER } from "./BusinessCard";
import type { FeaturedBusiness } from "@/lib/featured-businesses/types";

export default function HomeBusinessSpotlight(){const[business,setBusiness]=useState<FeaturedBusiness|null>(null);useEffect(()=>{fetch("/api/featured-businesses?featured=true").then(r=>r.ok?r.json():null).then(v=>setBusiness(v?.businesses?.[0]??null)).catch(()=>{});},[]);if(!business)return null;return <section aria-labelledby="business-spotlight-heading" className="bg-slate-100 px-5 py-10 md:px-10 md:py-14"><div className="mx-auto max-w-5xl"><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Community Spotlight</p><h2 id="business-spotlight-heading" className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Supporting Small Business Spotlight</h2><div className="mt-7"><BusinessCard business={business} source="homepage" compact /></div><p className="mt-5 text-xs leading-5 text-slate-500">{INDEPENDENT_BUSINESS_DISCLAIMER}</p><Link href="/featured-businesses" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-6 py-3 text-center font-black text-white hover:bg-emerald-700">Discover Featured Businesses</Link></div></section>}
