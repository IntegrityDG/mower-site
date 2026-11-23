import type { Metadata } from "next";
import MemberPortal from "@/components/dealer-network/MemberPortal";
import { validateUuid } from "@/lib/dealer-network/validation";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function DealerMemberPortalPage({ searchParams }: {
  searchParams: Promise<{ boardTopic?: string | string[] }>;
}) {
  const topic = validateUuid((await searchParams).boardTopic);
  return <MemberPortal initialBoardTopicId={topic} />;
}
