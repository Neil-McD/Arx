import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveCanonicalGatePolicy,
  resolveEntitledCapabilityFamiliesForGate,
} from "../shared/canonicalGateEngine.ts";
import {
  executeGetProductDocTool,
  executeSearchProductDocsTool,
} from "../shared/productDocsRuntime.ts";
import type { ProductDocsSearchIndex } from "../shared/productDocsSearch.ts";
import { buildWorkspaceRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
} from "../shared/runtimeKernelTypes.ts";

const productDocsIndex = JSON.parse(
  readFileSync("docs/product/generated/index.json", "utf8"),
) as ProductDocsSearchIndex;

function proveDocsCapabilityGate() {
  const anonymous = resolveEntitledCapabilityFamiliesForGate({
    surface: "web",
    authState: "anonymous",
    executionMode: "cloud",
    requestedFundingSource: "demo_public",
  });
  assert.equal(
    anonymous.includes("product_docs"),
    false,
    "anonymous free users should not receive runtime docs tools",
  );

  const authenticatedFree = resolveCanonicalGatePolicy({
    surface: "web",
    authState: "authenticated",
    tier: "free",
    executionMode: "cloud",
    requestedFundingSource: "demo_public",
  });
  assert.equal(
    authenticatedFree.entitledCapabilityFamilies.includes("product_docs"),
    true,
    "authenticated free users should be entitled to product docs tools",
  );
  assert.equal(
    authenticatedFree.activeCapabilityFamilies.includes("product_docs"),
    true,
    "product docs tools should not require community or workspace context",
  );

  const builder = resolveCanonicalGatePolicy({
    surface: "web",
    authState: "authenticated",
    tier: "builder",
    executionMode: "cloud",
    requestedFundingSource: "platform",
    hasCommunityContext: true,
    hasProjectContext: true,
  });
  assert.equal(builder.entitledCapabilityFamilies.includes("product_docs"), true);
  assert.equal(builder.activeCapabilityFamilies.includes("product_docs"), true);
  console.log("PASS: product docs capability is available to authenticated free and paid users");
}

function proveDocsToolExposure() {
  const source = readFileSync("convex/runtimeTurnResolution.ts", "utf8");
  assert.match(
    source,
    /activeCapabilityFamilies\.includes\("product_docs"\)[\s\S]*toolNames\.push\("search_product_docs", "get_product_doc"\)/,
    "runtime turn resolution should expose docs tools only from the product_docs capability",
  );
  console.log("PASS: product docs capability exposes only docs search/read tools");
}

function proveDocsToolExecution() {
  const search = executeSearchProductDocsTool({
    index: productDocsIndex,
    query: "community lens server validated",
    limit: 5,
  });
  assert.equal(search.ok, true);
  assert.ok(search.result_count > 0, "expected docs search to return matches");
  assert.ok(
    search.results.some((result) => result.slug === "primitives/community-lens"),
    "expected community lens query to find the community lens primitive",
  );

  const cashPathSearch = executeSearchProductDocsTool({
    index: productDocsIndex,
    query: "cash path paid community checkout payouts",
    limit: 5,
  });
  assert.equal(cashPathSearch.ok, true);
  assert.equal(
    cashPathSearch.results[0]?.slug,
    "reference/billing-entitlements",
    "expected payout/cash-path query to rank billing entitlements first",
  );
  assert.ok(
    cashPathSearch.results.slice(0, 3).some((result) => result.slug === "guides/manage-access-billing-and-roles"),
    "expected payout/cash-path query to surface the access and billing guide near the top",
  );

  const promptSearch = executeSearchProductDocsTool({
    index: productDocsIndex,
    query: "system prompts community owner instructions",
    limit: 5,
  });
  assert.equal(promptSearch.ok, true);
  assert.ok(
    promptSearch.results.slice(0, 3).some((result) => result.slug === "reference/prompt-context-model"),
    "expected prompt query to surface the prompt context reference near the top",
  );
  assert.ok(
    promptSearch.results.slice(0, 3).some((result) => result.slug === "guides/configure-community-agent"),
    "expected prompt query to surface the community agent configuration guide near the top",
  );

  const doc = executeGetProductDocTool({
    index: productDocsIndex,
    slug: "primitives/polynet",
    heading: "Definition",
  });
  assert.equal(doc.ok, true);
  assert.equal(doc.slug, "primitives/polynet");
  assert.match(doc.content, /collective intelligence platform/i);

  const missing = executeGetProductDocTool({ index: productDocsIndex, slug: "missing/doc" });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "product_doc_not_found");
  console.log("PASS: product docs runtime tools search, read, and fail deterministically");
}

function provePromptGuidance() {
  const prompt = buildWorkspaceRuntimeSystemPrompt({
    harnessName: "chat_tools",
    loopBudget: DEFAULT_RUNTIME_KERNEL_BUDGET,
    allowedToolNames: ["search_product_docs", "get_product_doc"],
    communityId: null,
    communityName: null,
    communitySlug: null,
    communityOneLiner: null,
    communityAbout: null,
    customCommunitySystemPrompt: null,
    projectLabel: null,
    projectDescription: null,
    threadWorkingState: null,
    activeBackgroundTerminals: null,
  });
  assert.match(prompt, /Use search_product_docs/);
  assert.match(prompt, /Product docs are the canonical platform documentation/);
  console.log("PASS: docs tool guidance is injected when docs tools are active");
}

proveDocsCapabilityGate();
proveDocsToolExposure();
proveDocsToolExecution();
provePromptGuidance();
