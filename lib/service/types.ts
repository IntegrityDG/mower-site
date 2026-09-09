export type CaseKind = "included_support" | "remote_service" | "onsite_service" | "warranty";
export type CaseStatus = "requested" | "warranty_verification" | "warranty_not_covered_authorization_required" | "scheduled" | "active" | "waiting_manufacturer_parts" | "customer_controlled_hazard" | "resolved" | "cancelled";
export type InvoiceStatus = "draft" | "submitted_for_master_review" | "finalized";
export type ServicePaymentStatus = "not_due" | "payment_due" | "processing" | "paid" | "paid_cash" | "refunded" | "partially_refunded" | "payment_review";
export type SubscriptionStatus = "pending_payment" | "pending_activation" | "active" | "suspended" | "cancelled";
export type WarrantyStatus = "not_requested" | "verification" | "verified" | "not_covered";
export type TripCategory = "initial" | "legitimate_return" | "hazard_return";

export type StaffActor = { id: string | null; role: "master" | "technician"; name: string; canCollectPayments: boolean; canRecordCash: boolean };
export type StaffProfile = { id: string; name: string; email: string; phone: string; enabled: boolean; can_collect_payments: boolean; can_record_cash: boolean; created_at: string };
export type Subscription = {
  id: string; customer_id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  status: SubscriptionStatus; source: "standalone" | "machine"; order_id: string | null;
  activation_at: string | null; paid_through: string | null; failed_at: string | null;
  cancel_at_period_end: boolean; livemode: boolean; created_at: string;
};
export type EquipmentDetails = { manufacturer: string; model: string; serial: string; purchaseDate: string; purchasedFrom: string };
export type WorkEntry = { id: string; date: string; minutes: number; description: string; technicianId: string | null };
export type TravelEntry = { id: string; date: string; category: TripCategory; outboundMinutes: number; returnMinutes: number; mappedRoute: string; reason: string };
export type SupplyEntry = { id: string; kind: "part" | "material" | "consumable"; description: string; partNumber: string; quantity: number; unitCents: number; authorization: string };
export type WorkSheet = {
  diagnosis: string; workPerformed: string; testing: string; resolution: string;
  labor: WorkEntry[]; travel: TravelEntry[]; supplies: SupplyEntry[];
  holdNotes: string; authorizationNotes: string; manufacturerReimbursementCents: number;
};
export type ServicePricing = {
  firstHourCents: number; additionalHalfHourCents: number;
  initialTravelHalfHourCents: number; returnTravelHalfHourCents: number;
  hazardTravelHalfHourCents: number; warrantyHourlyCents: number;
};
export type InvoiceTotals = {
  activeMinutes: number; additionalLaborBlocks: number; laborCents: number;
  travelCents: number; travelLines: { id: string; billableMinutes: number; blocks: number; rateCents: number; amountCents: number }[];
  eligibleSubtotalCents: number; discountCents: number; partsCents: number;
  materialsCents: number; consumablesCents: number; serviceValueCents: number; customerDueCents: number;
};
export type ServiceCase = {
  id: string; case_number: string; customer_id: string; subscription_id: string | null;
  customer_name: string; customer_phone: string; customer_email: string | null;
  kind: CaseKind; requested_kind: "remote_service" | "onsite_service" | null;
  status: CaseStatus; equipment: EquipmentDetails; address: string;
  issue_notes: string; resolution_notes: string; assigned_staff_id: string | null;
  warranty_status: WarrantyStatus; warranty_equipment_covered: boolean | null;
  warranty_service_covered: boolean | null; warranty_review_notes: string;
  arrangement: "remote" | "shop_dropoff" | "onsite_ids_approved" | "onsite";
  paid_authorized_at: string | null; payment_method_id: string | null;
  started_at: string | null; resolved_at: string | null; version: number;
  created_at: string; updated_at: string;
};
export type ServiceInvoice = {
  id: string; case_id: string; status: InvoiceStatus; sheet: WorkSheet;
  pricing: ServicePricing; totals: InvoiceTotals | null; subscriber_eligible: boolean;
  payment_status: ServicePaymentStatus; review_notes: string;
  finalized_at: string | null; version: number;
};
export type ServiceAppointment = {
  id: string; case_id: string; starts_at: string; ends_at: string;
  status: "scheduled" | "paused" | "completed" | "cancelled" | "no_show";
  staff_id: string; session_number: number | null; cycle_id: string | null;
};
export type CaseEvent = { id: string; action: string; actor_name: string; created_at: string; details: Record<string, unknown> };
export type CaseDetail = {
  case: ServiceCase; invoice: ServiceInvoice | null; subscription: Subscription | null;
  appointments: ServiceAppointment[]; events: CaseEvent[];
  attachments: { id: string; name: string; status: string }[];
  sessions: { cycle_id: string; number: number; status: string; reason: string | null; case_id: string | null }[];
};
