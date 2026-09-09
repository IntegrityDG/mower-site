import ServiceShell from "@/components/service/ServiceShell";
import { ServiceTerms } from "@/components/service/ServiceTerms";
import { ServiceIntake } from "@/components/service/CustomerIntake";
import { readPublicServiceAvailability } from "@/lib/service/availability";
import { publicServicePricing } from "@/lib/service/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service | IDS" };

export default async function ServicePage() {
  const [pricing, availability] = await Promise.all([
    publicServicePricing(),
    readPublicServiceAvailability(),
  ]);
  return (
    <ServiceShell title="Service">
      <section className="rounded-2xl bg-white p-5 sm:p-8">
        <h2 className="mb-4 text-2xl font-black">Remote and On-Site Service</h2>
        <ServiceTerms pricing={pricing} />
      </section>
      <section className="mx-auto max-w-3xl rounded-2xl border bg-white p-5 sm:p-8">
        <h2 className="mb-4 text-2xl font-black">Request Service</h2>
        <p className="mb-5 leading-7">
          Begin with the warranty question. This request does not charge a card
          or book a paid appointment. Warranty Yes/Unsure intake remains
          available when paid On-Site Service is unavailable.
        </p>
        <ServiceIntake
          availability={{
            remote: {
              available: availability.paid_remote_service.available,
              message: availability.paid_remote_service.public_message,
            },
            onsite: {
              available: availability.onsite_service.available,
              message: availability.onsite_service.public_message,
            },
          }}
        />
      </section>
    </ServiceShell>
  );
}
