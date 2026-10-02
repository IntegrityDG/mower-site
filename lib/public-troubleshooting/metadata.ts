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
  const prefix = sentence.slice(0, maximumLength + 1);
  const lastSpace = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, lastSpace > 0 ? lastSpace : maximumLength)}…`;
}

export function publicTroubleshootingMetadata(entry: MetadataEntry): Metadata {
  return {
    title: `${entry.title} | ${IDS_SITE_NAME}`,
    description: `${entry.title} — Problem: ${contentExcerpt(entry.issueDescription, 220)} Fix: ${contentExcerpt(entry.fixDescription, 220)}`,
    alternates: {
      canonical: `${IDS_CANONICAL_ORIGIN}/troubleshoot-your-robot/${entry.id}`,
    },
  };
}
