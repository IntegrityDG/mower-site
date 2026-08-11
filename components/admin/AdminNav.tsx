import Link from "next/link";

const links = [
  ["Reviews", "/admin/reviews"],
  ["Sales & Specials", "/admin/sales-specials"],
  ["Referrals", "/admin/referrals"],
  ["Accessories", "/admin/accessories"],
  ["Pricing", "/admin/pricing"],
  ["Payment Methods", "/admin/payment-methods"],
] as const;

export default function AdminNav() {
  return (
    <nav aria-label="IDS administration" className="mt-4 flex flex-wrap gap-2">
      {links.map(([label, href]) => (
        <Link key={href} href={href} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:border-emerald-600 hover:text-emerald-700">
          {label}
        </Link>
      ))}
    </nav>
  );
}
