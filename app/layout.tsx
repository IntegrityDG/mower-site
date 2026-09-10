import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(IDS_CANONICAL_ORIGIN),
  title: "Integrity Distribution Systems | Autonomous Lawn Care",
  description: "Browse autonomous mowers and build a property-specific robotic lawn care system with Integrity Distribution Systems.",
  openGraph: {
    type: "website",
    siteName: "Integrity Distribution Systems",
    title: "Integrity Distribution Systems | Autonomous Lawn Care",
    description: "Browse autonomous mowers and build a property-specific robotic lawn care system with Integrity Distribution Systems.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
