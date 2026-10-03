import type { Metadata } from "next";
import AuthorityPage, { ArticleLink, AuthoritySection } from "./AuthorityPage";
import { HOME_BREADCRUMB } from "./BreadcrumbJsonLd";
import { IDS_CANONICAL_ORIGIN } from "@/lib/site-origin";

export type Guide = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intent: string;
  intro: string;
  sections: readonly { title: string; paragraphs: readonly string[] }[];
  cta: { title: string; text: string; href: string; label: string };
};

export const GUIDES_BREADCRUMB = { name: "Robot Mower Guides", path: "/robot-mower-guides" } as const;

export function guideMetadata(guide: Guide): Metadata {
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `${IDS_CANONICAL_ORIGIN}/robot-mower-guides/${guide.slug}` },
    robots: { index: true, follow: true },
  };
}

// A deliberately small inline-link format for trusted, repository-authored copy.
// React escapes all text; article bodies never accept or inject HTML.
function GuideText({ text }: { text: string }) {
  const matches = [...text.matchAll(/\[([^\]]+)\]\((\/[^\s)]*)\)/g)];
  let offset = 0;
  const nodes = matches.flatMap((match) => {
    const start = match.index!;
    const preceding = text.slice(offset, start);
    offset = start + match[0].length;
    return [preceding, <ArticleLink key={start} href={match[2]}>{match[1]}</ArticleLink>];
  });
  return <>{nodes}{text.slice(offset)}</>;
}

export default function GuidePage({ guide }: { guide: Guide }) {
  return <AuthorityPage eyebrow="IDS educational resources" title={guide.h1}
    intro={<p><GuideText text={guide.intro} /></p>}
    breadcrumbs={[HOME_BREADCRUMB, GUIDES_BREADCRUMB, { name: guide.h1, path: `/robot-mower-guides/${guide.slug}` }]}
    cta={guide.cta}>
    {guide.sections.map((section) => <AuthoritySection key={section.title} title={section.title}>
      {section.paragraphs.map((paragraph) => <p key={paragraph}><GuideText text={paragraph} /></p>)}
    </AuthoritySection>)}
  </AuthorityPage>;
}
