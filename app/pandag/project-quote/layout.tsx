import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pandag G1 Project Quote Request | IDS",
  description:
    "Tell IDS about a commercial mowing project to request a Pandag G1 review. IDS evaluates the site and operating needs before recommending equipment and pricing.",
  robots: { index: false, follow: true },
};

export default function PandagProjectQuoteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
