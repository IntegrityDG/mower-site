import assert from "node:assert/strict";
import test from "node:test";

import {
  ACH_DISCOUNT_RATE,
  calculateAchDiscount,
  checkoutPaymentMethodValue,
  formatPaymentCents,
  paymentMethodCheckoutPayload,
} from "./payment-methods";
import {
  BANK_PAYMENT_DISCOUNT_BPS,
  BASIS_POINTS_DENOMINATOR,
} from "./payment-pricing";

test("ACH savings amount is calculated from the configured total", () => {
  const display = calculateAchDiscount(354800);

  assert.equal(
    ACH_DISCOUNT_RATE,
    BANK_PAYMENT_DISCOUNT_BPS / BASIS_POINTS_DENOMINATOR
  );
  assert.equal(display.discountRateLabel, "2.75%");
  assert.equal(display.savingsCents, 9757);
  assert.equal(display.formattedSavings, "$97.57");
});

test("ACH discounted total is calculated from the configured total", () => {
  const display = calculateAchDiscount(354800);

  assert.equal(display.discountedAchTotalCents, 345043);
  assert.equal(display.formattedDiscountedAchTotal, "$3,450.43");
  assert.equal(display.formattedRegularCardTotal, "$3,548.00");
});

test("ACH values update when configuration totals change", () => {
  const firstDisplay = calculateAchDiscount(100000);
  const secondDisplay = calculateAchDiscount(125000);

  assert.equal(firstDisplay.savingsCents, 2750);
  assert.equal(firstDisplay.discountedAchTotalCents, 97250);
  assert.equal(secondDisplay.savingsCents, 3438);
  assert.equal(secondDisplay.discountedAchTotalCents, 121562);
});

test("payment amounts round to two decimal places", () => {
  const display = calculateAchDiscount(12345);

  assert.equal(display.savingsCents, 339);
  assert.equal(display.discountedAchTotalCents, 12006);
  assert.equal(display.formattedSavings, "$3.39");
  assert.equal(display.formattedDiscountedAchTotal, "$120.06");
  assert.equal(formatPaymentCents(1000), "$10.00");
});

test("checkout payload keeps calculated ACH display fields out of the request", () => {
  const payload = paymentMethodCheckoutPayload("ach");

  assert.deepEqual(payload, { paymentMethod: "ach_debit" });
  assert.equal("discountRate" in payload, false);
  assert.equal("savingsCents" in payload, false);
  assert.equal("discountedAchTotalCents" in payload, false);
  assert.equal("regularCardTotalCents" in payload, false);
});

test("Card and ACH checkout method routing values remain unchanged", () => {
  assert.equal(checkoutPaymentMethodValue("card"), "card");
  assert.equal(checkoutPaymentMethodValue("ach"), "ach_debit");
});
