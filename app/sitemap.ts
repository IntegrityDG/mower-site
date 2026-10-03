import type { MetadataRoute } from "next";
import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";

const PUBLIC_ROUTES = [
  "/",
  "/equipment",
  "/equipment/accessories",
  "/equipment/lymow-one-plus",
  "/equipment/yarbo",
  "/equipment/pandag-g1",
  "/services-scheduling",
  "/professional-installation",
  "/remote-assistance",
  "/service",
  "/reviews",
  "/referral-program",
  "/featured-businesses",
  "/dealer-tech-resources",
  "/ids-in-action",
  "/troubleshoot-your-robot",
  "/robot-mowers",
  "/commercial-robot-mowers",
  "/robot-mowers/missouri",
  "/robot-mowers/southern-illinois",
  "/robot-mowers/northeast-arkansas",
  "/robot-mowers/western-kentucky",
  "/robot-mowers/western-tennessee",
  "/robot-mowers/large-acreage",
  "/robot-mowers/hills-rough-terrain",
  "/robot-mowers/wire-free",
  "/robot-mower-financing",
  "/robot-mower-guides",
  "/robot-mower-guides/do-robot-mowers-need-internet",
  "/robot-mower-guides/rtk-gps-vslam-vision",
  "/robot-mower-guides/robot-mower-vs-zero-turn",
  "/robot-mower-guides/commercial-roi-labor-planning",
  "/robot-mower-guides/tracked-vs-wheeled",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: new URL(path, IDS_CANONICAL_ORIGIN).href,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
