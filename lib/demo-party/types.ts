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

export type DemoPartyPortalBenefits = {
  qualifyingGuests: number;
  feeRefundCents: number;
  baseMachineDiscountCents: number;
};

export type DemoPartyGuest = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  qualificationStatus: "pending" | "qualifying" | "not_qualifying";
};

export type DemoPartyPortal = {
  customerName: string;
  propertyAddress: string;
  requestedStartAt: string;
  equipmentInterest: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  paymentStatus: "not_started" | "creating" | "checkout_open" | "paid" | "partially_refunded" | "refunded";
  amountPaidCents: number;
  amountRefundedCents: number;
  demoFormat: DemoFormat;
  guestArrivalAt: string | null;
  guestListLocked: boolean;
  guests: DemoPartyGuest[];
  benefits: DemoPartyPortalBenefits;
  benefitCheckoutUrl: string | null;
};

export type AdminDemoPartyDetail = {
  appointment: {
    requested_start_at: string;
    status: "pending" | "approved" | "denied" | "cancelled";
    payment_status: "not_started" | "creating" | "checkout_open" | "paid" | "partially_refunded" | "refunded";
  };
  party: {
    property_relationship: string;
    property_type: string;
    mowable_acreage: number;
    actively_considering_purchase: boolean;
    purchase_timeframe: string;
    equipment_budget: string;
    property_authorization_certified: boolean;
    guest_arrival_offset_minutes: number;
    guest_list_locked: boolean;
    food_support_status: string;
    food_notes: string | null;
    food_budget_cents: number | null;
  } | null;
  payment: {
    status: "not_started" | "creating" | "checkout_open" | "paid" | "partially_refunded" | "refunded";
    stripe_checkout_session_id: string | null;
    stripe_payment_intent_id: string | null;
    paid_cents: number;
    refunded_cents: number;
  } | null;
  guests: Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string;
    referral_identifier: string;
    registered_at: string;
    checked_in_at: string | null;
    checked_out_at: string | null;
    qualification_status: "pending" | "qualifying" | "not_qualifying";
    follow_up_consent: boolean | null;
  }>;
  benefits: Array<{
    benefit_type: string;
    earned_cents: number;
    consumed_cents: number;
  }>;
  redemptions: Array<{
    id: string;
    benefit_type: string;
    amount_cents: number;
    order_id: string;
    checkout_attempt_id: string | null;
    stripe_checkout_session_id: string | null;
    state: string;
  }>;
  referrals: Array<{
    id: string;
    demo_party_guest_id: string;
    status: string;
    purchase_date: string;
    return_period_ends_at: string;
    base_reward_cents: number;
    product_name_snapshot: string;
  }>;
  auditEvents: Array<{
    event_type: string;
    actor_type: string;
    created_at: string;
  }>;
};
