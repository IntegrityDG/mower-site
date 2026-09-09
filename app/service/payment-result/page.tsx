import ServiceShell from "@/components/service/ServiceShell";
export const metadata = { title: "Service Payment | IDS", robots: { index: false, follow: false } };
export default function Page() { return <ServiceShell title="Service payment"><p>Thank you. IDS verifies payment with Stripe before updating the invoice. Use your private Service link or contact IDS to check the confirmed status.</p></ServiceShell>; }
