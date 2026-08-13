export const DEMO_TIMEZONE="America/Chicago";
export const DEMO_SOURCES=["featured_lymow","featured_yarbo","meet_or_beat","ids_in_action"] as const;
export type DemoSource=typeof DEMO_SOURCES[number];
export type DemoRequest={id:string;customerName:string;customerEmail:string;customerPhone:string;propertyAddress:string;requestedStartAt:string;requestedEndAt:string;status:"pending"|"approved"|"denied"|"cancelled";source:DemoSource;equipmentInterest:string|null;adminMessage:string|null;createdAt:string;approvedAt:string|null;deniedAt:string|null;cancelledAt:string|null};
export type DemoSlot={startAt:string;endAt:string;date:string;timeLabel:string};
export type AvailabilityRule={id:string;weekday:number;enabled:boolean;startTime:string;endTime:string};
export type AvailabilityException={id:string;startsAt:string;endsAt:string;allDay:boolean;reason:string|null};
