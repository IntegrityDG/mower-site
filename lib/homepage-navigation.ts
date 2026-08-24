export const HOME_VIEWS = [
  "home",
  "build",
  "machines",
  "financing",
  "reviews",
  "ids-action",
  "contact",
] as const;

export type HomeView = (typeof HOME_VIEWS)[number];

const homeViews = new Set<string>(HOME_VIEWS);
const LEGACY_BUILD_HASH = "location-and-customer-path";

export function homeViewFromHash(hash: string): HomeView {
  const normalized = hash.replace(/^#/, "");
  if (normalized === LEGACY_BUILD_HASH) return "build";
  return homeViews.has(normalized) ? normalized as HomeView : "home";
}

export function homeViewFromLocation(location: Pick<Location, "hash">): HomeView {
  return homeViewFromHash(location.hash);
}

export function homeUrlForView(
  location: Pick<Location, "pathname" | "search">,
  view: HomeView,
): string {
  const hash = view === "home" ? "" : `#${view}`;
  return `${location.pathname}${location.search}${hash}`;
}
