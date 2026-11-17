import CatalogCardImage from "@/components/equipment/CatalogCardImage";
import EverydayPriceDisplay from "@/components/equipment/EverydayPriceDisplay";
import { catalogCardImage } from "@/lib/catalog/card-image";
import { catalogPackageIsAvailable } from "@/lib/catalog/availability";
import { LYMOW_ENHANCED_DISCHARGE_KIT_SLUG, lymowEnhancedPackageVariant } from "@/lib/catalog/lymow-enhanced-packages";
import type { CatalogProduct, ProductBuildSelection } from "@/lib/catalog/types";

/** One atomic choice keeps the existing physical configuration identity intact. */
export function selectLymowConfiguration(product: CatalogProduct, current: ProductBuildSelection,
  variantId: string, packageId = "", pinnedVariantId?: string): ProductBuildSelection | null {
  if (product.slug !== "lymow-one-plus" || (pinnedVariantId && variantId !== pinnedVariantId)) return null;
  const variant = product.variants.find(item => item.id === variantId);
  if (!variant?.isAvailable) return null;
  const pkg = packageId ? product.packages.find(item => item.id === packageId) : null;
  if (packageId && (!pkg || !catalogPackageIsAvailable(pkg) || lymowEnhancedPackageVariant(product, pkg)?.id !== variantId)) return null;
  const kitIds = new Set([...product.ungroupedOptions, ...product.optionGroups.flatMap(group => group.options)]
    .filter(option => option.slug === LYMOW_ENHANCED_DISCHARGE_KIT_SLUG).map(option => option.id));
  const included = new Set(pkg?.items.map(item => item.optionId) ?? []);
  return { ...current, variantId, packageId, purchaseMode: undefined, includeBaseProduct: false,
    optionQuantities: Object.fromEntries(Object.entries(current.optionQuantities).filter(([id]) => !kitIds.has(id) && !included.has(id))) };
}

export default function LymowConfigurationChoices({ product, selection, onSelectVariant, onSelectPackage }: {
  product: CatalogProduct; selection: ProductBuildSelection;
  onSelectVariant: (id: string) => void; onSelectPackage: (id: string) => void;
}) {
  return <section className="mt-8 rounded-[2rem] border border-slate-300 bg-slate-50 p-5 md:p-7" aria-label="Lymow mower packages">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Lymow One Plus packages</p>
    <h4 className="mt-2 text-xl font-black text-slate-950">Choose your mower package</h4>
    <p className="mt-3 text-sm leading-6 text-slate-600">Each mower includes its matching charging configuration. Choose mower-only or add the Enhanced Grass Discharge Kit as a complete package.</p>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {product.variants.flatMap(variant => {
        const pkg = product.packages.find(item => lymowEnhancedPackageVariant(product, item)?.id === variant.id);
        const label = variant.slug === "lymow-one-plus-5a" ? "5A" : variant.slug === "lymow-one-plus-10a" ? "10A" : variant.name;
        return [null, ...(pkg ? [pkg] : [])].map(offering => {
          const selected = selection.variantId === variant.id && selection.packageId === (offering?.id ?? "");
          const available = variant.isAvailable && (!offering || catalogPackageIsAvailable(offering));
          const title = `${label} ${offering ? "+ Enhanced Grass Discharge Kit" : "Mower Only"}`;
          return <button key={offering?.id ?? variant.id} type="button" disabled={!available} aria-pressed={selected}
            onClick={() => offering ? onSelectPackage(offering.id) : onSelectVariant(variant.id)}
            className={`rounded-2xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${selected ? "border-emerald-700 bg-white shadow-lg" : "border-slate-300 bg-white hover:border-emerald-500"}`}>
            <CatalogCardImage image={catalogCardImage(offering ?? variant, product)} />
            <h5 className="text-xl font-black text-slate-950">{title}</h5>
            <p className="mt-2 text-sm leading-6 text-slate-600">{offering?.description ?? variant.description}</p>
            <p className="mt-3 text-sm font-semibold text-slate-700">Includes the mower and {label} charging configuration{offering ? ", plus one Enhanced Grass Discharge Kit." : ". No Enhanced Grass Discharge Kit included."}</p>
            {!available ? <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">Unavailable</span> :
              <EverydayPriceDisplay item={offering ?? variant} comparisonLabel="Lymow Everyday Price" className="mt-4" />}
          </button>;
        });
      })}
    </div>
  </section>;
}
