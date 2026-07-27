export const PAYMENT_SECURITY_POLICY_ID = "ids-stripe-payment-security-v1" as const;
export const PAYMENT_SECURITY_POLICY_VERSION = "1.0" as const;

export const PAYMENT_SECURITY_NOTICE =
  "Payment Security Notice: Integrity Distribution Systems does not receive or store your full card or bank-account number. Payment information is entered directly into Stripe’s secure checkout. Stripe may offer you the option to save your payment method securely for future purchases; it will only be saved if you choose that option. IDS retains contact information, order history, payment status, and transaction references needed to fulfill and support your purchase." as const;

export const PROHIBITED_PAYMENT_DATA_FIELDS = [
  "card_number",
  "card_last4",
  "last4",
  "card_brand",
  "cvc",
  "cvv",
  "exp_month",
  "exp_year",
  "expiration",
  "fingerprint",
  "account_number",
  "bank_last4",
  "routing_number",
  "bank_name",
  "payment_method_id",
  "paymentmethod_id",
  "reusable_token",
  "mandate_details",
  "complete_stripe_webhook_payload",
] as const;

export const STRIPE_CUSTOMER_PROFILE_REUSE_POLICY = Object.freeze({
  newOrUnverifiedBuyer: "create_new_stripe_customer",
  emailMatchMeaning: "possible_duplicate_only",
  reuseRequires: "verified_identity",
  approvedVerificationMethods: ["authenticated_login", "email_otp", "signed_magic_link"],
  automaticEmailMerge: "prohibited",
  unresolvedDuplicates: "keep_separate_pending_verification_or_manual_review",
} as const);
