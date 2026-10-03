import GuidePage, { guideMetadata } from "@/components/seo/GuidePage";
import { commercialRoiGuide } from "@/lib/robot-mower-guides/commercial-roi";

export const metadata = guideMetadata(commercialRoiGuide);
export default function CommercialRoiGuidePage() { return <GuidePage guide={commercialRoiGuide} />; }
