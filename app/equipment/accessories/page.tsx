import type {Metadata} from "next";
import CatalogHeader from "@/components/equipment/CatalogHeader";
import AccessoryCatalog from "@/components/equipment/AccessoryCatalog";
import AccessoryPageHero from "@/components/equipment/AccessoryPageHero";
import BreadcrumbJsonLd, { EQUIPMENT_BREADCRUMB, HOME_BREADCRUMB } from "@/components/seo/BreadcrumbJsonLd";
import { readAccessoryCatalog } from "@/lib/accessories/server";
export const metadata:Metadata={title:"Robot Mower Accessories | Lymow & Yarbo Parts | IDS",description:"Shop compatible Lymow and Yarbo robot mower accessories and replacement parts, including charging, maintenance and setup items available through IDS.",alternates:{canonical:"/equipment/accessories"}};
export const dynamic = "force-dynamic";
export default async function AccessoriesPage(){const initialData=await readAccessoryCatalog(false);return <div className="min-h-screen bg-slate-50 text-slate-950"><BreadcrumbJsonLd items={[HOME_BREADCRUMB,EQUIPMENT_BREADCRUMB,{name:"Accessories & Parts",path:"/equipment/accessories"}]}/><CatalogHeader/><main><AccessoryPageHero/><section className="mx-auto max-w-7xl px-5 py-12 sm:px-8"><AccessoryCatalog initialData={initialData}/></section></main></div>}
