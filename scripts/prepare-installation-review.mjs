// Local review artifacts only: no commit, branch/ref update, checkout, or push.
import fs from "node:fs";
import cp from "node:child_process";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const baseline = "99a4fdda55fd7c49f2d70bef4f2ed929021d0d65";
const git = (args, env = process.env) => cp.execFileSync("git", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
function added(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trimEnd().split("\n");
  return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => "+" + line).join("\n") + "\n";
}
const artifact = "docs/review/installation-activation-controls.patch";
let patch = fs.readFileSync(artifact, "utf8");
for (const file of ["tests/helpers/installation-service-page.ts", "tests/services-scheduling.test.tsx"]) {
  if (!patch.includes(`diff --git a/${file} `)) patch += file.endsWith("services-scheduling.test.tsx") ? git(["diff", "--", file]) : added(file);
}
fs.writeFileSync(artifact, patch);
const activationFiles = [...patch.matchAll(/^diff --git a\/(.+) b\//gm)].map(match => match[1]);
fs.writeFileSync("docs/review/activation-files.json", JSON.stringify(activationFiles, null, 2) + "\n");
// Only this isolated temporary index is modified. Applying to it may create
// immutable Git blob objects, but never changes any real index, file, or ref.
const indexFile = path.join(os.tmpdir(), "ids-installation-review-" + crypto.randomUUID() + ".index");
const env = { ...process.env, GIT_INDEX_FILE: indexFile };
git(["read-tree", baseline], env);
git(["apply", "--cached", "--check", artifact], env);
git(["apply", "--cached", artifact], env);
const balanceFiles = [
  "app/admin/installations/page.tsx", "app/api/admin/installations/[id]/cash/route.ts", "app/professional-installation/[token]/page.tsx",
  "components/installations/InstallationBalanceSummary.tsx", "components/installations/RecordCashPayment.tsx",
  "lib/installations/accounting.ts", "lib/installations/cash.ts", "lib/installations/cash-validation.ts", "lib/installations/ledger.ts",
  "lib/installations/operations.ts", "lib/installations/policy.ts", "lib/installations/server.ts", "lib/installations/stripe.ts",
];
function groupDiff(files) {
  let result = git(["diff", "--binary", "--", ...files], env);
  for (const file of files) {
    const tracked = cp.spawnSync("git", ["ls-files", "--error-unmatch", file], { env, stdio: "ignore" }).status === 0;
    if (!tracked) result += added(file);
  }
  return result;
}
fs.writeFileSync("docs/review/installation-balance-cash.patch", groupDiff(balanceFiles));
const testDocFiles = [
  "AGENTS.md", "CLAUDE.md", "tests/installation-accounting.test.tsx", "tests/installation-operations.test.ts", "tests/installation-policy.test.ts",
  "tests/helpers/installation-fixtures.ts", "tests/helpers/installation-harness.ts", "scripts/installation-ui-fixture.ts",
  "scripts/installation-local-command.mjs", "scripts/verify-installation-local-http.mjs", "scripts/prepare-installation-review.mjs",
  "docs/installation-cash-database-test-plan.md",
];
fs.writeFileSync("docs/review/installation-tests-documentation.patch", groupDiff(testDocFiles));
const manifest = { baseline, A: activationFiles, B: balanceFiles, C: ["docs/review/installation-cash-proposed.sql"], D: testDocFiles };
fs.writeFileSync("docs/review/installation-change-groups.json", JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync("docs/review/evidence/activation-patch-check.json", JSON.stringify({ baseline, method: "git apply --cached --check using an isolated temporary index", passed: true, files: activationFiles.length }, null, 2) + "\n");
console.log(JSON.stringify({ activationPatchValid: true, groups: Object.fromEntries(["A", "B", "C", "D"].map(key => [key, manifest[key].length])) }));
