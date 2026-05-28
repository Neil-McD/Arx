import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  AUTHENTICATED_PLATFORM_CAPABILITIES,
  resolveActiveCapabilityFamiliesFromEntitlements,
  resolveEntitledCapabilityFamiliesForGate,
  resolveHarnessProfileFromActiveCapabilities,
} from "../shared/canonicalGateEngine.ts";
import {
  buildPlatformHarnessRuntimeSystemPrompt,
  composePlatformChatRuntimeSystemPrompt,
} from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function assertSameArray(actual: readonly string[], expected: readonly string[], message: string) {
  assert.equal(stable(actual), stable(expected), message);
}

function proveCapabilityContract() {
  assertSameArray(
    AUTHENTICATED_PLATFORM_CAPABILITIES,
    [
      "product_docs",
      "community_tools",
      "web_research",
      "workspace_tools",
    ],
    "authenticated platform capability constant should be the single product-facing entitlement set",
  );
  const canonicalEntitlement = [...AUTHENTICATED_PLATFORM_CAPABILITIES];
  assertSameArray(
    resolveEntitledCapabilityFamiliesForGate({
      authState: "authenticated",
      tier: "free",
    }),
    canonicalEntitlement,
    "authenticated free should be entitled to the platform capability set",
  );
  assertSameArray(
    resolveEntitledCapabilityFamiliesForGate({
      authState: "authenticated",
      tier: "architect",
    }),
    canonicalEntitlement,
    "architect should not fork the product-facing capability set",
  );
  assertSameArray(
    resolveEntitledCapabilityFamiliesForGate({
      authState: "anonymous",
      tier: "free",
    }),
    [],
    "anonymous users should not receive authenticated platform capabilities",
  );

  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: canonicalEntitlement as any,
      hasCommunityContext: false,
      hasProjectContext: false,
    }),
    ["product_docs", "web_research"],
    "without context, only global authenticated capabilities should activate",
  );
  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: canonicalEntitlement as any,
      hasCommunityContext: true,
      hasProjectContext: false,
    }),
    ["product_docs", "community_tools", "web_research"],
    "community tools should activate only with a validated community lens",
  );
  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: canonicalEntitlement as any,
      hasCommunityContext: false,
      hasProjectContext: true,
    }),
    ["product_docs", "web_research", "workspace_tools"],
    "workspace tools should activate only with a project context",
  );
  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: canonicalEntitlement as any,
      hasCommunityContext: true,
      hasProjectContext: true,
    }),
    canonicalEntitlement,
    "community plus project context should activate the full platform harness set",
  );
  assert.equal(
    resolveHarnessProfileFromActiveCapabilities({
      authState: "authenticated",
      activeCapabilityFamilies: [],
    }),
    "authenticated_cloud_chat",
    "authenticated chat should be a platform chat harness, not a tier-specific harness",
  );
  assert.equal(
    resolveHarnessProfileFromActiveCapabilities({
      authState: "authenticated",
      activeCapabilityFamilies: canonicalEntitlement as any,
    }),
    "authenticated_cloud_tools",
    "authenticated tool runs should use the unified platform tool harness",
  );
}

function provePromptEntrypoints() {
  const runtimeTurnContext = buildRuntimeTurnContextPacket({
    threadWorkingState: {
      version: 1,
      goal: "Prove the platform harness prompt contract.",
      status: "in_progress",
    },
  });
  const platformHarnessPrompt = buildPlatformHarnessRuntimeSystemPrompt({
    loopBudget: {
      maxToolSteps: 8,
      maxRepeatedIdenticalCalls: 2,
      maxConsecutiveFailures: 3,
      maxNoProgressSteps: 3,
    },
    allowedToolNames: [
      "search_product_docs",
      "get_product_doc",
      "get_active_community_context",
      "community_resources_map",
      "community_resources_read",
      "community_resources_list",
      "community_resource_read",
      "community_resources_search",
      "community_search",
      "community_write",
      "web_research",
      "web_crawl",
      "read",
      "write",
      "bash",
    ],
    harnessName: "chat_tools",
    communityId: "community_1",
    communityName: "Unified Community",
    communitySlug: "unified-community",
    communityOneLiner: "One prompt stack.",
    communityAbout: "Used to prove the one-platform-harness context model.",
    communitySystemPrompt: "Answer through the community lens when relevant.",
    agentName: "James",
    agentSoul: "Keep the product simple.",
    projectLabel: "Unified project",
    projectDescription: "Project context activates workspace tools.",
    runtimeTurnContext,
    currentDateTimeIso: "2026-05-07T12:00:00.000Z",
    currentDateLabel: "Thursday, May 7, 2026 at 8:00:00 AM EDT",
    currentTimeZone: "America/New_York",
  });
  assert.match(platformHarnessPrompt, /PLATFORM_DOCTRINE/);
  assert.match(platformHarnessPrompt, /AGENT_SOUL/);
  assert.match(platformHarnessPrompt, /Configured agent name: James/);
  assert.match(platformHarnessPrompt, /COMMUNITY_LENS/);
  assert.match(platformHarnessPrompt, /PLATFORM_HARNESS_CONTEXT/);
  assert.match(platformHarnessPrompt, /AGENT_OPERATING_POLICY/);
  assert.match(platformHarnessPrompt, /THREAD_WORKING_STATE/);
  assert.match(platformHarnessPrompt, /TEMPORAL_CONTEXT/);
  assert.match(platformHarnessPrompt, /Allowed tools: search_product_docs,get_product_doc,get_active_community_context,community_resources_map,community_resources_read,community_resources_list,community_resource_read,community_resources_search,community_search,community_write,web_research,web_crawl,read,write,bash/);
  assert.match(platformHarnessPrompt, /Use web_research for current external facts/);
  assert.match(platformHarnessPrompt, /Use web_crawl when the user provides a site, wiki, docs, course, or multi-page URL/);
  assert.match(platformHarnessPrompt, /Use get_active_community_context when the answer depends on the active community's identity/);
  assert.match(platformHarnessPrompt, /Use community_resources_map first/);
  assert.match(platformHarnessPrompt, /Use community_resources_read to batch-read/);
  assert.match(platformHarnessPrompt, /Use community_resources_list to inspect/);
  assert.doesNotMatch(
    platformHarnessPrompt,
    /community_resource_builder_read with target_type and an exact id copied from list output/,
    "member/read prompt fixture must not include builder resource edit guidance",
  );
  assert.match(platformHarnessPrompt, /Use community_search when active community activity/);
  assert.match(platformHarnessPrompt, /Use read to inspect specific files/);
  assert.doesNotMatch(
    platformHarnessPrompt,
    /\bfree tier\b|\bbuilder tier\b|\bpro tier\b|builder_tier|canonicalTier|effectiveTier/i,
    "runtime prompt output must not describe a tier-specific prompt stack",
  );

  const builderHarnessPrompt = buildPlatformHarnessRuntimeSystemPrompt({
    loopBudget: {
      maxToolSteps: 8,
      maxRepeatedIdenticalCalls: 2,
      maxConsecutiveFailures: 3,
      maxNoProgressSteps: 3,
    },
    allowedToolNames: [
      "get_active_community_context",
      "community_resources_map",
      "community_resources_read",
      "community_resources_list",
      "community_resource_read",
      "community_resources_search",
      "community_resource_builder_list",
      "community_resource_builder_read",
      "community_resource_builder_stage_changeset",
      "community_resource_builder_apply_changeset",
      "web_crawl",
    ],
    harnessName: "chat_tools",
    communityId: "community_1",
    communityName: "Unified Community",
    communitySlug: "unified-community",
    communityOneLiner: "One prompt stack.",
    communityAbout: "Used to prove the one-platform-harness context model.",
    communitySystemPrompt: "Answer through the community lens when relevant.",
    communityResourceLane: {
      lane: "builder",
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
    agentName: "James",
    agentSoul: "Keep the product simple.",
    projectLabel: "Unified project",
    projectDescription: "Project context activates workspace tools.",
    runtimeTurnContext,
    currentDateTimeIso: "2026-05-07T12:00:00.000Z",
    currentDateLabel: "Thursday, May 7, 2026 at 8:00:00 AM EDT",
    currentTimeZone: "America/New_York",
  });
  assert.match(
    builderHarnessPrompt,
    /community_resource_builder_read with ref to inspect a wiki category, page, source, readable path, resources:\/\/ URI, or exact id/,
  );
  assert.match(builderHarnessPrompt, /retry with the most specific directory_uri/);
  assert.match(builderHarnessPrompt, /wait for explicit builder approval before calling community_resource_builder_apply_changeset/);
  assert.match(
    builderHarnessPrompt,
    /translate resource tool results into product state/,
  );
  assert.match(
    builderHarnessPrompt,
    /Do not expose internal ids, database ids, resource ids/,
  );
  assert.match(
    builderHarnessPrompt,
    /Do not ask the builder to paste a changeset id/,
  );
  assert.match(
    builderHarnessPrompt,
    /Report saved versus reused state, page count, source-unit count when visible/,
  );

  const platformChatPrompt = composePlatformChatRuntimeSystemPrompt({
    communityId: "community_1",
    communityName: "Unified Community",
    communitySlug: "unified-community",
    communityOneLiner: "One prompt stack.",
    communityAbout: "Used to prove the one-platform-harness context model.",
    communitySystemPrompt: "Answer through the community lens when relevant.",
    agentName: "James",
    agentSoul: "Keep the product simple.",
    currentDateTimeIso: "2026-05-07T12:00:00.000Z",
    currentDateLabel: "Thursday, May 7, 2026 at 8:00:00 AM EDT",
    currentTimeZone: "America/New_York",
  });
  assert.match(platformChatPrompt, /This is a chat-only platform run/);
  assert.match(platformChatPrompt, /Configured agent name: James/);
  assert.match(platformChatPrompt, /No workspace tools are active in this run/);
  assert.doesNotMatch(platformChatPrompt, /This run can inspect and modify files/);
  assert.doesNotMatch(
    platformChatPrompt,
    /\bfree tier\b|\bbuilder tier\b|\bpro tier\b|builder_tier|canonicalTier|effectiveTier/i,
    "chat prompt output must not describe a tier-specific prompt stack",
  );
}

async function proveSourceContract() {
  const runtimePromptSource = await readRepoFile("shared/runtimePrompt.ts");
  const runtimeAgentLoopSource = await readRepoFile("convex/runtimeAgentLoop.ts");
  const runtimeTurnHandlersSource = await readRepoFile("convex/runtimeTurnHandlers.ts");
  const runtimeTurnResolutionSource = await readRepoFile("convex/runtimeTurnResolution.ts");
  const canonicalGateEngineSource = await readRepoFile("shared/canonicalGateEngine.ts");
  const schemaSource = await readRepoFile("convex/schema.ts");
  const runtimeHarnessCompositionSource = await readRepoFile("convex/runtimeHarnessComposition.ts");
  const communityAgentSource = await readRepoFile("convex/communityAgent.ts");
  const httpVoiceSource = await readRepoFile("convex/httpVoice.ts");
  const authCoreSource = await readRepoFile("shared/authCore.ts");
  const voiceControllerSource = await readRepoFile("shared/useWebVoiceInputController.ts");
  const appSource = await readRepoFile("apps/web/src/App.tsx");

  assert.match(
    runtimePromptSource,
    /export function buildPlatformHarnessRuntimeSystemPrompt/,
    "tool-capable prompt entrypoint should use platform harness terminology",
  );
  assert.match(
    runtimePromptSource,
    /export function composePlatformChatRuntimeSystemPrompt/,
    "chat prompt entrypoint should use platform harness terminology",
  );
  assert.doesNotMatch(
    runtimePromptSource,
    /buildWorkspaceRuntimeSystemPrompt|composeCloudScopedRuntimeSystemPrompt|composeCloudScopedSystemPrompt|buildWorkspaceOperatingPolicyPrompt|buildToolContextPrompt|normalizedBuilderTier/,
    "runtime prompt source should not carry stale workspace/cloud/tier prompt entrypoint names",
  );
  assert.doesNotMatch(
    runtimePromptSource,
    /\bfree tier\b|\bbuilder tier\b|\bpro tier\b|builder_tier|BuilderTier|canonicalTier|effectiveTier/,
    "runtime prompt source must not branch on product tiers",
  );
  assert.match(
    runtimeAgentLoopSource,
    /buildPlatformHarnessRuntimeSystemPrompt/,
    "agentic runtime path should call the platform harness prompt entrypoint",
  );
  assert.doesNotMatch(
    runtimeAgentLoopSource,
    /buildWorkspaceRuntimeSystemPrompt/,
    "agentic runtime path should not call the old workspace prompt entrypoint",
  );
  assert.match(
    runtimeTurnHandlersSource,
    /composePlatformChatRuntimeSystemPrompt/,
    "chat runtime path should call the platform chat prompt entrypoint",
  );
  assert.match(
    runtimeTurnHandlersSource,
    /agentName: runtimeAgentProfile\.agentName/,
    "runtime turn handlers must pass the saved agent name into prompt composition",
  );
  assert.match(
    runtimeAgentLoopSource,
    /agentName: params\.agentName/,
    "agentic runtime loop must pass the saved agent name into platform harness prompts",
  );
  assert.doesNotMatch(
    runtimeTurnHandlersSource,
    /composeCloudScopedRuntimeSystemPrompt/,
    "chat runtime path should not call the old cloud-scoped prompt entrypoint",
  );
  assert.match(
    canonicalGateEngineSource,
    /export const AUTHENTICATED_PLATFORM_CAPABILITIES[\s\S]*return \[\.\.\.AUTHENTICATED_PLATFORM_CAPABILITIES\]/,
    "free and architect should resolve through one authenticated platform capability constant",
  );
  assert.doesNotMatch(
    schemaSource,
    /v\.literal\("builder"\)|targetTier|builder_upgrade/,
    "active schema must not retain deleted Builder-plan tier or checkout fields",
  );
  assert.doesNotMatch(
    schemaSource.match(/userEntitlements: defineTable\(\{[\s\S]*?\n  \}\)/)?.[0] ?? "",
    /v\.literal\("stripe"\)/,
    "account entitlement source must not retain deleted Stripe-backed Builder-plan source",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /hasProjectContext:\s*Boolean\(runtimeProjectId\)/,
    "workspace tools should activate from real project context",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /hasCommunityContext:\s*Boolean\(runtimeCommunityId\)/,
    "community tools should activate from backend-validated community context",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /if \(params\.activeCapabilityFamilies\.includes\("web_research"\)\)[\s\S]*toolNames\.push\("web_research", "web_crawl"\)/,
    "web research and crawl should be exposed by capability family, not product tier",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /if \(params\.activeCapabilityFamilies\.includes\("workspace_tools"\)\)[\s\S]*"terminal_start"[\s\S]*"terminal_stop"/,
    "workspace tools should be exposed by capability family, not product tier",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /if \(params\.activeCapabilityFamilies\.includes\("community_tools"\)\)[\s\S]*"get_active_community_context"[\s\S]*"community_resources_map"[\s\S]*"community_resources_read"[\s\S]*"community_resources_list"[\s\S]*"community_resource_read"[\s\S]*"community_resources_search"[\s\S]*"community_search"[\s\S]*"community_write"/,
    "community tools should be exposed by capability family, not product tier",
  );
  assert.match(
    communityAgentSource,
    /requireCommunityChatAccess/,
    "community prompt context must remain backend access validated",
  );
  assert.match(
    runtimeHarnessCompositionSource,
    /personalSkillRuntimeState[\s\S]*activeCommunityModule[\s\S]*systemPromptSuffix/,
    "platform harness prompt suffix should compose personal and community skills through one harness path",
  );
  assert.doesNotMatch(
    voiceControllerSource,
    /normalizedBuilderTier/,
    "voice controller should not receive unused tier props",
  );

  assert.match(runtimeAgentLoopSource, /tool_kind:\s*"web_research"[\s\S]*required_credits:/);
  assert.match(runtimeAgentLoopSource, /tool_kind:\s*"workspace_tools"/);
  assert.match(httpVoiceSource, /tool_kind:\s*"voice_input"[\s\S]*required_credits:/);
  assert.match(authCoreSource, /class VoiceTranscriptionRequestError[\s\S]*toolKind[\s\S]*requiredCredits/);
  assert.match(
    appSource,
    /toolKind:\s*details\?\.toolKind\s*\?\?\s*"voice_input"[\s\S]*requiredCredits:\s*details\?\.requiredCredits\s*\?\?\s*null/,
    "voice balance failures should open the top-up modal with paid-tool metadata",
  );
}

async function proveDocsContract() {
  const promptContextDoc = await readRepoFile("docs/product/reference/prompt-context-model.md");
  const contextModelDoc = await readRepoFile("docs/product/reference/context-model.md");
  const accessMatrixDoc = await readRepoFile("docs/auth-money-access-matrix.md");
  const packageJson = await readRepoFile("package.json");

  assert.match(promptContextDoc, /There is one platform harness prompt stack/);
  assert.match(promptContextDoc, /Free and internal architect labels must not select different prompt stacks/);
  assert.match(promptContextDoc, /Tool balance is enforced when a paid tool executes/);
  assert.match(contextModelDoc, /There is no free-vs-architect context branch/);
  assert.match(accessMatrixDoc, /Prompt injection is not tiered/);
  assert.match(accessMatrixDoc, /Tool balance must not hide paid tools from the harness/);
  assert.match(
    packageJson,
    /"check:platform-harness-prompt-contract": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/platform_harness_prompt_contract_proof\.ts"/,
    "platform harness prompt contract proof should be wired into package scripts",
  );
}

proveCapabilityContract();
provePromptEntrypoints();
await proveSourceContract();
await proveDocsContract();

console.log("platform_harness_prompt_contract_proof: ok");
