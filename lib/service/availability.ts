import "server-only";
import { serviceControls } from "./controls";
import { databaseError, serviceDatabase, serviceRpc } from "./repository";
import { ServiceError } from "./validation";
import {
  SERVICE_AVAILABILITY_KEYS,
  type PublicServiceAvailabilitySetting,
  type ServiceAvailabilityEvent,
  type ServiceAvailabilityKey,
  type ServiceAvailabilitySetting,
  type ServiceAvailabilityStatus,
  type StaffActor,
} from "./types";

const fallback = (key: ServiceAvailabilityKey): ServiceAvailabilitySetting => ({
  service_key: key,
  status: "currently_unavailable",
  public_message: "",
  changed_at: new Date(0).toISOString(),
  changed_by: null,
  changed_by_name: "Unavailable",
});

function foundationEnabled(key: ServiceAvailabilityKey) {
  const controls = serviceControls();
  if (key === "professional_installation" || key === "professional_setup")
    return process.env.INSTALLATION_INTAKE_ENABLED === "true";
  if (key === "new_remote_support_subscriptions")
    return controls.remoteSupport && controls.payments;
  if (key === "existing_subscriber_assistance") return controls.remoteSupport;
  return controls.serviceIntake;
}

export async function readServiceAvailability(): Promise<
  ServiceAvailabilitySetting[]
> {
  const { data, error } = await serviceDatabase()
    .from("service_availability_settings")
    .select(
      "service_key,status,public_message,changed_at,changed_by,changed_by_name",
    )
    .order("service_key");
  if (error) databaseError(error);
  const rows = (data ?? []) as ServiceAvailabilitySetting[];
  if (
    rows.length !== SERVICE_AVAILABILITY_KEYS.length ||
    SERVICE_AVAILABILITY_KEYS.some(
      (key) => !rows.some((row) => row.service_key === key),
    )
  ) {
    throw new ServiceError(
      "Service availability settings are incomplete.",
      503,
    );
  }
  return rows;
}

export async function readPublicServiceAvailability(): Promise<
  Record<ServiceAvailabilityKey, PublicServiceAvailabilitySetting>
> {
  let rows: ServiceAvailabilitySetting[];
  try {
    rows = await readServiceAvailability();
  } catch {
    rows = SERVICE_AVAILABILITY_KEYS.map(fallback);
  }
  return Object.fromEntries(
    SERVICE_AVAILABILITY_KEYS.map((key) => {
      const row =
        rows.find((item) => item.service_key === key) ?? fallback(key);
      return [
        key,
        {
          ...row,
          available: foundationEnabled(key) && row.status === "available",
        },
      ];
    }),
  ) as Record<ServiceAvailabilityKey, PublicServiceAvailabilitySetting>;
}

export async function requireServiceAvailability(key: ServiceAvailabilityKey) {
  if (!foundationEnabled(key))
    throw new ServiceError("CURRENTLY UNAVAILABLE", 503);
  const { data, error } = await serviceDatabase()
    .from("service_availability_settings")
    .select("status,public_message")
    .eq("service_key", key)
    .maybeSingle();
  if (error) databaseError(error);
  if (!data || data.status !== "available")
    throw new ServiceError(
      data?.public_message?.trim() || "CURRENTLY UNAVAILABLE",
      503,
    );
}

export async function readAvailabilityHistory(): Promise<
  ServiceAvailabilityEvent[]
> {
  const { data, error } = await serviceDatabase()
    .from("service_availability_events")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) databaseError(error);
  return (data ?? []) as ServiceAvailabilityEvent[];
}

export async function saveServiceAvailability(
  actor: StaffActor,
  input: {
    operationKey: string;
    serviceKey: ServiceAvailabilityKey;
    status: ServiceAvailabilityStatus;
    publicMessage: string;
  },
) {
  return serviceRpc<
    ServiceAvailabilitySetting & { changed: boolean; replayed: boolean }
  >("ids_service_set_availability", {
    p_actor: actor.id,
    p_operation: input.operationKey,
    p_service_key: input.serviceKey,
    p_status: input.status,
    p_public_message: input.publicMessage,
  });
}
