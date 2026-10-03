import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Robot Mower Dealer Reviews | Integrity Distribution Systems",
  description: "Read customer reviews of IDS robot mower equipment, demos, service and support. Explore real experiences and share your own feedback.",
  alternates: { canonical: "/reviews" },
};

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
