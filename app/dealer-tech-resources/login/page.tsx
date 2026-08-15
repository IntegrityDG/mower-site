import Link from "next/link";
import MemberLogin from "@/components/dealer-network/MemberLogin";
export default function DealerMemberLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12">
      <Link
        href="/dealer-tech-resources"
        className="mb-7 font-black text-emerald-300"
      >
        ← Dealer &amp; Tech Community Resources
      </Link>
      <MemberLogin />
    </main>
  );
}
