import type { MetadataRoute } from "next";
import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";

const PUBLIC_ROUTES = [
  "/",
  "/equipment",
  "/equipment/accessories",
  "/services-scheduling",
  "/professional-installation",
  "/remote-assistance",
  "/service",
  "/reviews",
  "/referral-program",
  "/featured-businesses",
  "/featured-businesses/request",
  "/dealer-tech-resources",
  "/dealer-tech-resources/apply",
  "/ids-in-action",
  "/contact",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: new URL(path, IDS_CANONICAL_ORIGIN).href,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
