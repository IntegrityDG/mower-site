# IDS Demo Scheduling

Demo scheduling is managed by IDS availability rules and blackouts. The website does not read or synchronize private Proton Calendar data. Approval sends a standards-compliant ICS invitation by email.

Server environment configuration:

- `RESEND_API_KEY` — required for all demo email delivery.
- `NOTIFY_EMAIL` — existing IDS notification recipient and explicit fallback calendar recipient.
- `DEMO_CALENDAR_EMAIL` — recommended Proton Calendar email recipient for approved-demo invitations. When omitted, `NOTIFY_EMAIL` is used.
- `DEMO_FROM_EMAIL` — recommended verified Resend sender for customer and calendar emails. When omitted, the existing `onboarding@resend.dev` development sender is used.

Missing email configuration never rolls back a saved request or an approval. The demo notification event is marked failed and can be retried from the protected admin page.
