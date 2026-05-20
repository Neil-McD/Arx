import { DISCOVER_APP_CATALOG } from "./discoverCatalog";
import type { DeveloperAppAuthType } from "./communityAppMountTypes";
import {
  buildCommunityWorkflowImportMarkdownSkillReviewItemId,
  buildCommunityWorkflowImportMcpReviewItemId,
  buildCommunityWorkflowImportSkillReviewItemId,
  normalizeCommunityWorkflowImportCandidateKey,
} from "./communityWorkflowImportCandidateIds";

export type CommunityWorkflowImportReviewItem = {
  id: string;
  kind: "mcp" | "skill" | "repo";
  name: string;
  summary: string;
  source: string | null;
  preview: string | null;
  logoUrl: string | null;
  defaultSelected: boolean;
  catalogAppId?: string | null;
  endpointUrl?: string | null;
  authType?: DeveloperAppAuthType | null;
  instructionsMd?: string | null;
  repositoryUrl?: string | null;
  repositoryRecommendation?: string | null;
};

export type CommunityWorkflowImportReviewProjection = {
  mcpServers: CommunityWorkflowImportReviewItem[];
  skills: CommunityWorkflowImportReviewItem[];
  repository: CommunityWorkflowImportReviewItem | null;
  questionCount: number;
  secretCount: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const DISCOVER_APP_LOGO_BY_KEY = new Map<string, string>();
const DISCOVER_APP_ID_BY_KEY = new Map<string, string>();

for (const app of DISCOVER_APP_CATALOG) {
  const keys = [app.id, app.name];
  for (const key of keys) {
    const normalizedKey = normalizeCommunityWorkflowImportCandidateKey(key);
    DISCOVER_APP_ID_BY_KEY.set(normalizedKey, app.id);
    if (app.logoUrl) DISCOVER_APP_LOGO_BY_KEY.set(normalizedKey, app.logoUrl);
  }
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function readRecordArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readRecordListText(record: Record<string, unknown>, keys: string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    } else if (Array.isArray(value)) {
      for (const item of value.slice(0, 4)) {
        if (typeof item === "string" && item.trim()) {
          parts.push(item.trim());
        } else if (isPlainObject(item)) {
          const itemText = readRecordString(item, ["title", "name", "path", "location", "summary"]);
          if (itemText) parts.push(itemText);
        }
      }
    }
  }
  return parts.join(" | ");
}

function truncateReviewText(value: string, maxLength = 150): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function basenameWithoutExtension(path: string): string {
  const basename = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return basename.replace(/\.[a-z0-9]+$/i, "");
}

function displayNameFromRaw(value: string, fallback: string): string {
  const clean = value.trim();
  if (!clean) return fallback;
  return clean
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getReviewLogoUrl(record: Record<string, unknown>, name: string): string | null {
  const app = getReviewCatalogApp(record, name);
  if (app?.logoUrl) return app.logoUrl;
  const candidates = [
    readRecordString(record, ["catalog_app_id", "catalogAppId", "app_id", "appId", "id"]),
    name,
    readRecordString(record, ["package", "packageName", "command", "endpoint", "server"]),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const key = normalizeCommunityWorkflowImportCandidateKey(candidate);
    const direct = DISCOVER_APP_LOGO_BY_KEY.get(key);
    if (direct) return direct;
    for (const [catalogKey, logoUrl] of DISCOVER_APP_LOGO_BY_KEY) {
      if (catalogKey.length > 2 && key.includes(catalogKey)) return logoUrl;
    }
  }
  return null;
}

function getReviewCatalogApp(
  record: Record<string, unknown>,
  name: string,
): (typeof DISCOVER_APP_CATALOG)[number] | null {
  const candidates = [
    readRecordString(record, ["catalog_app_id", "catalogAppId", "app_id", "appId", "id"]),
    name,
    readRecordString(record, ["package", "packageName", "command", "endpoint", "server"]),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const key = normalizeCommunityWorkflowImportCandidateKey(candidate);
    const directId = DISCOVER_APP_ID_BY_KEY.get(key);
    if (directId) {
      return DISCOVER_APP_CATALOG.find((app) => app.id === directId) ?? null;
    }
    for (const [catalogKey, appId] of DISCOVER_APP_ID_BY_KEY) {
      if (catalogKey.length > 2 && key.includes(catalogKey)) {
        return DISCOVER_APP_CATALOG.find((app) => app.id === appId) ?? null;
      }
    }
  }
  return null;
}

function normalizeReviewAuthType(value: string): DeveloperAppAuthType | null {
  const normalized = value.toLowerCase();
  if (
    normalized === "none" ||
    normalized === "api_key" ||
    normalized === "bearer" ||
    normalized === "oauth"
  ) {
    return normalized;
  }
  if (normalized === "api key" || normalized === "apikey" || normalized === "token") {
    return "api_key";
  }
  if (normalized === "bearer_token" || normalized === "bearer token") {
    return "bearer";
  }
  return null;
}

function readReviewInstructionsMd(record: Record<string, unknown>): string | null {
  const value = readRecordString(record, [
    "instructionsMd",
    "instructions_md",
    "proposedInstructionsMd",
    "proposed_instructions_md",
    "skillBody",
    "skill_body",
    "markdownBody",
    "markdown_body",
  ]);
  return value.length >= 40 ? value : null;
}

function itemHasLowConfidence(record: Record<string, unknown>): boolean {
  return readRecordString(record, ["confidence", "confidence_level"]).toLowerCase() === "low";
}

function recordTextIncludes(record: Record<string, unknown>, keys: string[], needles: string[]): boolean {
  const haystack = keys.map((key) => readRecordString(record, [key])).join(" ").toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function isRejectedWorkflowCandidate(record: Record<string, unknown>): boolean {
  const explicitlyRejected = recordTextIncludes(
    record,
    [
      "recommendedHandling",
      "recommended_handling",
      "recommendedAction",
      "recommended_action",
      "status",
    ],
    ["ignore", "not_recommended", "unsupported", "not portable"],
  );
  if (explicitlyRejected) return true;
  const portable = readRecordString(record, [
    "portableToAnotherHarness",
    "portable_to_another_harness",
    "portable",
  ]).toLowerCase();
  return portable === "no";
}

function collectRequiredSecretNames(
  ledger: Record<string, unknown>,
  records: Record<string, unknown>[],
): Set<string> {
  const secretNames = new Set<string>();
  const topLevel = readRecordArray(ledger, [
    "required_secret_placeholders",
    "requiredSecretPlaceholders",
    "secret_placeholders",
    "secretPlaceholders",
  ]);
  for (const value of topLevel) {
    if (typeof value === "string" && value.trim()) secretNames.add(value.trim());
    if (isPlainObject(value)) {
      const name = readRecordString(value, ["name", "key", "envVar", "env_var", "label"]);
      if (name) secretNames.add(name);
    }
  }
  for (const record of records) {
    for (const value of readRecordArray(record, ["requiredEnvVars", "required_env_vars", "envVars", "env_vars"])) {
      if (typeof value === "string" && value.trim()) secretNames.add(value.trim());
    }
  }
  return secretNames;
}

export function buildCommunityWorkflowImportReviewProjection(
  ledgerJson: unknown,
): CommunityWorkflowImportReviewProjection {
  const ledger = isPlainObject(ledgerJson) ? ledgerJson : {};
  const mcpRecords = readRecordArray(ledger, [
    "mcp_servers",
    "mcpServers",
    "mcp_candidates",
    "mcpCandidates",
    "mcpServerCandidates",
  ]).filter(isPlainObject);
  const skillRecords = readRecordArray(ledger, [
    "skills",
    "skill_candidates",
    "skillCandidates",
    "workflow_skills",
    "workflowSkills",
  ]).filter(isPlainObject);
  const markdownRecords = readRecordArray(ledger, [
    "markdown_files",
    "markdownFiles",
    "markdown_candidates",
    "markdownCandidates",
    "md_files",
    "mdFiles",
  ]).filter(isPlainObject);

  const mcpServers = mcpRecords.map((record, index): CommunityWorkflowImportReviewItem => {
    const name = displayNameFromRaw(
      readRecordString(record, ["name", "serverName", "server_name", "catalog_app_id", "catalogAppId", "id"]),
      `MCP server ${index + 1}`,
    );
    const source = readRecordString(record, ["configLocation", "config_location", "location", "path", "endpoint", "command"]);
    const catalogApp = getReviewCatalogApp(record, name);
    const endpointUrl =
      readRecordString(record, ["endpoint_url", "endpointUrl", "endpoint", "url"]) ||
      (catalogApp?.personalConnect.connectionKind === "known"
        ? catalogApp.personalConnect.endpointUrl ?? ""
        : "");
    const authType =
      normalizeReviewAuthType(readRecordString(record, ["auth_type", "authType", "authMode", "auth_mode"])) ??
      (catalogApp?.personalConnect.connectionKind === "known" &&
      catalogApp.personalConnect.availability === "ready"
        ? catalogApp.personalConnect.authType
        : null);
    return {
      id: buildCommunityWorkflowImportMcpReviewItemId({ name, source, index }),
      kind: "mcp",
      name,
      summary: truncateReviewText(readRecordString(record, ["purpose", "summary", "description", "capabilities"]) || "MCP server"),
      source: source || null,
      preview: truncateReviewText(readRecordListText(record, ["evidence", "capabilities", "requiredEnvVars", "required_env_vars"]), 260) || null,
      logoUrl: getReviewLogoUrl(record, name),
      defaultSelected: !itemHasLowConfidence(record) && !isRejectedWorkflowCandidate(record),
      catalogAppId: catalogApp?.id ?? null,
      endpointUrl: endpointUrl || null,
      authType,
    };
  });

  const skills: CommunityWorkflowImportReviewItem[] = [];
  for (const [index, record] of skillRecords.entries()) {
    const name = displayNameFromRaw(
      readRecordString(record, ["name", "title", "skillName", "skill_name", "invocation"]),
      `Skill ${index + 1}`,
    );
    const source = readRecordString(record, ["location", "path", "source_file", "sourceFile", "invocation"]);
    const dependsOnRepo = readRecordString(record, ["dependsOnRepoCode", "depends_on_repo_code"]).toLowerCase() === "yes";
    skills.push({
      id: buildCommunityWorkflowImportSkillReviewItemId({ name, source, index }),
      kind: "skill",
      name,
      summary: truncateReviewText(readRecordString(record, ["purpose", "summary", "description"]) || "Reusable agent behavior."),
      source: source || null,
      preview: truncateReviewText(readRecordListText(record, ["evidence", "requiredEnvVars", "required_env_vars"]), 320) || null,
      logoUrl: null,
      defaultSelected: !dependsOnRepo && !itemHasLowConfidence(record) && !isRejectedWorkflowCandidate(record),
      instructionsMd: readReviewInstructionsMd(record),
    });
  }

  for (const [index, record] of markdownRecords.entries()) {
    const handling = readRecordString(record, ["recommendedHandling", "recommended_handling"]).toLowerCase();
    const standalone = readRecordString(record, ["standaloneSkillCandidate", "standalone_skill_candidate"]).toLowerCase();
    const behaviorRules = readRecordString(record, ["containsAgentBehaviorRules", "contains_agent_behavior_rules"]).toLowerCase();
    const dependsOnRepo = readRecordString(record, ["dependsOnRepoContext", "depends_on_repo_context"]).toLowerCase();
    const shouldShow =
      handling === "import_as_skill" ||
      handling === "merge_into_agent_instructions" ||
      handling === "review_manually" ||
      standalone === "yes" ||
      behaviorRules === "yes";
    if (!shouldShow) continue;
    const source = readRecordString(record, ["path", "location", "source_file", "sourceFile"]);
    const name = displayNameFromRaw(
      readRecordString(record, ["title", "name"]) || (source ? basenameWithoutExtension(source) : ""),
      `Markdown skill ${index + 1}`,
    );
    skills.push({
      id: buildCommunityWorkflowImportMarkdownSkillReviewItemId({ name, source, index }),
      kind: "skill",
      name,
      summary: truncateReviewText(
        readRecordString(record, ["summary", "whyItMatters", "why_it_matters", "reasoning"]) ||
          "Markdown-based workflow instructions.",
      ),
      source: source || null,
      preview: truncateReviewText(readRecordListText(record, ["shortExcerpt", "short_excerpt", "importantHeadings", "evidence"]), 360) || null,
      logoUrl: null,
      defaultSelected:
        handling === "import_as_skill" ||
        (standalone === "yes" && dependsOnRepo !== "yes" && !itemHasLowConfidence(record)),
      instructionsMd: readReviewInstructionsMd(record),
    });
  }

  const dedupedSkills: CommunityWorkflowImportReviewItem[] = [];
  const seenSkillKeys = new Set<string>();
  for (const skill of skills) {
    const key = normalizeCommunityWorkflowImportCandidateKey(`${skill.name}-${skill.source ?? ""}`);
    if (seenSkillKeys.has(key)) continue;
    seenSkillKeys.add(key);
    dedupedSkills.push(skill);
  }

  const repositoryRecord = isPlainObject(ledger.repository) ? ledger.repository : null;
  const repositoryPresent = repositoryRecord
    ? readRecordString(repositoryRecord, ["present"]).toLowerCase()
    : "no";
  const remoteUrl = repositoryRecord
    ? readRecordString(repositoryRecord, ["remoteUrl", "remote_url", "url"])
    : "";
  const repository =
    repositoryRecord && (repositoryPresent !== "no" || remoteUrl)
      ? (() => {
          const host = readRecordString(repositoryRecord, ["host"]).toLowerCase();
          const visibility = readRecordString(repositoryRecord, ["visibility"]) || "unknown";
          const recommendation = readRecordString(repositoryRecord, [
            "publicSharingRecommendation",
            "public_sharing_recommendation",
            "recommendedNextStep",
            "recommended_next_step",
          ]);
          const name = host === "github" || remoteUrl.includes("github.com")
            ? "GitHub repository"
            : "Repository";
          return {
            id: "repo:primary",
            kind: "repo" as const,
            name,
            summary: truncateReviewText(`${visibility}${recommendation ? ` | ${recommendation.replace(/_/g, " ")}` : ""}`),
            source: remoteUrl || null,
            preview: truncateReviewText(readRecordListText(repositoryRecord, ["reasoning", "evidence"]), 320) || null,
            logoUrl: getReviewLogoUrl(repositoryRecord, name),
            repositoryUrl: remoteUrl || null,
            repositoryRecommendation: recommendation || null,
            defaultSelected:
              (host === "github" || remoteUrl.includes("github.com")) &&
              (visibility.toLowerCase() === "public" ||
                recommendation === "recommended" ||
                recommendation === "connect_public_github" ||
                recommendation === "create_public_github_repo"),
          };
        })()
      : null;

  const questionCount = readRecordArray(ledger, ["clarifying_questions", "clarifyingQuestions", "questions"]).length;
  const secretCount = collectRequiredSecretNames(ledger, [...mcpRecords, ...skillRecords]).size;
  return {
    mcpServers,
    skills: dedupedSkills,
    repository,
    questionCount,
    secretCount,
  };
}
