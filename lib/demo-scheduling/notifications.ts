import "server-only";

import { sendIdsNotification, sendServerEmail, type ServerEmailOptions } from "@/lib/email";
import { DEMO_PARTY_CONFIRMATION_SUMMARY } from "@/lib/demo-party/disclaimer";
import { issuePortalToken } from "@/lib/demo-party/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { SITE_CONTACT } from "@/lib/site-contact";
import { DEMO_EMAIL_ROUTING } from "./email-config";
import { createDemoIcs } from "./ics";
import { humanDemoTime } from "./time";
import type { DemoRequest } from "./types";

type EventType = "ids_new_request" | "customer_request_received" | "customer_denied" | "customer_more_information" | "customer_payment_required" | "customer_payment_confirmed_private" | "customer_payment_confirmed_party" | "ids_calendar_invite";

async function deliver(request: DemoRequest, type: EventType, send: () => Promise<unknown>) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("demo_claim_notification", { p_request_id: request.id, p_event_type: type });
  if (error || !data) throw new Error("Notification claim failed.");
  const claim = data as { claimed: boolean; eventId: string; claimedAt: string };
  if (!claim.claimed) return "skipped" as const;
  try {
    await send();
  } catch (error) {
    const { error: finishError } = await client.rpc("demo_finish_notification", { p_event_id: claim.eventId, p_claimed_at: claim.claimedAt, p_status: "failed", p_error: error instanceof Error ? error.message.slice(0, 100) : "SEND_FAILED" });
    if (finishError) throw new Error("Notification failure could not be recorded.", { cause: error });
    throw error;
  }
  const { error: finishError } = await client.rpc("demo_finish_notification", { p_event_id: claim.eventId, p_claimed_at: claim.claimedAt, p_status: "sent", p_error: null });
  if (finishError) throw new Error("Notification completion could not be recorded.");
  return "sent" as const;
}
const details = (request: DemoRequest) => [
  `Customer: ${request.customerName}`,
  `Email: ${request.customerEmail}`,
  `Phone: ${request.customerPhone}`,
  `Property: ${request.propertyAddress}`,
  `Requested time: ${humanDemoTime(request.requestedStartAt, request.requestedEndAt)}`,
  `Format: ${request.demoFormat === "party" ? "Demo Party" : "Private Demo"}`,
  `Equipment: ${request.equipmentInterest ?? "Not specified"}`,
  `Source: ${request.source}`,
  `Request ID: ${request.id}`,
].join("\n");

const configuredOrganizer = () => {
  const explicit = process.env.DEMO_ORGANIZER_EMAIL?.trim();
  if (explicit) return explicit;
  const from = process.env.DEMO_FROM_EMAIL?.trim();
  if (from && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) return from;
  throw new Error("DEMO_ORGANIZER_EMAIL or a plain DEMO_FROM_EMAIL is required for calendar invitations.");
};

const attachment = (request: DemoRequest, attendeeEmail: string, attendeeName: string) => ({
  filename: `ids-demo-${request.id}.ics`,
  content: Buffer.from(createDemoIcs(request, { organizerEmail: configuredOrganizer(), attendeeEmail, attendeeName })).toString("base64"),
  contentType: "text/calendar; method=REQUEST; charset=UTF-8",
});

const siteOrigin = () => {
  const value = process.env.IDS_SITE_URL?.trim() || "http://localhost:3000";
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("IDS_SITE_URL must use HTTPS in production.");
  return url.origin;
};
const portalUrl = (token: string) => `${siteOrigin()}/services-scheduling/manage/${encodeURIComponent(token)}`;
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const emailButton = (label: string, url: string) => `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#047857;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(label)}</a>`;
const sendDemoEmail = (message: ServerEmailOptions) => sendServerEmail({ ...message, replyTo: DEMO_EMAIL_ROUTING.replyTo });

export async function notifyNewDemoRequest(request: DemoRequest) {
  const result: { ids?: string; customer?: string } = {};
  try {
    result.ids = await deliver(request, "ids_new_request", () => sendIdsNotification({ to: DEMO_EMAIL_ROUTING.staffRecipient, replyTo: DEMO_EMAIL_ROUTING.replyTo, subject: `New ${request.demoFormat === "party" ? "Demo Party" : "Private Demo"} Request`, text: `A new request is pending IDS approval.\n\n${details(request)}\n\nAdmin: /admin/demo-scheduling` }));
  } catch { result.ids = "failed"; }
  try {
    result.customer = await deliver(request, "customer_request_received", () => sendDemoEmail({
      to: request.customerEmail,
      subject: "IDS Demo Request Received",
      text: `Hello ${request.customerName},\n\nIDS received your ${request.demoFormat === "party" ? "Demo Party" : "Private Demo"} request for ${humanDemoTime(request.requestedStartAt, request.requestedEndAt)} at ${request.propertyAddress}.\n\nYour request is pending individual IDS review. Submission does not reserve or confirm the appointment, and no payment has been collected. If approved, IDS will send a private link for the fixed $100 reservation and travel fee.\n\nContact IDS: ${SITE_CONTACT.email.display}`,
    }));
  } catch { result.customer = "failed"; }
  return result;
}

export async function notifyDemoApproval(request: DemoRequest) {
  try {
    return { customer: await deliver(request, "customer_payment_required", async () => {
      const token = await issuePortalToken(request.id);
      const secureUrl = portalUrl(token);
      await sendDemoEmail({
        to: request.customerEmail,
        subject: "IDS Demo Approved — Payment Required",
        text: `Hello ${request.customerName},\n\nIDS approved your ${request.demoFormat === "party" ? "Demo Party" : "Private Demo"} request for ${humanDemoTime(request.requestedStartAt, request.requestedEndAt)} at ${request.propertyAddress}.\n\nThe appointment is not confirmed yet.\n\nPay $100 Demo Reservation & Travel Fee:\n${secureUrl}\n\nThis private link grants access to appointment${request.demoFormat === "party" ? " and guest" : ""} information. Do not forward it.\n\nContact IDS: ${SITE_CONTACT.email.display}`,
        html: `<p>Hello ${escapeHtml(request.customerName)},</p><p>IDS approved your ${request.demoFormat === "party" ? "Demo Party" : "Private Demo"} request for ${escapeHtml(humanDemoTime(request.requestedStartAt, request.requestedEndAt))} at ${escapeHtml(request.propertyAddress)}.</p><p><strong>The appointment is not confirmed yet.</strong></p><p>${emailButton("Pay $100 Demo Reservation & Travel Fee", secureUrl)}</p><p>This private link grants access to appointment${request.demoFormat === "party" ? " and guest" : ""} information. Do not forward it.</p><p>Contact IDS: ${escapeHtml(SITE_CONTACT.email.display)}</p>`,
      });
    }) };
  } catch { return { customer: "failed" as const }; }
}

export async function notifyDemoMoreInformation(request: DemoRequest) {
  return deliver(request, "customer_more_information", () => sendDemoEmail({
    to: request.customerEmail,
    subject: "IDS Needs More Information About Your Demo Request",
    text: `Hello ${request.customerName},\n\nBefore IDS can approve your request, we need the following information:\n\n${request.adminMessage}\n\nReply to this message or contact IDS at ${SITE_CONTACT.email.display}. Your requested time remains pending.`,
  }));
}

export async function notifyDemoPaymentConfirmed(request: DemoRequest, token: string | null) {
  const type: EventType = request.demoFormat === "party" ? "customer_payment_confirmed_party" : "customer_payment_confirmed_private";
  const result: { customer?: string; calendar?: string } = {};
  try {
    result.customer = await deliver(request, type, async () => {
      const secureUrl = portalUrl(token ?? await issuePortalToken(request.id));
      const partySummary = DEMO_PARTY_CONFIRMATION_SUMMARY;
      await sendDemoEmail({
        to: request.customerEmail,
        subject: request.demoFormat === "party" ? "Your IDS Demo Party Is Confirmed" : "Your IDS Private Demo Is Confirmed",
        text: `Hello ${request.customerName},\n\nYour $100 payment was verified and your appointment is confirmed for ${humanDemoTime(request.requestedStartAt, request.requestedEndAt)} at ${request.propertyAddress}.\n\nEquipment interest: ${request.equipmentInterest ?? "Not specified"}.\n\n${request.demoFormat === "party" ? "Manage Guest List" : "Manage secure appointment"}:\n${secureUrl}\n\n${request.demoFormat === "party" ? `${partySummary}\n\n` : ""}Contact IDS: ${SITE_CONTACT.email.display}`,
        html: `<p>Hello ${escapeHtml(request.customerName)},</p><p>Your <strong>$100 payment was verified</strong> and your appointment is confirmed for ${escapeHtml(humanDemoTime(request.requestedStartAt, request.requestedEndAt))} at ${escapeHtml(request.propertyAddress)}.</p><p>Equipment interest: ${escapeHtml(request.equipmentInterest ?? "Not specified")}.</p><p>${emailButton(request.demoFormat === "party" ? "Manage Guest List" : "Manage Secure Appointment", secureUrl)}</p>${request.demoFormat === "party" ? `<p>${escapeHtml(partySummary)}</p>` : ""}<p>Contact IDS: ${escapeHtml(SITE_CONTACT.email.display)}</p>`,
        attachments: [attachment(request, request.customerEmail, request.customerName)],
      });
    });
  } catch { result.customer = "failed"; }
  const calendarEmail = DEMO_EMAIL_ROUTING.staffRecipient;
  try {
    result.calendar = await deliver(request, "ids_calendar_invite", () => sendDemoEmail({ to: calendarEmail, subject: `IDS ${request.demoFormat === "party" ? "Demo Party" : "Private Demo"} — ${request.customerName}`, text: details(request), attachments: [attachment(request, calendarEmail, "IDS Demo Calendar")] }));
  } catch { result.calendar = "failed"; }
  return result;
}

export async function notifyDemoDenial(request: DemoRequest) {
  return deliver(request, "customer_denied", () => sendDemoEmail({ to: request.customerEmail, subject: "Update on Your IDS Demo Request", text: `Hello ${request.customerName},\n\nMachine requested: ${request.equipmentInterest ?? "Not specified"}\n\n${request.adminMessage}\n\nYour requested appointment was not confirmed. You may return to the IDS website to request another available time.` }));
}

export async function retryFailedDemoNotifications(request: DemoRequest) {
  if (request.status === "pending" && request.informationRequestedAt) return {
    initial: await notifyNewDemoRequest(request).catch(() => "failed"),
    information: await notifyDemoMoreInformation(request).catch(() => "failed"),
  };
  if (request.status === "pending") return { newRequest: await notifyNewDemoRequest(request).catch(() => "failed") };
  if (request.status === "approved" && ["paid", "partially_refunded", "refunded"].includes(request.paymentStatus ?? "")) {
    return notifyDemoPaymentConfirmed(request, null);
  }
  if (request.status === "approved") return notifyDemoApproval(request);
  if (request.status === "denied") return { denial: await notifyDemoDenial(request).catch(() => "failed") };
  return {};
}
