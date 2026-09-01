import type { DemoRequest } from "./types";
import type { ValidDemoAppointmentRequest } from "@/lib/demo-party/validation";
import { validateDemoAppointmentRequest } from "@/lib/demo-party/validation";

type DemoRequestSubmissionDependencies = {
  createRequest: (value: ValidDemoAppointmentRequest) => Promise<string>;
  readRequest: (id: string) => Promise<DemoRequest>;
  notifyRequest: (request: DemoRequest) => Promise<unknown>;
  onNotificationFailure?: (requestId: string) => void;
};

export async function handleDemoRequestPost(
  request: Request,
  dependencies: DemoRequestSubmissionDependencies,
) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16_000) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }
  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { body = null; }
  const parsed = validateDemoAppointmentRequest(body);
  if (!parsed.ok) return Response.json({ errors: parsed.errors }, { status: 400 });
  try {
    const id = await dependencies.createRequest(parsed.value);
    const saved = await dependencies.readRequest(id);
    await dependencies.notifyRequest(saved).catch(() => dependencies.onNotificationFailure?.(id));
    return Response.json({ id, status: saved.status, message: "Demo request received and is pending approval." }, { status: 201 });
  } catch (error) {
    const message = String((error as { message?: string })?.message ?? "");
    if (/slot_conflict|slot_unavailable|exclusion/i.test(message)) return Response.json({ error: "That time was just requested by another customer. Please choose another available time." }, { status: 409 });
    if (/idempotency_conflict/i.test(message)) return Response.json({ error: "This request could not be retried safely. Please refresh the scheduler and try again." }, { status: 409 });
    if (/request_throttled/i.test(message)) return Response.json({ error: "A demo request was recently submitted with these contact details. Please wait a few minutes before trying again." }, { status: 429 });
    return Response.json({ error: "Demo request could not be submitted." }, { status: 500 });
  }
}
