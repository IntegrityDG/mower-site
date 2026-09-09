import { readPublicServiceAvailability } from "@/lib/service/availability";
export const dynamic = "force-dynamic";
export async function GET() {
  const availability = await readPublicServiceAvailability();
  const publicRows = Object.fromEntries(
    Object.entries(availability).map(([key, value]) => [
      key,
      { available: value.available, message: value.public_message },
    ]),
  );
  return Response.json(
    {
      remoteSupport: availability.new_remote_support_subscriptions.available,
      machine: {
        install: publicRows.professional_installation,
        setup: publicRows.professional_setup,
        remoteSupport: publicRows.new_remote_support_subscriptions,
      },
      services: publicRows,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
