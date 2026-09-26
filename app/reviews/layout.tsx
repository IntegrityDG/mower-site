import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/reviews" },
};

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
