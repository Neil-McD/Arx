import {
  getProductDocFromIndex,
  searchProductDocsIndex,
  type ProductDocsSearchChunk,
  type ProductDocsSearchEntry,
  type ProductDocsSearchIndex,
  type ProductDocsSearchResult,
} from "./productDocsSearch.ts";

export type ProductDocsToolSearchPayload = {
  ok: true;
  tool: "search_product_docs";
  query: string;
  result_count: number;
  results: ProductDocsSearchResult[];
  next: string;
};

export type ProductDocsToolGetPayload =
  | {
      ok: true;
      tool: "get_product_doc";
      slug: string;
      title: string;
      section: string;
      source: string;
      heading: string | null;
      content: string;
      word_count: number;
      available_headings: string[];
    }
  | {
      ok: false;
      tool: "get_product_doc";
      code: "product_doc_not_found" | "product_doc_heading_not_found";
      message: string;
      slug: string;
      available_slugs?: string[];
      available_headings?: string[];
    };

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function findChunkByHeading(
  doc: ProductDocsSearchEntry,
  heading: string | null | undefined,
): ProductDocsSearchChunk | null {
  const normalizedHeading = normalizeLookupValue(String(heading ?? ""));
  if (!normalizedHeading) return null;
  return (
    doc.chunks.find((chunk) => {
      const chunkHeading = normalizeLookupValue(chunk.heading ?? "");
      const chunkIdSuffix = normalizeLookupValue(chunk.id.split("#").pop() ?? "");
      return chunkHeading === normalizedHeading || chunkIdSuffix === normalizedHeading;
    }) ?? null
  );
}

export function executeSearchProductDocsTool(args: {
  index: ProductDocsSearchIndex;
  query: string;
  limit?: number | null;
  section?: string | null;
  audience?: string | null;
}): ProductDocsToolSearchPayload {
  const query = String(args.query ?? "").trim();
  const limit = Number.isFinite(args.limit)
    ? Math.max(1, Math.min(Math.floor(Number(args.limit)), 10))
    : 5;
  const results = searchProductDocsIndex(args.index, query, {
    limit,
    section: args.section ?? undefined,
    audience: args.audience ?? undefined,
  });
  return {
    ok: true,
    tool: "search_product_docs",
    query,
    result_count: results.length,
    results,
    next:
      results.length > 0
        ? "Use get_product_doc with a returned slug when you need the full canonical page or a specific heading."
        : "Try a broader query or search the docs index by primitive name, workflow, role, or system concept.",
  };
}

export function executeGetProductDocTool(args: {
  index: ProductDocsSearchIndex;
  slug: string;
  heading?: string | null;
}): ProductDocsToolGetPayload {
  const slug = String(args.slug ?? "").trim();
  const doc = getProductDocFromIndex(args.index, slug);
  if (!doc) {
    return {
      ok: false,
      tool: "get_product_doc",
      code: "product_doc_not_found",
      message: `No product documentation page exists for slug "${slug}".`,
      slug,
      available_slugs: args.index.docs.map((entry) => entry.slug).slice(0, 50),
    };
  }

  const heading = String(args.heading ?? "").trim();
  const chunk = heading ? findChunkByHeading(doc, heading) : null;
  if (heading && !chunk) {
    return {
      ok: false,
      tool: "get_product_doc",
      code: "product_doc_heading_not_found",
      message: `No heading "${heading}" exists in product documentation page "${slug}".`,
      slug,
      available_headings: doc.headings.slice(0, 50),
    };
  }

  const content = chunk?.text ?? doc.content;
  const wordCount = chunk?.word_count ?? doc.word_count;
  return {
    ok: true,
    tool: "get_product_doc",
    slug: doc.slug,
    title: doc.title,
    section: doc.section,
    source: doc.source,
    heading: chunk?.heading ?? null,
    content,
    word_count: wordCount,
    available_headings: doc.headings,
  };
}
