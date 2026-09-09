import ServiceShell from "@/components/service/ServiceShell";
import StaffAccess from "@/components/service/StaffAccess";
export const metadata = { title: "Service Staff Sign In | IDS", robots: { index: false, follow: false } };
export default function Page() { return <ServiceShell title="Staff sign in"><StaffAccess /></ServiceShell>; }
