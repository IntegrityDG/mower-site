import type { Metadata } from "next";
import TokenPinForm from "@/components/dealer-network/TokenPinForm";
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function DealerPinResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <TokenPinForm token={token} mode="reset" />
    </main>
  );
}
