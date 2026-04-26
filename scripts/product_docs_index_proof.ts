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
}

const artifacts = buildProductDocsArtifacts();
validateIndex(artifacts.index);
validateLlmsFiles(artifacts.index, artifacts.llmsTxt, artifacts.llmsFullTxt);
validateSearch(artifacts.index);
assertFileMatches("docs/product/generated/index.json", artifacts.indexJson);
assertFileMatches("docs/product/llms.txt", artifacts.llmsTxt);
assertFileMatches("docs/product/llms-full.txt", artifacts.llmsFullTxt);

console.log(`Product docs index proof passed for ${artifacts.index.docs.length} docs.`);
