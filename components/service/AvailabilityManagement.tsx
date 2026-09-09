"use client";
import { useCallback, useEffect, useState } from "react";
import {
  SERVICE_AVAILABILITY_KEYS,
  SERVICE_AVAILABILITY_LABELS,
  type ServiceAvailabilityEvent,
  type ServiceAvailabilitySetting,
  type ServiceAvailabilityStatus,
} from "@/lib/service/types";
import {
  displayDate,
  displayStatus,
  serviceButton,
  serviceFetch,
  serviceInput,
  useServiceTask,
} from "./ui";

type Response = {
  settings: ServiceAvailabilitySetting[];
  history: ServiceAvailabilityEvent[];
};

export default function AvailabilityManagement() {
  const [data, setData] = useState<Response | null>(null);
  const [loadError, setLoadError] = useState("");
  const task = useServiceTask();
  const load = useCallback(async () => {
    const result = await serviceFetch<Response>(
      "/api/service/staff/availability",
    );
    setData(result);
    setLoadError("");
  }, []);
  useEffect(() => {
    let alive = true;
    serviceFetch<Response>("/api/service/staff/availability")
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((error) => {
        if (alive) setLoadError(error.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!data)
    return (
      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="text-2xl font-black">Service availability</h2>
        <p role={loadError ? "alert" : "status"}>
          {loadError || "Loading availability controls…"}
        </p>
      </section>
    );
  return (
    <section className="space-y-5 rounded-2xl border bg-white p-5">
      <div>
        <h2 className="text-2xl font-black">Service availability</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          These controls govern new public intake and machine-checkout
          selections. Existing records remain available to staff.
        </p>
      </div>
      {task.status}
      <div className="grid gap-4 lg:grid-cols-2">
        {SERVICE_AVAILABILITY_KEYS.map((key) => {
          const setting = data.settings.find((row) => row.service_key === key)!;
          return (
            <AvailabilityCard
              key={`${key}:${setting.changed_at}`}
              setting={setting}
              disabled={task.busy}
              save={(status, publicMessage) =>
                task.run(async () => {
                  await serviceFetch("/api/service/staff/availability", {
                    operationKey: crypto.randomUUID(),
                    serviceKey: key,
                    status,
                    publicMessage,
                  });
                  await load();
                }, `${SERVICE_AVAILABILITY_LABELS[key]} updated.`)
              }
            />
          );
        })}
      </div>
      <details>
        <summary className="cursor-pointer font-black">
          Availability change history
        </summary>
        {data.history.length === 0 ? (
          <p className="mt-3">No changes have been recorded.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {data.history.map((event) => (
              <li key={event.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <strong>
                  {SERVICE_AVAILABILITY_LABELS[event.service_key]}
                </strong>{" "}
                — {displayStatus(event.previous_status)} to{" "}
                {displayStatus(event.status)}
                <br />
                {event.changed_by_name} · {displayDate(event.changed_at)}
                {event.public_message && (
                  <>
                    <br />
                    Public message: {event.public_message}
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}

function AvailabilityCard({
  setting,
  disabled,
  save,
}: {
  setting: ServiceAvailabilitySetting;
  disabled: boolean;
  save: (
    status: ServiceAvailabilityStatus,
    message: string,
  ) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<ServiceAvailabilityStatus>(
    setting.status,
  );
  const [message, setMessage] = useState(setting.public_message);
  const dirty =
    status !== setting.status || message.trim() !== setting.public_message;
  return (
    <form
      className="space-y-3 rounded-xl border bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save(status, message.trim());
      }}
    >
      <h3 className="text-lg font-black">
        {SERVICE_AVAILABILITY_LABELS[setting.service_key]}
      </h3>
      <p className="text-sm">
        Current:{" "}
        <strong>
          {setting.status === "available"
            ? "Available"
            : "CURRENTLY UNAVAILABLE"}
        </strong>
        <br />
        Last changed by {setting.changed_by_name} ·{" "}
        {displayDate(setting.changed_at)}
      </p>
      <label className="block font-semibold">
        Status
        <select
          className={serviceInput}
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as ServiceAvailabilityStatus)
          }
        >
          <option value="available">Available</option>
          <option value="currently_unavailable">CURRENTLY UNAVAILABLE</option>
        </select>
      </label>
      <label className="block font-semibold">
        Optional public message
        <textarea
          className={serviceInput}
          value={message}
          maxLength={500}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Shown near the unavailable control"
        />
      </label>
      <button className={serviceButton} disabled={disabled || !dirty}>
        Save availability
      </button>
    </form>
  );
}
