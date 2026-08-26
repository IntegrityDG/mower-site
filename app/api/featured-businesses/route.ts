import { isActivePublicBusiness } from "@/lib/featured-businesses/homepage-rotation";
import { readPublicBusinesses } from "@/lib/featured-businesses/server";
import { filterBusinesses } from "@/lib/featured-businesses/search";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const featured = params.get("featured") === "true";
    const homepageRotation = params.get("homepageRotation") === "true";
    const page = Math.max(1, Number(params.get("page")) || 1);
    const limit = Math.min(24, Math.max(1, Number(params.get("limit")) || 24));
    const all = await readPublicBusinesses(featured && !homepageRotation);

    if (homepageRotation) {
      const now = Date.now();
      const businesses = all.filter((business) => isActivePublicBusiness(business, now));
      return Response.json({ businesses, count: businesses.length });
    }

    const filtered = featured ? all : filterBusinesses(all, {
      q: params.get("q") ?? undefined,
      state: params.get("state") ?? undefined,
      county: params.get("county") ?? undefined,
      areaCode: /^\d{3}$/.test(params.get("areaCode") ?? "") ? params.get("areaCode")! : undefined,
    });
    return Response.json({
      businesses: filtered.slice((page - 1) * limit, page * limit),
      count: filtered.length,
      page,
      hasMore: page * limit < filtered.length,
    });
  } catch {
    return Response.json({ error: "Featured businesses are temporarily unavailable." }, { status: 503 });
  }
}
