import ServiceShell from "@/components/service/ServiceShell";
import { CustomerCase } from "@/components/service/CustomerManage";
export const metadata = { title: "Your Service Request | IDS", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: { params: Promise<{ token: string }> }) { return <ServiceShell title="Your Service request"><CustomerCase token={(await params).token} /></ServiceShell>; }
