export type ProductDocsSearchChunk = {
  id: string;
  slug: string;
  heading: string | null;
  level: number | null;
  text: string;
  word_count: number;
  search_text: string;
};

export type ProductDocsSearchEntry = {
  id: string;
  slug: string;
  title: string;
  section: string;
  summary: string;
  audience: string[];
  status: string;
  source: string;
  content: string;
  headings: string[];
  keywords: string[];
  chunks: ProductDocsSearchChunk[];
  word_count: number;
  search_text: string;
};

export type ProductDocsSearchIndex = {
  version: number;
  default_slug: string;
  docs: ProductDocsSearchEntry[];
};

export type ProductDocsSearchResult = {
  slug: string;
  title: string;
  section: string;
  source: string;
  chunk_id: string;
  heading: string | null;
  score: number;
  excerpt: string;
};

export type ProductDocsSearchOptions = {
  limit?: number;
  section?: string;
  audience?: string;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchText(query)
        .split(" ")
        .map((term) => term.trim())
        .filter((term) => term.length > 1),
    ),
  );
}

function includesTerm(value: string, term: string): boolean {
  return normalizeSearchText(value).split(" ").includes(term);
}

function scoreChunk(doc: ProductDocsSearchEntry, chunk: ProductDocsSearchChunk, terms: string[]): number {
  let score = 0;
  const title = normalizeSearchText(doc.title);
  const slug = normalizeSearchText(doc.slug);
  const summary = normalizeSearchText(doc.summary);
  const section = normalizeSearchText(doc.section);
  const heading = normalizeSearchText(chunk.heading ?? "");
  const chunkText = chunk.search_text;

  for (const term of terms) {
    if (slug === term || doc.slug.toLowerCase() === term) score += 80;
    if (title === term) score += 70;
    if (includesTerm(doc.slug, term)) score += 40;
    if (title.includes(term)) score += 32;
    if (summary.includes(term)) score += 20;
    if (section.includes(term)) score += 12;
    if (heading.includes(term)) score += 28;
    if (doc.keywords.includes(term)) score += 16;
    if (chunkText.includes(term)) score += 6;
  }

  if (terms.length > 1 && terms.every((term) => chunkText.includes(term) || title.includes(term))) {
    score += 24;
  }

  return score;
}

function buildExcerpt(text: string, terms: string[]): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 260) return compact;

  const lower = compact.toLowerCase();
  const firstHit = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (firstHit ?? 0) - 80);
  const end = Math.min(compact.length, start + 260);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < compact.length ? " ..." : "";
  return `${prefix}${compact.slice(start, end).trim()}${suffix}`;
}

export function searchProductDocsIndex(
  index: ProductDocsSearchIndex,
  query: string,
  options: ProductDocsSearchOptions = {},
): ProductDocsSearchResult[] {
  const terms = uniqueTerms(query);
  if (terms.length === 0) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
  const sectionFilter = normalizeSearchText(options.section ?? "");
  const audienceFilter = normalizeSearchText(options.audience ?? "");
  const results: ProductDocsSearchResult[] = [];

  for (const doc of index.docs) {
    if (sectionFilter && normalizeSearchText(doc.section) !== sectionFilter) continue;
    if (audienceFilter && !doc.audience.some((audience) => normalizeSearchText(audience) === audienceFilter)) continue;

    let bestResult: ProductDocsSearchResult | null = null;
    for (const chunk of doc.chunks) {
      const score = scoreChunk(doc, chunk, terms);
      if (score <= 0) continue;
      const result = {
        slug: doc.slug,
        title: doc.title,
        section: doc.section,
        source: doc.source,
        chunk_id: chunk.id,
        heading: chunk.heading,
        score,
        excerpt: buildExcerpt(chunk.text, terms),
      };
      if (
        !bestResult ||
        result.score > bestResult.score ||
        (result.score === bestResult.score && result.chunk_id.localeCompare(bestResult.chunk_id) < 0)
      ) {
        bestResult = result;
      }
    }
    if (bestResult) results.push(bestResult);
  }

  return results
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug) || a.chunk_id.localeCompare(b.chunk_id))
    .slice(0, limit);
}

export function getProductDocFromIndex(
  index: ProductDocsSearchIndex,
  slug: string | null | undefined,
): ProductDocsSearchEntry | null {
  const normalizedSlug = String(slug ?? "").trim();
  if (!normalizedSlug) return null;
  return index.docs.find((doc) => doc.slug === normalizedSlug) ?? null;
}
