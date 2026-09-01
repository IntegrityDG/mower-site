export const DEMO_FORMATS = ["private", "party"] as const;
export type DemoFormat = (typeof DEMO_FORMATS)[number];

export const PROPERTY_RELATIONSHIPS = [
  "homeowner",
  "property_owner",
  "authorized_property_manager",
] as const;
export type PropertyRelationship = (typeof PROPERTY_RELATIONSHIPS)[number];

export const PROPERTY_TYPES = ["residential", "commercial", "rental_property", "hoa", "other"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PURCHASE_TIMEFRAMES = ["within_30_days", "1_to_3_months", "3_to_6_months", "researching_later"] as const;
export type PurchaseTimeframe = (typeof PURCHASE_TIMEFRAMES)[number];

export const EQUIPMENT_BUDGETS = ["under_3000", "3000_to_5000", "5000_to_8000", "8000_to_12000", "12000_plus"] as const;
export type EquipmentBudget = (typeof EQUIPMENT_BUDGETS)[number];

export type DemoPartyScreening = {
  propertyRelationship: PropertyRelationship;
  propertyType: PropertyType;
  mowableAcreage: number;
  activelyConsideringPurchase: boolean;
  purchaseTimeframe: PurchaseTimeframe;
  equipmentBudget: EquipmentBudget;
  certification: true;
};

export type DemoPartyBenefits = {
  qualifyingGuests: number;
  feeRefundCents: number;
  baseMachineDiscountCents: number;
  maximumMachineDiscountCents: number;
};

export type DemoPartyGuest = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  qualificationStatus: "pending" | "qualifying" | "not_qualifying";
  qualificationVerifiedAt: string | null;
  followUpConsent: boolean | null;
  referralIdentifier: string;
};

export type DemoPartyPortal = {
  appointmentId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  propertyAddress: string;
  requestedStartAt: string;
  requestedEndAt: string;
  equipmentInterest: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  paymentStatus: "not_started" | "checkout_open" | "paid" | "partially_refunded" | "refunded";
  amountPaidCents: number;
  amountRefundedCents: number;
  demoFormat: DemoFormat;
  guestArrivalAt: string | null;
  guestListLocked: boolean;
  guests: DemoPartyGuest[];
  benefits: DemoPartyBenefits;
  benefitCheckoutUrl: string | null;
  benefitCheckoutExpiresAt: string | null;
};
