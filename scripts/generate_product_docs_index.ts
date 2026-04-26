import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ProductDocAudience = "builder" | "member" | "llm" | "operator";

type ProductDocManifestEntry = {
  id: string;
  slug: string;
  title: string;
  section: string;
  summary: string;
  audience: ProductDocAudience[];
  status: string;
  source: string;
};

type ProductDocsManifest = {
  version: number;
  defaultSlug: string;
  docs: ProductDocManifestEntry[];
};

type ParsedFrontmatter = Record<string, string | string[] | null>;

type ProductDocChunk = {
  id: string;
  slug: string;
  heading: string | null;
  level: number | null;
  text: string;
  word_count: number;
  search_text: string;
};

type ProductDocIndexEntry = ProductDocManifestEntry & {
  frontmatter: ParsedFrontmatter;
  content: string;
  headings: string[];
  keywords: string[];
  chunks: ProductDocChunk[];
  word_count: number;
  search_text: string;
};

type ProductDocsIndex = {
  version: 1;
  source_manifest: string;
  manifest_hash: string;
  source_hash: string;
  default_slug: string;
  docs: ProductDocIndexEntry[];
};

export type ProductDocsArtifacts = {
  index: ProductDocsIndex;
  indexJson: string;
  llmsTxt: string;
  llmsFullTxt: string;
};

const repoRoot = process.cwd();
const manifestRelativePath = "docs/product/manifest.json";
const generatedIndexRelativePath = "docs/product/generated/index.json";
const llmsRelativePath = "docs/product/llms.txt";
const llmsFullRelativePath = "docs/product/llms-full.txt";

function repoPath(relativePath: string): string {
  return path.join(repoRoot, relativePath);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function readText(relativePath: string): string {
  return readFileSync(repoPath(relativePath), "utf8");
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function parseFrontmatter(raw: string): {
  frontmatter: ParsedFrontmatter;
  content: string;
  hasFrontmatter: boolean;
} {
  const normalized = normalizeNewlines(raw);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\s*/);
  if (!match) {
    return {
      frontmatter: {},
      content: normalized.trim(),
      hasFrontmatter: false,
    };
  }

  const frontmatter: ParsedFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!rawValue || rawValue === "null") {
      frontmatter[key] = null;
      continue;
    }
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    if (rawValue.includes(",") && key === "audience") {
      frontmatter[key] = rawValue
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    frontmatter[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return {
    frontmatter,
    content: normalized.slice(match[0].length).trim(),
    hasFrontmatter: true,
  };
}

function wordCount(value: string): number {
  const words = value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g);
  return words?.length ?? 0;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/`{1,3}/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  const normalized = normalizeSearchText(value).replace(/\s+/g, "-");
  return normalized || "section";
}

function extractHeadings(content: string): Array<{ level: number; title: string; lineIndex: number }> {
  const headings: Array<{ level: number; title: string; lineIndex: number }> = [];
  const lines = content.split("\n");
  lines.forEach((line, lineIndex) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) return;
    headings.push({
      level: match[1].length,
      title: match[2].replace(/\s+#+$/, "").trim(),
      lineIndex,
    });
  });
  return headings;
}

function buildChunks(slug: string, content: string): ProductDocChunk[] {
  const lines = content.split("\n");
  const chunks: ProductDocChunk[] = [];
  const seenIds = new Map<string, number>();
  let activeHeading: { level: number; title: string } | null = null;
  let activeLines: string[] = [];

  function pushActive() {
    const text = activeLines.join("\n").trim();
    if (!text) return;
    const baseId = `${slug}#${activeHeading ? slugify(activeHeading.title) : "overview"}`;
    const seenCount = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, seenCount + 1);
    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`;
    chunks.push({
      id,
      slug,
      heading: activeHeading?.title ?? null,
      level: activeHeading?.level ?? null,
      text,
      word_count: wordCount(text),
      search_text: normalizeSearchText([activeHeading?.title, text].filter(Boolean).join(" ")),
    });
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      pushActive();
      activeHeading = {
        level: headingMatch[1].length,
        title: headingMatch[2].replace(/\s+#+$/, "").trim(),
      };
      activeLines = [line];
      continue;
    }
    activeLines.push(line);
  }
  pushActive();

  if (chunks.length > 0) return chunks;

  const text = content.trim();
  return [
    {
      id: `${slug}#overview`,
      slug,
      heading: null,
      level: null,
      text,
      word_count: wordCount(text),
      search_text: normalizeSearchText(text),
    },
  ];
}

function keywordTokens(values: string[]): string[] {
  const keywords = new Set<string>();
  for (const value of values) {
    for (const token of normalizeSearchText(value).split(" ")) {
      if (token.length < 3) continue;
      keywords.add(token);
    }
  }
  return Array.from(keywords).sort();
}

function buildIndex(manifest: ProductDocsManifest, manifestRaw: string): ProductDocsIndex {
  const docs: ProductDocIndexEntry[] = manifest.docs.map((doc) => {
    if (!existsSync(repoPath(doc.source))) {
      throw new Error(`Missing product doc source: ${doc.source}`);
    }
    const raw = readText(doc.source);
    const parsed = parseFrontmatter(raw);
    if (!parsed.hasFrontmatter) {
      throw new Error(`Missing frontmatter in product doc source: ${doc.source}`);
    }
    const headings = extractHeadings(parsed.content).map((heading) => heading.title);
    const chunks = buildChunks(doc.slug, parsed.content);
    const keywords = keywordTokens([
      doc.id,
      doc.slug,
      doc.title,
      doc.section,
      doc.summary,
      doc.status,
      ...doc.audience,
      ...headings,
    ]);
    const searchText = normalizeSearchText([
      doc.slug,
      doc.title,
      doc.section,
      doc.summary,
      doc.status,
      ...doc.audience,
      ...keywords,
      ...headings,
      parsed.content,
    ].join(" "));

    return {
      ...doc,
      frontmatter: parsed.frontmatter,
      content: parsed.content,
      headings,
      keywords,
      chunks,
      word_count: wordCount(parsed.content),
      search_text: searchText,
    };
  });

  const sourceHashInput = docs
    .map((doc) => `${doc.source}\0${doc.content}\0${JSON.stringify(doc.frontmatter)}`)
    .join("\0");

  return {
    version: 1,
    source_manifest: manifestRelativePath,
    manifest_hash: sha256(manifestRaw),
    source_hash: sha256(sourceHashInput),
    default_slug: manifest.defaultSlug,
    docs,
  };
}

function buildLlmsTxt(index: ProductDocsIndex): string {
  const lines = [
    "# Polynet Product Docs",
    "",
    "This is the compact LLM entrypoint for Polynet product documentation.",
    "Use it to choose the smallest relevant document before reading full context.",
    "",
    "## Platform Value Prop",
    "",
    "Polynet lets builders create communities that can think, remember, and act with AI.",
    "The platform combines community, services, consulting, software, agents, skills, apps, MCPs, resources, access control, and payments into one services-as-software business surface.",
    "",
    "## Retrieval Rule",
    "",
    "Read only the specific docs needed for the task. Prefer precise slugs over broad context.",
    "",
    "## Default Document",
    "",
    `- \`${index.default_slug}\``,
    "",
    "## Directory",
    "",
  ];

  for (const doc of index.docs) {
    lines.push(`- \`${doc.slug}\` (${doc.section}) — ${doc.title}: ${doc.summary}`);
  }

  lines.push(
    "",
    "## Search Contract",
    "",
    "- Searchable directory: `docs/product/generated/index.json`",
    "- Search contract: `docs/product/search-contract.md`",
    "- Full generated context: `docs/product/llms-full.txt`",
    "",
  );

  return `${lines.join("\n").trim()}\n`;
}

function buildLlmsFullTxt(index: ProductDocsIndex): string {
  const lines = [
    "# Polynet Product Docs Full Context",
    "",
    "This file is generated from `docs/product/manifest.json` and the Markdown sources it lists.",
    "Do not edit this file directly. Edit source Markdown, then run `npm run generate:product-docs-index`.",
    "",
    "## Directory",
    "",
  ];

  for (const doc of index.docs) {
    lines.push(`- \`${doc.slug}\` — ${doc.title}: ${doc.summary}`);
  }

  lines.push("", "## Documents", "");

  for (const doc of index.docs) {
    lines.push(
      `# ${doc.title}`,
      "",
      `Slug: \`${doc.slug}\``,
      `Source: \`${doc.source}\``,
      `Section: ${doc.section}`,
      `Audience: ${doc.audience.join(", ")}`,
      `Status: ${doc.status}`,
      `Summary: ${doc.summary}`,
      "",
      doc.content,
      "",
    );
  }

  return `${lines.join("\n").trim()}\n`;
}

export function buildProductDocsArtifacts(): ProductDocsArtifacts {
  const manifestRaw = readText(manifestRelativePath);
  const manifest = JSON.parse(manifestRaw) as ProductDocsManifest;
  const index = buildIndex(manifest, manifestRaw);
  return {
    index,
    indexJson: `${JSON.stringify(index, null, 2)}\n`,
    llmsTxt: buildLlmsTxt(index),
    llmsFullTxt: buildLlmsFullTxt(index),
  };
}

export function writeProductDocsArtifacts(): void {
  const artifacts = buildProductDocsArtifacts();
  mkdirSync(repoPath("docs/product/generated"), { recursive: true });
  writeFileSync(repoPath(generatedIndexRelativePath), artifacts.indexJson);
  writeFileSync(repoPath(llmsRelativePath), artifacts.llmsTxt);
  writeFileSync(repoPath(llmsFullRelativePath), artifacts.llmsFullTxt);
  console.log(`Wrote ${generatedIndexRelativePath}`);
  console.log(`Wrote ${llmsRelativePath}`);
  console.log(`Wrote ${llmsFullRelativePath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  writeProductDocsArtifacts();
}

