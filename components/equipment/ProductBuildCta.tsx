import Link from "next/link";

export default function ProductBuildCta({
  supportingText,
  productSlug,
}: {
  supportingText: string;
  productSlug?: string;
}) {
  const href = productSlug
    ? `/?product=${encodeURIComponent(productSlug)}#location-and-customer-path`
    : "/#location-and-customer-path";

  return (
    <div className="mt-14 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-10">
      <h2 className="text-3xl font-black">Ready to Build Your System?</h2>
      <p className="mt-3 max-w-2xl leading-7 text-slate-300">
        {supportingText}
      </p>
      <Link
        href={href}
        className="mt-6 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950"
      >
        Build Your System
      </Link>
    </div>
  );
}
