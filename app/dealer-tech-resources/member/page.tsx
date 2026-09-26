import type { Metadata } from "next";
import MemberPortal from "@/components/dealer-network/MemberPortal";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function DealerMemberPortalPage() {
  return <MemberPortal />;
}
