import type { DeveloperAppAuthType } from "./communityAppMountTypes.ts";
import {
  COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY,
  findCommunityWorkflowImportMcpRegistryEntryById,
  resolveCommunityWorkflowImportMcpRegistryConnectPolicy,
  type CommunityWorkflowImportMcpRegistryEntry,
  type CommunityWorkflowImportMcpRegistrySetupKind,
  type CommunityWorkflowImportMcpRegistryStatus,
} from "./communityWorkflowImportMcpRegistry.ts";

export const PRIVATE_COMMUNITY_PLUGIN_SCHEMA = "polynet.plugin.v0" as const;

export type PrivateCommunityPluginNormalizedPlugin = {
  schema: typeof PRIVATE_COMMUNITY_PLUGIN_SCHEMA;
  name: string;
  description: string | null;
  version: string | null;
  visibility: "private_community";
};

export type PrivateCommunityPluginSkillPlan = {
  sourceIndex: number;
  name: string;
  slug: string;
  description: string | null;
  mentionToken: string | null;
};

export type PrivateCommunityPluginMcpAppPlan = {
  sourceIndex: number;
  name: string;
  mcpRegistryId: string;
  catalogAppId: string | null;
  endpointUrl: string;
  authType: DeveloperAppAuthType;
  setupKind: CommunityWorkflowImportMcpRegistrySetupKind;
  registryStatus: CommunityWorkflowImportMcpRegistryStatus;
  enabledTools: string[];
  reason: string;
};

export type PrivateCommunityPluginPlanMessage = {
  code: string;
  path: string;
  message: string;
};

export type PrivateCommunityPluginCompilePlan = {
  normalizedPlugin: PrivateCommunityPluginNormalizedPlugin | null;
  skillsToAttach: PrivateCommunityPluginSkillPlan[];
  mcpAppsToStage: PrivateCommunityPluginMcpAppPlan[];
  rejections: PrivateCommunityPluginPlanMessage[];
  warnings: PrivateCommunityPluginPlanMessage[];
};

type JsonRecord = Record<string, unknown>;

const FORBIDDEN_PUBLICATION_KEYS = new Set([
  "catalog",
  "discover",
  "install",
  "installable",
  "installation",
  "installer",
  "listing",
  "marketplace",
  "public",
  "publish",
  "published",
  "publication",
]);

const FORBIDDEN_VISIBILITY_VALUES = new Set([
  "catalog",
  "discover",
  "marketplace",
  "public",
  "publish",
  "published",
  "publication",
]);

const RUNTIME_EXECUTION_KEYS = new Set([
  "args",
  "command",
  "commands",
  "cwd",
  "execute",
  "exec",
  "runtime",
  "shell",
  "stdio",
]);

const SECRET_KEY_PATTERNS = [
  /(^|[_-])secret(s)?($|[_-])/i,
  /(^|[_-])token(s)?($|[_-])/i,
  /(^|[_-])password($|[_-])/i,
  /(^|[_-])api[_-]?key($|[_-])/i,
  /(^|[_-])credential(s)?($|[_-])/i,
  /(^|[_-])shared[_-]?credential(s)?($|[_-])/i,
  /(^|[_-])authorization($|[_-])/i,
  /(^|[_-])headers($|[_-])/i,
  /(^|[_-])env($|[_-])/i,
  /(^|[_-])client[_-]?secret($|[_-])/i,
];

const NON_SECRET_TOKEN_KEYS = new Set(["mention_token", "mentiontoken"]);

function emptyPlan(): PrivateCommunityPluginCompilePlan {
  return {
    normalizedPlugin: null,
    skillsToAttach: [],
    mcpAppsToStage: [],
    rejections: [],
    warnings: [],
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeFieldKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function slugify(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isDeveloperAppAuthType(value: unknown): value is DeveloperAppAuthType {
  return (
    value === "none" ||
    value === "api_key" ||
    value === "bearer" ||
    value === "oauth"
  );
}

function getEndpointHost(value: unknown): string {
  try {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function endpointLooksLocalOrPrivate(value: unknown): boolean {
  try {
    const raw = String(value ?? "").trim();
    if (!raw) return false;
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return true;
    }
    const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!ipv4) return false;
    const [, firstRaw, secondRaw] = ipv4;
    const first = Number(firstRaw);
    const second = Number(secondRaw);
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  } catch {
    return false;
  }
}

function findSecretPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretPaths(item, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeFieldKey(key);
    if (
      !NON_SECRET_TOKEN_KEYS.has(normalizedKey) &&
      SECRET_KEY_PATTERNS.some((pattern) => pattern.test(normalizedKey))
    ) {
      paths.push(`${path}.${key}`);
      continue;
    }
    paths.push(...findSecretPaths(child, `${path}.${key}`));
  }
  return paths;
}

function findRuntimeExecutionPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findRuntimeExecutionPaths(item, `${path}[${index}]`),
    );
  }
  if (!isRecord(value)) return [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (RUNTIME_EXECUTION_KEYS.has(normalizeKey(key))) {
      paths.push(`${path}.${key}`);
      continue;
    }
    paths.push(...findRuntimeExecutionPaths(child, `${path}.${key}`));
  }
  return paths;
}

function hasRuntimeExecutionShape(value: JsonRecord): boolean {
  return Object.keys(value).some((key) => RUNTIME_EXECUTION_KEYS.has(normalizeKey(key)));
}

function isForbiddenVisibilityValue(value: unknown): boolean {
  return FORBIDDEN_VISIBILITY_VALUES.has(normalizeKey(value));
}

function findPublicMetadataPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findPublicMetadataPaths(item, `${path}[${index}]`),
    );
  }
  if (!isRecord(value)) return [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (
      FORBIDDEN_PUBLICATION_KEYS.has(normalizedKey) ||
      (normalizedKey === "visibility" && isForbiddenVisibilityValue(child))
    ) {
      paths.push(`${path}.${key}`);
      continue;
    }
    paths.push(...findPublicMetadataPaths(child, `${path}.${key}`));
  }
  return paths;
}

function normalizeEnabledTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tools: string[] = [];
  for (const item of value) {
    const tool = cleanString(item, 120);
    if (!tool || seen.has(tool)) continue;
    seen.add(tool);
    tools.push(tool);
  }
  return tools;
}

function getRegistryCandidates(entry: CommunityWorkflowImportMcpRegistryEntry): string[] {
  return [
    entry.id,
    entry.name,
    ...entry.aliases,
    ...entry.packageNames,
    ...entry.commandTokens,
  ].map(normalizeKey).filter(Boolean);
}

function findRegistryEntryForMcp(rawMcp: JsonRecord): CommunityWorkflowImportMcpRegistryEntry | null {
  const explicitId =
    rawMcp.mcpRegistryId ?? rawMcp.mcp_registry_id ?? rawMcp.registryId;
  const byId = findCommunityWorkflowImportMcpRegistryEntryById(explicitId);
  if (byId) return byId;

  const endpointHost = getEndpointHost(rawMcp.endpointUrl ?? rawMcp.endpoint_url ?? rawMcp.url);
  if (endpointHost) {
    const byHost = COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY.find((entry) =>
      entry.endpointHosts.some((host) => getEndpointHost(`https://${host}`) === endpointHost),
    );
    if (byHost) return byHost;
  }

  const nameKey = normalizeKey(rawMcp.name ?? rawMcp.id ?? rawMcp.packageName);
  if (!nameKey) return null;
  return (
    COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY.find((entry) =>
      getRegistryCandidates(entry).includes(nameKey),
    ) ?? null
  );
}

function compileSkill(
  rawSkill: unknown,
  sourceIndex: number,
  plan: PrivateCommunityPluginCompilePlan,
) {
  const path = `$.skills[${sourceIndex}]`;
  if (!isRecord(rawSkill)) {
    plan.rejections.push({
      code: "skill_entry_invalid",
      path,
      message: "Skill entries must be objects.",
    });
    return;
  }
  const name = cleanString(rawSkill.name);
  if (!name) {
    plan.rejections.push({
      code: "skill_name_required",
      path: `${path}.name`,
      message: "Skill entries need a name.",
    });
    return;
  }
  const slug = slugify(rawSkill.slug) || slugify(name);
  plan.skillsToAttach.push({
    sourceIndex,
    name,
    slug,
    description: cleanString(rawSkill.description, 500) || null,
    mentionToken: cleanString(rawSkill.mentionToken ?? rawSkill.mention_token, 80) || null,
  });
}

function compileMcpServer(
  rawMcp: unknown,
  sourceIndex: number,
  plan: PrivateCommunityPluginCompilePlan,
) {
  const path = `$.mcpServers[${sourceIndex}]`;
  if (!isRecord(rawMcp)) {
    plan.rejections.push({
      code: "mcp_entry_invalid",
      path,
      message: "MCP entries must be objects.",
    });
    return;
  }

  const transport = normalizeKey(rawMcp.transport ?? rawMcp.type);
  if (transport === "stdio" || hasRuntimeExecutionShape(rawMcp)) {
    plan.rejections.push({
      code: "mcp_stdio_or_runtime_not_supported",
      path,
      message: "Private plugin manifests cannot import stdio, command, shell, or local runtime MCP definitions.",
    });
    return;
  }

  const endpointUrl = cleanString(rawMcp.endpointUrl ?? rawMcp.endpoint_url ?? rawMcp.url, 500);
  if (endpointLooksLocalOrPrivate(endpointUrl)) {
    plan.rejections.push({
      code: "mcp_endpoint_local_or_private",
      path: `${path}.endpointUrl`,
      message: "Localhost, private network, and internal MCP endpoints are not importable.",
    });
    return;
  }

  const registryEntry = findRegistryEntryForMcp(rawMcp);
  if (!registryEntry) {
    plan.rejections.push({
      code: endpointUrl ? "mcp_unknown_hosted_endpoint" : "mcp_registry_entry_missing",
      path,
      message: endpointUrl
        ? "Hosted MCP endpoints must match a reviewed Polynet registry entry."
        : "MCP entries must identify a reviewed Polynet registry entry.",
    });
    return;
  }

  if (
    registryEntry.connectionClass !== "hosted_remote" ||
    registryEntry.status === "needs_runtime" ||
    registryEntry.status === "unsupported" ||
    registryEntry.status === "unknown"
  ) {
    plan.rejections.push({
      code: "mcp_needs_managed_runtime",
      path,
      message: `${registryEntry.name} needs managed runtime support before it can be imported as a private community MCP app.`,
    });
    return;
  }

  const authTypeCandidate = rawMcp.authType ?? rawMcp.auth_type ?? registryEntry.defaultAuthType;
  if (!isDeveloperAppAuthType(authTypeCandidate)) {
    plan.rejections.push({
      code: "mcp_auth_type_invalid",
      path: `${path}.authType`,
      message: "MCP entries need a supported auth type.",
    });
    return;
  }

  const candidateEndpointUrl = endpointUrl || registryEntry.defaultEndpointUrl || "";
  const policy = resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
    mcpRegistryId: registryEntry.id,
    name: registryEntry.name,
    endpointUrl: candidateEndpointUrl,
    authType: authTypeCandidate,
  });
  if (!policy.ok) {
    plan.rejections.push({
      code: policy.code,
      path,
      message: policy.message,
    });
    return;
  }

  plan.mcpAppsToStage.push({
    sourceIndex,
    name: registryEntry.name,
    mcpRegistryId: policy.mcpRegistryId,
    catalogAppId: registryEntry.catalogAppId,
    endpointUrl: policy.endpointUrl,
    authType: policy.authType,
    setupKind: registryEntry.setupKind,
    registryStatus: registryEntry.status,
    enabledTools: normalizeEnabledTools(rawMcp.enabledTools ?? rawMcp.enabled_tools),
    reason: registryEntry.reason,
  });
}

export function compilePrivateCommunityPluginManifest(
  rawManifest: unknown,
): PrivateCommunityPluginCompilePlan {
  const plan = emptyPlan();
  if (!isRecord(rawManifest)) {
    plan.rejections.push({
      code: "manifest_invalid",
      path: "$",
      message: "Plugin manifest must be a JSON object.",
    });
    return plan;
  }

  const schema = cleanString(rawManifest.schema);
  if (schema !== PRIVATE_COMMUNITY_PLUGIN_SCHEMA) {
    plan.rejections.push({
      code: "manifest_schema_unsupported",
      path: "$.schema",
      message: `Expected schema ${PRIVATE_COMMUNITY_PLUGIN_SCHEMA}.`,
    });
    return plan;
  }

  const name = cleanString(rawManifest.name);
  if (!name) {
    plan.rejections.push({
      code: "manifest_name_required",
      path: "$.name",
      message: "Plugin manifest needs a name.",
    });
    return plan;
  }

  plan.normalizedPlugin = {
    schema: PRIVATE_COMMUNITY_PLUGIN_SCHEMA,
    name,
    description: cleanString(rawManifest.description, 500) || null,
    version: cleanString(rawManifest.version, 120) || null,
    visibility: "private_community",
  };

  for (const path of findPublicMetadataPaths(rawManifest)) {
    plan.rejections.push({
      code: "plugin_publication_not_supported",
      path,
      message: "Public, marketplace, Discover, and publication metadata are out of scope for private plugin manifests.",
    });
  }

  if (
    rawManifest.visibility !== undefined &&
    cleanString(rawManifest.visibility) !== "private_community"
  ) {
    plan.rejections.push({
      code: "plugin_publication_not_supported",
      path: "$.visibility",
      message: "Private plugin manifests cannot request public, marketplace, Discover, or publication visibility.",
    });
  }

  for (const path of findSecretPaths(rawManifest)) {
    plan.rejections.push({
      code: "plugin_secret_not_allowed",
      path,
      message: "Private plugin manifests cannot contain tokens, API keys, secrets, passwords, env blocks, or authorization headers.",
    });
  }

  for (const path of findRuntimeExecutionPaths(rawManifest)) {
    plan.rejections.push({
      code: "plugin_runtime_instruction_not_supported",
      path,
      message: "Private plugin manifests cannot contain command, shell, stdio, cwd, or runtime execution instructions.",
    });
  }

  if (plan.rejections.length > 0) {
    return plan;
  }

  const rawSkills = rawManifest.skills;
  if (rawSkills !== undefined && !Array.isArray(rawSkills)) {
    plan.rejections.push({
      code: "skills_invalid",
      path: "$.skills",
      message: "skills must be an array when present.",
    });
  } else {
    (rawSkills ?? []).forEach((skill, index) => compileSkill(skill, index, plan));
  }

  const rawMcpServers = rawManifest.mcpServers ?? rawManifest.mcp_servers;
  if (rawMcpServers !== undefined && !Array.isArray(rawMcpServers)) {
    plan.rejections.push({
      code: "mcp_servers_invalid",
      path: "$.mcpServers",
      message: "mcpServers must be an array when present.",
    });
  } else {
    (rawMcpServers ?? []).forEach((mcpServer, index) =>
      compileMcpServer(mcpServer, index, plan),
    );
  }

  if (plan.skillsToAttach.length === 0 && plan.mcpAppsToStage.length === 0) {
    plan.warnings.push({
      code: "plugin_manifest_empty",
      path: "$",
      message: "Manifest compiled, but it did not contain any stageable skills or MCP apps.",
    });
  }

  return plan;
}
