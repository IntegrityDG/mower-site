# Professional Installation refund notice — separate disclosure change

This uncommitted disclosure change is separate from the two-file refund-dispatch hotfix. It changes no eligibility, cancellation window, refund percentage, deposit, materials reconciliation, approved price, payment state, or refund-issuance timing.

## Existing customer-facing placements

- Installation booking form: after the existing safety/travel terms, before submission.
- Customer installation portal: immediately after the existing cancellation-deposit refund and materials-reconciliation notice.

Both placements render `components/installations/InstallationRefundNotice.tsx` with this approved wording:

### REFUND PROCESSING TIME

Please allow 7–12 business days from the date IDS issues an approved refund for processing and receipt of funds. Business days are Monday through Friday, excluding U.S. federal holidays. Electronic refunds are returned to the original payment method. Actual posting times depend on the payment processor and your financial institution and may occasionally exceed this estimate.

IDS will provide confirmation when a refund is issued. Refunds of cash payments are handled directly by IDS, with the repayment method and receipt documented. Please contact IDS if an issued refund has not been received after 12 business days.

This processing-time notice does not change your refund eligibility or the amount refundable under the applicable terms, and it does not override any shorter deadline required by law.

## Notification wording prepared for future placement

There is no existing Professional Installation refund-confirmation sender/template or dedicated cancellation/refund result screen. No workflow or sender is added here, and no email is sent. Existing order, demo, manufacturer, and product-return notices are unchanged.

When a Professional Installation cancellation/refund notice surface is implemented, place the approved notice alongside its eligibility/amount explanation. When an actual refund-issuance confirmation is available, append the same approved notice to that confirmation.

Draft issuance-confirmation wording for that future surface:

> Subject: Your Professional Installation refund has been issued
>
> IDS issued your approved Professional Installation refund of [amount] on [issue date]. Reference: [refund or receipt reference].

For an electronic refund, follow with:

> The refund was issued to your original payment method.

For a cash-payment refund, use this instead, only after IDS has documented the repayment:

> IDS handled the refund directly using [documented repayment method]. Repayment receipt: [receipt reference].

Then append the complete **REFUND PROCESSING TIME** notice above. Replace placeholders only with verified issuance/repayment records. Approval alone must not trigger issuance wording. Do not assert customer receipt based on approval or elapsed time, introduce an issuance delay, or automatically complete a refund after 12 days.

The later admin **Record cash payment** correction remains open and is not implemented by this disclosure change.
