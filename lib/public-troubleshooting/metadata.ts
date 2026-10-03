import type { Metadata } from "next";
import { IDS_CANONICAL_ORIGIN, IDS_SITE_NAME } from "@/lib/site-origin";
import type { PublicTroubleshootingEntry } from "./types";

type MetadataEntry = Pick<
  PublicTroubleshootingEntry,
  "id" | "title" | "issueDescription" | "fixDescription"
>;

function contentExcerpt(value: string, maximumLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  const sentence = compact.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? compact;
  if (sentence.length <= maximumLength) return sentence;
  const prefix = sentence.slice(0, maximumLength);
  const lastSpace = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, lastSpace > 0 ? lastSpace : maximumLength - 1)}…`;
}

export function publicTroubleshootingMetadata(entry: MetadataEntry): Metadata {
  const title = contentExcerpt(entry.title, 60);
  const remaining = 160 - `${title} — Problem:  Fix: `.length;
  const issueBudget = Math.floor(remaining / 2);
  const description = `${title} — Problem: ${contentExcerpt(entry.issueDescription, issueBudget)} Fix: ${contentExcerpt(entry.fixDescription, remaining - issueBudget)}`;
  return {
    title: `${entry.title} | ${IDS_SITE_NAME}`,
    description,
    alternates: {
      canonical: `${IDS_CANONICAL_ORIGIN}/troubleshoot-your-robot/${entry.id}`,
    },
  };
}
