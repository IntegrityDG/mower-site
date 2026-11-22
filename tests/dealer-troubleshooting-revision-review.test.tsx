import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import TroubleshootingRevisionReview from "../components/dealer-network/TroubleshootingRevisionReview";
import type { AdminTroubleshootingEntry, TroubleshootingTextFields } from "../lib/dealer-network/types";
import { validateUuid } from "../lib/dealer-network/validation";
import { loadInstallationModule } from "./helpers/installation-module";

const entryId = "00000000-0000-4000-8000-000000000011";
const revisionId = "00000000-0000-4000-8000-000000000012";
const current: TroubleshootingTextFields = {
  title: "Positioning issue", brand: "Brand", model: "Model", issueDate: "2026-11-01",
  firmwareSoftwareVersion: "3.4", systemArea: "Navigation", badPart: "Cable",
  issueDescription: "Position drift", fixDescription: "Original repair",
};
const entry: AdminTroubleshootingEntry = {
  ...current, id: entryId, memberId: "author", memberName: "Author", companyName: "Company",
  status: "approved", photos: [], updates: [], approvedAt: "2026-11-02", createdAt: "2026-11-01", publiclyPublished: true,
  pendingRevision: { id: revisionId, submittedAt: "2026-11-03T12:00:00Z",
    patch: { ...current, badPart: null, fixDescription: "Proposed <script>text</script>" } },
};

test("admin sees an escaped comparison of changed fields, not the unaffected fields", () => {
  const markup = renderToStaticMarkup(<TroubleshootingRevisionReview entry={entry} busy={false} review={() => {}} />);
  for (const label of ["Pending author edit", "Bad part", "Original repair", "Proposed &lt;script&gt;text&lt;/script&gt;", "Not provided", "Approve edit", "Reject edit"]) {
    assert.ok(markup.includes(label), label);
  }
  assert.match(markup, /current text stays on the public website/);
  assert.doesNotMatch(markup, /<script>|Positioning issue/);
  assert.equal(renderToStaticMarkup(<TroubleshootingRevisionReview entry={{ ...entry, pendingRevision: undefined }} busy={false} review={() => {}} />), "");
  const privateEntry = renderToStaticMarkup(<TroubleshootingRevisionReview entry={{ ...entry, publiclyPublished: false }} busy={false} review={() => {}} />);
  assert.match(privateEntry, /does not publish/);
});

class DealerNetworkAdminError extends Error {}

function route(authorized = true, rpcError?: string) {
  const calls: { name: string; params: unknown }[] = [];
  const { PATCH } = loadInstallationModule<{PATCH: (request: Request, context: {params: Promise<{id: string}>}) => Promise<Response>}>(
    "app/api/admin/dealer-network/troubleshooting/[id]/revision/route.ts",
    {
      "@/lib/dealer-network/admin-auth": { DealerNetworkAdminError, requireDealerNetworkAdmin: async () => {
        if (!authorized) throw new DealerNetworkAdminError();
      } },
      "@/lib/dealer-network/validation": { validateUuid },
      "@/lib/supabase": { getSupabaseServiceClient: () => ({
        rpc: async (name: string, params: unknown) => {
          calls.push({ name, params });
          return { error: rpcError ? { message: rpcError } : null };
        },
      }) },
    },
  );
  return {
    calls,
    send: (input: unknown) => PATCH(
      new Request("https://example.invalid/admin/revision", { method: "PATCH", body: JSON.stringify(input) }),
      { params: Promise.resolve({ id: entryId }) },
    ),
  };
}

test("revision review requires admin authentication and a valid exact revision decision", async () => {
  const unauthed = route(false);
  assert.equal((await unauthed.send({ revisionId, approve: true })).status, 401);
  assert.equal(unauthed.calls.length, 0);
  const auth = route();
  assert.equal((await auth.send({ revisionId, approve: "true" })).status, 400);
  assert.equal((await auth.send({ revisionId: "different-thing", approve: true })).status, 400);
  assert.equal(auth.calls.length, 0);
});

test("review forwards exact IDs and only an approval decision, with stale edits rejected", async () => {
  const auth = route();
  const response = await auth.send({ revisionId, approve: false, publiclyPublished: true, patch: { title: "Should not travel" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  assert.deepEqual(JSON.parse(JSON.stringify(auth.calls)), [{
    name: "dealer_network_review_troubleshooting_revision",
    params: { p_entry_id: entryId, p_revision_id: revisionId, p_approve: false },
  }]);
  const stale = await route(true, "troubleshooting_revision_unavailable").send({ revisionId, approve: true });
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /no longer pending/);
  const failure = await route(true, "private DB error").send({ revisionId, approve: true });
  assert.equal(failure.status, 500);
  assert.doesNotMatch(await failure.text(), /private DB error/);
});
