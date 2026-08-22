import Link from "next/link";
import MemberLogin from "@/components/dealer-network/MemberLogin";
export default async function DealerMemberLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const notice = (await searchParams).notice;
  const initialMessage =
    notice === "pin-changed"
      ? "Your PIN was changed. Sign in again with your new PIN."
      : notice === "signed-out-everywhere"
        ? "You have been signed out on every device."
        : "";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12">
      <Link
        href="/dealer-tech-resources"
        className="mb-7 font-black text-emerald-300"
      >
        ← Dealer &amp; Tech Community Resources
      </Link>
      <MemberLogin initialMessage={initialMessage} />
    </main>
  );
}
