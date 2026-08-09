import type {Metadata} from "next";
import CatalogHeader from "@/components/equipment/CatalogHeader";
import AccessoryCatalog from "@/components/equipment/AccessoryCatalog";
import AccessoryPageHero from "@/components/equipment/AccessoryPageHero";
export const metadata:Metadata={title:"Accessories & Parts | Integrity Distribution Systems",description:"Browse Lymow and Yarbo accessories and replacement parts."};
export default function AccessoriesPage(){return <div className="min-h-screen bg-slate-50 text-slate-950"><CatalogHeader/><main><AccessoryPageHero/><section className="mx-auto max-w-7xl px-5 py-12 sm:px-8"><AccessoryCatalog/></section></main></div>}
