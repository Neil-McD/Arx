// A person's private talk with the guide: what the guide is given (the card,
// handbook, memory.md, personal memory, the turn contract, the conversation
// within its budget), with receipts of each, then the run itself on the one
// run entry (convex/communityAgentRun.ts) under the talk's lens.
import { internal } from "./_generated/api";
import { loadCommunityTurnLayers } from "../shared/communityTurnLayers";
import { buildCommunityTurnContract, checkCommunityTurnToolCall, COMMUNITY_TURN_HISTORY_TURNS, summarizeCommunityTurnContract } from "../shared/communityTurnContract";
import { buildCommunityResourceRuntimeLaneState } from "../shared/communityResourceLane";
import { LENS_FAMILY } from "../shared/lens";
import {
  appendRuntimeToolCallFinished,
  appendRuntimeToolCallStarted,
} from "./runtimeToolCallEvents";
import {
  RUNTIME_RUN_NOT_ACTIVE_CODE,
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  isRuntimeRunInactiveError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCannotContinue,
} from "./runtimeCancellation";
import { type RetrievalToolName } from "../shared/retrievalTools";
import {
  extractTextFromNativeToolMessageContent,
  type NativeToolAwareMessage,
  type NativeToolInputContentPart,
} from "../shared/nativeToolProtocol";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelBudget,
  type RuntimeKernelFailure,
  type RuntimeKernelFailureInput,
  type RuntimeKernelSuccess,
} from "../shared/runtimeKernelTypes";
import {
  buildResponsesApiFunctionTools,
} from "../shared/toolRegistry";
import {
  buildPlatformHarnessRuntimePromptBundle,
  type RuntimeCommunityPromptFields,
  type ThreadWorkingStatePrompt,
} from "../shared/runtimePrompt";
import {
  type RuntimeInvocationSurface,
} from "../shared/runtimeInvocationSurface";
import {
  buildRuntimeTurnEnvelope,
  type RuntimeTurnEnvelopeV1,
} from "../shared/runtimeTurnEnvelope";
import {
  buildRuntimeContextManifest,
} from "../shared/runtimeContextManifest.ts";
import {
  renderCommunityAgentIdentityContext,
  type MemberIdentityContextStatus,
} from "../shared/communityAgentIdentityContext.ts";
import type { CommunityAgentSurfaceContextV1 } from "../shared/communityAgentSurfaceContext.ts";
import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";
import { logStructuredError, summarizeErrorForLog } from "./errorLogging";
import { runAgentTool } from "./agentTools";
import { runFundedCommunityAgent, type CommunityAgentRunRecorder, type CommunityAgentRunUsage } from "./communityAgentRun";
import type { CommunityInferenceFundingSession } from "./founderInferenceRuntime";
import type { CommunityInferenceFundingAdmission } from "../shared/founderInference";
import {
  summarizeToolArgsForLog,
} from "./runtimeHarnessShaping";
import { composeResolvedRuntimeHarness } from "./runtimeHarnessComposition.ts";
import {
  buildRuntimeToolPolicySurface,
} from "../shared/runtimeToolPolicy";
import {
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
  buildRuntimeProviderContextAttestation,
  type RuntimeProviderContextAttestationV1,
} from "../shared/runtimeProviderContextAttestation.ts";
import {
  resolveRuntimeProviderBudgetIdentity,
} from "../shared/runtimeInputBudget.ts";
import {
  COMMUNITY_AGENT_CONTEXT_PAGE_SIZE,
  type CommunityAgentPersistedHistorySeed,
  type CommunityAgentRuntimeHistoryPage,
} from "../shared/communityAgentConversationContext.ts";
import { selectCommunityAgentHistoryForBudget } from "../shared/communityAgentHistorySelection.ts";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string | NativeToolInputContentPart[];
};

function toNativeInferenceMessage(
  message: InferenceMessage,
): NativeToolAwareMessage {
  if (message.role === "user") {
    return { role: "user", content: message.content };
  }
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: extractTextFromNativeToolMessageContent(message.content),
    };
  }
  return {
    role: "system",
    content: extractTextFromNativeToolMessageContent(message.content),
  };
}

type RuntimeAgentLoopSuccess = RuntimeKernelSuccess<string>;
type RuntimeAgentLoopFailure = RuntimeKernelFailure<string>;
type RuntimeAgentLoopFailureInput = RuntimeKernelFailureInput;
// The loop's result, and for a finished run the funding to settle with it.
export type PrivateTalkRunResult = (RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure) & {
  funding: { session: CommunityInferenceFundingSession; usage: CommunityAgentRunUsage } | null;
};
type RuntimeProviderLifecycleHooks = {
  recordInitialProviderContextAttestation?: (
    attestation: RuntimeProviderContextAttestationV1,
  ) => Promise<{ ok: boolean; errorCode?: string | null }>;
  // Output text as the model writes it. completionIndex tells model turns apart:
  // text from a turn that ends in tool calls is a preamble, not the final reply.
  onAssistantTextDelta?: (delta: string, completionIndex: number) => void;
};

// Every turn is founder-funded through OpenAI.
type RuntimeInferenceSource = "platform";
const CHAT_TOOLS_RUNTIME_KERNEL_BUDGET: RuntimeKernelBudget =
  DEFAULT_RUNTIME_KERNEL_BUDGET;
const RUNTIME_PARALLEL_READ_TOOLS_FLAG =
  "RUNTIME_PARALLEL_READ_TOOLS_ENABLED";

function readRuntimeBooleanFlag(name: string, defaultValue: boolean): boolean {
  try {
    const rawValue = (globalThis as any)?.process?.env?.[name];
    if (typeof rawValue !== "string" || !rawValue.trim()) return defaultValue;
    const value = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
  } catch {
    // Convex runtime may not expose process.env; keep the safe default.
  }
  return defaultValue;
}

// The asker's profile timezone when it's a real IANA zone; otherwise UTC.
export function resolveRuntimeTimeZone(value: unknown): string {
  const zone = typeof value === "string" ? value.trim() : "";
  if (!zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0);
    return zone;
  } catch {
    return "UTC";
  }
}

async function executeRetrievalAgentLoop(
  params: RuntimeCommunityPromptFields & RuntimeProviderLifecycleHooks & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
    requestedModelId: string;
    inferenceSource: RuntimeInferenceSource;
    modelRef: string;
    messages: InferenceMessage[];
    persistedConversationHistory?: CommunityAgentPersistedHistorySeed | null;
    maxTokens: number;
    runId: string;
    harnessName: "chat_tools";
    loopBudget: RuntimeKernelBudget;
    allowedToolNames: readonly RetrievalToolName[];
    invocationSurface: RuntimeInvocationSurface;
    communityAgentSurfaceContext?: CommunityAgentSurfaceContextV1 | null;
      communitySystemPrompt?: string | null;
    communityContextVersion?: number | null;
    // The community's funding, admitted when the turn was resolved.
    communityInferenceAdmission: CommunityInferenceFundingAdmission | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    authSubject?: string | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    refreshRuntimeContextSnapshot?: (
      phase?: "started" | "active",
      runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null,
    ) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<PrivateTalkRunResult> {
  const now = new Date();
  // The resources lane follows the talk's lens: builders get the builder
  // lane (and the resources architect); members read live resources.
  const communityResourceLane = buildCommunityResourceRuntimeLaneState(
    !params.communityLens ? "none" : LENS_FAMILY[params.communityLens.lens] === "builder" ? "builder" : "member",
  );
  const resolvedHarness = composeResolvedRuntimeHarness({
    communityResourceLane,
  });
  const effectiveAllowedToolNames = params.allowedToolNames;
  const latestUserContent = [...params.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  const latestUserTextForRuntimeContext =
    extractTextFromNativeToolMessageContent(latestUserContent) ||
    (Array.isArray(latestUserContent) && latestUserContent.some((part) => part.type === "image")
      ? "[Image attached]"
      : null);
  const runtimeTurnEnvelope = buildRuntimeTurnEnvelope({
    latestUserText: latestUserTextForRuntimeContext,
    threadWorkingState: params.threadWorkingState,
    threadId: params.threadId ?? null,
    communityId: params.communityId ?? null,
    communityResourceLane: resolvedHarness.communityResourceLane,
    communityLens: params.communityLens ?? null,
    allowedToolNames: effectiveAllowedToolNames,
    communityAgentSurfaceContext: params.communityAgentSurfaceContext,
  });
  try {
    await params.refreshRuntimeContextSnapshot?.("started", runtimeTurnEnvelope);
  } catch {
    // Best-effort snapshot persistence; the explicit prompt envelope below remains canonical.
  }
  const runtimeTurnContext = (
    await loadRuntimeTurnContextPacketForRun({
      ctx: params.ctx,
      ownerId: params.userId,
      threadId: params.threadId ?? undefined,
      runId: params.runId,
      latestUserText: latestUserTextForRuntimeContext,
      runtimeTurnEnvelope,
      threadWorkingState: params.threadWorkingState,
    })
  ).packet;
  let memberIdentityContextMd: string | null = null;
  let memberIdentityContextStatus: MemberIdentityContextStatus = "not_applicable";
  // A private Ask answers the asker, so "now" is in the asker's own timezone.
  // A community-bound conversation never loads the global profile: UTC there.
  let askerTimeZone: string | null = null;
  const communityConversation = params.communityAgentSurfaceContext?.kind === "community" && params.communityAgentSurfaceContext.community_conversation === true;
  // The turn contract decides what this turn may use: who asked, who sees the
  // answer, and which layers that allows. Recorded on the run for audit.
  const turnContract = params.communityId && params.invocationSurface === "member_agent_dock"
    ? buildCommunityTurnContract({
      surface: communityConversation ? "ask_in_conversation" : "ask",
      communityId: String(params.communityId),
      speakerUserId: String(params.userId),
    })
    : null;
  if (turnContract) {
    try {
      await params.appendRunEvent({
        eventType: "turn_contract",
        eventKey: `${params.runId}:turn_contract:1`,
        payload: { run_id: params.runId, ...summarizeCommunityTurnContract(turnContract) },
      });
    } catch {
      // Best-effort receipt; the prompt bundle receipt records what was injected.
    }
  }
  // A community-bound conversation never loads the asker's global profile.
  if (turnContract?.uses.askerProfile) {
    memberIdentityContextStatus = "empty";
    try {
      const identity = await params.ctx.runQuery(
        internal.profiles.resolveCommunityAgentIdentityContextInternal,
        { userId: params.userId as any },
      );
      askerTimeZone = identity?.timezone ?? null;
      memberIdentityContextMd = renderCommunityAgentIdentityContext(
        identity
          ? {
              displayName: identity.display_name,
              handle: identity.handle,
              bio: identity.bio,
              timezone: identity.timezone,
              socialLinks: identity.social_links,
            }
          : null,
      );
      memberIdentityContextStatus = memberIdentityContextMd ? "loaded" : "empty";
    } catch {
      // Identity context improves personalization but must never block a member turn.
      memberIdentityContextMd = null;
      memberIdentityContextStatus = "error";
    }
  }
  const runtimeTimeZone = resolveRuntimeTimeZone(askerTimeZone);
  const runtimeDateTimeIso = now.toISOString();
  const runtimeDateLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: runtimeTimeZone,
  }).format(now);
  // The community card (community.md) is part of every private Ask, read
  // through the same door and lens as a model-issued polynet_read, so the agent
  // never has to choose to look. Failure never blocks the turn.
  let communityCardMd: string | null = null;
  let communityHandbookMd: string | null = null;
  let communityMemoryMd: string | null = null;
  // Undefined outside a private talk: the personal section isn't drawn at all.
  let personalMemoryMd: string | null | undefined = undefined;
  const communityCardSlug = String(params.communitySlug ?? "").trim();
  if (
    turnContract?.uses.communityCard &&
    params.communityId &&
    communityCardSlug &&
    effectiveAllowedToolNames.includes("polynet_read")
  ) {
    const layerCommunityId = params.communityId;
    const layers = await loadCommunityTurnLayers({
      contract: turnContract,
      communitySlug: communityCardSlug,
      // The member's own private talk: what the guide remembers about them.
      personal: params.invocationSurface === "member_agent_dock",
      read: (path, layer) => runAgentTool({
        ctx: params.ctx,
        userId: params.userId,
        communityId: layerCommunityId,
        authSubject: params.authSubject,
        runId: params.runId,
        toolCallId: `${params.runId}:${layer}`,
        toolName: "polynet_read",
        args: { path },
        evidenceSurface: "member_agent_dock",
        communityBoundConversation: communityConversation,
      }),
    });
    communityCardMd = layers.communityCardMd;
    communityHandbookMd = layers.communityHandbookMd;
    communityMemoryMd = layers.communityMemoryMd;
    if (params.invocationSurface === "member_agent_dock") personalMemoryMd = layers.personalMemoryMd;
    const cardStatus = layers.cardStatus;
    try {
      await params.appendRunEvent({
        eventType: "community_card",
        eventKey: `${params.runId}:community_card:1`,
        payload: { version: 1, run_id: params.runId, status: cardStatus, chars: communityCardMd?.length ?? 0, handbook_chars: communityHandbookMd?.length ?? 0 },
      });
    } catch {
      // Best-effort receipt; the prompt bundle receipt records the injected section.
    }
  }
  const runtimePromptBundle = buildPlatformHarnessRuntimePromptBundle({
    loopBudget: params.loopBudget,
    allowedToolNames: effectiveAllowedToolNames,
    communityResourceLane: resolvedHarness.communityResourceLane,
    harnessName: params.harnessName,
    communityId: params.communityId,
    communityName: params.communityName,
    communitySlug: params.communitySlug,
    communityOneLiner: params.communityOneLiner,
    communityAbout: params.communityAbout,
    communityChannels: params.communityChannels,
    communitySystemPrompt: params.communitySystemPrompt,
    communityLens: params.communityLens,
    runtimeTurnContext,
    currentDateTimeIso: runtimeDateTimeIso,
    currentDateLabel: runtimeDateLabel,
    currentTimeZone: runtimeTimeZone,
    invocationSurface: params.invocationSurface,
    communityAgentSurfaceContext: params.communityAgentSurfaceContext,
    memberIdentityContextMd,
    communityMemoryMd,
    personalMemoryMd,
    communityCardMd,
    communityHandbookMd,
    promptExtensions: resolvedHarness.promptExtensions,
  });
  // One cache group per community and surface: they share the stable prefix.
  const promptCacheKey = turnContract?.cacheKey ?? `pn:none:${params.invocationSurface}`;
  const systemPrompt = runtimePromptBundle.text;
  const promptSuffixChars = resolvedHarness.promptExtensions.reduce(
    (total, section) => total + String(section.text ?? "").length,
    0,
  );
  const providerToolPolicySurface = buildRuntimeToolPolicySurface({
    fixedToolNames: effectiveAllowedToolNames,
  });
  const activeProviderTools = {
    responsesTools: buildResponsesApiFunctionTools(effectiveAllowedToolNames),
    activeToolNames: [...effectiveAllowedToolNames],
    activeToolPolicies: providerToolPolicySurface.policies,
    activeToolPolicySummary: providerToolPolicySurface.summary,
  };
  const inputBudgetIdentity = resolveRuntimeProviderBudgetIdentity({
    inferenceSource: params.inferenceSource,
    requestedModelId: params.requestedModelId,
    modelRef: params.modelRef,
  });
  const resolvedProviderToolSchemas = activeProviderTools.responsesTools;
  let conversationMessagesForProvider = params.messages;
  if (params.persistedConversationHistory) {
    const historySeed = params.persistedConversationHistory;
    let loadedRows = [...historySeed.rows];
    let pagesRead = 1;
    let hasMore = historySeed.hasMore;
    let nextBeforeSeq = historySeed.nextBeforeSeq;
    let selection = selectCommunityAgentHistoryForBudget({
      rows: loadedRows,
      expectedUserMessageKey: historySeed.expectedUserMessageKey,
      systemPrompt,
      ...inputBudgetIdentity,
      toolSchemas: resolvedProviderToolSchemas,
      reservedOutputTokens: params.maxTokens,
      maxTurns: turnContract?.historyTurns ?? COMMUNITY_TURN_HISTORY_TURNS,
    });
    try {
      if (!selection.ok) throw new Error(selection.code);
      // Older pages load only until the budget or the turn cap is reached.
      while (hasMore && !selection.blockedByBudget && !selection.atTurnLimit) {
        if (typeof nextBeforeSeq !== "number") {
          throw new Error("persisted_history_cursor_missing");
        }
        const previousBeforeSeq = nextBeforeSeq;
        const page = (await params.ctx.runQuery(
          internal.threads.listCommunityAgentRuntimeMessagesInternal as any,
          {
            ownerId: params.userId as any,
            threadId: params.threadId as any,
            expectedUserMessageKey: historySeed.expectedUserMessageKey,
            beforeSeq: previousBeforeSeq,
          },
        )) as CommunityAgentRuntimeHistoryPage;
        if (
          page.expectedUserSeq !== historySeed.expectedUserSeq ||
          page.rows.some((row) => row.seq >= previousBeforeSeq) ||
          (page.hasMore &&
            (typeof page.nextBeforeSeq !== "number" ||
              page.nextBeforeSeq >= previousBeforeSeq))
        ) {
          throw new Error("persisted_history_page_invalid");
        }
        loadedRows = [...loadedRows, ...page.rows];
        pagesRead += 1;
        hasMore = page.hasMore;
        nextBeforeSeq = page.nextBeforeSeq;
        selection = selectCommunityAgentHistoryForBudget({
          rows: loadedRows,
          expectedUserMessageKey: historySeed.expectedUserMessageKey,
          systemPrompt,
          ...inputBudgetIdentity,
          toolSchemas: resolvedProviderToolSchemas,
          reservedOutputTokens: params.maxTokens,
          maxTurns: turnContract?.historyTurns ?? COMMUNITY_TURN_HISTORY_TURNS,
        });
        if (!selection.ok) throw new Error(selection.code);
      }
      const stopReason = selection.blockedByBudget
        ? selection.budgetPlan.failureCode &&
          selection.budgetPlan.failureCode !== "context_window_exceeded"
          ? "budget_unavailable"
          : "input_budget"
        : selection.atTurnLimit
          ? "turn_limit"
          : "history_exhausted";
      const selectedSeqs = selection.selectedEntries.map((entry) => entry.seq);
      conversationMessagesForProvider = selection.selectedEntries.map(
        (entry): InferenceMessage => ({
          role: entry.role,
          content: entry.content,
        }),
      );
      await params.appendRunEvent({
        eventType: "runtime_persisted_history_selected",
        eventKey: `${params.runId}:runtime_persisted_history_selected:1`,
        payload: {
          version: 1,
          run_id: params.runId,
          invocation_surface: params.invocationSurface,
          expected_user_message_key: historySeed.expectedUserMessageKey,
          expected_user_seq: historySeed.expectedUserSeq,
          oldest_selected_seq:
            selectedSeqs.length > 0 ? Math.min(...selectedSeqs) : null,
          newest_selected_seq:
            selectedSeqs.length > 0 ? Math.max(...selectedSeqs) : null,
          selected_message_count: selection.selectedEntries.length,
          selected_episode_count: selection.selectedEpisodeCount,
          loaded_row_count: loadedRows.length,
          loaded_complete_episode_count: selection.loadedCompleteEpisodeCount,
          ignored_leading_message_count: selection.ignoredLeadingMessageCount,
          page_size: COMMUNITY_AGENT_CONTEXT_PAGE_SIZE,
          pages_read: pagesRead,
          has_older:
            hasMore ||
            selection.loadedCompleteEpisodeCount > selection.selectedEpisodeCount ||
            selection.ignoredLeadingMessageCount > 0,
          stop_reason: stopReason,
          budget_profile_key: selection.budgetPlan.profileKey,
          budget_failure_code: selection.budgetPlan.failureCode,
        },
      });
    } catch (error) {
      logStructuredError("persisted_history_selection_failed", {
        error,
        runId: params.runId,
        threadId: params.threadId ?? undefined,
        invocationSurface: params.invocationSurface,
      });
      const fallbackTranscript: NativeToolAwareMessage[] = [
        { role: "system", content: systemPrompt },
        ...params.messages.map(toNativeInferenceMessage),
      ];
      return {
        ok: false,
        status: 503,
        code: "persisted_history_selection_failed",
        stopReason: "model_error",
        message: "The agent could not safely load this conversation. Please retry.",
        promptTokens: null,
        completionTokens: null,
        transcript: fallbackTranscript,
        stepCount: 0,
        steps: [],

        funding: null,
      };
    }
  }
  const runtimeContextManifest = buildRuntimeContextManifest({
    generatedAt: runtimeDateTimeIso,
    userId: params.userId ?? null,
    threadId: params.threadId ?? null,
    communityId: params.communityId ?? null,
    communityContextVersion: params.communityContextVersion ?? null,
    harnessName: params.harnessName,
    inferenceSource: params.inferenceSource,
    latestUserText: latestUserTextForRuntimeContext,
    messages: conversationMessagesForProvider.map((message) => ({
      role: message.role,
      content: extractTextFromNativeToolMessageContent(message.content),
    })),
    allowedToolNames: effectiveAllowedToolNames,
    communityResourceLane: resolvedHarness.communityResourceLane,
    communityAbout: params.communityAbout ?? null,
    promptSections: runtimePromptBundle.sections,
    runtimeTurnEnvelope,
    runtimeTurnContext,
    invocationSurface: params.invocationSurface,
    communityAgentSurfaceContext: params.communityAgentSurfaceContext,
    memberIdentityContextMd,
    memberIdentityContextStatus,
  });
  // The shared prompt ends at a cache breakpoint; this asker's and this
  // message's context follows the conversation, so the history stays cacheable.
  const promptSplit = runtimePromptBundle.split;
  const nativeTranscript: NativeToolAwareMessage[] = promptSplit?.sharedText
    ? [
        { role: "system", content: promptSplit.sharedText, cacheBreakpoint: true },
        ...conversationMessagesForProvider.map(toNativeInferenceMessage),
        ...(promptSplit.turnText.trim() ? [{ role: "system" as const, content: promptSplit.turnText, inPlace: true }] : []),
      ]
    : [
        { role: "system", content: systemPrompt },
        ...conversationMessagesForProvider.map(toNativeInferenceMessage),
      ];
  try {
    await params.appendRunEvent({
      eventType: "runtime_prompt_bundle_resolved",
      eventKey: `${params.runId}:runtime_prompt_bundle_resolved:1`,
      payload: {
        version: 3,
        run_id: params.runId,
        base_prompt_chars: runtimePromptBundle.text.length - promptSuffixChars,
        prompt_suffix_chars: promptSuffixChars,
        system_prompt_chars: systemPrompt.length,
        sections: runtimePromptBundle.sections,
      },
    });
  } catch {
    // Best-effort prompt receipt only; prompt assembly remains canonical for the turn.
  }
  try {
    await params.appendRunEvent({
      eventType: "runtime_context_manifest_resolved",
      eventKey: `${params.runId}:runtime_context_manifest_resolved:1`,
      payload: {
        run_id: params.runId,
        manifest: runtimeContextManifest,
      },
    });
  } catch {
    // Best-effort audit evidence only; prompt/tool assembly remains canonical for the turn.
  }
  const parallelReadToolsEnabled = readRuntimeBooleanFlag(
    RUNTIME_PARALLEL_READ_TOOLS_FLAG,
    true,
  );
  try {
    await params.appendRunEvent({
      eventType: "provider_tool_surface_resolved",
      eventKey: `${params.runId}:provider_tool_surface_resolved:initial`,
      payload: {
        run_id: params.runId,
        stage: "initial",
        fixed_allowed_tool_count: effectiveAllowedToolNames.length,
        base_fixed_allowed_tool_count: params.allowedToolNames.length,
        active_tool_count: activeProviderTools.activeToolNames.length,
        tool_policy_enforcement: "full_access_audit",
        tool_policy_summary: activeProviderTools.activeToolPolicySummary,
      },
    });
  } catch {
    // Best-effort runtime evidence only.
  }
  const throwIfRunCannotContinue = async (): Promise<void> => {
    await throwIfRuntimeRunCannotContinue({ ctx: params.ctx, ownerId: params.userId, runId: params.runId });
  };
  // The person can stop the run: a stop, or the run no longer being the
  // active one, ends it as stopped rather than as a crash.
  const stopFailure = (error: unknown): RuntimeAgentLoopFailureInput | null => {
    if (isRuntimeRunCancelledError(error)) {
      return { ok: false, status: 409, code: USER_CANCELLED_RUNTIME_CODE, stopReason: "user_cancelled", message: error.message };
    }
    if (isRuntimeRunInactiveError(error)) {
      return { ok: false, status: 409, code: RUNTIME_RUN_NOT_ACTIVE_CODE, stopReason: "model_error", message: error.message };
    }
    return null;
  };
  // The private talk's context receipt, with exactly what the first model
  // request sends; without it the turn doesn't run.
  const recordContextReceipt = async (providerMessages: NativeToolAwareMessage[]): Promise<RuntimeAgentLoopFailureInput | null> => {
    if (params.invocationSurface !== "member_agent_dock") return null;
    try {
      await throwIfRunCannotContinue();
      if (!params.recordInitialProviderContextAttestation || !params.threadId || !params.communityId
        || typeof params.communityContextVersion !== "number") {
        throw new Error("runtime_provider_context_attestation_inputs_missing");
      }
      const attestation = await buildRuntimeProviderContextAttestation({
        surface: params.invocationSurface,
        runId: params.runId,
        userId: params.userId,
        threadId: params.threadId,
        communityId: params.communityId,
        communityContextVersion: params.communityContextVersion,
        requestedModelId: params.requestedModelId,
        inferenceSource: params.inferenceSource,
        modelRef: params.modelRef,
        maxOutputTokens: params.maxTokens,
        toolChoice: "auto",
        parallelToolCalls: parallelReadToolsEnabled,
        messages: providerMessages,
        promptSections: runtimePromptBundle.sections,
        contextManifest: runtimeContextManifest,
        toolSchemaFormat: "responses_api",
        toolNames: activeProviderTools.activeToolNames,
        providerTools: activeProviderTools.responsesTools,
      });
      const persisted = await params.recordInitialProviderContextAttestation(attestation);
      if (persisted?.ok !== true) {
        throw new Error(String(persisted?.errorCode ?? "").trim() || RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE);
      }
      return null;
    } catch (error) {
      const stopped = stopFailure(error);
      if (stopped) return stopped;
      logStructuredError("runtime_provider_context_attestation_failed", {
        error, runId: params.runId, threadId: params.threadId ?? undefined,
        communityId: params.communityId ?? undefined, invocationSurface: params.invocationSurface,
        requestedModelId: params.requestedModelId,
      });
      return {
        ok: false, status: 503, code: RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE, stopReason: "model_error",
        message: "The agent could not safely prepare this turn. Please retry.",
      };
    }
  };
  // The run entry's events, written to this run's ledger (the timeline, stop
  // and recovery read it). Tool calls are written by the step hooks below.
  const recorder: CommunityAgentRunRecorder = {
    record: async () => {},
    recordRequired: async (event) => {
      const evidence = JSON.parse(event.content) as Record<string, unknown>;
      if (event.kind === "input_budget") {
        await params.appendRunEvent({
          eventType: evidence.kind === "initial" ? "runtime_input_budget_planned" : "runtime_input_budget_delta",
          eventKey: `${params.runId}:runtime_input_budget:${String(evidence.sequence)}`,
          payload: { run_id: params.runId, ...evidence },
        });
      } else if (event.kind === "context_projection") {
        await params.appendRunEvent({
          eventType: "runtime_context_projected",
          eventKey: `${params.runId}:runtime_context_projection:${String(evidence.sequence)}`,
          payload: { run_id: params.runId, ...evidence },
        });
      }
    },
    flushAll: async () => {},
  };
  const loopStartedAt = Date.now();
  const abortable = <T>(operation: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> =>
    runAbortableWithRuntimeCancellation({
      ctx: params.ctx, ownerId: params.userId, runId: params.runId, touchHeartbeat: params.touchRunHeartbeat,
      operation: async (signal) => await operation(signal),
    });
  if (!params.communityId || !params.communityInferenceAdmission?.ok) {
    throw new Error("community_inference_funding_authority_missing");
  }
  const run = await runFundedCommunityAgent({
    ctx: params.ctx,
    lens: params.communityLens?.lens ?? "member_private",
    communityId: params.communityId,
    actorUserId: params.userId,
    surface: "member_agent_dock",
    receiptKey: `member_agent_dock:${params.runId}`,
    sourceRunId: `runtime:${params.runId}`,
    admission: params.communityInferenceAdmission,
    messages: nativeTranscript,
    maxOutputTokens: params.maxTokens,
    maxToolSteps: params.loopBudget.maxToolSteps,
    budget: params.loopBudget,
    promptCacheKey,
    recorder,
    beforeEachCompletion: throwIfRunCannotContinue,
    abortable,
    mapStopError: stopFailure,
    beforeFirstCompletion: recordContextReceipt,
    parallelReads: parallelReadToolsEnabled,
    ...(params.onAssistantTextDelta ? { onTextDelta: params.onAssistantTextDelta } : {}),
    onToolSchedule: async (schedule, batch) => {
      try {
        await params.appendRunEvent({
          eventType: "tool_schedule_resolved",
          eventKey: `${params.runId}:tool_schedule_resolved:${batch.toolStepCount + 1}:${schedule.calls.map((call) => call.providerCallId).join(":")}`,
          payload: {
            run_id: params.runId,
            harness_name: params.harnessName,
            decision: schedule.decision,
            execution_mode: schedule.executionMode,
            reason: schedule.reason,
            parallel_read_tools_enabled: parallelReadToolsEnabled,
            is_batch: batch.isBatch,
            batch_call_count: schedule.calls.length,
            starting_iteration: batch.toolStepCount + 1,
            remaining_tool_budget: batch.remainingToolBudget,
            summary: schedule.summary,
            calls: schedule.calls,
          },
        });
      } catch {
        // Best-effort runtime evidence only.
      }
    },
    onToolStepStart: async ({ iteration, step }) => {
      await appendRuntimeToolCallStarted({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        harnessName: params.harnessName,
        communityId: params.communityId,
        iteration,
        providerCallId: step.providerCallId,
        toolName: step.toolName,
        args: step.normalizedArgs,
      });
    },
    onToolStepFinish: async ({ iteration, step, toolResult, toolResultEnvelope }) => {
      await appendRuntimeToolCallFinished({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        harnessName: params.harnessName,
        iteration,
        providerCallId: step.providerCallId,
        toolName: step.toolName,
        args: step.normalizedArgs,
        toolResult,
        toolResultEnvelope,
      });
      if (toolResult.status !== "ok") {
        console.error("tool_loop_tool_call_failed", {
          runId: params.runId,
          threadId: params.threadId ?? undefined,
          harnessName: params.harnessName,
          providerCallId: step.providerCallId,
          iteration,
          communityId: params.communityId ?? undefined,
          errorCode: toolResult.errorCode,
          errorMessage: toolResult.errorMessage,
          exitCode: toolResult.exitCode,
          hasOutputText: Boolean(toolResult.outputText),
          outputLength: String(toolResult.outputText ?? "").length,
          ...summarizeToolArgsForLog(step.toolName, step.normalizedArgs),
        });
      }
    },
    executeTool: async (toolName, _rawArguments, { providerCallId, normalizedArgs }) => {
      try {
        await throwIfRunCannotContinue();
      } catch (error) {
        if (isRuntimeRunCancelledError(error)) {
          return { status: "error", exitCode: null, outputText: "", errorCode: USER_CANCELLED_RUNTIME_CODE, errorMessage: error.message };
        }
        throw error;
      }
      // The turn's own rules (who asked, who sees the answer) come first.
      const allowed = checkCommunityTurnToolCall(turnContract, toolName, normalizedArgs);
      if (!allowed.ok) {
        try {
          await params.appendRunEvent({
            eventType: "tool_call_refused",
            eventKey: `${params.runId}:tool_call_refused:${providerCallId}`,
            payload: { run_id: params.runId, tool_name: toolName, reason: allowed.errorCode },
          });
        } catch {
          // Best-effort receipt; the tool result records the refusal too.
        }
        return { status: "error", exitCode: null, outputText: "", errorCode: allowed.errorCode, errorMessage: allowed.errorMessage };
      }
      try {
        const toolResult = await abortable(async (signal) => await runAgentTool({
          ctx: params.ctx,
          userId: params.userId,
          communityId: params.communityId ?? null,
          authSubject: params.authSubject,
          runId: params.runId,
          toolCallId: providerCallId,
          toolName,
          args: normalizedArgs,
          evidenceSurface: "member_agent_dock",
          communityBoundConversation: communityConversation,
          ...(signal ? { signal } : {}),
        }));
        await throwIfRunCannotContinue();
        return toolResult;
      } catch (error) {
        if (isRuntimeRunCancelledError(error)) {
          return { status: "error", exitCode: null, outputText: "", errorCode: USER_CANCELLED_RUNTIME_CODE, errorMessage: error.message };
        }
        const summary = summarizeErrorForLog(error);
        logStructuredError("agent_loop_tool_execution_crashed", {
          error, runId: params.runId, threadId: params.threadId ?? undefined,
          communityId: params.communityId ?? undefined, ...summarizeToolArgsForLog(toolName, normalizedArgs),
        });
        return { status: "error", exitCode: null, outputText: "", errorCode: "runtime_tool_execute_failed",
          errorMessage: `Runtime tool execution failed: ${summary.message}` };
      }
    },
  });

  // What the run became: the loop's own result when it ran to an end; a stop
  // or a crash otherwise. Funding the run couldn't claim is the handler's to
  // explain (the community's AI is unavailable, busy, or out of allowance).
  const stoppedBeforeAnything = !run.ok && !run.kernel && !run.providerStarted
    && run.failureCode !== USER_CANCELLED_RUNTIME_CODE && run.failureCode !== RUNTIME_RUN_NOT_ACTIVE_CODE;
  if (stoppedBeforeAnything) throw new Error(run.failureCode);
  const result: RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure = run.ok && run.kernel.ok
    ? run.kernel as RuntimeAgentLoopSuccess
    : run.kernel && run.kernel.ok === false
      ? run.kernel as RuntimeAgentLoopFailure
      : {
          ok: false,
          status: run.ok ? 502 : run.failureCode === USER_CANCELLED_RUNTIME_CODE || run.failureCode === RUNTIME_RUN_NOT_ACTIVE_CODE ? 409 : 502,
          code: run.ok ? "agent_loop_internal_error" : run.failureCode,
          stopReason: !run.ok && run.failureCode === USER_CANCELLED_RUNTIME_CODE ? "user_cancelled" : "model_error",
          message: run.ok ? "The agent loop ended without an answer." : `The agent could not complete this turn (${run.failureCode}).`,
          promptTokens: null,
          completionTokens: null,
          transcript: [...nativeTranscript],
          stepCount: 0,
          steps: [],
        };
  try {
    await params.appendRunEvent({
      eventType: "agent_loop_stopped",
      eventKey: `${params.runId}:agent_loop_stopped:1`,
      payload: {
        run_id: params.runId,
        harness: { kind: params.harnessName },
        stop_reason: result.stopReason,
        step_count: result.stepCount,
        total_latency_ms: Date.now() - loopStartedAt,
        status: result.ok ? "ok" : "error",
        ...(result.ok ? {} : { error_code: result.code, error_message: result.message }),
      },
    });
  } catch {
    // Best-effort runtime evidence only.
  }
  // A finished run hands its funding to the handler to settle with the
  // answer; any other run's funding was released by the run entry.
  return { ...result, funding: run.ok && result.ok ? { session: run.fundingSession, usage: run.usage } : null };
}

async function executeChatToolsAgentLoop(
  params: RuntimeCommunityPromptFields & RuntimeProviderLifecycleHooks & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
    authSubject?: string | null;
    requestedModelId: string;
    inferenceSource: RuntimeInferenceSource;
    modelRef: string;
    messages: InferenceMessage[];
    persistedConversationHistory?: CommunityAgentPersistedHistorySeed | null;
    maxTokens: number;
    runId: string;
    allowedToolNames: readonly RetrievalToolName[];
    invocationSurface: RuntimeInvocationSurface;
    communityAgentSurfaceContext?: CommunityAgentSurfaceContextV1 | null;
      communitySystemPrompt?: string | null;
    communityContextVersion?: number | null;
    communityInferenceAdmission: CommunityInferenceFundingAdmission | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    refreshRuntimeContextSnapshot?: (
      phase?: "started" | "active",
      runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null,
    ) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<PrivateTalkRunResult> {
  return await executeRetrievalAgentLoop({
    ...params,
    harnessName: "chat_tools",
    loopBudget: CHAT_TOOLS_RUNTIME_KERNEL_BUDGET,
  });
}

export {
  executeChatToolsAgentLoop,
};
