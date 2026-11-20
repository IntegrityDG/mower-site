import type { Metadata } from "next";
import Homepage from "@/components/home/Homepage";
import HomepageExplore from "@/components/home/HomepageExplore";
import { connection } from "next/server";
import { readPublicHomepageSlides } from "@/lib/homepage-slides/server";

export const metadata: Metadata = {
  title: "Robot Mowers, Installation & Service | Integrity Distribution Systems",
  description:
    "Explore Lymow, Yarbo and Pandag robotic mowers with IDS. Nationwide equipment sales and remote assistance; regional-only demos, installation, setup and physical service.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default async function Page() {
  await connection();
  const heroSnapshot = await readPublicHomepageSlides();
  return (
    <Homepage key={heroSnapshot.serverTime} heroSnapshot={heroSnapshot}>
      <HomepageExplore />
    </Homepage>
  );
}
