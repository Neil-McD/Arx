import {
  buildDaytonaAgentSystemPrompt,
  makeToolCallKey,
  parseDaytonaAgentDecision,
  resolveDaytonaToolPolicy,
  type CloudApprovalMode,
} from "./cloud_harness_core.ts";
import {
  executeDaytonaCommand,
  executeDaytonaTool,
  ensureDaytonaWorkspaceRoot,
  loadDaytonaConfig,
  type DaytonaLocalSandboxStatus,
  type DaytonaToolExecutionResult,
  type ResolvedDaytonaSandbox,
} from "./daytona_cloud_adapter.ts";
import { supabaseAdminFetch } from "./supabase_admin.ts";
import {
  normalizeCommunitySearchLimit,
  parseCommunitySearchSourceTypes,
  runCanonicalCommunityDeepResearch,
  runCanonicalCommunitySearch,
  sanitizeCommunitySearchPayloadChatRows,
  sanitizeCommunitySearchPayloadMemoryRows,
  sanitizeCommunitySearchPayloadResourceRows,
  type CommunityChatSnippetRow,
  type CommunityMemorySearchRow,
  type CommunityResourceSnippetRow,
  type CommunitySearchPayloadChatRow,
  type CommunitySearchPayloadMemoryRow,
  type CommunitySearchPayloadResourceRow,
  type CommunitySearchSourceType,
} from "./community_research_orchestrator.ts";

export type DaytonaLaneInferenceMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type DaytonaLaneInferenceResult = {
  assistantText: string;
  engineId: string;
  modelId: string;
};

export type DaytonaLaneResult = {
  assistantText: string;
  engineId: string;
  modelId: string;
  lane: "daytona";
  sandboxId: string;
};

type ToolDecisionRow = {
  approved: boolean;
  note: string | null;
};

type PlanStepStatus = "pending" | "in_progress" | "completed";

type PlanStep = {
  step: string;
  status: PlanStepStatus;
};

type NormalizedUpdatePlanPayload = {
  explanation: string | null;
  plan: PlanStep[];
};

type CommunityEvidenceSourceType = "chat" | "resource" | "memory";

type CommunityEvidenceAliasLookup = Record<
  string,
  {
    source_type: CommunityEvidenceSourceType;
    source_id: string;
  }
>;

function assistantClaimsSandboxToolsUnavailable(text: string): boolean {
  const normalized = String(text ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const patterns = [
    /don['’]t\s+currently\s+have\s+access\s+to\s+(a\s+)?sandbox/i,
    /can['’]t\s+(access|use)\s+(the\s+)?(sandbox|filesystem|tool)/i,
    /do\s+not\s+see\s+any\s+tool/i,
    /only\s+the\s+community_search\s+tool/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

const COMMUNITY_RPC = Object.freeze({
  memoryCandidatePropose: "community_memory_candidate_propose",
});

const COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE = "evidence_required";
const COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR =
  "community_memory_candidate_propose requires evidence.items with at least one provenance item.";

type DaytonaLaneParams = {
  runId: string;
  modelId: string;
  messages: DaytonaLaneInferenceMessage[];
  projectId: string;
  userId: string;
  userAccessToken: string | null;
  communityId: string | null;
  approvalMode: CloudApprovalMode;
  sandbox: ResolvedDaytonaSandbox;
  contractName: string;
  contractVersion: string;
  appendRunEvent: (eventType: string, payload: Record<string, unknown>) => Promise<void>;
  emitStreamEvent?: (event: string, data: Record<string, unknown>) => void;
  patchSandboxStatus?: (status: DaytonaLocalSandboxStatus) => Promise<void>;
  callInference: (
    transcript: DaytonaLaneInferenceMessage[],
    modelId: string,
  ) => Promise<DaytonaLaneInferenceResult>;
  patchRuntimeRun: (runId: string, patch: Record<string, unknown>) => Promise<void>;
  waitForRuntimeToolDecision: (params: { runId: string; toolCallId: string }) => Promise<ToolDecisionRow | null>;
  createApiError: (
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) => Error;
};

export async function executeDaytonaLane(params: DaytonaLaneParams): Promise<DaytonaLaneResult> {
  const patchSandboxStatus = async (status: DaytonaLocalSandboxStatus): Promise<void> => {
    if (!params.patchSandboxStatus) return;
    try {
      await params.patchSandboxStatus(status);
    } catch {
      // Best effort only; sandbox status persistence should never break a run.
    }
  };

  const config = loadDaytonaConfig();
  await ensureDaytonaWorkspaceRoot({
    config,
    toolboxProxyUrl: params.sandbox.toolbox_proxy_url,
    sandboxId: params.sandbox.provider_sandbox_id,
  });
  const probe = await executeDaytonaCommand({
    config,
    toolboxProxyUrl: params.sandbox.toolbox_proxy_url,
    sandboxId: params.sandbox.provider_sandbox_id,
    command: "pwd",
    cwd: "workspace",
    timeoutSeconds: 10,
  });
  await params.appendRunEvent("daytona_probe_finished", {
    contract_name: params.contractName,
    contract_version: params.contractVersion,
    project_id: params.projectId,
    sandbox_id: params.sandbox.id,
    provider_sandbox_id: params.sandbox.provider_sandbox_id,
    exit_code: probe.exitCode,
    stdout_preview: probe.stdout.slice(0, 200),
  });

  const maxIterations = 8;
  const maxInvalidJsonRetries = 1;
  const transcript: DaytonaLaneInferenceMessage[] = [
    {
      role: "system",
      content: buildDaytonaAgentSystemPrompt({
        projectId: params.projectId,
        sandboxId: params.sandbox.id,
        maxIterations,
        approvalMode: params.approvalMode,
      }),
    },
    ...params.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  let aliasLookup: CommunityEvidenceAliasLookup = {};
  let invalidJsonRetries = 0;
  let toolAccessCorrectionRetries = 0;
  const maxToolAccessCorrectionRetries = 1;
  let hasExecutedAnyToolCall = false;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const infer = await params.callInference(transcript, params.modelId);
    const rawAssistantText = infer.assistantText.trim();
    if (!rawAssistantText) {
      throw params.createApiError("empty_response", "Daytona lane model returned an empty response.", 502);
    }
    const decision = parseDaytonaAgentDecision(rawAssistantText);
    if (!decision) {
      if (invalidJsonRetries < maxInvalidJsonRetries) {
        invalidJsonRetries += 1;
        await params.appendRunEvent("model_output_invalid_json", {
          contract_name: params.contractName,
          contract_version: params.contractVersion,
          iteration,
          attempt: invalidJsonRetries,
          output_preview: rawAssistantText.slice(0, 2_000),
        });
        transcript.push({
          role: "assistant",
          content: rawAssistantText,
        });
        transcript.push({
          role: "system",
          content: [
            "INVALID_FORMAT",
            "Your previous response was not strict JSON.",
            "Reply again using exactly one JSON object and no prose/markdown.",
            "Allowed schemas:",
            '{"type":"assistant","text":"..."}',
            '{"type":"tool_call","tool_name":"read|list_dir|glob|grep|sha256|write|edit|bash|update_plan|community_search|community_memory_candidate_propose","args":{...},"reason":"..."}',
          ].join("\n"),
        });
        continue;
      }
      return {
        assistantText: rawAssistantText,
        engineId: `daytona/${infer.engineId}`,
        modelId: infer.modelId,
        lane: "daytona",
        sandboxId: params.sandbox.id,
      };
    }
    invalidJsonRetries = 0;

    if (decision.type === "assistant") {
      if (
        !hasExecutedAnyToolCall &&
        toolAccessCorrectionRetries < maxToolAccessCorrectionRetries &&
        assistantClaimsSandboxToolsUnavailable(decision.text)
      ) {
        toolAccessCorrectionRetries += 1;
        await params.appendRunEvent("assistant_tool_access_misalignment", {
          contract_name: params.contractName,
          contract_version: params.contractVersion,
          iteration,
          attempt: toolAccessCorrectionRetries,
          output_preview: decision.text.slice(0, 2_000),
        });
        transcript.push({
          role: "assistant",
          content: rawAssistantText,
        });
        transcript.push({
          role: "system",
          content: [
            "TOOL_ACCESS_CORRECTION",
            "Sandbox tools are available in this lane.",
            "Do not claim tool access is unavailable.",
            "If user asks to inspect/list files, reply with a strict JSON tool_call for list_dir and args {\"path\":\".\"}.",
            "Return strict JSON only.",
          ].join("\n"),
        });
        continue;
      }
      return {
        assistantText: decision.text,
        engineId: `daytona/${infer.engineId}`,
        modelId: infer.modelId,
        lane: "daytona",
        sandboxId: params.sandbox.id,
      };
    }

    const toolCallId = crypto.randomUUID();
    const normalizedArgs = decision.args ?? {};
    const toolCallKey = await makeToolCallKey({
      toolName: decision.tool_name,
      args: normalizedArgs,
      projectId: params.projectId,
    });
    const policy = resolveDaytonaToolPolicy(decision.tool_name, params.approvalMode);
    const requiresUserDecision =
      !policy.allowed &&
      policy.requiresApproval &&
      policy.denialCode === "tool_approval_required";
    hasExecutedAnyToolCall = true;

    await params.appendRunEvent("tool_call_requested", {
      contract_name: params.contractName,
      contract_version: params.contractVersion,
      tool_call_id: toolCallId,
      tool_call_key: toolCallKey,
      tool_name: decision.tool_name,
      args: normalizedArgs,
      requires_approval: policy.requiresApproval,
      policy_basis: policy.policyBasis,
      reason: decision.reason ?? null,
      iteration,
    });

    let toolApproved = policy.allowed;
    if (requiresUserDecision) {
      await params.appendRunEvent("tool_approval_requested", {
        contract_name: params.contractName,
        contract_version: params.contractVersion,
        tool_call_id: toolCallId,
        tool_name: decision.tool_name,
        args: normalizedArgs,
        iteration,
      });
      await patchSandboxStatus("paused");
      await params.patchRuntimeRun(params.runId, {
        status: "awaiting_approval",
        error_code: null,
        error_message: null,
      });
      params.emitStreamEvent?.("tool_approval_requested", {
        run_id: params.runId,
        tool_call_id: toolCallId,
        tool_name: decision.tool_name,
        args: normalizedArgs,
        message: "Tool approval required.",
      });
      const decisionRow = await params.waitForRuntimeToolDecision({
        runId: params.runId,
        toolCallId: toolCallId,
      });
      await params.patchRuntimeRun(params.runId, {
        status: "running",
        error_code: null,
        error_message: null,
      });
      await patchSandboxStatus("ready");
      if (!decisionRow) {
        await params.appendRunEvent("tool_call_denied", {
          contract_name: params.contractName,
          contract_version: params.contractVersion,
          tool_call_id: toolCallId,
          approved: false,
          approved_by: "system",
          code: "tool_approval_timeout",
          message: "Tool approval timed out.",
        });
        transcript.push({
          role: "assistant",
          content: rawAssistantText,
        });
        transcript.push({
          role: "system",
          content: [
            "TOOL_RESULT",
            `tool_name=${decision.tool_name}`,
            "status=denied",
            "code=tool_approval_timeout",
            "message=Tool approval timed out.",
          ].join("\n"),
        });
        continue;
      }
      if (decisionRow.approved) {
        await params.appendRunEvent("tool_call_approved", {
          contract_name: params.contractName,
          contract_version: params.contractVersion,
          tool_call_id: toolCallId,
          approved: true,
          approved_by: "user",
          note: decisionRow.note ?? "Approved by user.",
        });
        toolApproved = true;
      } else {
        await params.appendRunEvent("tool_call_denied", {
          contract_name: params.contractName,
          contract_version: params.contractVersion,
          tool_call_id: toolCallId,
          approved: false,
          approved_by: "user",
          code: "tool_denied_by_user",
          message: decisionRow.note ?? "Tool call denied by user.",
        });
        transcript.push({
          role: "assistant",
          content: rawAssistantText,
        });
        transcript.push({
          role: "system",
          content: [
            "TOOL_RESULT",
            `tool_name=${decision.tool_name}`,
            "status=denied",
            "code=tool_denied_by_user",
            `message=${decisionRow.note ?? "Tool call denied by user."}`,
          ].join("\n"),
        });
        continue;
      }
    }

    if (!toolApproved) {
      await params.appendRunEvent("tool_call_denied", {
        contract_name: params.contractName,
        contract_version: params.contractVersion,
        tool_call_id: toolCallId,
        approved: false,
        approved_by: "policy",
        code: policy.denialCode,
        message: policy.denialMessage,
      });
      transcript.push({
        role: "assistant",
        content: rawAssistantText,
      });
      transcript.push({
        role: "system",
        content: [
          "TOOL_RESULT",
          `tool_name=${decision.tool_name}`,
          `status=denied`,
          `code=${policy.denialCode ?? "tool_denied"}`,
          `message=${policy.denialMessage ?? "Tool call denied by cloud policy."}`,
        ].join("\n"),
      });
      continue;
    }

    if (!requiresUserDecision) {
      await params.appendRunEvent("tool_call_approved", {
        contract_name: params.contractName,
        contract_version: params.contractVersion,
        tool_call_id: toolCallId,
        approved: true,
        approved_by: "policy",
        note: policy.requiresApproval
          ? `Approved by cloud approval mode '${params.approvalMode}'.`
          : "Auto-approved by cloud read-only tool policy.",
      });
    }

    await params.appendRunEvent("tool_call_started", {
      contract_name: params.contractName,
      contract_version: params.contractVersion,
      tool_call_id: toolCallId,
      attempt: 1,
      cwd: "workspace",
      workspace_scope_id: params.projectId,
      sandbox: {
        sandbox_id: params.sandbox.id,
        provider_sandbox_id: params.sandbox.provider_sandbox_id,
      },
    });

    let toolResult: DaytonaToolExecutionResult;
    if (decision.tool_name === "community_search" || decision.tool_name === "community_memory_candidate_propose") {
      const communityToolResult = await executeCommunityTool({
        toolName: decision.tool_name,
        args: normalizedArgs,
        userId: params.userId,
        userAccessToken: params.userAccessToken,
        communityId: params.communityId,
        aliasLookup,
      });
      if (Object.keys(communityToolResult.aliasLookupUpdates).length > 0) {
        aliasLookup = { ...aliasLookup, ...communityToolResult.aliasLookupUpdates };
      }
      toolResult = communityToolResult.toolResult;
    } else if (decision.tool_name === "update_plan") {
      const planPayload = parseUpdatePlanPayload(normalizedArgs);
      await params.appendRunEvent("plan_updated", {
        contract_name: params.contractName,
        contract_version: params.contractVersion,
        tool_call_id: toolCallId,
        explanation: planPayload.explanation,
        plan: planPayload.plan,
      });
      params.emitStreamEvent?.("plan_updated", {
        run_id: params.runId,
        tool_call_id: toolCallId,
        explanation: planPayload.explanation,
        plan: planPayload.plan,
      });
      toolResult = {
        status: "ok",
        exitCode: 0,
        outputText: "Plan updated.",
        errorCode: null,
        errorMessage: null,
      };
    } else {
      toolResult = await executeDaytonaTool({
        config,
        toolboxProxyUrl: params.sandbox.toolbox_proxy_url,
        sandboxId: params.sandbox.provider_sandbox_id,
        toolName: decision.tool_name,
        args: normalizedArgs,
      });
    }

    await params.appendRunEvent("tool_call_finished", {
      contract_name: params.contractName,
      contract_version: params.contractVersion,
      tool_call_id: toolCallId,
      attempt: 1,
      status: toolResult.status,
      exit_code: toolResult.exitCode,
      error_code: toolResult.errorCode,
      error_message: toolResult.errorMessage,
      output_preview: toolResult.outputText.slice(0, 2_000),
    });

    transcript.push({
      role: "assistant",
      content: rawAssistantText,
    });
    transcript.push({
      role: "system",
      content: [
        "TOOL_RESULT",
        `tool_name=${decision.tool_name}`,
        `status=${toolResult.status}`,
        `exit_code=${toolResult.exitCode ?? ""}`,
        toolResult.errorCode ? `error_code=${toolResult.errorCode}` : "",
        toolResult.errorMessage ? `error_message=${toolResult.errorMessage}` : "",
        "output:",
        toolResult.outputText || "(empty)",
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    });
  }

  throw params.createApiError(
    "run_loop_limit_exceeded",
    `Daytona run exceeded max tool iterations (${maxIterations}).`,
    502,
  );
}

async function executeCanonicalCommunitySearch(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
  sourceTypes: CommunitySearchSourceType[];
}) {
  try {
    return await runCanonicalCommunityDeepResearch({
      userId: params.userId,
      communityId: params.communityId,
      query: params.query,
      limit: params.limit,
      sourceTypes: params.sourceTypes,
    });
  } catch {
    return await runCanonicalCommunitySearch({
      userId: params.userId,
      communityId: params.communityId,
      query: params.query,
      limit: params.limit,
      sourceTypes: params.sourceTypes,
    });
  }
}

function readToolStringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncateText(value: string, maxChars: number): string {
  return String(value ?? "").slice(0, Math.max(0, Math.floor(maxChars)));
}

function communityEvidenceAliasLookupKey(sourceType: string, sourceId: string): string {
  return `${String(sourceType ?? "").trim().toLowerCase()}:${String(sourceId ?? "").trim()}`;
}

function buildCommunitySearchAliasLookupUpdates(params: {
  payloadChatRows: CommunitySearchPayloadChatRow[];
  payloadResourceRows: CommunitySearchPayloadResourceRow[];
  payloadMemoryRows: CommunitySearchPayloadMemoryRow[];
  internalChatRows: CommunityChatSnippetRow[];
  internalResourceRows: CommunityResourceSnippetRow[];
  internalMemoryRows: CommunityMemorySearchRow[];
}): CommunityEvidenceAliasLookup {
  const out: CommunityEvidenceAliasLookup = {};
  for (let idx = 0; idx < params.payloadChatRows.length; idx += 1) {
    const alias = params.payloadChatRows[idx];
    const internal = params.internalChatRows[idx];
    const internalSourceId = String(internal?.message_id ?? "").trim();
    if (!alias || !internalSourceId) continue;
    out[communityEvidenceAliasLookupKey("chat", alias.source_id)] = {
      source_type: "chat",
      source_id: internalSourceId,
    };
  }
  for (let idx = 0; idx < params.payloadResourceRows.length; idx += 1) {
    const alias = params.payloadResourceRows[idx];
    const internal = params.internalResourceRows[idx];
    const aliasSourceType = alias?.source_type === "memory" ? "memory" : "resource";
    const internalSourceId = String(internal?.resource_id ?? "").trim();
    if (!alias || !internalSourceId) continue;
    out[communityEvidenceAliasLookupKey(aliasSourceType, alias.source_id)] = {
      source_type: aliasSourceType,
      source_id: internalSourceId,
    };
  }
  for (let idx = 0; idx < params.payloadMemoryRows.length; idx += 1) {
    const alias = params.payloadMemoryRows[idx];
    const internal = params.internalMemoryRows[idx];
    const internalSourceId = String(internal?.memory_id ?? "").trim();
    if (!alias || !internalSourceId) continue;
    out[communityEvidenceAliasLookupKey("memory", alias.source_id)] = {
      source_type: "memory",
      source_id: internalSourceId,
    };
  }
  return out;
}

function hasValidCommunityEvidenceProvenanceItem(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const sourceType = String(item.source_type ?? "").trim().toLowerCase();
  const sourceId = String(item.source_id ?? "").trim();
  return (
    (sourceType === "chat" || sourceType === "resource" || sourceType === "memory") &&
    sourceId.length > 0
  );
}

function validateCommunityMemoryProposalEvidence(
  value: unknown,
):
  | { ok: true; evidence: Record<string, unknown> }
  | { ok: false; reasonCode: typeof COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      reasonCode: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE,
      error: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR,
    };
  }
  const evidence = value as Record<string, unknown>;
  const items = Array.isArray(evidence.items) ? evidence.items : [];
  const hasProvenance = items.some((item) => hasValidCommunityEvidenceProvenanceItem(item));
  if (!hasProvenance) {
    return {
      ok: false,
      reasonCode: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE,
      error: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR,
    };
  }
  return { ok: true, evidence };
}

function resolveCommunityProposalEvidenceForRpc(params: {
  evidence: Record<string, unknown>;
  aliasLookup: CommunityEvidenceAliasLookup;
}): Record<string, unknown> {
  const evidenceItems = Array.isArray(params.evidence.items) ? params.evidence.items : [];
  const resolvedItems = evidenceItems.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const item = { ...(raw as Record<string, unknown>) };
    const internalSourceId = String(item.internal_source_id ?? "").trim();
    if (internalSourceId) {
      item.source_id = internalSourceId;
      return item;
    }
    const sourceType = String(item.source_type ?? "").trim().toLowerCase();
    const sourceId = String(item.source_id ?? "").trim();
    if (!sourceType || !sourceId) return item;
    const resolved = params.aliasLookup[communityEvidenceAliasLookupKey(sourceType, sourceId)];
    if (!resolved || resolved.source_type !== sourceType) return item;
    item.source_id = resolved.source_id;
    return item;
  });
  return {
    ...params.evidence,
    items: resolvedItems,
  };
}

async function proposeCommunityMemoryCandidate(params: {
  communityId: string;
  userAccessToken: string | null;
  title?: string | null;
  memoryText: string;
  evidence: Record<string, unknown>;
  requestKey?: string | null;
}): Promise<Record<string, unknown> | null> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.memoryCandidatePropose}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.userAccessToken ? { Authorization: `Bearer ${params.userAccessToken}` } : {}),
    },
    body: JSON.stringify({
      p_community_id: params.communityId,
      p_title: params.title ?? null,
      p_memory_text: params.memoryText,
      p_evidence: params.evidence,
      p_request_key: params.requestKey ?? null,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const payload = await res.json();
  if (Array.isArray(payload)) {
    return payload[0] && typeof payload[0] === "object" ? (payload[0] as Record<string, unknown>) : null;
  }
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

async function executeCommunityTool(params: {
  toolName: "community_search" | "community_memory_candidate_propose";
  args: Record<string, unknown>;
  userId: string;
  userAccessToken: string | null;
  communityId: string | null;
  aliasLookup: CommunityEvidenceAliasLookup;
}): Promise<{ toolResult: DaytonaToolExecutionResult; aliasLookupUpdates: CommunityEvidenceAliasLookup }> {
  const communityId = String(params.communityId ?? "").trim();
  const requestedCommunityId = readToolStringArg(params.args, "community_id");
  if (!communityId) {
    return {
      toolResult: {
        status: "ok",
        exitCode: 0,
        outputText: JSON.stringify({
          ok: false,
          tool: params.toolName,
          reason_code: "no_active_community",
          error: "community tool calls require an active thread community context.",
        }),
        errorCode: null,
        errorMessage: null,
      },
      aliasLookupUpdates: {},
    };
  }

  try {
    if (params.toolName === "community_search") {
      const query = readToolStringArg(params.args, "query") ?? "";
      const limit = normalizeCommunitySearchLimit(params.args.limit);
      const sourceTypes = parseCommunitySearchSourceTypes(params.args);
      const searchResult = await executeCanonicalCommunitySearch({
        userId: params.userId,
        communityId,
        query,
        limit,
        sourceTypes,
      });
      const payloadChatRows = sanitizeCommunitySearchPayloadChatRows(searchResult.chatRows);
      const payloadResourceRows = sanitizeCommunitySearchPayloadResourceRows(searchResult.resourceRows);
      const payloadMemoryRows = sanitizeCommunitySearchPayloadMemoryRows(searchResult.memoryRows);
      const toolChatRows = payloadChatRows.map(({ internal_source_id: _internalSourceId, ...row }) => row);
      const toolResourceRows = payloadResourceRows.map(({ internal_source_id: _internalSourceId, ...row }) => row);
      const toolMemoryRows = payloadMemoryRows.map(({ internal_source_id: _internalSourceId, ...row }) => row);
      const aliasLookupUpdates = buildCommunitySearchAliasLookupUpdates({
        payloadChatRows,
        payloadResourceRows,
        payloadMemoryRows,
        internalChatRows: searchResult.chatRows,
        internalResourceRows: searchResult.resourceRows,
        internalMemoryRows: searchResult.memoryRows,
      });
      return {
        toolResult: {
          status: "ok",
          exitCode: 0,
          outputText: JSON.stringify({
            ok: true,
            tool: params.toolName,
            canonical_tool: "community_search",
            community_scope: "thread_context",
            ...(requestedCommunityId && requestedCommunityId !== communityId
              ? { requested_community_id_ignored: true }
              : null),
            query,
            limit,
            source_types: sourceTypes,
            query_plan: searchResult.queryPlan,
            executed_queries: searchResult.executedQueries,
            ...("deepQueryPlan" in searchResult ? { deep_query_plan: searchResult.deepQueryPlan } : null),
            ...("passCount" in searchResult ? { pass_count: searchResult.passCount } : null),
            ...("stopReason" in searchResult ? { stop_reason: searchResult.stopReason } : null),
            diagnostics: searchResult.diagnostics,
            meta_recent_fallback_used: searchResult.metaRecentFallbackUsed,
            rows: {
              chat: toolChatRows,
              resources: toolResourceRows,
              memory: toolMemoryRows,
            },
          }),
          errorCode: null,
          errorMessage: null,
        },
        aliasLookupUpdates,
      };
    }

    const memoryText = readToolStringArg(params.args, "memory_text");
    if (!memoryText) {
      return {
        toolResult: {
          status: "ok",
          exitCode: 0,
          outputText: JSON.stringify({ ok: false, tool: params.toolName, error: "memory_text is required." }),
          errorCode: null,
          errorMessage: null,
        },
        aliasLookupUpdates: {},
      };
    }
    const title = readToolStringArg(params.args, "title");
    const requestKey = readToolStringArg(params.args, "request_key");
    const evidenceValidation = validateCommunityMemoryProposalEvidence(params.args.evidence);
    if (!evidenceValidation.ok) {
      return {
        toolResult: {
          status: "ok",
          exitCode: 0,
          outputText: JSON.stringify({
            ok: false,
            tool: params.toolName,
            reason_code: evidenceValidation.reasonCode,
            error: evidenceValidation.error,
            community_scope: "thread_context",
            ...(requestedCommunityId && requestedCommunityId !== communityId
              ? { requested_community_id_ignored: true }
              : null),
          }),
          errorCode: null,
          errorMessage: null,
        },
        aliasLookupUpdates: {},
      };
    }

    const evidence = resolveCommunityProposalEvidenceForRpc({
      evidence: evidenceValidation.evidence,
      aliasLookup: params.aliasLookup,
    });
    const result = await proposeCommunityMemoryCandidate({
      communityId,
      userAccessToken: params.userAccessToken,
      title,
      memoryText,
      evidence,
      requestKey,
    });
    return {
      toolResult: {
        status: "ok",
        exitCode: 0,
        outputText: JSON.stringify({
          ok: true,
          tool: params.toolName,
          community_scope: "thread_context",
          ...(requestedCommunityId && requestedCommunityId !== communityId
            ? { requested_community_id_ignored: true }
            : null),
          title: title ?? null,
          memory_text_preview: truncateText(memoryText, 200),
          result,
        }),
        errorCode: null,
        errorMessage: null,
      },
      aliasLookupUpdates: {},
    };
  } catch (error) {
    return {
      toolResult: {
        status: "ok",
        exitCode: 0,
        outputText: JSON.stringify({
          ok: false,
          tool: params.toolName,
          error: error instanceof Error ? error.message : String(error),
          community_scope: "thread_context",
          ...(requestedCommunityId && requestedCommunityId !== communityId
            ? { requested_community_id_ignored: true }
            : null),
        }),
        errorCode: null,
        errorMessage: null,
      },
      aliasLookupUpdates: {},
    };
  }
}

function parseUpdatePlanPayload(args: Record<string, unknown>): NormalizedUpdatePlanPayload {
  const allowedStatuses: Record<string, PlanStepStatus> = {
    pending: "pending",
    in_progress: "in_progress",
    completed: "completed",
  };
  const explanationRaw = typeof args.explanation === "string" ? args.explanation.trim() : "";
  const explanation = explanationRaw.length > 0 ? explanationRaw.slice(0, 4_000) : null;
  const rawPlan = Array.isArray(args.plan) ? args.plan : [];
  const plan: PlanStep[] = rawPlan
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const step = typeof record.step === "string" ? record.step.trim() : "";
      const statusRaw = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
      const status = allowedStatuses[statusRaw];
      if (!step || !status) return null;
      return {
        step: step.slice(0, 500),
        status,
      } satisfies PlanStep;
    })
    .filter((entry): entry is PlanStep => entry !== null);
  return { explanation, plan };
}
