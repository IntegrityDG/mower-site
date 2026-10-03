import GuidePage, { guideMetadata } from "@/components/seo/GuidePage";
import { zeroTurnGuide } from "@/lib/robot-mower-guides/zero-turn";

export const metadata = guideMetadata(zeroTurnGuide);
export default function ZeroTurnGuidePage() { return <GuidePage guide={zeroTurnGuide} />; }
