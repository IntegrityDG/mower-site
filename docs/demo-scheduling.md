# IDS Demo Scheduling

Demo scheduling is managed by IDS availability rules and blackouts. The website does not read or synchronize private Proton Calendar data. Approval sends a standards-compliant ICS invitation by email.

Server environment configuration:

- `RESEND_API_KEY` — required for all demo email delivery.
- `NOTIFY_EMAIL` — existing recipient for non-demo IDS notifications. Demo staff delivery does not use this variable.
- `DEMO_FROM_EMAIL` — required verified Resend sender for customer and calendar emails. A plain email value can also serve as the ICS organizer.
- `DEMO_ORGANIZER_EMAIL` — optional server-only ICS organizer address. Set this when `DEMO_FROM_EMAIL` contains a display-name format or should not be used as the calendar organizer. Calendar delivery fails cleanly if neither this value nor a plain `DEMO_FROM_EMAIL` is available.

The demo staff recipient and `Reply-To` address are centrally fixed at `demos.IDS@proton.me`. Approved invitations are recipient-specific `METHOD:REQUEST` iTIP events. The customer copy names the saved customer email as `ATTENDEE`; the IDS copy names the central demo mailbox. Resend receives the base64 `.ics` attachment with `text/calendar; method=REQUEST; charset=UTF-8`.

Missing email configuration never rolls back a saved request or an approval. The protected admin page displays applicable notification delivery states and offers one retry action when failures exist: pending requests retry the IDS new-request notice, approved requests retry failed customer/IDS calendar invitations, and denied requests retry the customer denial. Sent events are never claimed or delivered again. Cancelled requests have no notification or `METHOD:CANCEL` behavior in version 1.
