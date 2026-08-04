import Image from "next/image";
import type { ReactNode } from "react";

import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import {
  yarboComponentContent,
  yarboCoreSpecs,
  yarboFeatureSections,
  yarboImages,
  yarboNavigationSpecs,
  yarboPowerSpecs,
  yarboTerrainSpecs,
  type YarboBrochureImage,
  type YarboSpec,
} from "@/components/equipment/yarboBrochureContent";
import type { CatalogOption, CatalogProduct } from "@/lib/catalog/types";
import {
  YARBO_INCLUDED_PLATFORM_EQUIPMENT,
  YARBO_MODULE_ONLY_NOTICE,
  yarboIndividualModules,
  yarboOptionDisplayName,
} from "@/lib/catalog/yarbo";

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

function SpecList({ specs }: { specs: YarboSpec[] }) {
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

function BulletedList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function BrochureImage({
  image,
  className = "",
}: {
  image: YarboBrochureImage;
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

function FeatureImageGroup({
  image,
  secondaryImage,
}: {
  image: YarboBrochureImage;
  secondaryImage?: YarboBrochureImage;
}) {
  if (!secondaryImage) {
    return (
      <div className="overflow-hidden rounded-3xl bg-slate-100">
        <BrochureImage image={image} className="h-full max-h-[28rem] w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[image, secondaryImage].map((item) => (
        <div
          key={item.src}
          className="flex min-h-64 items-center justify-center overflow-hidden rounded-2xl bg-slate-100"
        >
          <BrochureImage image={item} className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}

function VisualFeatureSections() {
  return (
    <section className="mt-16" aria-labelledby="yarbo-feature-sections">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
        Yarbo platform features
      </p>
      <h2
        id="yarbo-feature-sections"
        className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-5xl"
      >
        Designed to handle more than a single season.
      </h2>
      <p className="mt-5 max-w-4xl text-lg leading-8 text-slate-600">
        Yarbo brings navigation, tracked mobility, charging, controls, and
        modular task equipment into one expandable property-care platform.
      </p>

      <div className="mt-8 space-y-8">
        {yarboFeatureSections.map((feature, index) => (
          <article
            key={feature.title}
            className="grid items-center gap-8 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-2 lg:p-8"
          >
            <div className={index % 2 ? "lg:order-2" : ""}>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
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
    </section>
  );
}

function moduleDescription(option: CatalogOption) {
  return (
    yarboComponentContent[option.slug]?.description ??
    option.description?.replaceAll("Leaf Blower", "Blower") ??
    "A compatible component for the Yarbo platform."
  );
}

function ComponentImage({ image }: { image: YarboBrochureImage }) {
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
      <BrochureImage image={image} className="h-full w-full" />
    </div>
  );
}

function ActiveComponentCards({
  product,
  modules,
}: {
  product: CatalogProduct;
  modules: CatalogOption[];
}) {
  const coreContent = yarboComponentContent["yarbo-core"];

  return (
    <section
      id="compatible-equipment"
      className="mt-16 scroll-mt-8"
      aria-labelledby="yarbo-system-components"
    >
      <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
        Yarbo system components
      </p>
      <h2
        id="yarbo-system-components"
        className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-5xl"
      >
        Build one platform around the work your property needs.
      </h2>
      <p className="mt-5 max-w-4xl text-lg leading-8 text-slate-600">
        Yarbo Core provides the shared drive, power, navigation, and control
        platform. Add compatible modules to create the system that fits your
        property and the work you want it to handle.
      </p>

      <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-5">
        <article className="flex flex-col rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <ComponentImage image={coreContent.image} />
          <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            {coreContent.category}
          </p>
          <h3 className="mt-3 text-xl font-black">Yarbo Core</h3>
          <p className="mt-3 leading-7 text-slate-600">
            {product.homepageSummary ?? coreContent.description}
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            <span className="font-black text-slate-950">Job: </span>
            {coreContent.job}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            {coreContent.specs.map((spec) => (
              <div
                key={spec.label}
                className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0"
              >
                <dt className="text-slate-500">{spec.label}</dt>
                <dd className="text-right font-bold text-slate-950">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
          <YarboPriceDisplay
            item={product}
            className="mt-auto pt-5"
            priceClassName="text-xl font-black text-emerald-700"
          />
        </article>

        {modules.map((option) => {
          const detail = yarboComponentContent[option.slug] ?? {
            category: "Yarbo component",
            description: moduleDescription(option),
            job: "Expands the work a Yarbo Core-based system can perform.",
            image: yarboImages.lineup,
            specs: [],
          };

          return (
            <article
              key={option.id}
              className="flex flex-col rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <ComponentImage image={detail.image} />
              <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                {detail.category}
              </p>
              <h3 className="mt-3 text-xl font-black">
                {yarboOptionDisplayName(option)}
              </h3>
              <p className="mt-3 leading-7 text-slate-600">
                {moduleDescription(option)}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                <span className="font-black text-slate-950">Job: </span>
                {detail.job}
              </p>
              {detail.specs.length > 0 && (
                <dl className="mt-4 space-y-2 text-sm">
                  {detail.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0"
                    >
                      <dt className="text-slate-500">{spec.label}</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <YarboPriceDisplay
                item={option}
                className="mt-auto pt-5"
                priceClassName="text-xl font-black text-emerald-700"
              />
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950">
                {YARBO_MODULE_ONLY_NOTICE}
              </p>
            </article>
          );
        })}
      </div>

      {!modules.length && (
        <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-950">
          Yarbo task modules are not available for online configuration at this
          moment. Build Your System will show current availability when
          equipment is ready to select.
        </p>
      )}

      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-100 p-5 leading-7 text-slate-700">
        <p>
          Additional Yarbo attachments may become available as the product
          lineup continues to expand. Current availability is shown in Build
          Your System.
        </p>
      </div>
    </section>
  );
}

export default function YarboInformationSections({
  product,
}: {
  product: CatalogProduct;
}) {
  const modules = yarboIndividualModules(product);

  return (
    <>
      <section className="mt-14" aria-labelledby="yarbo-product-information">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
          Product information
        </p>
        <h2
          id="yarbo-product-information"
          className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-5xl"
        >
          Understand the Yarbo platform before building a system.
        </h2>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <InformationCard title="Product Overview">
            {product.homepageSummary || product.fullDescription ? (
              <p>{product.homepageSummary ?? product.fullDescription}</p>
            ) : (
              <p className="font-semibold text-amber-900">
                Yarbo overview details are temporarily unavailable.
              </p>
            )}
            <p>
              Yarbo is a modular autonomous property-maintenance platform. The
              Core supplies the shared tracked drive, power, navigation,
              charging, and control foundation; task modules attach to the Core
              to perform specific jobs.
            </p>
          </InformationCard>

          <InformationCard title="Key Strengths">
            <BulletedList
              items={[
                "Tracked mobility for traction and weight distribution.",
                "Interchangeable task modules built around one Core.",
                "RTK-GPS, computer vision, sensors, IMU, and odometry support.",
                "Automatic charging and docking after work or low battery.",
                "App, physical controller, and teleoperation support.",
                "Available modules cover mowing, Pro mowing, snow clearing, blowing, and trimming.",
              ]}
            />
          </InformationCard>

          <InformationCard title="Property Considerations and Limitations">
            {product.propertyScale && <p>{product.propertyScale}</p>}
            {product.customerGuidance && <p>{product.customerGuidance}</p>}
            <BulletedList
              items={[
                "Plan access widths and routes for the Core plus the selected task module.",
                "Place charging and navigation equipment where the system can dock, communicate, and return safely.",
                "Confirm slopes by task: snow clearing has a lower slope rating than mowing, blowing, and trimming.",
                "Expect manual supervision around unfamiliar hazards, narrow edges, complex snow conditions, pets, people, and newly changed work areas.",
                "Performance and operating results may vary based on terrain, weather, property layout, vegetation, debris, snow conditions, system setup, and selected module.",
              ]}
            />
          </InformationCard>

          <InformationCard title="Yarbo Core Specifications">
            <SpecList specs={yarboCoreSpecs} />
          </InformationCard>

          <InformationCard title="Navigation, Mapping, and Obstacle Detection">
            <p>
              Yarbo combines RTK positioning with vision, IMU, odometry, cameras,
              and sensors. Stereo vision supports automatic boundary mapping,
              path keeping, and precise obstacle detection.
            </p>
            <SpecList specs={yarboNavigationSpecs} />
          </InformationCard>

          <InformationCard title="Power, Battery, Charging, and Docking">
            <p>
              Yarbo uses a lithium-ion battery system and supports automatic
              return to the docking station when work is complete or battery is
              low.
            </p>
            <SpecList specs={yarboPowerSpecs} />
          </InformationCard>

          <InformationCard title="Terrain and Mobility">
            <p>
              Yarbo uses a tracked drive platform. Mowing, Pro mowing, blower,
              and trimmer configurations are rated for steeper slopes than the
              snow blower configuration.
            </p>
            <SpecList specs={yarboTerrainSpecs} />
          </InformationCard>

          <InformationCard title="Controls and Connectivity">
            <p>
              Yarbo can be operated through the Yarbo app or a physical
              controller. Supported connectivity includes 4G, Wi-Fi, Bluetooth,
              and Wi-Fi HaLow, with teleoperation support on task modules.
            </p>
            <BulletedList
              items={[
                "The app supports setup and ongoing system management.",
                "The physical controller supports manual control.",
                "Wi-Fi HaLow wide coverage is listed up to 31 acres.",
                "Emergency and safety behavior should be confirmed during final setup and owner handoff.",
              ]}
            />
          </InformationCard>

          <InformationCard title="How the Yarbo System Works">
            <ol className="space-y-2">
              <li>1. Yarbo Core provides the required shared base platform.</li>
              <li>2. Compatible modules attach to the Core.</li>
              <li>
                3. Charging and navigation equipment support autonomous
                operation.
              </li>
              <li>
                4. Customers can build one-season or multi-season systems
                around the work their property needs.
              </li>
            </ol>
          </InformationCard>

          <InformationCard title="Included Base Equipment">
            <p>
              Complete Yarbo systems include the platform foundation needed to
              support Core-based operation:
            </p>
            <BulletedList items={YARBO_INCLUDED_PLATFORM_EQUIPMENT} />
            <p>
              Task modules are optional unless selected in Build Your System or
              included inside a complete Yarbo package. Build Your System
              handles package combinations, equipment selection, and purchasing.
            </p>
          </InformationCard>
        </div>
      </section>

      <VisualFeatureSections />
      <ActiveComponentCards product={product} modules={modules} />
    </>
  );
}
