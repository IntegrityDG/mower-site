import type { Metadata } from "next";
import Link from "next/link";
import MemberLogin from "@/components/dealer-network/MemberLogin";
import { readMemberPortalSelection } from "@/lib/dealer-network/member-portal-location";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DealerMemberLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { notice } = params;
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
      <MemberLogin initialMessage={initialMessage} selection={readMemberPortalSelection(params)} />
    </main>
  );
}
