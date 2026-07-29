import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getProductDocFromIndex, searchProductDocsIndex } from "../shared/productDocsSearch.ts";
import { buildProductDocsArtifacts } from "./generate_product_docs_index.ts";

type ProductDocsIndex = ReturnType<typeof buildProductDocsArtifacts>["index"];

const repoRoot = process.cwd();

function repoPath(relativePath: string): string {
  return path.join(repoRoot, relativePath);
}

function readText(relativePath: string): string {
  return readFileSync(repoPath(relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFileMatches(relativePath: string, expected: string): void {
  assert(existsSync(repoPath(relativePath)), `Missing generated artifact: ${relativePath}`);
  const actual = readText(relativePath);
  assert(
    actual === expected,
    `Generated artifact is stale: ${relativePath}. Run npm run generate:product-docs-index.`,
  );
}

function validateIndex(index: ProductDocsIndex): void {
  assert(index.version === 1, "Product docs index version must be 1.");
  assert(index.source_manifest === "docs/product/manifest.json", "Unexpected source manifest.");
  assert(index.default_slug.length > 0, "Missing default slug.");
  assert(index.docs.length > 0, "Product docs index is empty.");

  const slugs = new Set<string>();
  const sources = new Set<string>();
  for (const doc of index.docs) {
    assert(!slugs.has(doc.slug), `Duplicate product doc slug: ${doc.slug}`);
    assert(!sources.has(doc.source), `Duplicate product doc source: ${doc.source}`);
    slugs.add(doc.slug);
    sources.add(doc.source);
    assert(existsSync(repoPath(doc.source)), `Missing source file: ${doc.source}`);
    assert(doc.id.length > 0, `Missing id for ${doc.slug}`);
    assert(doc.title.length > 0, `Missing title for ${doc.slug}`);
    assert(doc.section.length > 0, `Missing section for ${doc.slug}`);
    assert(doc.summary.length > 0, `Missing summary for ${doc.slug}`);
    assert(doc.audience.length > 0, `Missing audience for ${doc.slug}`);
    assert(doc.status.length > 0, `Missing status for ${doc.slug}`);
    assert(doc.content.length > 0, `Missing content for ${doc.slug}`);
    assert(doc.word_count > 0, `Missing word count for ${doc.slug}`);
    assert(doc.search_text.length > 0, `Missing search text for ${doc.slug}`);
    assert(doc.chunks.length > 0, `Missing chunks for ${doc.slug}`);
    assert(doc.keywords.length > 0, `Missing keywords for ${doc.slug}`);
    assert(Object.keys(doc.frontmatter).length > 0, `Missing parsed frontmatter for ${doc.slug}`);
    if (doc.search) {
      assert(Array.isArray(doc.search.aliases), `Search aliases must be an array for ${doc.slug}`);
      assert(Array.isArray(doc.search.keywords), `Search keywords must be an array for ${doc.slug}`);
      assert(Array.isArray(doc.search.queries), `Search queries must be an array for ${doc.slug}`);
      assert(Array.isArray(doc.search.related_slugs), `Search related slugs must be an array for ${doc.slug}`);
      assert(
        Number.isFinite(doc.search.boost) && doc.search.boost >= 0.5 && doc.search.boost <= 3,
        `Search boost must stay within the supported ranking range for ${doc.slug}`,
      );
    }

    const chunkIds = new Set<string>();
    for (const chunk of doc.chunks) {
      assert(chunk.slug === doc.slug, `Chunk slug mismatch in ${doc.slug}`);
      assert(!chunkIds.has(chunk.id), `Duplicate chunk id in ${doc.slug}: ${chunk.id}`);
      chunkIds.add(chunk.id);
      assert(chunk.id.startsWith(`${doc.slug}#`), `Chunk id must start with slug: ${chunk.id}`);
      assert(chunk.text.length > 0, `Empty chunk text in ${chunk.id}`);
      assert(chunk.word_count > 0, `Empty chunk word count in ${chunk.id}`);
      assert(chunk.search_text.length > 0, `Empty chunk search text in ${chunk.id}`);
    }
  }

  assert(slugs.has(index.default_slug), `Default slug is not indexed: ${index.default_slug}`);
}

function validateLlmsFiles(index: ProductDocsIndex, llmsTxt: string, llmsFullTxt: string): void {
  for (const doc of index.docs) {
    assert(llmsTxt.includes(`\`${doc.slug}\``), `llms.txt is missing slug: ${doc.slug}`);
    assert(llmsFullTxt.includes(`Slug: \`${doc.slug}\``), `llms-full.txt is missing slug: ${doc.slug}`);
    assert(llmsFullTxt.includes(`Source: \`${doc.source}\``), `llms-full.txt is missing source: ${doc.source}`);
    assert(llmsFullTxt.includes(doc.content.slice(0, Math.min(120, doc.content.length))), `llms-full.txt is missing content for ${doc.slug}`);
  }
}

function validateSearch(index: ProductDocsIndex): void {
  type GoldenQuery = {
    query: string;
    expectedTopSlugs?: string[];
    expectedFirstSlug?: string;
    topN?: number;
  };

  function assertTopSlug(query: string, expectedSlug: string, limit = 5): void {
    const results = searchProductDocsIndex(index, query, { limit });
    assert(results[0]?.slug === expectedSlug, `Search "${query}" should rank ${expectedSlug} first, got ${results[0]?.slug ?? "no result"}.`);
  }

  function assertTopSlugsInclude(query: string, expectedSlug: string, topN: number, limit = 8): void {
    const results = searchProductDocsIndex(index, query, { limit });
    assert(
      results.slice(0, topN).some((result) => result.slug === expectedSlug),
      `Search "${query}" should rank ${expectedSlug} in the top ${topN}; got ${results.map((result) => result.slug).join(", ")}.`,
    );
  }

  function assertGoldenQuery(goldenQuery: GoldenQuery): void {
    const topN = goldenQuery.topN ?? 3;
    const expectedTopSlugs = goldenQuery.expectedTopSlugs ?? [];
    const results = searchProductDocsIndex(index, goldenQuery.query, { limit: Math.max(8, topN) });
    const resultSlugs = results.map((result) => result.slug);
    assert(resultSlugs.length > 0, `Search "${goldenQuery.query}" should return results.`);
    if (goldenQuery.expectedFirstSlug) {
      assert(
        resultSlugs[0] === goldenQuery.expectedFirstSlug,
        `Search "${goldenQuery.query}" should rank ${goldenQuery.expectedFirstSlug} first; got ${resultSlugs[0] ?? "no result"}.`,
      );
    }
    for (const expectedSlug of expectedTopSlugs) {
      assert(
        resultSlugs.slice(0, topN).includes(expectedSlug),
        `Search "${goldenQuery.query}" should rank ${expectedSlug} in the top ${topN}; got ${resultSlugs.join(", ")}.`,
      );
    }
  }

  function assertExplainableSearchResult(query: string, expectedTerms: string[], expectedFields: string[]): void {
    const [result] = searchProductDocsIndex(index, query, { limit: 1 });
    assert(result, `Search "${query}" should return an explainable result.`);
    for (const term of expectedTerms) {
      assert(
        result.matched_terms.includes(term),
        `Search "${query}" should explain matched term "${term}"; got ${result.matched_terms.join(", ")}.`,
      );
    }
    for (const field of expectedFields) {
      assert(
        result.matched_fields.includes(field),
        `Search "${query}" should explain matched field "${field}"; got ${result.matched_fields.join(", ")}.`,
      );
    }
    assert(result.reason.length > 0, `Search "${query}" should include a short match reason.`);
    assert(
      !result.matched_terms.includes("what") && !result.matched_terms.includes("can"),
      `Search "${query}" should not expose low-signal stop words as matched terms.`,
    );
  }

  const lensResults = searchProductDocsIndex(index, "community lens server validated context", { limit: 5 });
  assert(
    lensResults.some((result) => result.slug === "primitives/community-lens"),
    "Search should find the community lens primitive.",
  );

  const payoutResults = searchProductDocsIndex(index, "payouts builder cash community payments", { limit: 10 });
  assert(
    payoutResults.some((result) => result.slug.includes("billing") || result.slug.includes("access")),
    "Search should find billing or access docs for payout/payment queries.",
  );

  const defaultDoc = getProductDocFromIndex(index, index.default_slug);
  assert(defaultDoc?.slug === index.default_slug, "Default product doc must be retrievable by slug.");

  assertTopSlug("payout readiness", "reference/billing-entitlements");
  assertTopSlugsInclude("cash path paid community checkout payouts", "reference/billing-entitlements", 3);
  assertTopSlugsInclude("cash path paid community checkout payouts", "guides/manage-access-billing-and-roles", 3);
  assertTopSlugsInclude("system prompts community owner instructions", "reference/prompt-context-model", 3);
  assertTopSlugsInclude("system prompts community owner instructions", "guides/configure-community-agent", 3);
  assertTopSlugsInclude("community lens context switching", "primitives/community-lens", 2);
  assertTopSlug("memory across threads", "primitives/memory");
  assertTopSlug("what is polynet value prop", "primitives/polynet");

  const goldenQueries: GoldenQuery[] = [
    {
      query: "how does community lens work",
      expectedTopSlugs: ["primitives/community-lens", "guides/community-lens"],
    },
    {
      query: "builder payouts monetize community cash",
      expectedTopSlugs: ["reference/billing-entitlements", "guides/manage-access-billing-and-roles"],
    },
    {
      query: "what can admins do",
      expectedTopSlugs: ["reference/roles-permissions", "primitives/role"],
    },
    {
      query: "how do I connect Polynet MCP",
      expectedTopSlugs: ["guides/connect-polynet-mcp", "primitives/polynet-mcp"],
    },
    {
      query: "where should community instructions go",
      expectedTopSlugs: ["guides/configure-community-agent", "reference/prompt-context-model"],
    },
    {
      query: "how does memory work",
      expectedFirstSlug: "primitives/memory",
    },
    {
      query: "join a paid community",
      expectedTopSlugs: ["guides/joining-communities", "reference/billing-entitlements"],
    },
    {
      query: "resources in a community",
      expectedTopSlugs: ["guides/manage-resources", "primitives/resource"],
    },
    {
      query: "voice chat",
      expectedFirstSlug: "primitives/voice",
    },
    {
      query: "what is Polynet",
      expectedFirstSlug: "primitives/polynet",
    },
  ];

  for (const goldenQuery of goldenQueries) {
    assertGoldenQuery(goldenQuery);
  }

  assertExplainableSearchResult("what can admins do", ["admins"], ["queries", "keywords"]);
  assertExplainableSearchResult("resources in a community", ["resources", "community"], ["queries", "title"]);
  assertExplainableSearchResult("community lens server validated", ["community", "lens"], ["slug", "summary"]);
}

const artifacts = buildProductDocsArtifacts();
validateIndex(artifacts.index);
validateLlmsFiles(artifacts.index, artifacts.llmsTxt, artifacts.llmsFullTxt);
validateSearch(artifacts.index);
assertFileMatches("docs/product/generated/index.json", artifacts.indexJson);
assertFileMatches("docs/product/llms.txt", artifacts.llmsTxt);
assertFileMatches("docs/product/llms-full.txt", artifacts.llmsFullTxt);

console.log(`Product docs index proof passed for ${artifacts.index.docs.length} docs.`);
