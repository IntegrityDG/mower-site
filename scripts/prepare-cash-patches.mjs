// Local review files only. No real index/ref edits, database or service access.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import crypto from "node:crypto";
const root = process.cwd(), baseline = "99a4fdda55fd7c49f2d70bef4f2ed929021d0d65";
const out = "docs/review/cash-safeguards", before = `${out}/before`;
const stage = `node_modules/.cache/ids-cash-controls-review/${crypto.randomUUID()}`;
const git = args => cp.execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "--no-optional-locks", ...args], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 30 * 1024 * 1024 });
const normalize = text => text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const read = p => normalize(fs.readFileSync(p, "utf8"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const sha = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const baselineFiles = new Set(git(["ls-tree", "-r", "--name-only", baseline]).trim().split(/\r?\n/));
const base = file => baselineFiles.has(file) ? normalize(git(["show", `${baseline}:${file}`])) : null;
function diff(file, old, next) {
  if (old === next) return "";
  if (old === null) {
    const lines = next.trimEnd().split("\n");
    return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(s => "+" + s).join("\n") + "\n";
  }
  write(`${stage}/diff-before.txt`, old); write(`${stage}/diff-after.txt`, next);
  const r = cp.spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--text", "--", `${stage}/diff-before.txt`, `${stage}/diff-after.txt`], { encoding: "utf8", windowsHide: true, maxBuffer: 30 * 1024 * 1024 });
  if (![0, 1].includes(r.status)) throw new Error("Local diff failed");
  return r.stdout.replace(/^diff --git .*$/m, `diff --git a/${file} b/${file}`).replace(/^--- .*$/m, `--- a/${file}`).replace(/^\+\+\+ .*$/m, `+++ b/${file}`);
}
if (sha(`${before}/docs/review/installation-cash-proposed.sql.txt`) !== "6e036d1d0de1a14dc314c94d8400167ffdb405bdafbdfa6ddf09ec764aca075b") throw new Error("Prior SQL snapshot hash mismatch");
if (sha("supabase/migrations/20260904204800_professional_installations.sql") !== "01543ab2b5eaffc97dcd96c8e9253a307f9511a60cdf42652d11ba145efaafef") throw new Error("Pending migration changed");
const previousA = `${before}/docs/review/installation-activation-controls.patch.txt`;
const activationFiles = [...read(previousA).matchAll(/^diff --git a\/(.+) b\//gm)].map(m => m[1]);
if (fs.existsSync(`${stage}/applied.marker`)) throw new Error("Review staging already used; preserve it and choose a fresh staging path in this script");
for (const file of activationFiles) { const content = base(file); if (content !== null) write(`${stage}/${file}`, content); }
git(["apply", "--check", `--directory=${stage}`, previousA]);
git(["apply", `--directory=${stage}`, previousA]);
const activation = new Map(activationFiles.map(file => [file, read(`${stage}/${file}`)]));
for (const file of ["lib/installations/controls.ts", "app/api/admin/installations/route.ts", "tests/installation-controls.test.ts", "docs/installation-controls.md", "tests/installation-cash-controls.test.ts"]) activation.set(file, read(file));
let server = activation.get("lib/installations/server.ts");
if (!server) throw new Error("Prior controls patch must contain server.ts");
// Close the legacy direct-write bypass without any dependency on cash SQL.
server = server.replace('actor="admin"){const db=c(),now=new Date(),audit:', 'actor="admin"){if(action==="cash_paid")throw new Error("Use the authorized cash receipt endpoint with a stable operation key.");const db=c(),now=new Date(),audit:');
server = server.replace('actor = "admin") { const db = c(), now = new Date(), audit:', 'actor = "admin") { if(action === "cash_paid") throw new Error("Use the authorized cash receipt endpoint with a stable operation key."); const db = c(), now = new Date(), audit:');
if (!server.includes('if(action==="cash_paid")throw') && !server.includes('if(action === "cash_paid") throw')) throw new Error("Controls-only legacy guard was not inserted");
const legacyStart = server.indexOf('else if(action==="cash_paid"){');
if (legacyStart >= 0) { const end = server.indexOf('else throw new Error("invalid_action")', legacyStart); if (end < 0) throw new Error("Legacy branch boundary not found"); server = server.slice(0, legacyStart) + server.slice(end); }
activation.set("lib/installations/server.ts", server);
const stub = `import "server-only";\nimport { isReviewAdmin } from "@/lib/reviews/admin-auth";\nimport { requireInstallationCashRecording } from "./controls";\nasync function unavailable() {\n  if (!(await isReviewAdmin())) throw new Error("Unauthorized");\n  requireInstallationCashRecording();\n  throw new Error("installation_cash_implementation_unavailable");\n}\nexport const recordInstallationCash = unavailable;\nexport const correctInstallationCash = unavailable;\n`;
activation.set("lib/installations/cash.ts", stub);
for (const suffix of ["", "/corrections"]) activation.set(`app/api/admin/installations/[id]/cash${suffix}/route.ts`, `import { isReviewAdmin } from "@/lib/reviews/admin-auth";\nimport { requireInstallationCashRecording } from "@/lib/installations/controls";\nexport async function POST(request: Request, context: { params: Promise<{ id: string }> }) {\n  void request; void context;\n  if (!(await isReviewAdmin())) return Response.json({error:"Unauthorized"},{status:401});\n  try { requireInstallationCashRecording(); } catch { return Response.json({error:"Cash recording is disabled."},{status:503}); }\n  return Response.json({error:"Cash implementation is unavailable in the controls-only release."},{status:503});\n}\n`);
const admin = activation.get("app/admin/installations/page.tsx");
activation.set("app/admin/installations/page.tsx", admin.replace('<p className="mt-2">Approval', '<p role="status">Cash recording and corrections are unavailable in this controls-only release. History remains available.</p><p className="mt-2">Approval'));
const aPatch = [...activation].map(([file, next]) => diff(file, base(file), next)).join("");
write("docs/review/installation-activation-controls.patch", aPatch);
// Validate the updated patch against fresh plain baseline files, without an index.
const check = `${stage}/check`;
for (const file of activation.keys()) { const content = base(file); if (content !== null) write(`${check}/${file}`, content); }
git(["apply", "--check", `--directory=${check}`, "docs/review/installation-activation-controls.patch"]);
git(["apply", `--directory=${check}`, "docs/review/installation-activation-controls.patch"]);
write(`${check}/lib/stripe/config-values.ts`, base("lib/stripe/config-values.ts"));
const testEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|STRIPE|RESEND|SMTP|DATABASE|POSTGRES|ADMIN_PASSWORD|INSTALLATION_|EMAIL/.test(k)));
Object.assign(testEnv, { INSTALLATION_INTAKE_ENABLED: "false", INSTALLATION_ONLINE_PAYMENTS_ENABLED: "false", INSTALLATION_CASH_RECORDING_ENABLED: "false", NODE_ENV: "test" });
const controlsTest = cp.execFileSync(process.execPath, ["--import", "tsx", "--test", path.resolve(`${check}/tests/installation-controls.test.ts`), path.resolve(`${check}/tests/installation-cash-controls.test.ts`)], { encoding: "utf8", env: testEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
write(`${out}/evidence/controls-only-test.log`, controlsTest);
write(`${stage}/applied.marker`, "Source review staging only; no worktree/index/ref created.\n");

const candidates = git(["ls-files", "-co", "--exclude-standard"]).trim().split(/\r?\n/).filter(p => /^(app|components|lib|scripts|tests)\//.test(p) || /^docs\/[^/]+\.md$/.test(p) || p === "docs/review/installation-cash-proposed.sql");
const changed = candidates.filter(p => !fs.existsSync(`${before}/${p}.txt`) || read(p) !== read(`${before}/${p}.txt`));
if (!changed.includes("scripts/prepare-cash-source-review.mjs")) changed.push("scripts/prepare-cash-source-review.mjs");
changed.sort();
const groups = {
  controls: changed.filter(p => p.includes("controls") && p !== "app/admin/installations/page.tsx" || p === "app/api/admin/installations/route.ts" || p === "scripts/installation-local-command.mjs"),
  accounting_cash: changed.filter(p => /^(lib|app|components)\//.test(p) && !p.includes("controls") && p !== "app/api/admin/installations/route.ts"),
  sql: ["docs/review/installation-cash-proposed.sql"],
  database_harness: changed.filter(p => p.startsWith("scripts/installation-cash-db/")),
  source_tests: changed.filter(p => p.startsWith("tests/") && !p.includes("controls")),
  documentation_tooling: changed.filter(p => /^docs\/[^/]+\.md$/.test(p) || p.startsWith("scripts/prepare-cash")),
};
const delta = p => diff(p, p === "scripts/prepare-cash-source-review.mjs" || !fs.existsSync(`${before}/${p}.txt`) ? null : read(`${before}/${p}.txt`), read(p));
for (const [name, files] of Object.entries(groups)) write(`${out}/${name}.patch`, files.map(delta).join(""));
write(`${out}/sql-from-reviewed.patch`, delta("docs/review/installation-cash-proposed.sql"));
write(`${out}/all-task-changes.patch`, changed.map(delta).join(""));
// Full accounting/controls-followup patch relative to updated A, not baseline.
const oldManifest = JSON.parse(read(`${before}/docs/review/installation-change-groups.json.txt`));
const bFiles = [...new Set([...oldManifest.B, ...candidates.filter(p => /^(app|components|lib)\//.test(p) && changed.includes(p)), ...activation.keys()].filter(p => /^(app|components|lib)\//.test(p)))].sort();
write("docs/review/installation-balance-cash.patch", bFiles.map(p => diff(p, activation.get(p) ?? base(p), read(p))).join(""));
const dFiles = [...new Set([...oldManifest.D, ...candidates.filter(p => /^(scripts|tests|docs)\//.test(p) && !p.startsWith("docs/review/"))])].filter(p => oldManifest.D.includes(p) || changed.includes(p)).sort();
write("docs/review/installation-tests-documentation.patch", dFiles.map(p => diff(p, activation.get(p) ?? base(p), read(p))).join(""));
for (const p of [...bFiles, ...dFiles]) { const content = base(p); if (!fs.existsSync(`${check}/${p}`) && content !== null) write(`${check}/${p}`, content); }
git(["apply", "--check", `--directory=${check}`, "docs/review/installation-balance-cash.patch"]);
git(["apply", `--directory=${check}`, "docs/review/installation-balance-cash.patch"]);
git(["apply", "--check", `--directory=${check}`, "docs/review/installation-tests-documentation.patch"]);
write("docs/review/activation-files.json", JSON.stringify([...activation.keys()], null, 2) + "\n");
write("docs/review/installation-change-groups.json", JSON.stringify({baseline,A:[...activation.keys()],B:bFiles,C:["docs/review/installation-cash-proposed.sql"],D:dFiles},null,2)+"\n");
const manifest = { baseline, priorReviewedCashSqlSha256: "6e036d1d0de1a14dc314c94d8400167ffdb405bdafbdfa6ddf09ec764aca075b", revisedCashSqlSha256: sha("docs/review/installation-cash-proposed.sql"), pendingMigrationSha256: sha("supabase/migrations/20260904204800_professional_installations.sql"), changedFiles: changed.map(file => ({ file, change: !fs.existsSync(`${before}/${file}.txt`) || file === "scripts/prepare-cash-source-review.mjs" ? "added" : "modified", sha256: sha(file) })), groups, controlsPatchFiles: [...activation.keys()], accountingPatchFiles: bFiles, controlsPatchCheck: "PASS: git apply --check against plain baseline files; no real index or refs changed" };
write(`${out}/changed-files.json`, JSON.stringify(manifest, null, 2) + "\n");
write(`${out}/changed-files.md`, "# Exact task source changes\n\nRelative to the preserved pre-task implementation snapshot. Earlier uncommitted installation work is excluded from these task deltas.\n\n" + manifest.changedFiles.map(f => `- ${f.change}: \`${f.file}\``).join("\n") + "\n\nGenerated review artifacts are listed separately in `artifact-files.json`; baseline source snapshots and preservation evidence are retained.\n");
console.log(JSON.stringify({ changedSourceFiles: changed.length, controlsPatchCheck: "passed", sqlSha256: manifest.revisedCashSqlSha256 }));
