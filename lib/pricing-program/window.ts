export type PriceWindowState = "none" | "upcoming" | "active" | "ended";

export type PriceWindow = {
  startsAt?: string | null;
  endsAt?: string | null;
};

function instant(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Pricing windows start inclusively and end exclusively: [start, end). */
export function isWithinPriceWindow(
  window: PriceWindow,
  now = Date.now(),
) {
  const starts = instant(window.startsAt, Number.NEGATIVE_INFINITY);
  const ends = instant(window.endsAt, Number.POSITIVE_INFINITY);
  return now >= starts && now < ends;
}

export function priceWindowState(
  hasPrice: boolean,
  window: PriceWindow,
  now = Date.now(),
): PriceWindowState {
  if (!hasPrice) return "none";
  const starts = instant(window.startsAt, Number.NEGATIVE_INFINITY);
  const ends = instant(window.endsAt, Number.POSITIVE_INFINITY);
  if (now < starts) return "upcoming";
  if (now >= ends) return "ended";
  return "active";
}
