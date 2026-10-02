import assert from "node:assert/strict";
import test from "node:test";
import { IDS_CANONICAL_ORIGIN, IDS_SITE_NAME } from "../lib/site-origin";
import { publicTroubleshootingMetadata } from "../lib/public-troubleshooting/metadata";

const entries = [
  {
    id: "46a3f5dc-bcbb-40c4-98ae-be366d78e31f",
    title: "Yarbo has DISAPPEARED!",
    issueDescription: "The mower went offline while using 4G. It later came back into range.",
    fixDescription: "Support performed an update. The issue later recurred.",
  },
  {
    id: "f975f090-35fe-4e8f-9154-639a67028ccf",
    title: "Powerboard issue after replacement",
    issueDescription: "A replacement ECU showed a powerboard issue.",
    fixDescription: "Replace shell.",
  },
];

test("published entry metadata has a unique title, content-derived description, and self canonical", () => {
  const metadata = entries.map(publicTroubleshootingMetadata);
  assert.equal(new Set(metadata.map((entry) => entry.title)).size, entries.length);
  assert.equal(new Set(metadata.map((entry) => entry.description)).size, entries.length);
  for (const [index, entry] of entries.entries()) {
    assert.equal(metadata[index].title, `${entry.title} | ${IDS_SITE_NAME}`);
    assert.ok(String(metadata[index].description).startsWith(`${entry.title} — Problem: `));
    assert.ok(String(metadata[index].description).includes(entry.issueDescription.split(". ")[0]));
    assert.ok(String(metadata[index].description).includes(entry.fixDescription.split(". ")[0]));
    assert.equal(
      metadata[index].alternates?.canonical,
      `${IDS_CANONICAL_ORIGIN}/troubleshoot-your-robot/${entry.id}`,
    );
  }
});

test("long issue and fix excerpts preserve published words without adding technical claims", () => {
  const metadata = publicTroubleshootingMetadata({
    id: entries[0].id,
    title: entries[0].title,
    issueDescription: "The mower went offline while using 4G near the edge of the property and returned after it came back into range. Further detail follows.",
    fixDescription: "Support performed an update after the mower returned into range and continued to investigate a later recurrence. Further detail follows.",
  });
  assert.match(String(metadata.description), /^Yarbo has DISAPPEARED! — Problem: The mower went offline/);
  assert.match(String(metadata.description), /Fix: Support performed an update/);
  assert.doesNotMatch(String(metadata.description), /Further detail follows/);
  assert.ok(!("structuredData" in metadata));
});
