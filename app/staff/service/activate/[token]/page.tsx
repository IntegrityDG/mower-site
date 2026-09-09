import ServiceShell from "@/components/service/ServiceShell";
import StaffAccess from "@/components/service/StaffAccess";
export const metadata = { title: "Activate Service Staff Account | IDS", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: { params: Promise<{ token: string }> }) { return <ServiceShell title="Activate your staff account"><StaffAccess token={(await params).token} /></ServiceShell>; }
