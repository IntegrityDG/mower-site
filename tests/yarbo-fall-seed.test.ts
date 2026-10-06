import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

// Independent transcription of the owner's manufacturer sheet. Values are
// Public MSRP and sale for Y40, then public MSRP and sale for Y40P.
// Manufacturer dealer costs are excluded from this public repository.
const suppliedPackages = [
  ["yarbo-snow-blower", "Yarbo Snow Blower Gen 2", 619900,489900,779900,739900],
  ["yarbo-lawn-mower-pro", "Yarbo Lawn Mower Pro", 599900,489900,759900,719900],
  ["yarbo-leaf-blower", "Yarbo Leaf Blower", 509900,429900,669900,629900],
  ["yarbo-leaf-blower-trimmer", "Yarbo Leaf Blower + Trimmer Package", 639900,639900,799900,799900],
  ["yarbo-snow-blower-trimmer", "Yarbo Snow Blower Gen 2 + Trimmer Package", 749900,749900,909900,909900],
  ["yarbo-lawn-mower-pro-trimmer", "Yarbo Lawn Mower Pro + Trimmer Package", 729900,579900,889900,839900],
  ["yarbo-snow-leaf", "Yarbo Snow Blower Gen 2 + Leaf Blower", 729900,579900,889900,839900],
  ["yarbo-snow-leaf-trimmer", "Yarbo Snow Blower Gen 2 + Leaf Blower + Trimmer Package", 859900,859900,1019900,1019900],
  ["yarbo-pro-snow", "Yarbo Lawn Mower Pro + Snow Blower Gen 2", 819900,649900,979900,929900],
  ["yarbo-pro-leaf", "Yarbo Lawn Mower Pro + Leaf Blower", 709900,559900,869900,819900],
  ["yarbo-pro-snow-trimmer", "Yarbo Lawn Mower Pro + Snow Blower Gen 2 + Trimmer Package", 949900,749900,1109900,1049900],
  ["yarbo-pro-leaf-trimmer", "Yarbo Lawn Mower Pro + Leaf Blower + Trimmer Package", 839900,659900,999900,939900],
  ["yarbo-pro-snow-leaf", "Yarbo Lawn Mower Pro + Snow Blower Gen 2 + Leaf Blower", 929900,739900,1089900,1029900],
  ["yarbo-pro-snow-leaf-trimmer", "Yarbo Lawn Mower Pro + Snow Blower Gen 2 + Leaf Blower + Trimmer Package", 1059900,839900,1219900,1149900],
];
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261006001909_yarbo_fall_sale_pricing_seed.sql"), "utf8");
test("Fall Sale seed exactly matches all fourteen manufacturer package names and both Core price contexts", () => {
  const rows = [...sql.matchAll(/\('([^']+)','([^']+)',(\d+),(\d+),(\d+),(\d+)\)/g)].map(match => [match[1], match[2], ...match.slice(3).map(Number)]);
  assert.deepEqual(rows, suppliedPackages);
  assert.equal(new Set(rows.map(row => row[0])).size, 14);
});
test("Fall Sale preserves stable entities, has the exact Central Time window and leaves IDS Everyday NULL", () => {
  assert.equal([...sql.matchAll(/'regular_price_cents',null/g)].length, 5);
  assert.equal([...sql.matchAll(/'sale_starts_at','2026-10-06T05:00:00Z'/g)].length, 5);
  assert.equal([...sql.matchAll(/'sale_ends_at','2026-10-13T05:00:00Z'/g)].length, 5);
  assert.equal([...sql.matchAll(/'promotion_label','Fall Sale'/g)].length, 5);
  assert.doesNotMatch(sql, /delete\s+from\s+|insert\s+into\s+public\.catalog_packages/i);
  assert.doesNotMatch(sql, /dealer_cost_cents|catalog_internal_pricing|\b\w*_cost\b/);
});
