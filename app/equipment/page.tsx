import type { Metadata } from "next";
import CatalogHeader from "@/components/equipment/CatalogHeader";
import EquipmentCatalog from "@/components/equipment/EquipmentCatalog";

export const metadata: Metadata = { title: "Equipment Catalog | Integrity Distribution Systems", description: "Browse robotic mower systems, accessories, and replacement parts." };

export default function EquipmentPage() {
  return <div className="min-h-screen bg-slate-50 text-slate-950"><CatalogHeader />
    <main><section className="bg-slate-950 px-5 py-16 text-white sm:px-8 sm:py-20"><div className="mx-auto max-w-7xl">
      <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-400">Equipment catalog</p>
      <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">Find the autonomous system that fits the property.</h1>
      <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">Compare Lymow and Yarbo equipment for self-service configuration, or explore Pandag as a commercial project platform. Current availability is shown on every machine while informational details remain accessible.</p>
    </div></section><section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16"><EquipmentCatalog /></section></main>
  </div>;
}
