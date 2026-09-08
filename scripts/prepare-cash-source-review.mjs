// Source artifacts only. Never starts services or accesses a database.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import cp from "node:child_process";
const root = process.cwd();
const original = path.resolve(root, "../..");
const output = path.join(root, "docs/review/cash-safeguards");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const git = (cwd, args) => cp.execFileSync("git", ["-c", `safe.directory=${cwd.replaceAll("\\", "/")}`, "--no-optional-locks", ...args], { cwd, encoding: "utf8", windowsHide: true });
function files(dir, excluded = new Set()) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink() || excluded.has(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file, excluded) : [file];
  });
}
function preservation() {
  const list = files(original, new Set([".git", ".worktrees", "node_modules", ".next", ".vercel"]));
  const index = cwd => path.resolve(cwd, git(cwd, ["rev-parse", "--git-path", "index"]).trim());
  return { originalHead: git(original, ["rev-parse", "HEAD"]).trim(), originalStatus: git(original, ["status", "--short"]),
    originalIndex: hash(index(original)), implementationIndex: hash(index(root)),
    hashes: Object.fromEntries(list.map(file => [path.relative(original, file).replaceAll("\\", "/"), hash(file)])) };
}
if (process.argv[2] === "capture") {
  if (fs.existsSync(path.join(output, "preservation-before.json"))) throw new Error("Existing capture must be preserved");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "preservation-before.json"), JSON.stringify(preservation(), null, 2) + "\n");
  const names = git(root, ["ls-files", "-co", "--exclude-standard"]).trim().split(/\r?\n/)
    .filter(name => /^(app|components|lib|scripts|tests|docs)\//.test(name) && !name.startsWith("docs/review/cash-safeguards/") && !name.includes("/evidence/"));
  for (const name of names) {
    const target = path.join(output, "before", name + ".txt");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, name), target);
  }
  console.log(JSON.stringify({ capturedSourceFiles: names.length, originalFiles: Object.keys(preservation().hashes).length }));
} else if (process.argv[2] === "preservation") {
  const before = JSON.parse(fs.readFileSync(path.join(output, "preservation-before.json"), "utf8"));
  const after = preservation();
  const changed = Object.keys(before.hashes).filter(file => before.hashes[file] !== after.hashes[file]);
  const passed = changed.length === 0 && before.originalHead === after.originalHead && before.originalStatus === after.originalStatus && before.originalIndex === after.originalIndex && before.implementationIndex === after.implementationIndex;
  const result = { passed, checkedOriginalFiles: Object.keys(before.hashes).length, changed, originalHead: after.originalHead, originalIndexUnchanged: before.originalIndex === after.originalIndex, implementationIndexUnchanged: before.implementationIndex === after.implementationIndex };
  fs.writeFileSync(path.join(output, "preservation-result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  if (!passed) process.exitCode = 1;
} else throw new Error("Choose capture or preservation");
