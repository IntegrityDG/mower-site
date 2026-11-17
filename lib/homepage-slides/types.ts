export type PublicHomepageSlide = {
  id: string; imageUrl: string; altText: string; buttonLabel: string | null;
  buttonHref: string | null; startsAt: string; endsAt: string; sortOrder: number; dwellSeconds: number;
};
export type HomepageSlideInput = {
  title: string; altText: string; buttonLabel: string | null; buttonHref: string | null;
  startDate: string; endDate: string; sortOrder: number; dwellSeconds: number; enabled: boolean;
};
export type AdminHomepageSlide = HomepageSlideInput & {
  id: string; imageUrl: string | null; startsAt: string; endsAt: string; updatedAt: string;
};

export type PublicHomepageSlideSnapshot = { slides: PublicHomepageSlide[]; serverTime: string; nextChangeAt: string | null };
