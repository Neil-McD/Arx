import codingHarnessToolsContract from "../../../shared/contracts/coding_harness_tools_v1.json" assert { type: "json" };

export type CloudApprovalMode = "read-only" | "agent" | "agent-full";

export type DaytonaToolName =
  | "read"
  | "list_dir"
  | "glob"
  | "grep"
  | "sha256"
  | "write"
  | "edit"
  | "bash"
  | "update_plan"
  | "community_search"
  | "community_memory_candidate_propose";

export type DaytonaToolCallDecision = {
  type: "tool_call";
  tool_name: DaytonaToolName;
  args?: Record<string, unknown> | null;
  reason?: string | null;
};

export type DaytonaAssistantDecision = {
  type: "assistant";
  text: string;
};

export type DaytonaAgentDecision = DaytonaToolCallDecision | DaytonaAssistantDecision;

export type DaytonaToolPolicyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  policyBasis: string;
  denialCode: string | null;
  denialMessage: string | null;
};

type CloudApprovalPolicyMode = CloudApprovalMode | "default";

type CloudApprovalPolicyContractDecision = {
  allowed: boolean;
  requires_approval: boolean;
  policy_basis: string;
  denial_code?: string;
  denial_message?: string;
};

type CloudApprovalPolicyContractByMode = Partial<
  Record<CloudApprovalPolicyMode, CloudApprovalPolicyContractDecision>
>;

function parseCloudPolicyDecision(value: unknown): CloudApprovalPolicyContractDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.allowed !== "boolean") return null;
  if (typeof record.requires_approval !== "boolean") return null;
  const policyBasis = String(record.policy_basis ?? "").trim();
  if (!policyBasis) return null;
  const denialCode = String(record.denial_code ?? "").trim();
  const denialMessage = String(record.denial_message ?? "").trim();
  return {
    allowed: record.allowed,
    requires_approval: record.requires_approval,
    policy_basis: policyBasis,
    ...(denialCode ? { denial_code: denialCode } : {}),
    ...(denialMessage ? { denial_message: denialMessage } : {}),
  };
}

function parseCloudPolicyModes(value: unknown): CloudApprovalPolicyContractByMode {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = value as Record<string, unknown>;
  const parsed: CloudApprovalPolicyContractByMode = {};
  for (const [modeRaw, modeValue] of Object.entries(entries)) {
    const mode = modeRaw.trim().toLowerCase();
    if (mode !== "default" && mode !== "read-only" && mode !== "agent" && mode !== "agent-full") continue;
    const decision = parseCloudPolicyDecision(modeValue);
    if (!decision) continue;
    parsed[mode as CloudApprovalPolicyMode] = decision;
  }
  return parsed;
}

function buildDaytonaToolPolicyContractMap(): Map<DaytonaToolName, CloudApprovalPolicyContractByMode> {
  const map = new Map<DaytonaToolName, CloudApprovalPolicyContractByMode>();
  const capabilities = Array.isArray((codingHarnessToolsContract as { capabilities?: unknown }).capabilities)
    ? (codingHarnessToolsContract as { capabilities: unknown[] }).capabilities
    : [];
  for (const capabilityRaw of capabilities) {
    if (!capabilityRaw || typeof capabilityRaw !== "object" || Array.isArray(capabilityRaw)) continue;
    const capability = capabilityRaw as Record<string, unknown>;
    const toolName = normalizeToolName(capability.name);
    if (!toolName) continue;
    const status = String(capability.status ?? "").trim().toLowerCase();
    if (status && status !== "active") continue;
    const approvalPolicy = capability.approval_policy;
    if (!approvalPolicy || typeof approvalPolicy !== "object" || Array.isArray(approvalPolicy)) continue;
    const cloudPolicy = parseCloudPolicyModes((approvalPolicy as Record<string, unknown>).cloud);
    if (Object.keys(cloudPolicy).length === 0) continue;
    map.set(toolName, cloudPolicy);
  }
  return map;
}

const DAYTONA_TOOL_POLICY_CONTRACT = buildDaytonaToolPolicyContractMap();

function normalizeToolName(value: unknown): DaytonaToolName | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "read" ||
    normalized === "list_dir" ||
    normalized === "glob" ||
    normalized === "grep" ||
    normalized === "sha256" ||
    normalized === "write" ||
    normalized === "edit" ||
    normalized === "bash" ||
    normalized === "update_plan" ||
    normalized === "community_search" ||
    normalized === "community_memory_candidate_propose"
  ) {
    return normalized;
  }
  return null;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline <= 0) return trimmed;
  const closingFence = trimmed.lastIndexOf("```");
  if (closingFence <= firstNewline) return trimmed;
  return trimmed.slice(firstNewline + 1, closingFence).trim();
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  return Array.from(view).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeCloudApprovalMode(value: unknown): CloudApprovalMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "read-only" || normalized === "agent" || normalized === "agent-full") {
    return normalized;
  }
  return "agent";
}

export function parseDaytonaAgentDecision(rawText: string): DaytonaAgentDecision | null {
  const stripped = stripCodeFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const type = String(record.type ?? "").trim().toLowerCase();
  if (type === "assistant") {
    const text = String(record.text ?? "").trim();
    if (!text) return null;
    return { type: "assistant", text };
  }
  if (type === "tool_call") {
    const toolName = normalizeToolName(record.tool_name);
    if (!toolName) return null;
    const args = record.args && typeof record.args === "object" && !Array.isArray(record.args)
      ? (record.args as Record<string, unknown>)
      : {};
    const reason = String(record.reason ?? "").trim() || null;
    return {
      type: "tool_call",
      tool_name: toolName,
      args,
      reason,
    };
  }
  return null;
}

export function buildDaytonaAgentSystemPrompt(params: {
  projectId: string;
  sandboxId: string;
  maxIterations: number;
  approvalMode: CloudApprovalMode;
}): string {
  const writePolicyLine = params.approvalMode === "agent-full"
    ? "- write/edit/bash are available for this run (user-approved mode agent-full)."
    : "- write/edit/bash require explicit approval and are denied in this run unless mode is agent-full.";
  return [
    "You are the PolyNet cloud coding agent running inside a Daytona sandbox.",
    "Return only strict JSON (no prose, no markdown).",
    "Allowed JSON outputs:",
    '1) {"type":"assistant","text":"..."}',
    '2) {"type":"tool_call","tool_name":"read|list_dir|glob|grep|sha256|write|edit|bash|update_plan|community_search|community_memory_candidate_propose","args":{...},"reason":"..."}',
    "Rules:",
    "- At most one tool_call per response.",
    "- Prefer read/list_dir/glob/grep/sha256 before any risky operation.",
    "- Never claim you cannot access sandbox tools; filesystem and process tools are available in this lane.",
    "- If user intent is discovery (e.g. 'list files', 'show sandbox', 'what is in here'), call list_dir with path='.'.",
    "- Keep paths relative to workspace root (use '.' for root; avoid 'workspace/' prefixes) and never use absolute paths.",
    "- If a tool result indicates denial/error, adapt and continue without repeating the same failing call.",
    writePolicyLine,
    `- You have a max of ${params.maxIterations} tool iterations this run.`,
    `Context: project_id=${params.projectId}, sandbox_id=${params.sandboxId}`,
  ].join("\n");
}

export async function makeToolCallKey(params: {
  toolName: DaytonaToolName;
  args: Record<string, unknown>;
  projectId: string;
}): Promise<string> {
  const canonicalArgs = JSON.stringify(params.args, Object.keys(params.args).sort());
  return sha256Hex(`${params.projectId}:${params.toolName}:${canonicalArgs}`);
}

export function resolveDaytonaToolPolicy(
  toolName: DaytonaToolName,
  approvalMode: CloudApprovalMode,
): DaytonaToolPolicyDecision {
  const policyByMode = DAYTONA_TOOL_POLICY_CONTRACT.get(toolName);
  if (policyByMode) {
    const resolved = policyByMode[approvalMode] ?? policyByMode.default ?? null;
    if (resolved) {
      return {
        allowed: resolved.allowed,
        requiresApproval: resolved.requires_approval,
        policyBasis: resolved.policy_basis,
        denialCode: resolved.denial_code ?? null,
        denialMessage: resolved.denial_message ?? null,
      };
    }
  }
  if (toolName === "community_search" || toolName === "community_memory_candidate_propose") {
    return {
      allowed: true,
      requiresApproval: false,
      policyBasis: "cloud_policy_v1:community_tools_auto_allow",
      denialCode: null,
      denialMessage: null,
    };
  }
  return {
    allowed: false,
    requiresApproval: true,
    policyBasis: "cloud_policy_v1:tool_unknown",
    denialCode: "tool_not_enabled_for_cloud_daytona_v1",
    denialMessage: "This tool is not enabled for cloud Daytona.",
  };
}
