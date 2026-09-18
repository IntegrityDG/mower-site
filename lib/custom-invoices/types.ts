export type InvoiceStatus = "draft" | "finalized" | "sent" | "partially_paid" | "paid" | "void";
export type InvoiceLineType = "item" | "fee" | "discount" | "credit";
export type InvoiceSourceType = "custom" | "product" | "variant" | "package" | "option" | "service";
export type PaymentTerms = "full" | "deposit";

export type InvoiceAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};

export type InvoiceLineInput = {
  id?: string;
  lineType: InvoiceLineType;
  sourceType: InvoiceSourceType;
  catalogId?: string | null;
  catalogParentId?: string | null;
  description: string;
  secondaryDescription?: string | null;
  sku?: string | null;
  quantity: number;
  unitPriceCents: number;
  catalogReferencePriceCents?: number | null;
  catalogStatus?: string | null;
  catalogPurchaseState?: string | null;
  availabilityWarning?: boolean;
  sortOrder: number;
};

export type InvoiceDraftInput = {
  customerName: string;
  companyName?: string | null;
  customerEmail: string;
  customerPhone: string;
  billingAddress: InvoiceAddress;
  shippingAddress: InvoiceAddress;
  customerNotes: string;
  internalNotes: string;
  fulfillmentNotes: string;
  dueDate: string | null;
  paymentTerms: PaymentTerms;
  depositAmountCents: number | null;
  availabilityAcknowledged: boolean;
  taxCents: number;
  items: InvoiceLineInput[];
};

export type InvoiceTotals = {
  subtotalCents: number;
  feeCents: number;
  discountCents: number;
  creditCents: number;
  taxCents: number;
  totalCents: number;
};

export type CatalogInvoiceReference = {
  id: string;
  sourceType: Exclude<InvoiceSourceType, "custom">;
  name: string;
  description: string | null;
  sku: string | null;
  priceCents: number | null;
  status: string | null;
  purchaseState: string | null;
  parentId: string | null;
  parentName: string | null;
  availabilityWarning: boolean;
};
