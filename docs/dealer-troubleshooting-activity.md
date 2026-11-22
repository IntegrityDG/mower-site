# Dealer troubleshooting activity

## Behavior

- **My Troubleshooting Submissions → Update** is available to the original member account, including submissions made before this feature. Ownership comes from the stored member UUID and the current server session, not a name or a field sent by the browser.
- **Edit original issue text** keeps photos and publication controls separate. Pending and denied submissions can be corrected in place without changing their status. Edits to approved posts, whether publicly published or dealer-only, create or replace a pending proposal. Admin sees the changed fields next to the current text and can approve or reject the exact proposal. The current approved text and any existing public publication stay unchanged during review and on rejection. Approving a proposal does not itself change whether that post is public.
- **Add a dated update** adds an author note, not a comment. The note is visible only in the authenticated Dealer Portal: on the owner's own submission, and in the member library while the post is approved.
- **Comments n/5** is collapsed by default. Only other active, unlocked dealers or repair technicians can comment on an approved entry. The total is five per post, not five per member. Comments are plain text, 1–250 Unicode code points after trimming; the UI shows the limit and asks for information relevant to the issue. Owner updates never use these slots. Notes, proposals and peer comments are never returned by the public troubleshooting readers.
- The DB repeats eligibility and ownership checks and enforces the cap with five unique integer slots per post. A row lock serializes app comment inserts and coordinates them with moderation. A stale revision ID cannot approve or reject a replacement proposal. No new notifications or publication pathways are introduced.

## Later release, only if separately approved

Apply additive migration `20261122202439_dealer_troubleshooting_updates.sql` to a staging copy first and verify the new relations and RPCs through the staging app. The migration must be available before deploying this application version; the member and Admin readers include the new tables. The previous application version works with the additive migration, so if application rollout must be reverted, restore the prior application build and leave the new tables and their rows intact. Do not run the fixture SQL on a live database.

Run the focused application tests:

```sh
node --import tsx --test tests/dealer-troubleshooting-activity.test.tsx \
  tests/dealer-troubleshooting-revision-review.test.tsx \
  tests/dealer-network-troubleshooting.test.tsx tests/public-troubleshooting.test.tsx
```

On an isolated local PostgreSQL/Supabase database with the migrations applied, run `supabase/tests/dealer_troubleshooting_updates.sql` using the local database owner. It uses synthetic records and rolls them back. Also exercise simultaneous comment inserts using separate PostgreSQL sessions on an approved fixture: six or more callers must produce exactly five rows and each surplus caller must receive the cap error. A rollout smoke check should verify the public case and old approved text first, then both member roles and the Admin comparison on staging fixtures.
