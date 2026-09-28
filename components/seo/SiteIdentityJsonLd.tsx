import { SITE_CONTACT } from "@/lib/site-contact";
import { IDS_CANONICAL_ORIGIN, IDS_SITE_NAME } from "@/lib/site-origin";

const organizationId = `${IDS_CANONICAL_ORIGIN}/#organization`;

export const siteIdentityGraph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: IDS_SITE_NAME,
      url: IDS_CANONICAL_ORIGIN,
      logo: `${IDS_CANONICAL_ORIGIN}/logo.png`,
      email: SITE_CONTACT.email.display,
      sameAs: [SITE_CONTACT.facebook.href],
    },
    {
      "@type": "WebSite",
      "@id": `${IDS_CANONICAL_ORIGIN}/#website`,
      url: IDS_CANONICAL_ORIGIN,
      name: IDS_SITE_NAME,
      publisher: { "@id": organizationId },
    },
  ],
} as const;

export default function SiteIdentityJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(siteIdentityGraph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
