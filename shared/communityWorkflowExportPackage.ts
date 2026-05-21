import { strFromU8, unzipSync } from "fflate";

export const COMMUNITY_WORKFLOW_EXPORT_PACKAGE_SENTINEL =
  "[WORKFLOW_IMPORT_PACKAGE_UPLOAD]";

export const COMMUNITY_WORKFLOW_EXPORT_PACKAGE_SCHEMA_VERSION =
  "polynet_workflow_export_v1";

export const COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS = {
  maxZipBytes: 10 * 1024 * 1024,
  maxFiles: 100,
  maxTotalTextBytes: 5 * 1024 * 1024,
  maxJsonChars: 400_000,
  maxSkillBodyChars: 40_000,
  maxSkills: 30,
  maxMcpServers: 100,
};

type WorkflowExportPackageParseParams = {
  communityId: unknown;
  builderUserId: unknown;
  sourceHarness: string;
  sourceFilename?: string | null;
};

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const ZIP_GENERAL_PURPOSE_ENCRYPTED = 0x0001;

export type CommunityWorkflowExportPackageSummary = {
  schema_version: string;
  source_filename: string | null;
  zip_byte_count: number;
  file_count: number;
  total_text_bytes: number;
  skill_count: number;
  mcp_count: number;
  markdown_decision_count: number;
  checksum_count: number;
};

export type CommunityWorkflowExportPackageParseResult = {
  ledger: Record<string, unknown>;
  summary: CommunityWorkflowExportPackageSummary;
};

function normalizeText(input: unknown, maxLength: number): string {
  return String(input ?? "").trim().slice(0, maxLength);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(`${label}_must_be_object`);
  return value;
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function parseJsonText(text: string, label: string): unknown {
  if (text.length > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxJsonChars) {
    throw new Error(`${label}_too_large`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}_invalid_json`);
  }
}

function normalizePath(rawPath: string): string {
  const value = String(rawPath ?? "").trim();
  if (!value) throw new Error("workflow_export_empty_path");
  if (value.includes("\\")) throw new Error("workflow_export_backslash_path_rejected");
  if (value.startsWith("/") || /^[A-Za-z]:\//.test(value)) {
    throw new Error("workflow_export_absolute_path_rejected");
  }
  const parts = value.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("workflow_export_relative_path_rejected");
  }
  if (
    parts.some((part) =>
      ["__MACOSX", ".git", "node_modules", ".next", "dist", "build", "coverage"].includes(part),
    )
  ) {
    throw new Error("workflow_export_junk_path_rejected");
  }
  return parts.join("/");
}

function readAllowedPathKind(path: string):
  | { kind: "manifest" }
  | { kind: "checksums" }
  | { kind: "mcpServers" }
  | { kind: "markdownDecisions" }
  | { kind: "repository" }
  | { kind: "evidence" }
  | { kind: "skillBody"; slug: string }
  | { kind: "skillMetadata"; slug: string }
  | null {
  if (path === "manifest.json") return { kind: "manifest" };
  if (path === "checksums.json") return { kind: "checksums" };
  if (path === "mcp/servers.json") return { kind: "mcpServers" };
  if (path === "markdown/decisions.json") return { kind: "markdownDecisions" };
  if (path === "repository.json") return { kind: "repository" };
  if (path === "evidence.json") return { kind: "evidence" };
  const skillBody = path.match(/^skills\/([^/]+)\/SKILL\.md$/);
  if (skillBody) return { kind: "skillBody", slug: skillBody[1] };
  const skillMetadata = path.match(/^skills\/([^/]+)\/metadata\.json$/);
  if (skillMetadata) return { kind: "skillMetadata", slug: skillMetadata[1] };
  return null;
}

function isLikelyBinary(bytes: Uint8Array): boolean {
  const length = Math.min(bytes.length, 8192);
  for (let index = 0; index < length; index += 1) {
    if (bytes[index] === 0) return true;
  }
  return false;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new Error("workflow_export_zip_directory_invalid");
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new Error("workflow_export_zip_directory_invalid");
  }
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function findEndOfCentralDirectoryOffset(bytes: Uint8Array): number {
  if (bytes.byteLength < ZIP_EOCD_MIN_BYTES) {
    throw new Error("workflow_export_zip_directory_missing");
  }
  const minOffset = Math.max(0, bytes.byteLength - ZIP_EOCD_MIN_BYTES - ZIP_MAX_COMMENT_BYTES);
  for (let offset = bytes.byteLength - ZIP_EOCD_MIN_BYTES; offset >= minOffset; offset -= 1) {
    if (readUint32LE(bytes, offset) !== ZIP_EOCD_SIGNATURE) continue;
    const commentLength = readUint16LE(bytes, offset + 20);
    if (offset + ZIP_EOCD_MIN_BYTES + commentLength === bytes.byteLength) return offset;
  }
  throw new Error("workflow_export_zip_directory_missing");
}

function enforceCentralDirectoryEntrySize(
  kind: NonNullable<ReturnType<typeof readAllowedPathKind>>,
  path: string,
  uncompressedSize: number,
) {
  if (
    kind.kind === "skillBody" &&
    uncompressedSize > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxSkillBodyChars
  ) {
    throw new Error(`workflow_export_skill_body_too_large:${kind.slug}`);
  }
  if (
    kind.kind !== "skillBody" &&
    uncompressedSize > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxJsonChars
  ) {
    throw new Error(`workflow_export_json_file_too_large:${path}`);
  }
}

function validateWorkflowExportZipDirectory(bytes: Uint8Array) {
  const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
  const diskNumber = readUint16LE(bytes, eocdOffset + 4);
  const centralDirectoryDisk = readUint16LE(bytes, eocdOffset + 6);
  const entriesOnThisDisk = readUint16LE(bytes, eocdOffset + 8);
  const totalEntries = readUint16LE(bytes, eocdOffset + 10);
  const centralDirectorySize = readUint32LE(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUint32LE(bytes, eocdOffset + 16);
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnThisDisk !== totalEntries) {
    throw new Error("workflow_export_multidisk_zip_unsupported");
  }
  if (
    totalEntries === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error("workflow_export_zip64_unsupported");
  }
  if (
    centralDirectoryOffset > bytes.byteLength ||
    centralDirectorySize > bytes.byteLength ||
    centralDirectoryOffset + centralDirectorySize > bytes.byteLength
  ) {
    throw new Error("workflow_export_zip_directory_invalid");
  }

  const seenPaths = new Set<string>();
  let offset = centralDirectoryOffset;
  let centralDirectoryEntriesSeen = 0;
  let acceptedFiles = 0;
  let totalTextBytes = 0;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  while (offset < centralDirectoryEnd) {
    if (readUint32LE(bytes, offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("workflow_export_zip_directory_invalid");
    }
    centralDirectoryEntriesSeen += 1;

    const generalPurposeFlag = readUint16LE(bytes, offset + 8);
    if ((generalPurposeFlag & ZIP_GENERAL_PURPOSE_ENCRYPTED) !== 0) {
      throw new Error("workflow_export_encrypted_entry_rejected");
    }

    const compressedSize = readUint32LE(bytes, offset + 20);
    const uncompressedSize = readUint32LE(bytes, offset + 24);
    const fileNameLength = readUint16LE(bytes, offset + 28);
    const extraFieldLength = readUint16LE(bytes, offset + 30);
    const fileCommentLength = readUint16LE(bytes, offset + 32);
    if (compressedSize === ZIP64_SENTINEL_32 || uncompressedSize === ZIP64_SENTINEL_32) {
      throw new Error("workflow_export_zip64_unsupported");
    }

    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const nextOffset = fileNameEnd + extraFieldLength + fileCommentLength;
    if (fileNameEnd > centralDirectoryEnd || nextOffset > centralDirectoryEnd) {
      throw new Error("workflow_export_zip_directory_invalid");
    }

    const rawPath = strFromU8(bytes.slice(fileNameStart, fileNameEnd));
    if (!rawPath.endsWith("/")) {
      const path = normalizePath(rawPath);
      if (seenPaths.has(path)) throw new Error("workflow_export_duplicate_path");
      seenPaths.add(path);
      const kind = readAllowedPathKind(path);
      if (!kind) throw new Error(`workflow_export_unexpected_path:${path}`);
      enforceCentralDirectoryEntrySize(kind, path, uncompressedSize);
      acceptedFiles += 1;
      if (acceptedFiles > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxFiles) {
        throw new Error("workflow_export_too_many_files");
      }
      totalTextBytes += uncompressedSize;
      if (totalTextBytes > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxTotalTextBytes) {
        throw new Error("workflow_export_text_too_large");
      }
    }

    offset = nextOffset;
  }

  if (offset !== centralDirectoryEnd || centralDirectoryEntriesSeen !== totalEntries) {
    throw new Error("workflow_export_zip_directory_invalid");
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readChecksumMap(checksumsJson: unknown): Map<string, string> {
  if (!isPlainRecord(checksumsJson)) return new Map();
  const candidates = [checksumsJson.sha256, checksumsJson.files, checksumsJson.checksums];
  const map = new Map<string, string>();
  for (const candidate of candidates) {
    if (!isPlainRecord(candidate)) continue;
    for (const [rawPath, rawValue] of Object.entries(candidate)) {
      const path = normalizePath(rawPath);
      const value = isPlainRecord(rawValue)
        ? readRecordString(rawValue, ["sha256", "hash", "digest"])
        : String(rawValue ?? "").trim();
      if (/^[a-f0-9]{64}$/i.test(value)) map.set(path, value.toLowerCase());
    }
  }
  return map;
}

function readArrayFromJson(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isPlainRecord(value)) return [];
  for (const key of keys) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function buildProposedActions(args: {
  mcpServers: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  repository: Record<string, unknown> | null;
}): Record<string, unknown>[] {
  const actions: Record<string, unknown>[] = [];
  for (const mcp of args.mcpServers) {
    const name = readRecordString(mcp, ["officialName", "official_name", "name"]) || "MCP server";
    actions.push({
      type: "mcp_server",
      label: name,
      target: readRecordString(mcp, ["catalog_app_id", "catalogAppId", "packageName", "endpoint", "name"]),
      status: readRecordString(mcp, ["catalog_app_id", "catalogAppId"]) ? "ready_to_connect" : "needs_review",
      reason: readRecordString(mcp, ["purpose", "summary", "description"]) || "Workflow export package candidate.",
    });
  }
  for (const skill of args.skills) {
    const name = readRecordString(skill, ["name", "title"]) || "Skill";
    actions.push({
      type: "skill",
      label: name,
      target: readRecordString(skill, ["location", "source_file", "sourceFile", "name"]),
      status: readRecordString(skill, ["proposedInstructionsMd", "instructionsMd"])
        ? "ready_to_attach"
        : "needs_review",
      reason: readRecordString(skill, ["purpose", "summary", "description"]) || "Workflow export package skill.",
    });
  }
  if (args.repository) {
    actions.push({
      type: "repository",
      label: readRecordString(args.repository, ["fullName", "full_name", "remoteUrl", "remote_url"]) || "Repository",
      target: readRecordString(args.repository, ["remoteUrl", "remote_url", "fullName", "full_name"]),
      status: "record_next_action",
      reason: readRecordString(args.repository, ["reasoning", "summary"]) || "Repository handling decision from workflow export.",
    });
  }
  return actions;
}

export async function parseCommunityWorkflowExportPackage(
  bytes: Uint8Array,
  params: WorkflowExportPackageParseParams,
): Promise<CommunityWorkflowExportPackageParseResult> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
    throw new Error("workflow_export_package_empty");
  }
  if (bytes.byteLength > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxZipBytes) {
    throw new Error("workflow_export_package_too_large");
  }
  validateWorkflowExportZipDirectory(bytes);

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("workflow_export_package_invalid_zip");
  }

  const normalizedEntries = new Map<string, { bytes: Uint8Array; kind: NonNullable<ReturnType<typeof readAllowedPathKind>> }>();
  let totalTextBytes = 0;
  for (const [rawPath, fileBytes] of Object.entries(files)) {
    if (rawPath.endsWith("/")) continue;
    const path = normalizePath(rawPath);
    if (normalizedEntries.has(path)) throw new Error("workflow_export_duplicate_path");
    const kind = readAllowedPathKind(path);
    if (!kind) throw new Error(`workflow_export_unexpected_path:${path}`);
    enforceCentralDirectoryEntrySize(kind, path, fileBytes.byteLength);
    if (isLikelyBinary(fileBytes)) throw new Error("workflow_export_binary_file_rejected");
    totalTextBytes += fileBytes.byteLength;
    if (totalTextBytes > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxTotalTextBytes) {
      throw new Error("workflow_export_text_too_large");
    }
    normalizedEntries.set(path, { bytes: fileBytes, kind });
  }

  if (normalizedEntries.size > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxFiles) {
    throw new Error("workflow_export_too_many_files");
  }
  if (!normalizedEntries.has("manifest.json")) {
    throw new Error("workflow_export_manifest_required");
  }

  const readText = (path: string): string | null => {
    const entry = normalizedEntries.get(path);
    if (!entry) return null;
    return strFromU8(entry.bytes);
  };
  const readJson = (path: string): unknown => {
    const text = readText(path);
    return text ? parseJsonText(text, path.replace(/[^a-z0-9]/gi, "_")) : null;
  };

  const checksumsJson = readJson("checksums.json");
  const checksumMap = readChecksumMap(checksumsJson);
  for (const [path, expected] of checksumMap.entries()) {
    if (path === "checksums.json") continue;
    const entry = normalizedEntries.get(path);
    if (!entry) throw new Error(`workflow_export_checksum_missing_file:${path}`);
    const actual = await sha256Hex(entry.bytes);
    if (actual !== expected) throw new Error(`workflow_export_checksum_mismatch:${path}`);
  }

  const manifest = requirePlainRecord(readJson("manifest.json"), "workflow_export_manifest");
  const schemaVersion = readRecordString(manifest, ["schemaVersion", "schema_version"]);
  if (!schemaVersion) {
    throw new Error("workflow_export_schema_version_required");
  }
  if (schemaVersion !== COMMUNITY_WORKFLOW_EXPORT_PACKAGE_SCHEMA_VERSION) {
    throw new Error("workflow_export_schema_version_unsupported");
  }

  const rawMcpServers = readArrayFromJson(readJson("mcp/servers.json"), [
    "mcpServers",
    "mcp_servers",
    "servers",
  ]).filter(isPlainRecord);
  if (rawMcpServers.length > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxMcpServers) {
    throw new Error("workflow_export_too_many_mcp_servers");
  }
  const mcpServers = rawMcpServers.map((record) => ({
    ...record,
    source: readRecordString(record, ["source"]) || "workflow_export_zip",
  }));

  const skillMetadataBySlug = new Map<string, Record<string, unknown>>();
  const skillBodyBySlug = new Map<string, string>();
  for (const [path, entry] of normalizedEntries.entries()) {
    if (entry.kind.kind === "skillMetadata") {
      skillMetadataBySlug.set(
        entry.kind.slug,
        requirePlainRecord(parseJsonText(strFromU8(entry.bytes), path.replace(/[^a-z0-9]/gi, "_")), "workflow_export_skill_metadata"),
      );
    } else if (entry.kind.kind === "skillBody") {
      const body = normalizeText(strFromU8(entry.bytes), COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxSkillBodyChars);
      if (body.length < 40) throw new Error(`workflow_export_skill_body_too_short:${entry.kind.slug}`);
      skillBodyBySlug.set(entry.kind.slug, body);
    }
  }

  const skills: Record<string, unknown>[] = [];
  for (const [slug, body] of skillBodyBySlug.entries()) {
    const metadata = skillMetadataBySlug.get(slug) ?? {};
    skills.push({
      ...metadata,
      name: readRecordString(metadata, ["name", "title"]) || slug.replace(/[-_]+/g, " "),
      kind: readRecordString(metadata, ["kind"]) || "skill",
      location: readRecordString(metadata, ["location", "source_file", "sourceFile"]) || `skills/${slug}/SKILL.md`,
      source_file: `skills/${slug}/SKILL.md`,
      proposedInstructionsMd: body,
      recommendedHandling: readRecordString(metadata, ["recommendedHandling", "recommended_handling"]) || "import_as_skill",
      polynetAction: readRecordString(metadata, ["polynetAction", "polynet_action"]) || "skill_import_candidate",
      confidence: readRecordString(metadata, ["confidence"]) || "high",
    });
  }
  if (skills.length > COMMUNITY_WORKFLOW_EXPORT_PACKAGE_LIMITS.maxSkills) {
    throw new Error("workflow_export_too_many_skills");
  }

  const markdownFiles = readArrayFromJson(readJson("markdown/decisions.json"), [
    "markdownFiles",
    "markdown_files",
    "decisions",
  ]).filter(isPlainRecord);
  const repositoryJson = readJson("repository.json");
  const repository = isPlainRecord(repositoryJson) ? repositoryJson : null;
  const evidenceJson = readJson("evidence.json");
  const scanSummary = isPlainRecord(manifest.scanSummary)
    ? manifest.scanSummary
    : isPlainRecord(manifest.scan_summary)
      ? manifest.scan_summary
      : {};

  const ledger: Record<string, unknown> = {
    version: "community_workflow_import_ledger_v1",
    source_kind: "workflow_export_zip",
    schema_version: schemaVersion || COMMUNITY_WORKFLOW_EXPORT_PACKAGE_SCHEMA_VERSION,
    community_id: String(params.communityId),
    builder_user_id: String(params.builderUserId),
    source_harness: normalizeText(params.sourceHarness, 80) || "Other",
    package_filename: normalizeText(params.sourceFilename, 240) || null,
    summary: isPlainRecord(manifest.summary) ? manifest.summary : {},
    scan_summary: scanSummary,
    mcp_servers: mcpServers,
    skills,
    markdown_files: markdownFiles,
    repository,
    evidence: evidenceJson ?? null,
    required_secret_placeholders: readArrayFromJson(manifest.requiredSecretPlaceholders ?? manifest.required_secret_placeholders, []),
    clarifying_questions: readArrayFromJson(manifest.questions ?? manifest.clarifying_questions, []),
    proposed_integration_actions: buildProposedActions({ mcpServers, skills, repository }),
    notes: [
      {
        type: "workflow_export_package",
        message: "Parsed from a validated PolyNet workflow export package.",
      },
    ],
  };

  return {
    ledger,
    summary: {
      schema_version: String(ledger.schema_version),
      source_filename: normalizeText(params.sourceFilename, 240) || null,
      zip_byte_count: bytes.byteLength,
      file_count: normalizedEntries.size,
      total_text_bytes: totalTextBytes,
      skill_count: skills.length,
      mcp_count: mcpServers.length,
      markdown_decision_count: markdownFiles.length,
      checksum_count: checksumMap.size,
    },
  };
}
