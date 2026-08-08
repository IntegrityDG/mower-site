import { REVIEW_PRODUCTS, US_STATES, type ReviewSubmission } from "./types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const rating = (value: unknown, optional = false) => {
  if ((value === null || value === undefined || value === "") && optional) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : NaN;
};

export function calculateOverall(ease: number, speed: number, price: number, support?: number | null) {
  const values = support == null ? [ease, speed, price] : [ease, speed, price, support];
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function validateReviewSubmission(input: unknown):
  | { ok: true; value: ReviewSubmission & { supportRating: number | null; overallRating: number } }
  | { ok: false; errors: Record<string, string> } {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const value = {
    firstName: clean(body.firstName, 80), lastName: clean(body.lastName, 100),
    state: clean(body.state, 40), email: clean(body.email, 254).toLowerCase(),
    product: clean(body.product, 80), otherDescription: clean(body.otherDescription, 120),
    easeRating: rating(body.easeRating), speedRating: rating(body.speedRating),
    priceRating: rating(body.priceRating), supportRating: rating(body.supportRating, true),
    writtenReview: clean(body.writtenReview, 1001),
    publishingConsent: body.publishingConsent === true,
    contactConsent: body.contactConsent === true, website: clean(body.website, 200),
  };
  const errors: Record<string, string> = {};
  if (!value.firstName) errors.firstName = "First name is required.";
  if (!value.lastName) errors.lastName = "Last name is required.";
  if (!US_STATES.includes(value.state as never)) errors.state = "Select a valid state.";
  if (!emailPattern.test(value.email)) errors.email = "Enter a valid email address.";
  if (!REVIEW_PRODUCTS.includes(value.product as never)) errors.product = "Select a product or service.";
  if (value.product === "Other" && !value.otherDescription) errors.otherDescription = "Describe the product or service.";
  for (const key of ["easeRating", "speedRating", "priceRating"] as const)
    if (!Number.isFinite(value[key])) errors[key] = "Select a rating from 1 to 5.";
  if (value.supportRating !== null && !Number.isFinite(value.supportRating)) errors.supportRating = "Select a rating from 1 to 5.";
  if (!value.writtenReview) errors.writtenReview = "Written review is required.";
  if (value.writtenReview.length > 1000) errors.writtenReview = "Written review must be 1,000 characters or fewer.";
  if (!value.publishingConsent) errors.publishingConsent = "Publishing consent is required.";
  if (value.website) errors.form = "Unable to submit this review.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const ease = value.easeRating as number, speed = value.speedRating as number, price = value.priceRating as number;
  return { ok: true, value: { ...value, product: value.product as ReviewSubmission["product"], easeRating: ease, speedRating: speed, priceRating: price, overallRating: calculateOverall(ease, speed, price, value.supportRating) } };
}
