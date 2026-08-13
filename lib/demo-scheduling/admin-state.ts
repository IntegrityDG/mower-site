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

function canRefreshDemoRequestStatus(current: DemoRequest["status"], refreshed: DemoRequest["status"]): boolean {
  if (current === refreshed) return true;
  if (current === "pending") return refreshed === "approved" || refreshed === "denied";
  return current === "approved" && refreshed === "cancelled";
}

export function mergeRefreshedDemoRequests(current: DemoRequest[], refreshed: DemoRequest[]): DemoRequest[] {
  const currentById = new Map(current.map((request) => [request.id, request]));
  const seen = new Set<string>();
  const merged: DemoRequest[] = [];

  for (const request of refreshed) {
    if (seen.has(request.id)) continue;
    const existing = currentById.get(request.id);
    merged.push(existing && !canRefreshDemoRequestStatus(existing.status, request.status) ? existing : request);
    seen.add(request.id);
  }

  for (const request of current) {
    if (!seen.has(request.id)) {
      merged.push(request);
      seen.add(request.id);
    }
  }

  return merged;
}

export class DemoSchedulingAdminRequestState {
  private requests: DemoRequest[];

  constructor(initial: DemoRequest[] = []) {
    this.requests = mergeRefreshedDemoRequests([], initial);
  }

  applyTransition(request: DemoRequest): DemoRequest[] {
    this.requests = mergeRefreshedDemoRequests([request], this.requests);
    return this.requests;
  }

  applyRefresh(requests: DemoRequest[]): DemoRequest[] {
    this.requests = mergeRefreshedDemoRequests(this.requests, requests);
    return this.requests;
  }
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
