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
        "/professional-installation/",
        "/services-scheduling/manage/",
        "/dealer-tech-resources/member/",
        "/troubleshoot-your-robot/",
      ],
    },
    sitemap: `${IDS_CANONICAL_ORIGIN}/sitemap.xml`,
    host: IDS_CANONICAL_ORIGIN,
  };
}
