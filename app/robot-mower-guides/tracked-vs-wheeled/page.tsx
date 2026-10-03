import GuidePage, { guideMetadata } from "@/components/seo/GuidePage";
import { trackedGuide } from "@/lib/robot-mower-guides/tracked";

export const metadata = guideMetadata(trackedGuide);
export default function TrackedGuidePage() { return <GuidePage guide={trackedGuide} />; }
