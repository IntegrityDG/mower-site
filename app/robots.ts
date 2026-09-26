import type { MetadataRoute } from "next";
import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/staff/",
        "/checkout/",
        "/service/manage/",
        "/remote-assistance/manage/",
        "/services-scheduling/manage/",
        "/dealer-tech-resources/member",
      ],
    },
    sitemap: `${IDS_CANONICAL_ORIGIN}/sitemap.xml`,
  };
}
