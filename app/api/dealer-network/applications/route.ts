import {
  attachCertificationFiles,
  createDealerApplication,
  readApplicationNotice,
} from "@/lib/dealer-network/applications-server";
import {
  consumeDealerRateLimit,
  requestClientKey,
} from "@/lib/dealer-network/member-auth";
import { notifyNewDealerApplication } from "@/lib/dealer-network/notifications";
import { privateIdentifierHash } from "@/lib/dealer-network/security";
import {
  validateDealerApplication,
  validateUuid,
} from "@/lib/dealer-network/validation";

const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_REQUEST_BYTES)
    return Response.json(
      { error: "Application files are too large." },
      { status: 413 },
    );
  const clientKey = requestClientKey(request);
  if (
    !(await consumeDealerRateLimit(
      "dealer_application",
      clientKey,
      5,
      60 * 60,
    ).catch(() => false))
  )
    return Response.json(
      {
        error:
          "Too many applications were submitted. Please wait and try again.",
      },
      { status: 429 },
    );
  const form = await request.formData().catch(() => null);
  if (!form)
    return Response.json(
      { error: "Application data is invalid." },
      { status: 400 },
    );
  const raw = form.get("application");
  const formBytes = [...form.values()].reduce(
    (total, value) =>
      total +
      (typeof value === "string"
        ? Buffer.byteLength(value, "utf8")
        : value.size),
    0,
  );
  if (formBytes > MAX_REQUEST_BYTES)
    return Response.json(
      { error: "Application files are too large." },
      { status: 413 },
    );
  let body: unknown;
  try {
    body = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const object =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof object.websiteFax === "string" && object.websiteFax.trim())
    return Response.json(
      { message: "Application received for review." },
      { status: 201 },
    );
  const parsed = validateDealerApplication(body);
  const idempotencyKey = validateUuid(form.get("idempotencyKey"));
  if (!parsed.ok || !idempotencyKey)
    return Response.json(
      {
        errors: parsed.ok
          ? { idempotencyKey: "Refresh and try again." }
          : parsed.errors,
      },
      { status: 400 },
    );
  try {
    const applicationId = await createDealerApplication(
      parsed.value,
      idempotencyKey,
      privateIdentifierHash(`application:${clientKey}`),
    );
    const files = parsed.value.certifications.map((_, index) => {
      const item = form.get(`certificationFile${index}`);
      return item instanceof File && item.size ? item : null;
    });
    const warnings = await attachCertificationFiles(applicationId, files);
    const application = await readApplicationNotice(applicationId);
    await notifyNewDealerApplication(application).catch(() =>
      console.error("New Dealer Network application notification failed", {
        applicationId,
      }),
    );
    return Response.json(
      {
        id: applicationId,
        message: "Application received for IDS review.",
        warnings,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/idempotency_conflict/i.test(message))
      return Response.json(
        {
          error:
            "This application retry did not match the original request. Refresh and try again.",
        },
        { status: 409 },
      );
    if (/INVALID_BRAND/i.test(message))
      return Response.json(
        { error: "One of the selected brands is no longer available." },
        { status: 400 },
      );
    return Response.json(
      { error: "The application could not be submitted." },
      { status: 500 },
    );
  }
}
