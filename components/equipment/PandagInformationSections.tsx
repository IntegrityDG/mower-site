import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  pandagCommercialApplications,
  pandagFeatureSections,
  pandagImages,
  pandagModelContent,
  pandagPerformanceDisclaimer,
  pandagQuickCapabilities,
  type PandagBrochureImage,
  type PandagSpec,
} from "@/components/equipment/pandagBrochureContent";
import { customerFacingProductOptions } from "@/lib/catalog/customer-facing-options";
import type {
  CatalogOption,
  CatalogPrice,
  CatalogProduct,
} from "@/lib/catalog/types";

function BrochureImage({
  image,
  className = "",
}: {
  image: PandagBrochureImage;
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

function SpecList({ specs }: { specs: readonly PandagSpec[] }) {
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

function CatalogPricing({ item }: { item: CatalogPrice }) {
  void item;
  return <p className="text-lg font-black text-emerald-700">Contact IDS for a Commercial Quote Today</p>;
}

function CommercialCapabilities({ product }: { product: CatalogProduct }) {
  const capabilityCards = [
    {
      label: "Best fit",
      value:
        product.propertyScale ??
        "Large commercial, institutional, municipal, agricultural, and utility properties.",
    },
    {
      label: "Platform capability",
      value:
        product.capabilityLevel ??
        "Commercial autonomous mowing with model-specific decks, batteries, and terrain capability.",
    },
    {
      label: "Project path",
      value:
        "Property review, model recommendation, charging plan, and a commercial proposal before deployment.",
    },
  ];

  return (
    <section className="mt-12" aria-labelledby="pandag-commercial-capabilities">
      <h2 id="pandag-commercial-capabilities" className="sr-only">
        Pandag G1 commercial capability overview
      </h2>
      <div className="grid gap-5 md:grid-cols-3">
        {capabilityCards.map((card) => (
          <article
            key={card.label}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-xs font-black uppercase tracking-[0.17em] text-emerald-700">
              {card.label}
            </p>
            <p className="mt-3 leading-7 text-slate-700">{card.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuickCapabilities() {
  return (
    <section className="mt-6" aria-labelledby="pandag-quick-capabilities">
      <h2 id="pandag-quick-capabilities" className="sr-only">
        Pandag G1 quick capabilities
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {pandagQuickCapabilities.map((capability) => (
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

function PlatformOverview({ product }: { product: CatalogProduct }) {
  return (
    <section className="mt-16" aria-labelledby="pandag-platform-overview">
      <SectionHeading
        eyebrow="Platform overview"
        title="A commercial mowing platform planned around the site and the work."
        body="Pandag G1 combines a heavy-duty wheeled chassis, a 48-inch cutting deck, multi-sensor navigation, swappable battery power, and app or remote control. The right configuration depends on vegetation, required cut, terrain, daily coverage, and charging access."
        id="pandag-platform-overview"
      />

      <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-h-80 overflow-hidden rounded-[2rem] bg-slate-950">
          <BrochureImage
            image={pandagImages.largeProperty}
            className="h-full w-full"
          />
        </div>
        <InformationCard title="Operational fit">
          <p>
            {product.fullDescription ??
              product.homepageSummary ??
              "Pandag G1 is a commercial autonomous mowing platform for large properties and demanding applications."}
          </p>
          <p>
            A project review aligns the machine with the property&apos;s mowing
            zones, access routes, slopes, vegetation, cut-height targets, and
            operating schedule.
          </p>
          <p>
            Model selection is non-binding until the property and deployment
            requirements have been reviewed.
          </p>
        </InformationCard>
      </div>
    </section>
  );
}

function ModelComparison({ product }: { product: CatalogProduct }) {
  const models = product.variants
    .filter((variant) => variant.slug in pandagModelContent)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <section
      id="model-configurations"
      className="mt-16 scroll-mt-8"
      aria-labelledby="pandag-model-comparison"
    >
      <SectionHeading
        eyebrow="Model family comparison"
        title="Choose the G1 configuration around the mowing assignment."
        body="The three active models share the same commercial platform direction but differ in deck style, blade system, output, battery capacity, endurance, slope rating, and intended vegetation."
        id="pandag-model-comparison"
      />

      {models.length > 0 ? (
        <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-5">
          {models.map((variant) => {
            const content =
              pandagModelContent[
                variant.slug as keyof typeof pandagModelContent
              ];

            return (
              <article
                key={variant.id}
                className="flex flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex h-52 items-center justify-center overflow-hidden bg-slate-950">
                  <BrochureImage
                    image={content.image}
                    className="h-full w-full"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                    {content.eyebrow}
                  </p>
                  <h3 className="mt-3 text-2xl font-black">
                    {content.displayName}
                  </h3>
                  <p className="mt-3 leading-7 text-slate-600">
                    {content.summary}
                  </p>
                  <div className="mt-5">
                    <SpecList specs={content.comparisonFacts} />
                  </div>
                  <div className="mt-auto border-t border-slate-200 pt-5">
                    <CatalogPricing item={variant} />
                    <Link
                      href={`/pandag/project-quote?model=${content.quoteModel}`}
                      className="mt-5 inline-flex w-full justify-center rounded-2xl bg-emerald-600 px-5 py-4 text-center font-black text-white hover:bg-emerald-700"
                    >
                      Request Pricing
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-950">
          Pandag G1 commercial configurations are temporarily unavailable.
        </p>
      )}
    </section>
  );
}

function FeatureStories() {
  return (
    <section className="mt-16" aria-labelledby="pandag-feature-stories">
      <SectionHeading
        eyebrow="Commercial platform features"
        title="Built for repeatable operation across complex properties."
        body="The G1 platform brings navigation, terrain capability, cutting hardware, charging, and obstacle handling into one coordinated commercial system."
        id="pandag-feature-stories"
      />

      <div className="mt-8 space-y-8">
        {pandagFeatureSections.map((feature, index) => (
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
            <div
              className={`flex min-h-72 items-center justify-center overflow-hidden rounded-3xl bg-slate-950 ${
                feature.image.fit === "contain" ? "p-4" : ""
              }`}
            >
              <BrochureImage
                image={feature.image}
                className="h-full max-h-[34rem] w-full"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommercialApplications() {
  return (
    <section className="mt-16" aria-labelledby="pandag-commercial-applications">
      <SectionHeading
        eyebrow="Commercial applications"
        title="One platform family for a wide range of large-property work."
        body="The property, vegetation, required finish, access conditions, and operating schedule determine which G1 configuration is appropriate."
        id="pandag-commercial-applications"
      />

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {pandagCommercialApplications.map((application) => (
          <article
            key={application.title}
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="aspect-[2/1] overflow-hidden bg-slate-950">
              <BrochureImage
                image={application.image}
                className="h-full w-full"
              />
            </div>
            <div className="p-6">
              <h3 className="text-xl font-black">{application.title}</h3>
              <p className="mt-3 leading-7 text-slate-600">
                {application.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailedSpecifications({ product }: { product: CatalogProduct }) {
  const activeModelSlugs = new Set(product.variants.map((variant) => variant.slug));
  const models = Object.entries(pandagModelContent).filter(([slug]) =>
    activeModelSlugs.has(slug)
  );

  return (
    <section className="mt-16" aria-labelledby="pandag-detailed-specifications">
      <SectionHeading
        eyebrow="Model-specific specifications"
        title="Compare the technical details without blending the models together."
        body="Power, deck hardware, battery capacity, runtime, cutting-height choices, weight, and slope capability are listed for the configuration they apply to."
        id="pandag-detailed-specifications"
      />

      <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-5">
        {models.map(([slug, model]) => (
          <article
            key={slug}
            className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              {model.eyebrow}
            </p>
            <h3 className="mt-3 text-2xl font-black">{model.displayName}</h3>
            <div className="mt-6 space-y-7">
              {model.specGroups.map((group) => (
                <div key={group.title}>
                  <h4 className="text-sm font-black uppercase tracking-[0.14em] text-slate-950">
                    {group.title}
                  </h4>
                  <div className="mt-3">
                    <SpecList specs={group.specs} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <p className="mt-7 rounded-2xl border border-slate-200 bg-slate-100 p-5 text-sm leading-6 text-slate-600">
        {pandagPerformanceDisclaimer}
      </p>
    </section>
  );
}

function chargingOptionLabel(option: CatalogOption) {
  if (option.slug === "pandag-charging-cable" && option.isIncluded) {
    return "Included charging equipment";
  }
  return "Available charging equipment";
}

function ChargingEquipment({ product }: { product: CatalogProduct }) {
  const chargingOptions = customerFacingProductOptions(product)
    .filter((option) =>
      ["pandag-charging-cable", "pandag-charging-dock"].includes(option.slug)
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (!chargingOptions.length) return null;

  return (
    <section
      id="compatible-equipment"
      className="mt-16 scroll-mt-8"
      aria-labelledby="pandag-charging-equipment"
    >
      <SectionHeading
        eyebrow="Charging equipment"
        title="Match the charging approach to site access and daily demand."
        body="Current charging equipment is reviewed as part of the commercial proposal. Dock placement, available power, operating cadence, and model selection all affect the final plan."
        id="pandag-charging-equipment"
      />

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {chargingOptions.map((option) => (
          <article
            key={option.id}
            className="flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"
          >
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              {chargingOptionLabel(option)}
            </p>
            <h3 className="mt-3 text-2xl font-black">{option.name}</h3>
            {option.description && (
              <p className="mt-3 flex-1 whitespace-pre-line leading-7 text-slate-600">
                {option.description}
              </p>
            )}
            <div className="mt-5 border-t border-slate-200 pt-5">
              {option.slug === "pandag-charging-cable" ? (
                <p className="text-lg font-black text-emerald-700">
                  Included with Every Pandag G1
                </p>
              ) : (
                <CatalogPricing item={option} />
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommercialProposalCta() {
  return (
    <section className="mt-16 overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 to-emerald-950 p-8 text-white sm:p-10">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-300">
        Pandag G1 commercial proposal
      </p>
      <h2 className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-5xl">
        Start with the property, the mowing standard, and the operating plan.
      </h2>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
        Share acreage, terrain, vegetation, cutting requirements, charging
        access, and scheduling needs. IDS will review the project and recommend
        the appropriate Pandag configuration. No purchase or payment occurs
        through the request form.
      </p>
      <Link
        href="/pandag/project-quote?model=recommend"
        className="mt-7 inline-flex rounded-2xl bg-emerald-400 px-7 py-4 text-center font-black text-slate-950 hover:bg-emerald-300"
      >
        Request a Commercial Proposal
      </Link>
    </section>
  );
}

export default function PandagInformationSections({
  product,
}: {
  product: CatalogProduct;
}) {
  return (
    <>
      <CommercialCapabilities product={product} />
      <QuickCapabilities />
      <PlatformOverview product={product} />
      <ModelComparison product={product} />
      <FeatureStories />
      <CommercialApplications />
      <DetailedSpecifications product={product} />
      <ChargingEquipment product={product} />
      <CommercialProposalCta />
    </>
  );
}
