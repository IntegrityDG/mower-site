import "server-only";
import { sendServerEmail } from "@/lib/email";
import { SITE_CONTACT } from "@/lib/site-contact";
import { claimInvoiceDelivery, failInvoiceDelivery, finishInvoiceDelivery } from "./repository";
import { customInvoiceEmailContent } from "./email-content";

export async function deliverCustomInvoice(detail: { invoice: Record<string, unknown>; items: Record<string, unknown>[] }, requestId: string, operationKey: string) {
  const claimed = await claimInvoiceDelivery(requestId, operationKey);
  if (claimed.email_status === "sent") return claimed;
  if (!claimed.hosted_invoice_url) throw new Error("Secure payment link is unavailable.");
  const content = customInvoiceEmailContent(detail, claimed);
  try {
    const result = await sendServerEmail({ to: String(detail.invoice.customer_email), replyTo: SITE_CONTACT.email.display, ...content, idempotencyKey: `custom-invoice-${requestId}`.slice(0, 256) });
    const providerId = "data" in result && result.data?.id ? result.data.id : "accepted";
    await finishInvoiceDelivery(requestId, operationKey, providerId);
    return { ...claimed, email_status: "sent", email_provider_id: providerId };
  } catch (error) {
    await failInvoiceDelivery(requestId, operationKey);
    throw error;
  }
}
