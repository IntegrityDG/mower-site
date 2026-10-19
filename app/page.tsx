import type { Metadata } from "next";
import Homepage from "@/components/home/Homepage";
import { connection } from "next/server";
import { readPublicSalesTicker } from "@/lib/promotions/ticker-server";

export const metadata: Metadata = {
  title: "Robot Mowers, Installation & Service | Integrity Distribution Systems",
  description:
    "Explore Lymow, Yarbo and Pandag robotic mowers with IDS. Nationwide equipment sales and regional demos, installation, service and support from Missouri.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default async function Page() {
  await connection();
  const tickerSnapshot = await readPublicSalesTicker();
  return <Homepage key={tickerSnapshot.serverTime} tickerSnapshot={tickerSnapshot} />;
}
