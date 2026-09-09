import ServiceShell from "@/components/service/ServiceShell";
import { ServiceTerms } from "@/components/service/ServiceTerms";
import { ServiceIntake } from "@/components/service/CustomerIntake";
import { serviceControls } from "@/lib/service/controls";
import { publicServicePricing } from "@/lib/service/server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Service | IDS" };
export default async function ServicePage() {
  const pricing = await publicServicePricing();
  return <ServiceShell title="Service"><section className="rounded-2xl bg-white p-5 sm:p-8"><h2 className="mb-4 text-2xl font-black">Remote and On-Site Service</h2><ServiceTerms pricing={pricing} /></section><section className="mx-auto max-w-3xl rounded-2xl border bg-white p-5 sm:p-8"><h2 className="mb-4 text-2xl font-black">Request Service</h2><p className="mb-5 leading-7">Begin with the warranty question. This request does not charge a card or book a paid appointment.</p><ServiceIntake enabled={serviceControls().serviceIntake} /></section></ServiceShell>;
}
