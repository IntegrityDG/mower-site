import ServiceShell from "@/components/service/ServiceShell";
import { CustomerSubscription } from "@/components/service/CustomerManage";
export const metadata = { title: "Remote Support Billing | IDS", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: { params: Promise<{ token: string }> }) { return <ServiceShell title="Remote Support billing"><CustomerSubscription token={(await params).token} /></ServiceShell>; }
