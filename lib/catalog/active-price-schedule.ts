export type PriceScheduleTarget = "product" | "variant" | "option" | "package" | "service" | "product_service";

export type ActivePriceSchedule = {
  id: string;
  schedule_name?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
  option_id?: string | null;
  package_id?: string | null;
  service_id?: string | null;
  product_service_id?: string | null;
  starts_at: string;
  ends_at: string | null;
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  promotion_label?: string | null;
  show_public_price?: boolean;
  contact_for_pricing?: boolean;
  public_status: string;
};

export type SchedulePriceRow = {
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  promotion_label?: string | null;
  show_public_price?: boolean;
  contact_for_pricing?: boolean;
};

export function selectActivePriceSchedule<T extends ActivePriceSchedule>(schedules: readonly T[], target: PriceScheduleTarget, targetId: string, now = Date.now()): T | null {
  const key = `${target}_id` as keyof T;
  return schedules
    .filter((schedule) => schedule.public_status === "active" && schedule[key] === targetId && new Date(schedule.starts_at).getTime() <= now && (!schedule.ends_at || new Date(schedule.ends_at).getTime() >= now))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0] ?? null;
}

export function applyActivePriceSchedule<T extends SchedulePriceRow>(row: T, schedule: ActivePriceSchedule | null): T {
  if (!schedule) return row;
  return { ...row, regular_price_cents: schedule.regular_price_cents, sale_price_cents: schedule.sale_price_cents, sale_starts_at: schedule.starts_at, sale_ends_at: schedule.ends_at, ...(schedule.promotion_label !== undefined ? { promotion_label: schedule.promotion_label } : {}), ...(schedule.show_public_price !== undefined ? { show_public_price: schedule.show_public_price } : {}), ...(schedule.contact_for_pricing !== undefined ? { contact_for_pricing: schedule.contact_for_pricing } : {}) };
}
