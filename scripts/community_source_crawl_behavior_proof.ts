import assert from "node:assert/strict";

import {
  buildCommunitySourceCrawledBody,
  communitySourceCrawlerUrlInRootScope,
  communitySourceCrawlerUrlAliases,
  planCommunitySourceCrawlerPageSave,
  summarizeCommunitySourceCrawlerPageSaveDecisions,
  type CommunitySourceCrawlerExistingSource,
  type CommunitySourcePageResult,
} from "../shared/communitySourceCrawler.ts";

function normalizeUrl(raw: unknown): string | null {
  try {
    const parsed = new URL(String(raw ?? "").trim());
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== "443") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function page(overrides: Partial<CommunitySourcePageResult> = {}): CommunitySourcePageResult {
  return {
    requested_url: "https://docs.example.com/wiki",
    final_url: "https://docs.example.com/wiki",
    canonical_url: "https://docs.example.com/wiki",
    root_url: "https://docs.example.com/wiki",
    parent_url: null,
    depth: 0,
    title: "Docs Home",
    markdown: "Useful source material.",
    links: [],
    status: "ready",
    error: null,
    ...overrides,
  };
}

function existing(
  id: string,
  hasReadyText: boolean,
): CommunitySourceCrawlerExistingSource<{ id: string }> {
  return {
    id,
    hasReadyText,
    payload: { id },
  };
}

assert.deepEqual(
  Array.from(communitySourceCrawlerUrlAliases(
    normalizeUrl,
    "https://docs.example.com/wiki",
    "https://docs.example.com/wiki/",
    "https://docs.example.com/wiki#section",
    "http://docs.example.com/wiki",
  )).sort(),
  [
    "https://docs.example.com/wiki",
    "https://docs.example.com/wiki/",
  ],
  "crawler URL aliases should collapse hash variants and trailing slash variants while rejecting unsafe URLs",
);

assert.equal(
  communitySourceCrawlerUrlInRootScope({
    rootUrl: "https://docs.example.com/wiki",
    candidateUrl: "https://docs.example.com/wiki/start-here",
    normalizeUrl,
  }),
  true,
  "crawler scope should allow pages below the submitted root path",
);
assert.equal(
  communitySourceCrawlerUrlInRootScope({
    rootUrl: "https://docs.example.com/wiki",
    candidateUrl: "https://docs.example.com/wiki/",
    normalizeUrl,
  }),
  true,
  "crawler scope should allow trailing-slash variants of the submitted root path",
);
assert.equal(
  communitySourceCrawlerUrlInRootScope({
    rootUrl: "https://docs.example.com/wiki",
    candidateUrl: "https://docs.example.com/pricing",
    normalizeUrl,
  }),
  false,
  "crawler scope should reject same-origin pages outside the submitted root path",
);
assert.equal(
  communitySourceCrawlerUrlInRootScope({
    rootUrl: "https://docs.example.com/wiki",
    candidateUrl: "https://docs.example.com/wiki-old",
    normalizeUrl,
  }),
  false,
  "crawler scope should reject path-prefix traps",
);
assert.equal(
  communitySourceCrawlerUrlInRootScope({
    rootUrl: "https://docs.example.com/wiki",
    candidateUrl: "https://other.example.com/wiki/start-here",
    normalizeUrl,
  }),
  false,
  "crawler scope should reject cross-origin pages",
);
assert.equal(
  communitySourceCrawlerUrlInRootScope({
    rootUrl: "https://docs.example.com/",
    candidateUrl: "https://docs.example.com/pricing",
    normalizeUrl,
  }),
  true,
  "crawler scope should allow whole-origin crawling when the submitted root path is slash",
);

const readyExistingByAlias = new Map<string, CommunitySourceCrawlerExistingSource<{ id: string }>>();
for (const alias of communitySourceCrawlerUrlAliases(normalizeUrl, "https://docs.example.com/wiki/")) {
  readyExistingByAlias.set(alias, existing("source_ready", true));
}
assert.deepEqual(
  planCommunitySourceCrawlerPageSave({
    page: page({ final_url: "https://docs.example.com/wiki" }),
    rootUrl: "https://docs.example.com/wiki",
    existingSourcesByAlias: readyExistingByAlias,
    seenAliases: new Set(),
    normalizeUrl,
  }),
  {
    action: "skip",
    reason: "existing_ready",
    final_url: "https://docs.example.com/wiki",
    aliases: [
      "https://docs.example.com/wiki",
      "https://docs.example.com/wiki/",
    ],
    body_md: buildCommunitySourceCrawledBody(page({ final_url: "https://docs.example.com/wiki" })),
    source_id: "source_ready",
    existing_source: existing("source_ready", true),
  },
  "ready existing sources should be counted as usable and skipped instead of duplicated",
);

const queuedExistingByAlias = new Map<string, CommunitySourceCrawlerExistingSource<{ id: string }>>();
for (const alias of communitySourceCrawlerUrlAliases(normalizeUrl, "https://docs.example.com/wiki")) {
  queuedExistingByAlias.set(alias, existing("source_queued", false));
}
const updateDecision = planCommunitySourceCrawlerPageSave({
  page: page({ final_url: "https://docs.example.com/wiki/" }),
  rootUrl: "https://docs.example.com/wiki",
  existingSourcesByAlias: queuedExistingByAlias,
  seenAliases: new Set(),
  normalizeUrl,
});
assert.equal(updateDecision.action, "update_existing");
assert.equal(updateDecision.reason, "existing_not_ready");
assert.equal(updateDecision.source_id, "source_queued");
assert.match(updateDecision.body_md, /Source URL: https:\/\/docs\.example\.com\/wiki\//);
assert.match(updateDecision.body_md, /Crawl root: https:\/\/docs\.example\.com\/wiki/);

const seenAliases = new Set<string>();
const firstNew = planCommunitySourceCrawlerPageSave({
  page: page({ final_url: "https://docs.example.com/wiki/start-here" }),
  rootUrl: "https://docs.example.com/wiki",
  existingSourcesByAlias: new Map(),
  seenAliases,
  normalizeUrl,
});
const duplicateNew = planCommunitySourceCrawlerPageSave({
  page: page({
    requested_url: "https://docs.example.com/wiki/start-here/",
    final_url: "https://docs.example.com/wiki/start-here/",
    canonical_url: "https://docs.example.com/wiki/start-here/",
  }),
  rootUrl: "https://docs.example.com/wiki",
  existingSourcesByAlias: new Map(),
  seenAliases,
  normalizeUrl,
});
assert.equal(firstNew.action, "save_new");
assert.equal(firstNew.reason, "ready_new");
assert.equal(duplicateNew.action, "skip");
assert.equal(duplicateNew.reason, "duplicate_url");

const unusableDecisions = [
  planCommunitySourceCrawlerPageSave({
    page: page({ status: "failed", markdown: "", error: "blocked" }),
    rootUrl: "https://docs.example.com/wiki",
    existingSourcesByAlias: new Map(),
    seenAliases: new Set(),
    normalizeUrl,
  }),
  planCommunitySourceCrawlerPageSave({
    page: page({ final_url: "https://docs.example.com/empty", markdown: "" }),
    rootUrl: "https://docs.example.com/wiki",
    existingSourcesByAlias: new Map(),
    seenAliases: new Set(),
    normalizeUrl,
  }),
];
assert.deepEqual(
  summarizeCommunitySourceCrawlerPageSaveDecisions(unusableDecisions),
  {
    saved_source_count: 0,
    skipped_source_count: 0,
    failed_page_count: 2,
    source_resource_ids: [],
  },
  "a crawl with zero usable pages should summarize as recoverably failed",
);

const mixedDecisions = [
  firstNew,
  updateDecision,
  duplicateNew,
  unusableDecisions[0],
];
assert.deepEqual(
  summarizeCommunitySourceCrawlerPageSaveDecisions(mixedDecisions),
  {
    saved_source_count: 2,
    skipped_source_count: 1,
    failed_page_count: 1,
    source_resource_ids: ["source_queued"],
  },
  "partial success should preserve usable pages while reporting skipped and failed pages separately",
);

console.log("community_source_crawl_behavior_proof: ok");
