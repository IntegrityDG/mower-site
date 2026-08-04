import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  ContactInformationDialog,
  contactDialogReducer,
  type ContactDialogCloseReason,
} from "../components/contact/ContactInformationModal";
import HomepageContactSection from "../components/contact/HomepageContactSection";
import ProductBuildCta from "../components/equipment/ProductBuildCta";
import { SITE_CONTACT } from "../lib/site-contact";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("the homepage contact section appears after the request flow and before the footer", () => {
  const html = renderToStaticMarkup(<HomepageContactSection />);
  const homepageSource = readFileSync(
    join(process.cwd(), "app", "page.tsx"),
    "utf8"
  );
  const requestFlowStart = homepageSource.indexOf(
    'id="location-and-customer-path"'
  );
  const contactSectionStart = homepageSource.indexOf(
    "<HomepageContactSection />"
  );
  const footerStart = homepageSource.indexOf("{/* FOOTER */}");

  assert.match(html, /Contact Integrity Distribution Systems/);
  assert.match(html, /Have Questions\? We’re Here to Help\./);
  assert.match(
    html,
    /Need help choosing the right system\? Have a complex property that may require multiple machines\? Contact us today and let our team help you build the right solution\./
  );
  assert.match(html, /<button[^>]*>Contact Us<\/button>/);
  assert.ok(requestFlowStart >= 0);
  assert.ok(contactSectionStart > requestFlowStart);
  assert.ok(footerStart > contactSectionStart);
  assert.match(
    homepageSource,
    /<NationwidePurchaseFlow \/>\s*<\/div>\s*<\/section>\s*<HomepageContactSection \/>/
  );
});

test("the homepage price-match section replaces the equipment request process", () => {
  const homepageSource = readFileSync(
    join(process.cwd(), "app", "page.tsx"),
    "utf8"
  );
  const featuredEquipmentEnd = homepageSource.indexOf(
    "{/* PRICE MATCH */}"
  );
  const financingStart = homepageSource.indexOf("{/* HEARTH FINANCING */}");

  assert.match(
    homepageSource,
    /We’ll Do Our Absolute Best Meet or Beat Any Verified Competitor\s+Price/
  );
  assert.match(
    homepageSource,
    /Found a better price\? Send us the competitor’s current advertised\s+price and give us the opportunity to save you even more\./
  );
  assert.match(homepageSource, /<ContactInformationModal triggerClassName=/);
  assert.doesNotMatch(
    homepageSource,
    /Equipment Request Process|Build and review an equipment-only request|Browse public equipment without entering a ZIP/
  );
  assert.ok(featuredEquipmentEnd >= 0);
  assert.ok(financingStart > featuredEquipmentEnd);
});

test("the equipment build banner keeps only its existing Build Your System action", () => {
  const supportingText =
    "Choose your equipment, then check delivery and service availability.";
  const html = renderToStaticMarkup(
    <ProductBuildCta
      supportingText={supportingText}
      productSlug="lymow-one-plus"
    />
  );

  assert.match(html, /Ready to Build Your System\?/);
  assert.match(html, new RegExp(supportingText));
  assert.match(html, />Build Your System<\/a>/);
  assert.match(
    html,
    /href="\/\?product=lymow-one-plus#location-and-customer-path"/
  );
  assert.doesNotMatch(html, /Contact Us|role="dialog"|aria-haspopup="dialog"/);
});

test("the homepage contact modal opens and all supported close paths close it", () => {
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
