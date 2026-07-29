import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  AUTHENTICATED_FREE_PLATFORM_CAPABILITIES,
  PREMIUM_PLATFORM_CAPABILITIES,
  resolveActiveCapabilityFamiliesFromEntitlements,
  resolveEntitledCapabilityFamiliesForGate,
  resolveHarnessProfileFromActiveCapabilities,
} from "../shared/canonicalGateEngine.ts";
import {
  buildPlatformHarnessRuntimeSystemPrompt,
  composePlatformChatRuntimeSystemPrompt,
} from "../shared/runtimePrompt.ts";
import {
  RUNTIME_ENGINE_CODEX,
  RUNTIME_ENGINE_POLYNET,
  canUseRuntimeEngineForTier,
  getRuntimeEngineAccessLevel,
} from "../shared/runtimeEngine.ts";
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
  assert.equal(
    getRuntimeEngineAccessLevel(RUNTIME_ENGINE_POLYNET),
    "included",
    "PolyNet must be the included/free agent runtime",
  );
  assert.equal(
    getRuntimeEngineAccessLevel(RUNTIME_ENGINE_CODEX),
    "premium",
    "Codex must be a premium agent runtime",
  );
  assert.equal(
    canUseRuntimeEngineForTier({ engine: RUNTIME_ENGINE_POLYNET, accountTier: "free" }),
    true,
    "free accounts must be able to use the PolyNet runtime",
  );
  assert.equal(
    canUseRuntimeEngineForTier({ engine: RUNTIME_ENGINE_CODEX, accountTier: "free" }),
    false,
    "free accounts must not be able to use the Codex runtime",
  );
  assert.equal(
    canUseRuntimeEngineForTier({ engine: RUNTIME_ENGINE_CODEX, accountTier: "architect" }),
    true,
    "premium accounts must be able to use the Codex runtime",
  );
  assertSameArray(
    AUTHENTICATED_FREE_PLATFORM_CAPABILITIES,
    [
      "product_docs",
      "community_tools",
    ],
    "authenticated free capability constant should only contain free-safe capability families",
  );
  assertSameArray(
    PREMIUM_PLATFORM_CAPABILITIES,
    [
      "product_docs",
      "community_tools",
      "web_research",
      "sandbox_tools",
      "workspace_tools",
    ],
    "premium platform capability constant should contain the full paid tool entitlement set",
  );
  const freeEntitlement = [...AUTHENTICATED_FREE_PLATFORM_CAPABILITIES];
  const premiumEntitlement = [...PREMIUM_PLATFORM_CAPABILITIES];
  assertSameArray(
    resolveEntitledCapabilityFamiliesForGate({
      authState: "authenticated",
      tier: "free",
    }),
    freeEntitlement,
    "authenticated free should receive only free-safe platform capabilities",
  );
  assertSameArray(
    resolveEntitledCapabilityFamiliesForGate({
      authState: "authenticated",
      tier: "architect",
    }),
    premiumEntitlement,
    "architect should receive the full premium platform capability set",
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
      entitledCapabilityFamilies: freeEntitlement as any,
      hasCommunityContext: false,
      hasProjectContext: false,
    }),
    ["product_docs"],
    "without context, free users should activate product docs only",
  );
  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: freeEntitlement as any,
      hasCommunityContext: true,
      hasProjectContext: false,
    }),
    ["product_docs", "community_tools"],
    "free community tools should activate only with a validated community lens",
  );
  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: freeEntitlement as any,
      hasCommunityContext: false,
      hasProjectContext: true,
    }),
    ["product_docs"],
    "project context must not grant free users premium workspace tools",
  );
  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: premiumEntitlement as any,
      hasCommunityContext: false,
      hasProjectContext: false,
    }),
    ["product_docs", "web_research", "sandbox_tools"],
    "premium users should receive global web and sandbox tools outside project context",
  );
  assertSameArray(
    resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: premiumEntitlement as any,
      hasCommunityContext: true,
      hasProjectContext: true,
    }),
    premiumEntitlement,
    "premium community plus project context should activate the full platform harness set",
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
      activeCapabilityFamilies: premiumEntitlement as any,
    }),
    "authenticated_cloud_tools",
    "authenticated tool runs should use the unified platform tool harness",
  );
}

function provePromptEntrypoints() {
  const runtimeTurnContext = buildRuntimeTurnContextPacket({
    projectContext: {
      label: "Unified project",
      description: "Project context activates workspace tools.",
      instructions: "Use project context when answering project-scoped work.",
      links: [{ title: "Spec", url: "https://example.com/spec" }],
    },
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
      "polynet_list",
      "polynet_read",
      "community_resources_read",
      "community_resources_search",
      "community_search",
      "community_memory_search",
      "community_memory_read",
      "community_write",
      "web_research",
      "web_crawl",
      "read",
      "write",
      "bash",
    ],
    accountPlan: "premium",
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
  assert.match(platformHarnessPrompt, /PROJECT_CONTEXT/);
  assert.match(platformHarnessPrompt, /PROJECT_INSTRUCTIONS/);
  assert.match(platformHarnessPrompt, /Use project context when answering project-scoped work/);
  assert.match(platformHarnessPrompt, /Spec: https:\/\/example\.com\/spec/);
  assert.match(platformHarnessPrompt, /AGENT_OPERATING_POLICY/);
  assert.match(platformHarnessPrompt, /THREAD_WORKING_STATE/);
  assert.match(platformHarnessPrompt, /TEMPORAL_CONTEXT/);
  assert.match(platformHarnessPrompt, /Allowed tools: search_product_docs,get_product_doc,polynet_list,polynet_read,community_resources_read,community_resources_search,community_search,community_memory_search,community_memory_read,community_write,web_research,web_crawl,read,write,bash/);
  assert.match(platformHarnessPrompt, /Account plan: Premium/);
  assert.match(platformHarnessPrompt, /Premium tools are still limited to the listed allowed tools/);
  assert.match(platformHarnessPrompt, /Use web_research for current external facts/);
  assert.match(platformHarnessPrompt, /Use web_crawl when the user provides a site, wiki, docs, course, or multi-page URL/);
  assert.match(platformHarnessPrompt, /Use polynet_list with path \/ to inspect the platform repository root/);
  assert.match(platformHarnessPrompt, /Use polynet_list with path \/communities\/ to list communities the signed-in member can currently access/);
  assert.match(platformHarnessPrompt, /Use polynet_read with path \/communities\/unified-community\/community\.md when the answer depends on the active community's full identity/);
  assert.match(platformHarnessPrompt, /use the semantic polynet_list\/polynet_read path before product documentation tools/);
  assert.match(platformHarnessPrompt, /community_resources_read only when a justified batch read/);
  assert.doesNotMatch(
    platformHarnessPrompt,
    /community_resource_builder_read with target_type and an exact id copied from list output/,
    "member/read prompt fixture must not include builder resource edit guidance",
  );
  assert.match(platformHarnessPrompt, /Use community_memory_search and community_memory_read when the answer depends on what the community has learned and accepted/);
  assert.match(platformHarnessPrompt, /Use community_search for broad raw recent community activity evidence/);
  assert.match(platformHarnessPrompt, /Use read to inspect specific files/);
  assert.doesNotMatch(
    platformHarnessPrompt,
    /\bfree tier\b|\bbuilder tier\b|\bpro tier\b|builder_tier|canonicalTier|effectiveTier/i,
    "runtime prompt output must not describe a tier-specific prompt stack",
  );

  const freeHarnessPrompt = buildPlatformHarnessRuntimeSystemPrompt({
    loopBudget: {
      maxToolSteps: 8,
      maxRepeatedIdenticalCalls: 2,
      maxConsecutiveFailures: 3,
      maxNoProgressSteps: 3,
    },
    allowedToolNames: ["search_product_docs", "get_product_doc"],
    accountPlan: "free",
    harnessName: "chat_tools",
    runtimeTurnContext,
    currentDateTimeIso: "2026-05-07T12:00:00.000Z",
    currentDateLabel: "Thursday, May 7, 2026 at 8:00:00 AM EDT",
    currentTimeZone: "America/New_York",
  });
  assert.match(freeHarnessPrompt, /Account plan: Free/);
  assert.match(freeHarnessPrompt, /Premium-only tools not available in this run/);
  assert.match(freeHarnessPrompt, /requires Polynet Premium and direct them to Billing to upgrade/);
  assert.doesNotMatch(freeHarnessPrompt, /Allowed tools: .*write/);

  const builderHarnessPrompt = buildPlatformHarnessRuntimeSystemPrompt({
    loopBudget: {
      maxToolSteps: 8,
      maxRepeatedIdenticalCalls: 2,
      maxConsecutiveFailures: 3,
      maxNoProgressSteps: 3,
    },
    allowedToolNames: [
      "polynet_list",
      "polynet_read",
      "community_resources_read",
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
    accountPlan: "free",
    currentDateTimeIso: "2026-05-07T12:00:00.000Z",
    currentDateLabel: "Thursday, May 7, 2026 at 8:00:00 AM EDT",
    currentTimeZone: "America/New_York",
  });
  assert.match(platformChatPrompt, /This is a chat-only platform run/);
  assert.match(platformChatPrompt, /Configured agent name: James/);
  assert.match(platformChatPrompt, /No workspace tools are active in this run/);
  assert.match(platformChatPrompt, /Account plan: Free/);
  assert.match(platformChatPrompt, /Workspace app\/file\/shell\/browser tools and live web research\/crawl tools require Premium/);
  assert.match(platformChatPrompt, /requires Polynet Premium and direct them to Billing to upgrade/);
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
  const runtimeEngineSource = await readRepoFile("shared/runtimeEngine.ts");
  const runtimeTurnPersistenceSource = await readRepoFile("convex/runtimeTurnPersistence.ts");
  const runtimeTurnResolutionSource = await readRepoFile("convex/runtimeTurnResolution.ts");
  const polynetCodexWorkerBridgeSource = await readRepoFile("convex/polynetCodexWorkerBridge.ts");
  const threadsSource = await readRepoFile("convex/threads.ts");
  const canonicalGateEngineSource = await readRepoFile("shared/canonicalGateEngine.ts");
  const schemaSource = await readRepoFile("convex/schema.ts");
  const runtimeHarnessCompositionSource = await readRepoFile("convex/runtimeHarnessComposition.ts");
  const communityAgentSource = await readRepoFile("convex/communityAgent.ts");
  const httpVoiceSource = await readRepoFile("convex/httpVoice.ts");
  const paidToolCreditReservationSource = await readRepoFile("convex/paidToolCreditReservation.ts");
  const voiceControllerSource = await readRepoFile("shared/useWebVoiceInputController.ts");
  const messageMetadataUiSource = await readRepoFile("shared/messageMetadataUi.ts");
  const workspaceThreadViewsSource = await readRepoFile("apps/web/src/components/webWorkspaceThreadViews.ts");
  const workspaceThreadMessageListSource = await readRepoFile("apps/web/src/components/WebWorkspaceThreadMessageList.tsx");
  const workspaceHostSource = await readRepoFile("apps/web/src/components/WebWorkspaceHost.tsx");
  const directMessagesHostSource = await readRepoFile("apps/web/src/components/WebDirectMessagesHost.tsx");
  const directMessagePanelSource = await readRepoFile("apps/web/src/components/WebDirectMessagePanel.tsx");
  const freeAccountModalSource = await readRepoFile("shared/FreeAccountIncludedModal.tsx");
  const accountSettingsSectionSource = await readRepoFile("apps/web/src/components/WebAccountSettingsSection.tsx");
  const appSource = await readRepoFile("apps/web/src/App.tsx");
  const webTurnRunnerSource = await readRepoFile("shared/useWebTurnRunnerController.ts");

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
    /buildPlatformHarnessRuntimePromptBundle/,
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
    /export const AUTHENTICATED_FREE_PLATFORM_CAPABILITIES[\s\S]*export const PREMIUM_PLATFORM_CAPABILITIES[\s\S]*effectiveTier === "auth_free"[\s\S]*AUTHENTICATED_FREE_PLATFORM_CAPABILITIES[\s\S]*PREMIUM_PLATFORM_CAPABILITIES/,
    "free and premium capability families must resolve through separate tier-aware entitlement constants",
  );
  assert.match(
    runtimeEngineSource,
    /getRuntimeEngineAccessLevel[\s\S]*RUNTIME_ENGINE_POLYNET \? "included" : "premium"/,
    "shared runtime engine policy must keep PolyNet included and default other runtimes to premium",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /canUseRuntimeEngineForTier[\s\S]*runtime_plan_required[\s\S]*Upgrade in Billing to use Codex and premium agent runtimes/,
    "runtime turn resolution must block free Codex requests before engine execution",
  );
  assert.match(
    polynetCodexWorkerBridgeSource,
    /resolvePolynetRuntimeEngine\([\s\S]*accountPlan\?: RuntimeAccountPlan[\s\S]*runtime_plan_required[\s\S]*resolveExplicitCodexWorkerFailure/,
    "Codex worker resolver must independently enforce premium runtime access",
  );
  assert.match(
    runtimeTurnHandlersSource,
    /resolvePolynetRuntimeEngine\(\{[\s\S]*accountPlan: runtimeAccountPlan[\s\S]*buildPolynetCodexWorkerTurnInputs\(\{[\s\S]*accountPlan: runtimeAccountPlan/,
    "runtime handlers must pass account plan into Codex runtime resolution and prompt projection",
  );
  assert.match(
    runtimeTurnHandlersSource,
    /const runStartArgs: Record<string, unknown> = \{[\s\S]*capabilityFamilies: resolvedRuntimeCapabilityFamilies,[\s\S]*accountPlan: runtimeAccountPlan,/,
    "runtime turn handlers must include account plan in run-start metadata",
  );
  assert.match(
    threadsSource,
    /ensureCloudRuntimeRunStarted[\s\S]*accountPlan: v\.optional\(v\.union\(v\.literal\("free"\), v\.literal\("premium"\)\)\)[\s\S]*const accountPlan = args\.accountPlan === "premium" \? "premium" : "free"[\s\S]*capabilityFamilies,[\s\S]*accountPlan,/,
    "run-start mutation must validate, normalize, and persist account plan metadata",
  );
  assert.match(
    schemaSource,
    /runtimeRuns: defineTable\(\{[\s\S]*capabilityFamilies: v\.optional\(v\.array\(v\.string\(\)\)\),[\s\S]*accountPlan: v\.optional\(v\.union\(v\.literal\("free"\), v\.literal\("premium"\)\)\)/,
    "runtime run schema must persist account plan metadata used by prompt and tool policy",
  );
  assert.doesNotMatch(
    runtimeTurnPersistenceSource,
    /buildPremiumUpgradeCtaForAssistantMessage|content\.includes\("premium"\)|premium_upgrade_cta/,
    "assistant message persistence must not infer billing UI from model-written prose",
  );
  assert.match(
    webTurnRunnerSource,
    /eventName === "error"[\s\S]*classifyCloudFunctionErrorCategory[\s\S]*setInferenceIssueModal/,
    "billing UI must come from structured runtime error evidence",
  );
  assert.match(
    messageMetadataUiSource,
    /export type PremiumUpgradeCta[\s\S]*parsePremiumUpgradeCta[\s\S]*premium_upgrade_cta[\s\S]*premium_tools_required[\s\S]*open_billing/,
    "web metadata parser should accept the durable premium upgrade CTA shape",
  );
  assert.match(
    workspaceThreadViewsSource,
    /PremiumUpgradeCta[\s\S]*premiumUpgradeCta: PremiumUpgradeCta \| null/,
    "workspace message view model should include premium upgrade CTA metadata",
  );
  assert.match(
    workspaceThreadMessageListSource,
    /message\.premiumUpgradeCta[\s\S]*message-premium-upgrade-cta[\s\S]*onOpenPremiumBilling/,
    "workspace message list should render premium upgrade CTA with the Billing action",
  );
  assert.match(
    workspaceHostSource,
    /onOpenPremiumBilling[\s\S]*<WebWorkspaceThreadMessageList[\s\S]*onOpenPremiumBilling=\{props\.onOpenPremiumBilling\}/,
    "workspace host should thread the premium Billing action into assistant messages",
  );
  assert.match(
    workspaceHostSource,
    /WorkspaceRuntimeEngineSelector[\s\S]*getRuntimeEngineAccessLevel[\s\S]*Included[\s\S]*Premium[\s\S]*onOpenPremiumBilling/,
    "workspace runtime picker should show included/premium runtime labels and route premium selection to Billing",
  );
  assert.match(
    appSource,
    /handleWorkspaceRuntimeEngineChange[\s\S]*canUseRuntimeEngineForTier[\s\S]*openPremiumBilling[\s\S]*updateThreadRuntimeEngine/,
    "app shell must not commit premium runtime selection for accounts without runtime access",
  );
  assert.match(
    appSource,
    /const openPremiumBilling = \(\) => openGlobalSettings\("billing"\)/,
    "premium actions must route to the first-class global Billing surface",
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
    /if \(params\.activeCapabilityFamilies\.includes\("sandbox_tools"\)\)[\s\S]*SANDBOX_FILE_SHELL_TOOL_NAMES[\s\S]*SANDBOX_PREVIEW_TOOL_NAMES/,
    "sandbox file, shell, and preview start/stop tools should be exposed by authenticated sandbox capability",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /if \(params\.activeCapabilityFamilies\.includes\("workspace_tools"\)\)[\s\S]*PROJECT_WORKSPACE_TERMINAL_TOOL_NAMES/,
    "project workspace tools should expose terminal controls by capability family, not product tier",
  );
  assert.match(
    runtimeTurnResolutionSource,
    /if \(params\.activeCapabilityFamilies\.includes\("community_tools"\)\)[\s\S]*"polynet_list"[\s\S]*"polynet_read"[\s\S]*"community_resources_read"[\s\S]*"community_resources_search"[\s\S]*"community_search"[\s\S]*"community_write"/,
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
  assert.match(
    voiceControllerSource,
    /export type VoiceSurface = "workspace" \| "community" \| "direct_message"/,
    "voice input should share one surface contract across workspace, community chat, and DMs",
  );
  assert.match(
    voiceControllerSource,
    /directMessageVoiceIntent[\s\S]*directMessageVoiceUiState[\s\S]*cancelVoiceInput/,
    "voice controller should expose DM intent/state and cleanup without duplicating recorder logic",
  );
  assert.match(
    voiceControllerSource,
    /getBrowserSpeechRecognitionConstructor[\s\S]*SpeechRecognition[\s\S]*webkitSpeechRecognition[\s\S]*continuous = true[\s\S]*interimResults = true/,
    "voice controller should use browser speech recognition for free voice input",
  );
  assert.match(
    voiceControllerSource,
    /(?=[\s\S]*Listening\.\.\. tap mic again when you're done\.)(?=[\s\S]*Stop voice input\.)(?=[\s\S]*Transcript inserted\.)/,
    "voice controller should be a manual click-on/click-off flow",
  );
  assert.doesNotMatch(
    voiceControllerSource,
    /transcribeVoice|VoiceTranscriptionRequestError|onToolBalanceRequired|VoiceToolBalanceDetails|tool balance|Add balance|voice_transcribe/,
    "voice controller must not route browser voice input through paid transcription or balance UX",
  );
  assert.match(
    httpVoiceSource,
    /surface !== "workspace" && surface !== "community" && surface !== "direct_message"/,
    "voice route should accept direct_message as first-party surface metadata",
  );
  assert.match(
    directMessagesHostSource,
    /useWebVoiceInputController<SessionT>[\s\S]*appendDirectMessageTranscript[\s\S]*handleDirectMessageVoiceInputClick\("direct_message"\)/,
    "DM composer should reuse the shared voice input controller",
  );
  assert.match(
    directMessagesHostSource,
    /pendingVoiceTranscriptConversationIdRef[\s\S]*previous\.conversation\.id !== targetConversationId[\s\S]*pendingVoiceTranscriptConversationIdRef\.current = directMessagePanel\.conversation\.id/,
    "DM voice transcripts should stay bound to the conversation that started capture",
  );
  assert.match(
    directMessagePanelSource,
    /VoiceInputButton[\s\S]*voiceButtonProps[\s\S]*<VoiceInputButton \{\.\.\.props\.voiceButtonProps\}/,
    "DM composer should render the shared voice input button",
  );

  assert.match(runtimeAgentLoopSource, /toolKind:\s*"web_research"[\s\S]*toolName:\s*"web_research"/);
  assert.match(
    paidToolCreditReservationSource,
    /tool_kind:\s*params\.toolKind[\s\S]*required_credits:\s*params\.requiredCredits/,
  );
  assert.match(runtimeAgentLoopSource, /tool_kind:\s*"workspace_tools"/);
  assert.doesNotMatch(
    appSource,
    /onToolBalanceRequired|onVoiceToolBalanceRequired|toolKind:\s*details\?\.toolKind\s*\?\?\s*"voice_input"/,
    "voice input must not open top-up or Billing from the browser UI",
  );
  assert.doesNotMatch(
    directMessagesHostSource,
    /onVoiceToolBalanceRequired|onToolBalanceRequired|Add balance to use voice input/,
    "DM voice input must not route paid-tool balance failures",
  );
  assert.doesNotMatch(
    `${freeAccountModalSource}\n${accountSettingsSectionSource}`,
    /tool balance[^"\n]*voice input|voice input[^"\n]*tool balance/i,
    "account billing copy must not describe voice input as tool-balance usage",
  );
}

async function proveDocsContract() {
  const promptContextDoc = await readRepoFile("docs/product/reference/prompt-context-model.md");
  const contextModelDoc = await readRepoFile("docs/product/reference/context-model.md");
  const accessMatrixDoc = await readRepoFile("docs/auth-money-access-matrix.md");
  const packageJson = await readRepoFile("package.json");

  assert.match(promptContextDoc, /There is one platform harness prompt stack/);
  assert.match(promptContextDoc, /Free and Polynet Premium labels must not select different prompt stacks/);
  assert.match(promptContextDoc, /Premium entitlement is enforced before premium tools are exposed or executed/);
  assert.match(contextModelDoc, /There is no free-vs-premium context branch/);
  assert.match(accessMatrixDoc, /Prompt injection is not tiered/);
  assert.match(accessMatrixDoc, /premium tools require Premium entitlement/i);
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
