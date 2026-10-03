import GuidePage, { guideMetadata } from "@/components/seo/GuidePage";
import { internetGuide } from "@/lib/robot-mower-guides/internet";

export const metadata = guideMetadata(internetGuide);
export default function InternetGuidePage() { return <GuidePage guide={internetGuide} />; }
