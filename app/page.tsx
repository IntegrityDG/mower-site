import type { Metadata } from "next";
import Homepage from "@/components/home/Homepage";

export const metadata: Metadata = {
  title: "Robot Mowers, Installation & Service | Integrity Distribution Systems",
  description:
    "Explore Lymow, Yarbo and Pandag robotic mowers with IDS. Nationwide equipment sales and regional demos, installation, service and support from Missouri.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function Page() {
  return <Homepage />;
}
