import productDocsIndex from "../../../../docs/product/generated/index.json";
import { PRODUCT_DOCS_DEFAULT_SLUG } from "./productDocsMeta";

export { PRODUCT_DOCS_DEFAULT_SLUG };

export type ProductDocAudience = "builder" | "member" | "llm" | "operator";

export type ProductDocEntry = {
  id: string;
  slug: string;
  title: string;
  section: string;
  summary: string;
  audience: ProductDocAudience[];
  status: string;
  source: string;
  search?: {
    aliases: string[];
    keywords: string[];
    queries: string[];
    related_slugs: string[];
    boost: number;
  };
  content: string;
  headings: string[];
  keywords: string[];
  chunks: Array<{
    id: string;
    slug: string;
    heading: string | null;
    level: number | null;
    text: string;
    word_count: number;
    search_text: string;
  }>;
  word_count: number;
  search_text: string;
};

type ProductDocsIndex = {
  version: number;
  default_slug: string;
  docs: ProductDocEntry[];
};

const index = productDocsIndex as ProductDocsIndex;

export const PRODUCT_DOCS: ProductDocEntry[] = index.docs;

export function findProductDocBySlug(slug: string | null | undefined): ProductDocEntry | null {
  const normalized = String(slug ?? "").trim();
  if (!normalized) return null;
  return PRODUCT_DOCS.find((doc) => doc.slug === normalized) ?? null;
}

export function groupProductDocsBySection(): Array<{
  section: string;
  docs: ProductDocEntry[];
}> {
  const sections: Array<{ section: string; docs: ProductDocEntry[] }> = [];
  for (const doc of PRODUCT_DOCS) {
    let section = sections.find((candidate) => candidate.section === doc.section);
    if (!section) {
      section = { section: doc.section, docs: [] };
      sections.push(section);
    }
    section.docs.push(doc);
  }
  return sections;
}
