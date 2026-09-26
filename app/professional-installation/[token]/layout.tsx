import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { installationByToken } from "@/lib/installations/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function InstallationTokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let missing = false;

  try {
    await installationByToken(token);
  } catch (error) {
    missing = (error as { code?: string })?.code === "PGRST116";
  }

  if (missing) notFound();
  return children;
}
