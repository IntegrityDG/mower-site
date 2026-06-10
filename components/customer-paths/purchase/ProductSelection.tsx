import Image from "next/image";

import type { ProductCatalogItem, ProductId } from "@/lib/products/types";

type ProductSelectionProps = {
  products: ProductCatalogItem[];
  selectedProductId: ProductId | "";
  onSelectProduct: (productId: ProductId) => void;
};

export default function ProductSelection({
  products,
  selectedProductId,
  onSelectProduct,
}: ProductSelectionProps) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Product Selection
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Select one primary product.
      </h3>

      <p className="mt-4 max-w-3xl leading-7 text-slate-600">
        Choose the equipment system you want to start with. You can select one
        primary product at a time.
      </p>

      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {products.map((product) => {
          const isSelected = selectedProductId === product.id;

          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelectProduct(product.id)}
              aria-pressed={isSelected}
              className={`group flex h-full flex-col rounded-[2rem] border p-5 text-left transition ${
                isSelected
                  ? "border-emerald-700 bg-emerald-50 shadow-xl"
                  : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
              }`}
            >
              <div className="flex h-44 items-center justify-center rounded-2xl bg-slate-100 p-3">
                <Image
                  src={product.imageSrc}
                  alt={product.imageAlt}
                  width={420}
                  height={280}
                  sizes="(min-width: 1024px) 28vw, 90vw"
                  className="max-h-40 w-auto object-contain"
                />
              </div>

              <span
                className={`mt-5 inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${
                  isSelected
                    ? "bg-emerald-700 text-white"
                    : "bg-slate-950 text-white"
                }`}
              >
                {isSelected ? "Selected" : "Product Option"}
              </span>

              <h4 className="mt-4 text-2xl font-black text-slate-950">
                {product.name}
              </h4>

              <p className="mt-3 leading-7 text-slate-600">
                {product.description}
              </p>

              <p className="mt-5 text-sm font-bold text-emerald-700">
                {isSelected ? "Primary product selected" : "Select product"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
