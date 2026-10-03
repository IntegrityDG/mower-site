import GuidePage, { guideMetadata } from "@/components/seo/GuidePage";
import { navigationGuide } from "@/lib/robot-mower-guides/navigation";

export const metadata = guideMetadata(navigationGuide);
export default function NavigationGuidePage() { return <GuidePage guide={navigationGuide} />; }
