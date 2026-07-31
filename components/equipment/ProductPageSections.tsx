import type { CatalogPageSection } from "@/lib/catalog/types";

export default function ProductPageSections({
  sections,
}: {
  sections: CatalogPageSection[];
}) {
  if (!sections.length) return null;

  const orderedSections = [...sections].sort(
    (left, right) => left.sortOrder - right.sortOrder
  );

  return (
    <section className="mt-14" aria-labelledby="product-information-heading">
      <p
        id="product-information-heading"
        className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700"
      >
        Product information
      </p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {orderedSections.map((section) => (
          <article
            key={section.id}
            className="rounded-3xl border border-slate-200 bg-white p-7"
          >
            {section.heading ? (
              <h2 className="text-2xl font-black">{section.heading}</h2>
            ) : null}
            {section.bodyContent ? (
              <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">
                {section.bodyContent}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
