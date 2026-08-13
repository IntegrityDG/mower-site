import type { DemoRequest } from "./types";

export const DEMO_REQUEST_FILTERS = ["active", "pending", "approved", "past", "denied", "all"] as const;
export type DemoRequestFilter = (typeof DEMO_REQUEST_FILTERS)[number];

export function requestMatchesDemoFilter(request: DemoRequest, filter: DemoRequestFilter, now: number): boolean {
  if (filter === "all") return true;
  if (filter === "pending" || filter === "approved" || filter === "denied") return request.status === filter;

  const appointmentHasEnded = Date.parse(request.requestedEndAt) < now;
  if (filter === "past") return appointmentHasEnded;

  return request.status === "pending" || (request.status === "approved" && !appointmentHasEnded);
}

export function reconcileSelectedDemoRequest(
  selected: DemoRequest | null,
  filter: DemoRequestFilter,
  now: number,
): DemoRequest | null {
  return selected && requestMatchesDemoFilter(selected, filter, now) ? selected : null;
}

export function isDemoRequestSlotOccupying(request: DemoRequest): boolean {
  return request.status === "pending" || request.status === "approved";
}

export function demoCalendarOccupancyCount(requests: DemoRequest[]): number {
  return requests.filter(isDemoRequestSlotOccupying).length;
}

export function selectDemoRequestForCalendarDate(
  requests: DemoRequest[],
  filter: DemoRequestFilter,
  now: number,
): DemoRequest | null {
  return requests.find((request) => requestMatchesDemoFilter(request, filter, now)) ?? null;
}
