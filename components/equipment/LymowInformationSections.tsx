import Image from "next/image";
import type { ReactNode } from "react";

import EverydayPriceDisplay from "@/components/equipment/EverydayPriceDisplay";
import LymowPriceDisplay from "@/components/equipment/LymowPriceDisplay";
import {
  lymowConfigurationFacts,
  lymowCuttingSpecs,
  lymowFeatureSections,
  lymowImages,
  lymowIncludedEquipment,
  lymowMachineSpecs,
  lymowNavigationSpecs,
  lymowPerformanceDisclaimer,
  lymowPowerSpecs,
  lymowQuickCapabilities,
  lymowSafetySpecs,
  lymowTerrainSpecs,
  type LymowBrochureImage,
  type LymowSpec,
} from "@/components/equipment/lymowBrochureContent";
import { customerFacingProductOptions } from "@/lib/catalog/customer-facing-options";
import type { CatalogOption, CatalogProduct } from "@/lib/catalog/types";

function BrochureImage({
  image,
  className = "",
}: {
  image: LymowBrochureImage;
  className?: string;
}) {
  return (
    <Image
      src={image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      className={`${image.fit === "contain" ? "object-contain" : "object-cover"} ${className}`.trim()}
      sizes="(min-width: 1024px) 50vw, 100vw"
    />
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  id,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  id: string;
}) {
  return (
    <div>
      <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-5xl"
      >
        {title}
      </h2>
      {body && (
        <p className="mt-5 max-w-4xl text-lg leading-8 text-slate-600">
          {body}
        </p>
      )}
    </div>
  );
}

function SpecList({ specs }: { specs: LymowSpec[] }) {
  return (
    <dl className="divide-y divide-slate-200">
      {specs.map((specification) => (
        <div
          key={`${specification.label}-${specification.value}`}
          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-5"
        >
          <dt className="font-bold text-slate-950">{specification.label}</dt>
          <dd className="text-slate-600 sm:text-right">{specification.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InformationCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
      <h3 className="text-2xl font-black">{title}</h3>
      <div className="mt-4 space-y-3 leading-7 text-slate-600">{children}</div>
    </article>
  );
}

function ConfigurationSummary({ product }: { product: CatalogProduct }) {
  const configurations = product.variants
    .filter((variant) => variant.slug in lymowConfigurationFacts)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <section className="mt-12" aria-labelledby="lymow-configurations">
      <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
              Current mower configurations
            </p>
            <h2
              id="lymow-configurations"
              className="mt-3 max-w-3xl text-3xl font-black tracking-tight md:text-4xl"
            >
              Choose 5A or 10A in Build Your System.
            </h2>
          </div>
          <p className="max-w-xl leading-7 text-emerald-950">
            The charger is included with the selected mower configuration. There
            is no separate charging-configuration selection.
          </p>
        </div>

        {configurations.length > 0 ? (
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {configurations.map((variant) => {
              const facts =
                lymowConfigurationFacts[
                  variant.slug as keyof typeof lymowConfigurationFacts
                ];

              return (
                <article
                  key={variant.id}
                  className="rounded-2xl border border-emerald-200 bg-white p-6"
                >
                  <h3 className="text-xl font-black">{variant.name}</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-5">
                      <dt className="font-bold text-slate-500">Charge time</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {facts.chargeTime}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-5">
                      <dt className="font-bold text-slate-500">
                        Estimated daily coverage
                      </dt>
                      <dd className="text-right font-bold text-slate-950">
                        {facts.dailyCoverage}
                      </dd>
                    </div>
                  </dl>
                  <LymowPriceDisplay
                    variant={variant}
                    className="mt-5 border-t border-slate-200 pt-5"
                    priceClassName="text-2xl font-black text-emerald-700"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-950">
            Current Lymow One Plus configurations are temporarily unavailable.
          </p>
        )}
      </div>
    </section>
  );
}

function QuickCapabilities() {
  return (
    <section className="mt-12" aria-labelledby="lymow-quick-capabilities">
      <h2 id="lymow-quick-capabilities" className="sr-only">
        Lymow One Plus quick capabilities
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {lymowQuickCapabilities.map((capability) => (
          <article
            key={capability.label}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-xs font-black uppercase tracking-[0.17em] text-emerald-700">
              {capability.label}
            </p>
            <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              {capability.value}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {capability.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductOverview({ product }: { product: CatalogProduct }) {
  return (
    <section className="mt-16" aria-labelledby="lymow-product-overview">
      <SectionHeading
        eyebrow="Product overview"
        title="A dedicated autonomous mower for complex residential lawns."
        body="Lymow One Plus combines tracked drive, virtual-boundary navigation, a broad rotary cutting system, and automatic recharge-and-resume behavior in one purpose-built mowing platform."
        id="lymow-product-overview"
      />

      <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="overflow-hidden rounded-[2rem] bg-slate-950">
          <BrochureImage image={lymowImages.closeup} className="h-full w-full" />
        </div>
        <InformationCard title="Property Fit">
          <p>
            {product.fullDescription ??
              product.homepageSummary ??
              "Lymow One Plus is designed for segmented, sloped, uneven, and multi-zone residential lawns."}
          </p>
          <p>
            It is best suited to residential properties where slopes, narrow
            passages, uneven ground, or multiple lawn zones make a conventional
            wheeled robotic mower less practical.
          </p>
          <p>
            Plan access, RTK placement, charging-station placement, and safe
            routes before operation. The 15-acre map-storage value is not a
            daily mowing or whole-property coverage rating.
          </p>
        </InformationCard>
      </div>

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-5">
        {[
          ["Machine specifications", lymowMachineSpecs],
          ["Navigation and connectivity", lymowNavigationSpecs],
          ["Terrain and mobility", lymowTerrainSpecs],
          ["Cutting system", lymowCuttingSpecs],
          ["Power and charging", lymowPowerSpecs],
          ["Detection and autonomy", lymowSafetySpecs],
        ].map(([title, specs]) => (
          <InformationCard key={title as string} title={title as string}>
            <SpecList specs={specs as LymowSpec[]} />
          </InformationCard>
        ))}
      </div>
    </section>
  );
}

function FeatureImageGroup({
  image,
  secondaryImage,
}: {
  image: LymowBrochureImage;
  secondaryImage?: LymowBrochureImage;
}) {
  if (!secondaryImage) {
    return (
      <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-3xl bg-slate-950">
        <BrochureImage image={image} className="h-full max-h-[30rem] w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[image, secondaryImage].map((item) => (
        <div
          key={item.src}
          className="flex min-h-72 items-center justify-center overflow-hidden rounded-2xl bg-slate-950"
        >
          <BrochureImage image={item} className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}

function VisualFeatureSections() {
  return (
    <section className="mt-16" aria-labelledby="lymow-feature-sections">
      <SectionHeading
        eyebrow="Lymow One Plus features"
        title="Tracked autonomous mowing built for demanding residential properties."
        body="From route planning to the final cut, each system supports practical autonomous mowing across the mapped parts of the property."
        id="lymow-feature-sections"
      />

      <div className="mt-8 space-y-8">
        {lymowFeatureSections.map((feature, index) => (
          <article
            key={feature.title}
            className="grid items-center gap-8 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-2 lg:p-8"
          >
            <div className={index % 2 ? "lg:order-2" : ""}>
              <p className="text-xs font-black uppercase tracking-[0.17em] text-emerald-700">
                {feature.eyebrow}
              </p>
              <h3 className="mt-3 text-2xl font-black tracking-tight md:text-4xl">
                {feature.title}
              </h3>
              <p className="mt-4 leading-7 text-slate-600">{feature.body}</p>
              <ul className="mt-5 grid gap-3">
                {feature.facts.map((fact) => (
                  <li
                    key={fact}
                    className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-950"
                  >
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
            <FeatureImageGroup
              image={feature.image}
              secondaryImage={feature.secondaryImage}
            />
          </article>
        ))}
      </div>

      <p className="mt-7 rounded-2xl border border-slate-200 bg-slate-100 p-5 text-sm leading-6 text-slate-600">
        {lymowPerformanceDisclaimer}
      </p>
    </section>
  );
}

function IncludedEquipment() {
  return (
    <section className="mt-16" aria-labelledby="lymow-included-equipment">
      <SectionHeading
        eyebrow="Included equipment"
        title="The mower, charging equipment, and RTK setup arrive together."
        body="The selected 5A or 10A mower configuration includes the equipment needed for charging, positioning, and initial setup."
        id="lymow-included-equipment"
      />

      <div className="mt-8 grid items-center gap-8 rounded-[2rem] bg-slate-950 p-5 text-white lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:p-8">
        <div className="overflow-hidden rounded-2xl bg-black">
          <BrochureImage
            image={lymowImages.includedEquipment}
            className="h-full w-full"
          />
        </div>
        <div>
          <h3 className="text-2xl font-black">Included with the system</h3>
          <ul className="mt-5 grid gap-x-8 gap-y-3 text-sm leading-6 text-slate-200 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {lymowIncludedEquipment.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="font-black text-emerald-400">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function accessoryCategory(option: CatalogOption) {
  const value = `${option.name} ${option.description ?? ""}`.toLowerCase();
  if (/battery|charg|cable|adapter/.test(value)) return "Power and charging";
  if (/rtk|antenna|mount/.test(value)) return "Navigation and setup";
  if (/blade|track/.test(value)) return "Maintenance and replacement";
  return "Compatible accessory";
}

function AvailableAccessories({ product }: { product: CatalogProduct }) {
  const accessories = customerFacingProductOptions(product)
    .filter((option) => !option.isIncluded)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <section
      id="compatible-equipment"
      className="mt-16 scroll-mt-8"
      aria-labelledby="lymow-accessories"
    >
      <SectionHeading
        eyebrow="Available accessories"
        title="Replacement and optional equipment for an active Lymow system."
        body="Build Your System shows current availability and compatibility. Charging adapters shown here are replacement or additional equipment, not another required configuration choice."
        id="lymow-accessories"
      />

      {accessories.length > 0 ? (
        <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-5">
          {accessories.map((option) => (
            <article
              key={option.id}
              className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                {accessoryCategory(option)}
              </p>
              <h3 className="mt-3 text-xl font-black">{option.name}</h3>
              {option.description && (
                <p className="mt-3 flex-1 leading-7 text-slate-600">
                  {option.description}
                </p>
              )}
              <EverydayPriceDisplay
                item={option}
                comparisonLabel="Lymow Everyday Price"
                className="mt-auto pt-5"
                priceClassName="text-xl font-black text-emerald-700"
              />
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-950">
          Lymow replacement and optional equipment is temporarily unavailable.
        </p>
      )}
    </section>
  );
}

export default function LymowInformationSections({
  product,
}: {
  product: CatalogProduct;
}) {
  return (
    <>
      <ConfigurationSummary product={product} />
      <QuickCapabilities />
      <ProductOverview product={product} />
      <VisualFeatureSections />
      <IncludedEquipment />
      <AvailableAccessories product={product} />
    </>
  );
}
