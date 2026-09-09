import Link from "next/link";
import ServiceShell from "@/components/service/ServiceShell";
import { SupportTerms } from "@/components/service/ServiceTerms";
import {
  ServiceIntake,
  SupportPurchase,
} from "@/components/service/CustomerIntake";
import { readPublicServiceAvailability } from "@/lib/service/availability";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remote Assistance | IDS" };

export default async function RemoteAssistancePage() {
  const availability = await readPublicServiceAvailability();
  const assistance = availability.existing_subscriber_assistance;
  const subscriptions = availability.new_remote_support_subscriptions;
  return (
    <ServiceShell title="Remote Assistance">
      <section className="rounded-2xl bg-white p-5 sm:p-8">
        <h2 className="mb-4 text-2xl font-black">Remote Support</h2>
        <SupportTerms />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 sm:p-8">
          <h2 className="mb-4 text-2xl font-black">
            Existing subscriber request
          </h2>
          <ServiceIntake
            included
            availability={{
              included: {
                available: assistance.available,
                message: assistance.public_message,
              },
            }}
          />
        </section>
        <section className="rounded-2xl border bg-white p-5 sm:p-8">
          <h2 className="mb-4 text-2xl font-black">
            Subscribe to Remote Support
          </h2>
          <SupportPurchase
            availability={{
              available: subscriptions.available,
              message: subscriptions.public_message,
            }}
          />
        </section>
      </div>
      <section className="rounded-2xl bg-emerald-50 p-6">
        <h2 className="text-2xl font-black">Need paid Service?</h2>
        <p className="my-3 leading-7">
          Choose paid Remote or On-Site Service, including warranty
          verification. Active subscribers retain their eligible Service
          discount after using their included sessions.
        </p>
        <Link
          href="/service"
          className="inline-flex min-h-11 items-center font-bold text-emerald-900 underline"
        >
          Service options and rates
        </Link>
      </section>
    </ServiceShell>
  );
}
