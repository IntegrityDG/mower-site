import type { Metadata } from "next";
import MemberPortal from "@/components/dealer-network/MemberPortal";
import { readMemberPortalSelection } from "@/lib/dealer-network/member-portal-location";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function DealerMemberPortalPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selection = readMemberPortalSelection(await searchParams);
  return <MemberPortal initialBoardTopicId={selection.boardTopicId} initialSelection={selection} />;
}
