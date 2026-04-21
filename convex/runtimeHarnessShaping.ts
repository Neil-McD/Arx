import {
  type CommunityOverlayMountedTool,
  type CommunityOverlaySelectedSkill,
  type CommunityOverlaySkillInventory,
} from "../shared/communityOverlayRuntime";
import {
  type PersonalOverlaySelectedSkill,
  type PersonalOverlaySkillInventory,
} from "../shared/personalSkillOverlayRuntime";
import {
  buildOpenAiFunctionTools,
  projectResponsesApiToolSchema,
  type ResponsesApiFunctionTool,
} from "../shared/toolRegistry";
import type { RuntimeMountedMcpTool } from "./runtimeMcpManager";
import { decodeStoredMcpToolInputSchema } from "./mcpSnapshotCodec";

type OpenAiCompatibleFunctionTool = ReturnType<
  typeof buildOpenAiFunctionTools
>[number];

export type RuntimeMountedCommunityAppTool = {
  community_app_mount_id: string;
  developer_app_id: string;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

export type RuntimeMountedUserPlatformAppTool = {
  user_platform_app_mount_id: string;
  developer_app_id: string;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

export type RuntimeCommunitySkillInventory = {
  community_skill_attachment_id: string;
  skill_package_id: string;
  name: string;
  mention_token: string;
  description: string | null;
};

export type RuntimeSelectedCommunitySkill = RuntimeCommunitySkillInventory & {
  skill_revision_id: string | null;
  instructions_md: string;
};

export type RuntimeUserPlatformSkillInventory = {
  user_platform_skill_install_id: string;
  skill_package_id: string;
  name: string;
  mention_token: string;
  description: string | null;
};

export type RuntimeSelectedUserPlatformSkill = RuntimeUserPlatformSkillInventory & {
  skill_revision_id: string | null;
  instructions_md: string;
};

export type RuntimeSkillResolution = {
  requested_mention_tokens: string[];
  ambiguous_mention_tokens: string[];
  user_platform_skill_inventory: RuntimeUserPlatformSkillInventory[];
  selected_user_platform_skills: RuntimeSelectedUserPlatformSkill[];
  community_skill_inventory: RuntimeCommunitySkillInventory[];
  selected_community_skills: RuntimeSelectedCommunitySkill[];
};

export function normalizeMountedToolSchema(
  value: unknown,
): Record<string, unknown> | boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    return decodeStoredMcpToolInputSchema({
      input_schema_json: value,
    });
  }
  return {
    type: "object",
    additionalProperties: true,
    properties: {},
  };
}

export function normalizeRuntimeMountedCommunityAppTools(
  value: unknown,
): RuntimeMountedCommunityAppTool[] {
  if (!Array.isArray(value)) return [];
  const tools: RuntimeMountedCommunityAppTool[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const namespacedToolName = String(
      record.namespaced_tool_name ?? "",
    ).trim();
    const toolName = String(record.tool_name ?? "").trim();
    if (!namespacedToolName || !toolName || seen.has(namespacedToolName)) {
      continue;
    }
    seen.add(namespacedToolName);
    const riskLevel =
      record.risk_level === "write" || record.risk_level === "sensitive"
        ? record.risk_level
        : "read";
    tools.push({
      community_app_mount_id: String(record.community_app_mount_id ?? "").trim(),
      developer_app_id: String(record.developer_app_id ?? "").trim(),
      app_name: String(record.app_name ?? "").trim() || "Community app",
      endpoint_url: String(record.endpoint_url ?? "").trim(),
      auth_type: String(record.auth_type ?? "").trim(),
      tool_name: toolName,
      namespaced_tool_name: namespacedToolName,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      input_schema: normalizeMountedToolSchema(
        record.input_schema_json ?? record.input_schema,
      ),
      risk_level: riskLevel,
    });
  }
  return tools;
}

export function normalizeRuntimeMountedUserPlatformAppTools(
  value: unknown,
): RuntimeMountedUserPlatformAppTool[] {
  if (!Array.isArray(value)) return [];
  const tools: RuntimeMountedUserPlatformAppTool[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const namespacedToolName = String(
      record.namespaced_tool_name ?? "",
    ).trim();
    const toolName = String(record.tool_name ?? "").trim();
    if (!namespacedToolName || !toolName || seen.has(namespacedToolName)) {
      continue;
    }
    seen.add(namespacedToolName);
    const riskLevel =
      record.risk_level === "write" || record.risk_level === "sensitive"
        ? record.risk_level
        : "read";
    tools.push({
      user_platform_app_mount_id: String(
        record.user_platform_app_mount_id ?? "",
      ).trim(),
      developer_app_id: String(record.developer_app_id ?? "").trim(),
      app_name: String(record.app_name ?? "").trim() || "My app",
      endpoint_url: String(record.endpoint_url ?? "").trim(),
      auth_type: String(record.auth_type ?? "").trim(),
      tool_name: toolName,
      namespaced_tool_name: namespacedToolName,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      input_schema: normalizeMountedToolSchema(
        record.input_schema_json ?? record.input_schema,
      ),
      risk_level: riskLevel,
    });
  }
  return tools;
}

export function normalizeRuntimeCommunitySkillInventory(
  value: unknown,
): RuntimeCommunitySkillInventory[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeCommunitySkillInventory[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    if (!mentionToken || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      community_skill_attachment_id: String(
        record.community_skill_attachment_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
    });
  }
  return skills;
}

export function normalizeRuntimeSelectedCommunitySkills(
  value: unknown,
): RuntimeSelectedCommunitySkill[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeSelectedCommunitySkill[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    const instructionsMd =
      typeof record.instructions_md === "string"
        ? record.instructions_md.trim()
        : "";
    if (!mentionToken || !instructionsMd || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      community_skill_attachment_id: String(
        record.community_skill_attachment_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      skill_revision_id:
        typeof record.skill_revision_id === "string" && record.skill_revision_id.trim()
          ? record.skill_revision_id.trim()
          : null,
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      instructions_md: instructionsMd,
    });
  }
  return skills;
}

export function normalizeRuntimeUserPlatformSkillInventory(
  value: unknown,
): RuntimeUserPlatformSkillInventory[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeUserPlatformSkillInventory[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    if (!mentionToken || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      user_platform_skill_install_id: String(
        record.user_platform_skill_install_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
    });
  }
  return skills;
}

export function normalizeRuntimeSelectedUserPlatformSkills(
  value: unknown,
): RuntimeSelectedUserPlatformSkill[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeSelectedUserPlatformSkill[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    const instructionsMd =
      typeof record.instructions_md === "string"
        ? record.instructions_md.trim()
        : "";
    if (!mentionToken || !instructionsMd || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      user_platform_skill_install_id: String(
        record.user_platform_skill_install_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      skill_revision_id:
        typeof record.skill_revision_id === "string" && record.skill_revision_id.trim()
          ? record.skill_revision_id.trim()
          : null,
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      instructions_md: instructionsMd,
    });
  }
  return skills;
}

export function normalizeRuntimeSkillResolution(
  value: unknown,
): RuntimeSkillResolution {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const requestedMentionTokens = Array.isArray(record?.requested_mention_tokens)
    ? record!.requested_mention_tokens
        .map((token) => String(token ?? "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  const ambiguousMentionTokens = Array.isArray(record?.ambiguous_mention_tokens)
    ? record!.ambiguous_mention_tokens
        .map((token) => String(token ?? "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  return {
    requested_mention_tokens: requestedMentionTokens,
    ambiguous_mention_tokens: ambiguousMentionTokens,
    user_platform_skill_inventory: normalizeRuntimeUserPlatformSkillInventory(
      record?.user_platform_skill_inventory,
    ),
    selected_user_platform_skills:
      normalizeRuntimeSelectedUserPlatformSkills(
        record?.selected_user_platform_skills,
      ),
    community_skill_inventory: normalizeRuntimeCommunitySkillInventory(
      record?.community_skill_inventory,
    ),
    selected_community_skills: normalizeRuntimeSelectedCommunitySkills(
      record?.selected_community_skills,
    ),
  };
}

export function buildMountedAppToolDescription(
  tool: RuntimeMountedMcpTool,
): string {
  const baseDescription =
    tool.description ||
    `Run ${tool.tool_name} on ${
      tool.scope === "user" ? "your" : "the active community"
    } ${tool.app_name} app.`;
  if (tool.scope === "user" && tool.risk_level !== "read") {
    return `[Approval required for write or sensitive actions] ${baseDescription}`;
  }
  return baseDescription;
}

export function buildMountedAppOpenAiTools(
  mountedTools: RuntimeMountedMcpTool[],
): OpenAiCompatibleFunctionTool[] {
  return mountedTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.runtime_tool_name,
      description: buildMountedAppToolDescription(tool),
      parameters: normalizeMountedToolSchema(tool.input_schema),
      strict: true,
    },
  }));
}

export function buildMountedAppResponsesTools(
  mountedTools: RuntimeMountedMcpTool[],
): ResponsesApiFunctionTool[] {
  return mountedTools.map((tool) => {
    const projection = projectResponsesApiToolSchema(
      normalizeMountedToolSchema(tool.input_schema),
      {
        allowBestEffortFallback: true,
      },
    );
    return {
      type: "function",
      name: tool.runtime_tool_name,
      description: buildMountedAppToolDescription(tool),
      parameters: projection.parameters,
      strict: projection.strict,
    };
  });
}

export function buildUserPlatformMountedAppsPromptBlock(
  mountedTools: RuntimeMountedMcpTool[],
): string {
  if (mountedTools.length === 0) return "";
  return [
    "",
    "Your connected app tools stay available across communities, but they are exposed lazily.",
    "Use `resolve_mounted_tools` with a short query when you need a connected personal app tool.",
    "Resolved personal app tools use the `me__` prefix when they are exposed to the model.",
    "Personal app tools that are marked write or sensitive require an approval flow and will refuse execution until that flow ships. Read tools can run directly.",
  ].join("\n");
}

export function mapMountedToolsToOverlayRuntime(
  mountedTools: RuntimeMountedCommunityAppTool[],
): CommunityOverlayMountedTool[] {
  return mountedTools.map((tool) => ({
    namespacedToolName: tool.namespaced_tool_name,
    toolName: tool.tool_name,
    appName: tool.app_name,
    description: tool.description,
  }));
}

export function mapCommunitySkillsToOverlayRuntime(
  attachedSkills: RuntimeCommunitySkillInventory[],
): CommunityOverlaySkillInventory[] {
  return attachedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
  }));
}

export function mapSelectedCommunitySkillsToOverlayRuntime(
  selectedSkills: RuntimeSelectedCommunitySkill[],
): CommunityOverlaySelectedSkill[] {
  return selectedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
    instructionsMd: skill.instructions_md,
  }));
}

export function mapUserPlatformSkillsToOverlayRuntime(
  installedSkills: RuntimeUserPlatformSkillInventory[],
): PersonalOverlaySkillInventory[] {
  return installedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
  }));
}

export function mapSelectedUserPlatformSkillsToOverlayRuntime(
  selectedSkills: RuntimeSelectedUserPlatformSkill[],
): PersonalOverlaySelectedSkill[] {
  return selectedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
    instructionsMd: skill.instructions_md,
  }));
}

export function formatJsonToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function readFailureOutputPreview(details: unknown): string {
  const record =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  if (!record) return "";
  const preferred = String(record.output_preview ?? "").trim();
  if (preferred) return preferred;
  const responseText = String(record.response_text ?? "").trim();
  if (responseText) return responseText;
  return "";
}

export function summarizeToolArgsForLog(
  toolName: string,
  normalizedArgs: unknown,
): Record<string, unknown> {
  const record =
    normalizedArgs &&
    typeof normalizedArgs === "object" &&
    !Array.isArray(normalizedArgs)
      ? (normalizedArgs as Record<string, unknown>)
      : null;
  if (!record) return { toolName };
  const summary: Record<string, unknown> = {
    toolName,
    argKeys: Object.keys(record).sort(),
  };
  if (typeof record.path === "string" && record.path.trim()) {
    summary.path = record.path.trim().slice(0, 1024);
  }
  if (typeof record.cwd === "string" && record.cwd.trim()) {
    summary.cwd = record.cwd.trim().slice(0, 1024);
  }
  if (typeof record.offset === "number" && Number.isFinite(record.offset)) {
    summary.offset = Math.max(0, Math.floor(record.offset));
  }
  if (typeof record.limit === "number" && Number.isFinite(record.limit)) {
    summary.limit = Math.max(0, Math.floor(record.limit));
  }
  if (typeof record.preview_path === "string" && record.preview_path.trim()) {
    summary.previewPath = record.preview_path.trim().slice(0, 1024);
  }
  if (
    typeof record.preview_port === "number" &&
    Number.isFinite(record.preview_port)
  ) {
    summary.previewPort = Math.max(0, Math.floor(record.preview_port));
  }
  if (typeof record.command === "string") {
    summary.hasCommand = true;
  }
  return summary;
}
