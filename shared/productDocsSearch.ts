export type ProductDocsSearchChunk = {
  id: string;
  slug: string;
  heading: string | null;
  level: number | null;
  text: string;
  word_count: number;
  search_text: string;
};

export type ProductDocsSearchMetadata = {
  aliases: string[];
  keywords: string[];
  queries: string[];
  related_slugs: string[];
  boost: number;
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
  search?: ProductDocsSearchMetadata;
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

function tokenSet(value: string): Set<string> {
  return new Set(normalizeSearchText(value).split(" ").filter(Boolean));
}

function phraseIncludes(value: string, phrase: string): boolean {
  const normalizedValue = normalizeSearchText(value);
  const normalizedPhrase = normalizeSearchText(phrase);
  return Boolean(normalizedPhrase) && normalizedValue.includes(normalizedPhrase);
}

function buildDocumentFrequency(index: ProductDocsSearchIndex, terms: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const term of terms) {
    let count = 0;
    for (const doc of index.docs) {
      if (tokenSet(doc.search_text).has(term)) count += 1;
    }
    result.set(term, count);
  }
  return result;
}

function idfForTerm(term: string, docCount: number, documentFrequency: Map<string, number>): number {
  const frequency = documentFrequency.get(term) ?? 0;
  return Math.log((docCount + 1) / (frequency + 1)) + 1;
}

function fieldTermScore(field: string, terms: string[], weight: number, idf: (term: string) => number): number {
  if (!field) return 0;
  const tokens = tokenSet(field);
  let score = 0;
  for (const term of terms) {
    if (tokens.has(term)) score += weight * idf(term);
  }
  return score;
}

function listTermScore(fields: readonly string[] | undefined, terms: string[], weight: number, idf: (term: string) => number): number {
  return (fields ?? []).reduce((score, field) => score + fieldTermScore(field, terms, weight, idf), 0);
}

function phraseScore(fields: readonly string[] | undefined, queryPhrase: string, weight: number): number {
  if (!queryPhrase) return 0;
  return (fields ?? []).some((field) => phraseIncludes(field, queryPhrase)) ? weight : 0;
}

function scoreChunk(
  doc: ProductDocsSearchEntry,
  chunk: ProductDocsSearchChunk,
  terms: string[],
  queryPhrase: string,
  idf: (term: string) => number,
): number {
  let score = 0;
  const title = normalizeSearchText(doc.title);
  const slug = normalizeSearchText(doc.slug);
  const summary = normalizeSearchText(doc.summary);
  const section = normalizeSearchText(doc.section);
  const heading = normalizeSearchText(chunk.heading ?? "");
  const chunkText = chunk.search_text;
  const search = doc.search ?? {
    aliases: [],
    keywords: [],
    queries: [],
    related_slugs: [],
    boost: 1,
  };

  score += phraseIncludes(doc.slug, queryPhrase) ? 180 : 0;
  score += phraseIncludes(doc.title, queryPhrase) ? 170 : 0;
  score += phraseIncludes(chunk.heading ?? "", queryPhrase) ? 130 : 0;
  score += phraseIncludes(doc.summary, queryPhrase) ? 110 : 0;
  score += phraseScore(search.queries, queryPhrase, 220);
  score += phraseScore(search.aliases, queryPhrase, 180);
  score += phraseScore(search.keywords, queryPhrase, 120);

  for (const term of terms) {
    const termWeight = idf(term);
    if (slug === term || doc.slug.toLowerCase() === term) score += 90 * termWeight;
    if (title === term) score += 80 * termWeight;
    if (includesTerm(doc.slug, term)) score += 48 * termWeight;
    if (title.includes(term)) score += 40 * termWeight;
    if (summary.includes(term)) score += 26 * termWeight;
    if (section.includes(term)) score += 8 * termWeight;
    if (heading.includes(term)) score += 36 * termWeight;
    if (doc.keywords.includes(term)) score += 18 * termWeight;
    if (chunkText.includes(term)) score += 3 * termWeight;
  }

  score += listTermScore(search.queries, terms, 52, idf);
  score += listTermScore(search.aliases, terms, 44, idf);
  score += listTermScore(search.keywords, terms, 28, idf);

  if (terms.length > 1 && terms.every((term) => chunkText.includes(term) || title.includes(term))) {
    score += 30;
  }
  if (
    terms.length > 1 &&
    terms.every((term) =>
      title.includes(term) ||
      summary.includes(term) ||
      heading.includes(term) ||
      (search.aliases ?? []).some((field) => phraseIncludes(field, term)) ||
      (search.keywords ?? []).some((field) => phraseIncludes(field, term)) ||
      (search.queries ?? []).some((field) => phraseIncludes(field, term))
    )
  ) {
    score += 70;
  }

  return score * Math.max(0.5, Math.min(Number(search.boost ?? 1), 3));
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
  const queryPhrase = normalizeSearchText(query);
  const documentFrequency = buildDocumentFrequency(index, terms);
  const idf = (term: string) => idfForTerm(term, index.docs.length, documentFrequency);

  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
  const sectionFilter = normalizeSearchText(options.section ?? "");
  const audienceFilter = normalizeSearchText(options.audience ?? "");
  const results: ProductDocsSearchResult[] = [];

  for (const doc of index.docs) {
    if (sectionFilter && normalizeSearchText(doc.section) !== sectionFilter) continue;
    if (audienceFilter && !doc.audience.some((audience) => normalizeSearchText(audience) === audienceFilter)) continue;

    let bestResult: ProductDocsSearchResult | null = null;
    for (const chunk of doc.chunks) {
      const score = scoreChunk(doc, chunk, terms, queryPhrase, idf);
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
