import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import ProductBuildCta, {
  ContactInformationDialog,
  contactDialogReducer,
  type ContactDialogCloseReason,
} from "../components/equipment/ProductBuildCta";
import { SITE_CONTACT } from "../lib/site-contact";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("the bottom build banner keeps its existing action and adds Contact Us", () => {
  const html = renderToStaticMarkup(
    <ProductBuildCta
      supportingText="Choose your equipment, then check delivery and service availability."
      productSlug="lymow-one-plus"
    />
  );

  assert.match(html, /Ready to Build Your System\?/);
  assert.match(html, />Build Your System<\/a>/);
  assert.match(
    html,
    /href="\/\?product=lymow-one-plus#location-and-customer-path"/
  );
  assert.match(html, /<button[^>]*>Contact Us<\/button>/);
});

test("the contact modal state opens and all supported close paths close it", () => {
  assert.equal(contactDialogReducer(false, { type: "open" }), true);

  for (const reason of [
    "button",
    "backdrop",
    "escape",
  ] satisfies ContactDialogCloseReason[]) {
    assert.equal(
      contactDialogReducer(true, { type: "close", reason }),
      false
    );
  }
});

test("the accessible contact dialog uses the centralized public links", () => {
  const html = renderToStaticMarkup(
    <ContactInformationDialog
      dialogId="contact-dialog"
      headingId="contact-heading"
      descriptionId="contact-description"
      onClose={() => undefined}
    />
  );

  assert.equal(SITE_CONTACT.phone.display, "(573) 971-7197");
  assert.equal(SITE_CONTACT.phone.href, "tel:+15739717197");
  assert.equal(SITE_CONTACT.email.display, "Info.IDS@proton.me");
  assert.equal(SITE_CONTACT.email.href, "mailto:Info.IDS@proton.me");
  assert.match(
    SITE_CONTACT.facebook.href,
    /^https:\/\/www\.facebook\.com\/61577666481254$/
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="contact-heading"/);
  assert.match(html, /aria-describedby="contact-description"/);
  assert.match(html, /aria-label="Close contact information"/);
  assert.match(html, /href="tel:\+15739717197"/);
  assert.match(html, /href="mailto:Info\.IDS@proton\.me"/);
  const facebookLinkPattern = new RegExp(
    `href="${escapeRegExp(SITE_CONTACT.facebook.href)}" target="_blank" rel="noopener noreferrer"`,
    "g"
  );
  assert.equal((html.match(facebookLinkPattern) ?? []).length, 2);

  const qrAlt =
    "QR code for the Integrity Distribution Systems Facebook page";
  const qrImageStart = html.indexOf(`alt="${qrAlt}"`);
  assert.ok(qrImageStart >= 0);

  const qrLinkStart = html.lastIndexOf("<a ", qrImageStart);
  const qrLinkEnd = html.indexOf("</a>", qrImageStart);
  const qrLink = html.slice(qrLinkStart, qrLinkEnd);
  assert.equal(
    existsSync(join(process.cwd(), "public", "contact", "facebook-qr.png")),
    true
  );
  assert.match(html, /Scan to visit us on Facebook/);
  assert.match(qrLink, /src="\/contact\/facebook-qr\.png"/);
  assert.match(qrLink, new RegExp(`alt="${escapeRegExp(qrAlt)}"`));
  assert.match(qrLink, facebookLinkPattern);
  assert.doesNotMatch(html, /gmail\.com/i);
});
