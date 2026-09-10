import type { Metadata } from "next";
import Homepage from "@/components/home/Homepage";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function Page() {
  return <Homepage />;
}
