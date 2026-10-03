import AdminNav from "@/components/admin/AdminNav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-slate-200 bg-white px-5 pb-3 md:px-10">
        <div className="mx-auto max-w-7xl"><AdminNav /></div>
      </div>
      {children}
    </>
  );
}
