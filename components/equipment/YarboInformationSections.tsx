import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import type { ReactNode } from "react";
import type {
  CatalogOption,
  CatalogProduct,
  CatalogSpecification,
} from "@/lib/catalog/types";
import {
  YARBO_INCLUDED_PLATFORM_EQUIPMENT,
  YARBO_MODULE_ONLY_NOTICE,
  yarboIndividualModules,
  yarboOptionDisplayName,
} from "@/lib/catalog/yarbo";

type ComponentDetail = {
  category: string;
  job: string;
};

const componentDetails: Record<string, ComponentDetail> = {
  "yarbo-mower-module": {
    category: "Mowing module",
    job: "Handles autonomous lawn mowing as part of a Yarbo Core-based system.",
  },
  "yarbo-lawn-mower-pro-module": {
    category: "Mowing module",
    job: "Provides the Pro mowing configuration for a Yarbo Core-based system.",
  },
  "yarbo-snow-blower-module": {
    category: "Snow module",
    job: "Handles snow-clearing work along configured winter routes.",
  },
  "yarbo-leaf-blower-module": {
    category: "Cleanup module",
    job: "Handles leaf, light-debris, and seasonal cleanup work.",
  },
  "yarbo-trimmer-module": {
    category: "Trimming package",
    job: "Supports edge and detail trimming through the trimmer and BBM package.",
  },
};

function InformationCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-7">
      <h2 className="text-2xl font-black">{title}</h2>
      <div className="mt-4 space-y-3 leading-7 text-slate-600">{children}</div>
    </article>
  );
}

function specificationValue(specification: CatalogSpecification) {
  if (specification.displayValue) return specification.displayValue;
  if (specification.textValue) return specification.textValue;
  if (specification.textValues?.length) {
    return specification.textValues.join(", ");
  }
  if (specification.numericValue != null) {
    return `${specification.numericValue}${
      specification.canonicalUnit ? ` ${specification.canonicalUnit}` : ""
    }`;
  }
  if (specification.booleanValue != null) {
    return specification.booleanValue ? "Yes" : "No";
  }
  return null;
}

function productSpecifications(product: CatalogProduct) {
  return product.variants.flatMap((variant) =>
    Object.values(variant.specifications ?? {})
      .flat()
      .map((specification) => ({
        ...specification,
        value: specificationValue(specification),
      }))
      .filter(
        (specification): specification is CatalogSpecification & {
          value: string;
        } => Boolean(specification.value)
      )
  );
}

function moduleDescription(option: CatalogOption) {
  return (
    option.description?.replaceAll("Leaf Blower", "Blower") ??
    "A customer-facing component currently available for the Yarbo platform."
  );
}

export default function YarboInformationSections({
  product,
}: {
  product: CatalogProduct;
}) {
  const modules = yarboIndividualModules(product);
  const specifications = productSpecifications(product);
  const platformOverview = product.page?.sections.find((section) =>
    section.heading?.toLowerCase().includes("platform")
  )?.bodyContent;

  return (
    <>
      <section className="mt-14" aria-labelledby="yarbo-product-information">
        <p
          id="yarbo-product-information"
          className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700"
        >
          Product information
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <InformationCard title="Product overview">
            {product.homepageSummary || product.fullDescription ? (
              <p>{product.homepageSummary ?? product.fullDescription}</p>
            ) : (
              <p className="font-semibold text-amber-900">
                Product overview information is not currently published in the
                catalog.
              </p>
            )}
            {platformOverview && <p>{platformOverview}</p>}
          </InformationCard>

          <InformationCard title="Key strengths">
            <ul className="list-disc space-y-2 pl-5">
              {product.capabilityLevel && <li>{product.capabilityLevel}</li>}
              <li>Shared tracked Core platform for compatible task modules</li>
              <li>Autonomous operation supported by Core navigation equipment</li>
              <li>Single-purpose or multi-season system flexibility</li>
              <li>{modules.length} active task modules in the current catalog</li>
            </ul>
          </InformationCard>

          <InformationCard title="Property considerations and limitations">
            {product.propertyScale && <p>{product.propertyScale}</p>}
            {product.customerGuidance && <p>{product.customerGuidance}</p>}
            <p>
              Confirm access, safe operating areas, charging and navigation
              placement, and the requirements of each selected task module.
            </p>
            <p>
              Module-specific terrain, weather, and operating limits are not
              currently published as normalized IDS catalog specifications.
            </p>
          </InformationCard>

          <InformationCard title="Specifications">
            {specifications.length ? (
              <dl className="divide-y divide-slate-200">
                {specifications.map((specification) => (
                  <div
                    key={`${specification.slug}-${specification.value}`}
                    className="flex items-start justify-between gap-5 py-3 first:pt-0 last:pb-0"
                  >
                    <dt className="font-bold text-slate-950">
                      {specification.label}
                    </dt>
                    <dd className="text-right">{specification.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-950">
                Detailed Core and module technical specifications are not
                currently published in the normalized IDS catalog. IDS should
                confirm task-specific requirements before final configuration.
              </p>
            )}
          </InformationCard>

          <InformationCard title="How the Yarbo system works">
            <ol className="space-y-2">
              <li>1. Yarbo Core provides the required shared base platform.</li>
              <li>2. Compatible task modules attach to the Core.</li>
              <li>
                3. Core charging and navigation equipment support autonomous
                operation.
              </li>
              <li>
                4. Build a single-purpose or multi-season configuration around
                the work the property requires.
              </li>
            </ol>
          </InformationCard>

          <InformationCard title="Included base equipment">
            <p>
              Current IDS catalog guidance identifies this platform foundation
              for complete Yarbo systems:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              {YARBO_INCLUDED_PLATFORM_EQUIPMENT.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>
              Task modules are not included with Core unless they are selected
              as part of the customer&apos;s configuration.
            </p>
          </InformationCard>
        </div>
      </section>

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
          <article className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              Core platform
            </p>
            <h3 className="mt-3 text-xl font-black">Yarbo Core</h3>
            <p className="mt-3 leading-7 text-slate-600">
              {product.homepageSummary ??
                "The shared base platform for compatible Yarbo task modules."}
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              <span className="font-black text-slate-950">Job: </span>
              Provides the shared drive, power, navigation, and control
              foundation for a Yarbo system.
            </p>
            <YarboPriceDisplay
              item={product}
              className="mt-5"
              priceClassName="text-xl font-black text-emerald-700"
            />
          </article>

          {modules.map((option) => {
            const detail = componentDetails[option.slug] ?? {
              category: "Yarbo component",
              job: "Expands the work a Yarbo Core-based system can perform.",
            };

            return (
              <article
                key={option.id}
                className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
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
                <YarboPriceDisplay
                  item={option}
                  className="mt-5"
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
            No customer-facing Yarbo task modules are currently published in
            the catalog.
          </p>
        )}
      </section>
    </>
  );
}
