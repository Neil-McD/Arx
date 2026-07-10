import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const onboardingLifecycle = read("convex/onboardingLifecycle.ts");
const lifecycleActivations = read("convex/agentLifecycleActivations.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const runtimeTurnResolution = read("convex/runtimeTurnResolution.ts");
const app = read("apps/web/src/App.tsx");
const bridgeCard = read("apps/web/src/components/WebCommunityBridgeCard.tsx");
const workspaceLandingProjection = read("apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx");
const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
const mainSurfaceHost = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const handoffPage = read("apps/web/src/components/WebOnboardingHandoffPage.tsx");
const baseCss = read("apps/web/src/base.css");
const gateway = read("shared/cloudOnboardingGuideGateway.ts");
const webTurnRunner = read("shared/useWebTurnRunnerController.ts");
const webTurnRunnerCore = read("shared/webTurnRunnerCore.ts");
const platformSkill = read("convex/platformSkillRuntime.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const nativeToolProtocol = read("shared/nativeToolProtocol.ts");
const chatgptTransport = read("convex/chatgptResponsesTransport.ts");
const openAiTransport = read("convex/openAiNativeToolCompletion.ts");
const openRouterTransport = read("convex/openRouterNativeTransport.ts");
const contract = read("docs/skill-harness-contract.md");
const completeBridgeAndEnterBody =
  app.match(
    /async function completeBridgeAndEnter[\s\S]*?\n  async function saveOnboardingProfile/,
  )?.[0] ?? "";
const approvalPendingBridgeBranch =
  completeBridgeAndEnterBody.match(/if \(approvalPending\) \{[\s\S]*?return true;\n    \}/)?.[0] ?? "";

assert.match(
  onboardingLifecycle,
  /export const requestOnboardingGuideKickoff = action/,
  "onboarding guide kickoff must be a backend action",
);
assert.match(
  onboardingLifecycle,
  /ensurePlatformHomeCommunityMembership/,
  "platform bridge kickoff must resolve the default Polynet community lens",
);
assert.match(
  onboardingLifecycle,
  /requireCommunityChatAccess/,
  "community bridge kickoff must validate member access before using a lens",
);
assert.match(
  onboardingLifecycle,
  /ONBOARDING_THREAD_KEY_PREFIX = "community-onboarding"/,
  "kickoff must use a deterministic community onboarding thread prefix",
);
assert.match(
  onboardingLifecycle,
  /ONBOARDING_MAX_TOKENS = 4000/,
  "onboarding staging experiment must retain the measured provider-completion ceiling",
);
assert.match(
  onboardingLifecycle,
  /ensureCloudThread/,
  "preparation must create or reuse a normal cloud thread",
);
assert.doesNotMatch(
  onboardingLifecycle,
  /executeChatToolsAgentLoop|resolveAuthenticatedRuntimeTurn|persistRuntimeAssistantMessage|stream:\s*false/,
  "preparation must not invoke or persist a model turn",
);
assert.match(
  onboardingLifecycle,
  /run_required:\s*Boolean\(ensuredActivation\?\.claimable\)/,
  "preparation must return whether the client should start the live runtime turn",
);
assert.match(
  onboardingLifecycle,
  /run_id: ensuredActivation\?\.claimable[\s\S]*?\? null[\s\S]*?: normalizeIdValue\(ensuredActivation\?\.runId\)/,
  "claimable retries must receive a fresh runtime run id",
);
assert.match(
  onboardingLifecycle,
  /buildOnboardingLifecycleSafeUserRequest/,
  "the server lifecycle module must own the safe synthetic request",
);
const safeRequestBody =
  onboardingLifecycle.match(
    /function buildOnboardingLifecycleSafeUserRequest[\s\S]*?\n}\n\nexport function buildOnboardingPrivateLifecycleContext/,
  )?.[0] ?? "";
assert.doesNotMatch(
  safeRequestBody,
  /PRIVATE_MEMBER_CONTEXT|PRIVATE_COMMUNITY_MEMBER_CONTEXT/,
  "safe lifecycle user request must not contain private ontology markdown",
);
assert.match(
  safeRequestBody,
  /call get_active_community_context[\s\S]*community_resources_map[\s\S]*search_product_docs/,
  "onboarding opener must perform bounded read-only orientation calls before answering",
);
assert.match(
  safeRequestBody,
  /Do not call member_profile_confirm_facts, community_write, workspace, web, computer, MCP, paid, or premium tools/,
  "onboarding opener must stay on the free-safe read-only tool surface",
);
assert.match(
  safeRequestBody,
  /Do not mention account plan, billing, Premium, upgrades, unavailable tools, or provider limits/,
  "onboarding opener must not introduce billing or upgrade friction",
);
assert.match(
  runtimeTurnHandlers,
  /resolveOnboardingLifecycleCandidate/,
  "normal runtime handling must recognize backend-authorized onboarding lifecycle turns",
);
assert.doesNotMatch(
  runtimeTurnResolution,
  /onboarding[\s\S]{0,300}no_user_message|no_user_message[\s\S]{0,300}onboarding/i,
  "normal runtime resolution must not gain an onboarding-specific no-user-message carve-out",
);
assert.match(
  runtimeTurnResolution,
  /conversationMessages\.length === 0[\s\S]*code: "no_user_message"/,
  "ordinary message-less runtime turns must continue to fail closed",
);
assert.match(
  runtimeTurnHandlers,
  /messages:\s*\[\{[\s\S]*role: "user",[\s\S]*content: buildOnboardingLifecycleSafeUserRequest/,
  "the lifecycle lane must synthesize only the safe server-owned request before resolution",
);
assert.match(
  runtimeTurnHandlers,
  /runtime_engine:\s*"polynet"[\s\S]*requested_agentic_tools:\s*true[\s\S]*stream:\s*true/,
  "the onboarding lifecycle lane must force the existing streaming agentic runtime",
);
assert.match(
  runtimeTurnHandlers,
  /persistVisibleUserMessage = onboardingLifecycleRun === null/,
  "the lifecycle lane must not persist its synthetic user request",
);
assert.match(
  runtimeTurnHandlers,
  /skillLifecycleTrigger: onboardingLifecycleRun[\s\S]*?"onboarding_completed"/,
  "the normal runtime loop must select the onboarding guide from lifecycle evidence",
);
assert.match(
  runtimeTurnHandlers,
  /privateLifecycleContextMd:\s*onboardingLifecycleRun\?\.privateLifecycleContextMd/,
  "private member context must enter through the runtime's private lifecycle channel",
);
assert.match(
  runtimeTurnHandlers,
  /latestUserText = onboardingLifecycleRun[\s\S]*ONBOARDING_LIFECYCLE_AUDIT_LABEL/,
  "runtime metadata must use the lifecycle audit label instead of the synthetic request",
);
assert.match(
  runtimeTurnHandlers,
  /finishOnboardingActivationBestEffort[\s\S]*completeOnboardingCompletedAgentLifecycleActivationInternal[\s\S]*failOnboardingCompletedAgentLifecycleActivationInternal/,
  "the runtime must complete or fail every claimed onboarding activation",
);

assert.match(
  runtimeAgentLoop,
  /privateLifecycleContextMd\?: string \| null/,
  "runtime loop must expose a private lifecycle context channel",
);
assert.match(
  runtimeAgentLoop,
  /lifecycleAuditLabel\?: string \| null/,
  "runtime loop must expose a lifecycle audit label override",
);
assert.match(
  runtimeAgentLoop,
  /PRIVATE_LIFECYCLE_CONTEXT/,
  "private lifecycle context must be injected only as server-side prompt orientation",
);
assert.match(
  runtimeAgentLoop,
  /private_lifecycle_context/,
  "prompt receipt must include private lifecycle context section evidence without dumping content",
);
assert.match(
  runtimeAgentLoop,
  /member_profile_confirm_facts[\s\S]*memberOntology\.confirmMemberInterviewFacts/,
  "selected onboarding guide must be able to write confirmed interview facts through the ontology confirmation tool",
);

assert.match(
  lifecycleActivations,
  /ensureCommunityOnboardingCompletedAgentLifecycleActivation/,
  "activation ledger must support community-scoped onboarding activations",
);
assert.match(
  lifecycleActivations,
  /getCommunityOnboardingActivationInternal/,
  "runtime admission must inspect the server-owned activation before synthesizing a turn",
);
assert.match(
  lifecycleActivations,
  /claimOnboardingCompletedAgentLifecycleActivationInternal/,
  "activation ledger must claim before running",
);
assert.match(
  lifecycleActivations,
  /completeOnboardingCompletedAgentLifecycleActivationInternal/,
  "activation ledger must mark completed after persistence",
);
assert.match(
  lifecycleActivations,
  /failOnboardingCompletedAgentLifecycleActivationInternal/,
  "activation ledger must preserve failed kickoff evidence",
);

assert.match(
  gateway,
  /client\.action\("onboardingLifecycle:requestOnboardingGuideKickoff"/,
  "web gateway must call the kickoff action directly",
);
assert.match(
  app,
  /requestOnboardingGuideAfterBridge/,
  "bridge must have a best-effort onboarding guide handoff",
);
assert.match(
  app,
  /completePlatformBridge[\s\S]*finishOnboarding\(\{ navigate: false \}\)[\s\S]*await requestOnboardingGuideAfterBridge\(\)/,
  "platform bridge completion must start the guide handoff after account setup completes",
);
assert.match(
  app,
  /flushSync\(\(\) => \{[\s\S]*setOnboardingGuidePending[\s\S]*setActiveThreadId\(null\)[\s\S]*setWorkspaceWantsNewChatMode\(true\)[\s\S]*\}\);[\s\S]*navigateTo\(routePath\)[\s\S]*await requestOnboardingGuideKickoff/,
  "guide handoff must commit the visible launch shell before navigating and waiting on the backend action",
);
assert.match(
  app,
  /run_required[\s\S]*runAgentTurn\(activeSession, threadId,[\s\S]*onStreamStart:/,
  "bridge handoff must enter the thread and start the lifecycle turn through the normal client runner",
);
assert.doesNotMatch(
  app,
  /getOnboardingGuideLaunchDelayMs|ONBOARDING_GUIDE_MIN_LAUNCH_MS/,
  "bridge handoff must not use a timer as a substitute for runtime readiness",
);
assert.match(
  webTurnRunnerCore,
  /onStreamStart\?:/,
  "the existing runtime runner contract must expose the real stream-start boundary",
);
assert.match(
  webTurnRunner,
  /eventName === "start"[\s\S]*params\.onStreamStart\?\./,
  "the transition shell must clear from the first real SSE start event",
);
assert.match(
  app,
  /shellProjectionActivePage = onboardingGuidePending \? "onboarding" : activePage[\s\S]*activePage: shellProjectionActivePage/,
  "guide handoff must suppress workspace shell chrome by projecting as onboarding while pending",
);
assert.match(
  app,
  /completeBridgeAndEnter[\s\S]*requestOnboardingGuideAfterBridge\(\{[\s\S]*communityId: guideTarget\.communityId/,
  "community bridge completion must trigger the guide handoff with the active community",
);
assert.match(
  completeBridgeAndEnterBody,
  /if \(approvalPending\) \{[\s\S]*setBridgePendingEntry\(null\);[\s\S]*return true;[\s\S]*\}[\s\S]*requestOnboardingGuideAfterBridge/,
  "approval-pending community bridge completion must stop before guide handoff",
);
assert.doesNotMatch(
  approvalPendingBridgeBranch,
  /requestOnboardingGuideAfterBridge|enterJoinedCommunity|handlePublicLandingPrimaryAction/,
  "approval-pending community bridge completion must not start a guide or enter community chat",
);
assert.match(
  bridgeCard,
  /\{isPlatform \? null : \([\s\S]*<div className="cfg-gav">[\s\S]*<div className="cfg-gname">/,
  "generic platform bridge must not repeat the community masthead inside the card",
);
assert.match(
  bridgeCard,
  /cvs-bridge-platform/,
  "platform bridge card must retain a distinct styling hook",
);
assert.match(
  mainSurfaceHost,
  /onboardingHandoffPageProps[\s\S]*community-mode[\s\S]*<WebOnboardingHandoffPage/,
  "main surface must render the bridge handoff as a first-class screen",
);
assert.match(
  handoffPage,
  /Your Polynet agent is getting oriented[\s\S]*Your agent is getting oriented to \$\{targetName\}[\s\S]*Try again/,
  "handoff page must present the member-language launch shell and retry",
);
assert.doesNotMatch(
  handoffPage,
  /Step 2|Onboarding into|Profile saved|lens selected|Starting your guide/,
  "handoff page must not regress into the heavy checklist flow",
);
assert.match(
  handoffPage,
  /failedMessage = "We could not start your guide yet\. Try again in a moment\."/,
  "handoff failure UI must use stable user-facing copy",
);
assert.doesNotMatch(
  handoffPage,
  /\{props\.error \|\||\{props\.error\}/,
  "handoff failure UI must not render raw backend error strings",
);
assert.doesNotMatch(
  workspaceLandingProjection,
  /web-empty-thread-guide-pending|emptyThreadGuidePending/,
  "workspace landing projection must not own the onboarding handoff UI",
);
assert.doesNotMatch(
  workspaceHost,
  /isOnboardingGuidePending|emptyThreadGuidePending|Starting your guide/,
  "workspace host must not render the onboarding handoff above the composer",
);
assert.doesNotMatch(
  baseCss,
  /web-empty-thread-guide/,
  "legacy composer-adjacent onboarding guide strip CSS must stay deleted",
);
assert.match(
  baseCss,
  /polynet-onboarding-launch-shell[\s\S]*onboardingLaunchMeter/,
  "handoff CSS must use the compact launch shell and subtle meter",
);
assert.doesNotMatch(
  baseCss,
  /polynet-onboarding-handoff-card|polynet-onboarding-handoff-steps|onboardingHandoffDot|onboardingHandoffPulse/,
  "handoff CSS must not keep the deleted checklist styling hooks",
);

assert.match(
  platformSkill,
  /thoughtful human host/,
  "onboarding skill must use the human-host interaction model",
);
assert.match(
  platformSkill,
  /Private context:[\s\S]*Do not quote, dump, expose/,
  "onboarding skill must keep profile ontology context private",
);
assert.match(
  platformSkill,
  /social links[\s\S]*interview/,
  "onboarding skill must prefer attached social context and fall back to interview",
);
assert.match(
  platformSkill,
  /First response shape:[\s\S]*at most 4 short paragraphs[\s\S]*exactly one plain question/,
  "onboarding skill must produce a brief evidence-grounded opener ending in one question",
);
assert.match(
  platformSkill,
  /Ground the member in one short clause[\s\S]*Do not introduce yourself by name[\s\S]*never describe yourself as a thread, a product, or an AI system/,
  "onboarding skill must ground identity in one clause without a named self-introduction",
);
assert.match(
  platformSkill,
  /you are THEIR agent[\s\S]*not the community's agent/,
  "onboarding opener identity is the member's own agent — communities have separate agents on community surfaces",
);
assert.match(
  platformSkill,
  /Originality:[\s\S]*do not use a stock welcome opener[\s\S]*Start from one concrete observation supported by this run's fetched context/,
  "onboarding skill must derive its opener from fetched context instead of a prompt exemplar",
);
assert.doesNotMatch(
  platformSkill,
  /Example register|Second example register/,
  "onboarding skill must not carry prose exemplars that can be copied into the response",
);
assert.match(
  platformSkill,
  /Conversation law:[\s\S]*every turn must deliver one concrete useful thing[\s\S]*Never ask hypotheticals about what 'would be useful.'/,
  "onboarding must lead with concrete member value and ask grounded questions",
);
assert.match(
  platformSkill,
  /enforce all of it silently/,
  "onboarding boundaries must live in behavior rather than the response",
);
assert.doesNotMatch(
  platformSkill,
  /Mention once, plainly|State that profile memory/,
  "onboarding must not mandate self-disclosure of its memory policy",
);
assert.doesNotMatch(
  platformSkill,
  /would make this community useful/,
  "onboarding questions must be concrete rather than product-evaluation hypotheticals",
);
assert.doesNotMatch(
  safeRequestBody,
  /State that profile memory|would make this community useful/,
  "the lifecycle request must not reintroduce policy narration or hypothetical questions",
);
assert.match(
  platformSkill,
  /Evidence rule:[\s\S]*must trace to a tool result from this run, the private orientation context, or the active community lens/,
  "onboarding skill must ground every opener claim in fetched or injected evidence",
);
assert.doesNotMatch(
  platformSkill,
  /say who you are|240-360 words|5-7 short paragraphs/,
  "onboarding skill must not retain the essay-length self-introducing opener spec",
);
assert.match(
  platformSkill,
  /Attached social links alone are leads, not proof[\s\S]*Never claim you researched a profile unless a real research tool result supports it/,
  "onboarding skill must not fabricate social research from attached links",
);
assert.match(
  onboardingLifecycle,
  /Write the first assistant message only, following your onboarding-guide skill instructions[\s\S]*Do not claim external\/social research unless a real research tool result/,
  "onboarding lifecycle request must defer opener shape and voice to the single skill spec",
);
assert.match(
  platformSkill,
  /Billing boundary: never mention the member's account plan, billing, Premium/,
  "onboarding skill must keep billing and entitlement talk out of onboarding",
);
assert.match(
  platformSkill,
  /member_profile_confirm_facts[\s\S]*Do not silently store guesses/,
  "onboarding skill must treat ontology writes as explicit confirmed profile memory",
);
assert.match(
  runtimeAgentLoop,
  /buildRequiredLifecycleToolSequence[\s\S]*onboarding_completed[\s\S]*get_active_community_context[\s\S]*search_product_docs[\s\S]*community_resources_map/,
  "onboarding runtime must choose the two orientation reads deterministically by lens",
);
assert.match(
  runtimeAgentLoop,
  /providerToolChoice[\s\S]*type: "function", name: requiredToolName[\s\S]*: "none"[\s\S]*toolChoice: providerToolChoice/,
  "onboarding runtime must force each required read and then force the final answer",
);
assert.match(
  runtimeAgentLoop,
  /onboarding_required_tool_unavailable[\s\S]*onboarding_required_tool_not_called[\s\S]*onboarding_unexpected_tool_call/,
  "onboarding runtime must fail closed when its forced tool protocol cannot be honored",
);
assert.match(
  nativeToolProtocol,
  /NativeToolChoice[\s\S]*"auto"[\s\S]*"none"[\s\S]*type: "function"[\s\S]*name: TToolName/,
  "native tool protocol must define a provider-neutral named tool choice",
);
assert.match(
  chatgptTransport,
  /toolChoice\??:[\s\S]*requestBody\.tool_choice = params\.toolChoice \?\? "auto"/,
  "ChatGPT native transport must project the runtime tool choice",
);
assert.match(
  openAiTransport,
  /toolChoice\??:[\s\S]*tool_choice: params\.toolChoice \?\? "auto"/,
  "OpenAI native transport must project the runtime tool choice",
);
assert.match(
  openRouterTransport,
  /toolChoice\??:[\s\S]*tool_choice: buildOpenRouterToolChoice\(params\.toolChoice\)/,
  "OpenRouter native transport must project the runtime tool choice",
);

assert.match(
  contract,
  /deterministic normal cloud thread/,
  "skill harness contract must document the normal-thread handoff",
);
assert.match(
  contract,
  /member_profile_confirm_facts[\s\S]*stated_interview/,
  "skill harness contract must document the narrow onboarding profile write tool",
);
assert.match(
  contract,
  /private lifecycle context/,
  "skill harness contract must document the private lifecycle context boundary",
);
assert.match(
  contract,
  /forces the orientation protocol:[\s\S]*get_active_community_context[\s\S]*search_product_docs[\s\S]*community_resources_map[\s\S]*compact handoff screen[\s\S]*evidence-grounded orientation[\s\S]*active thread\/community lens[\s\S]*profile-memory boundary[\s\S]*one-clause agent grounding instead of a named[\s\S]*self-introduction/,
  "skill harness contract must document the deterministic bridge-to-agent handoff screen",
);

console.log("onboarding_lifecycle_kickoff_contract_proof: ok");
