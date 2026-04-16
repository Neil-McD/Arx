import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  DAYTONA_WORKSPACE_ROOT,
  deleteDaytonaSandbox,
  listDaytonaSandboxes,
  loadDaytonaConfig,
  stopDaytonaSandbox,
  waitForDaytonaSandboxStopped,
  type DaytonaConfig,
  type DaytonaSandboxApiDto,
} from "./daytonaSandboxClient";
import {
  createWorkspaceSandboxSession,
  cleanupWorkspaceSandboxSession,
  type WorkspaceSandboxSession,
} from "./daytonaWorkspaceSession";
import { executeDaytonaCommand } from "./daytonaToolboxExecutor";

const BUILDER_MAX_PROJECTS = 5;
const PROJECT_IMPORT_MAX_BYTES = 150 * 1024 * 1024;
const PROJECT_IMPORT_MAX_FILES = 25_000;
const PROJECT_IMPORT_MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;
const PROJECT_IMPORT_LEASE_MS = 20 * 60 * 1000;

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

async function resolveOwnerIdForAuthenticatedRequest(args: {
  ctx: any;
  ownerId?: any;
  authSubject?: string | null;
}): Promise<any> {
  try {
    return await resolveUserIdForAuthenticatedRequest({
      ctx: args.ctx,
      userId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "user_id_mismatch") {
      throw new Error("owner_id_mismatch");
    }
    throw error;
  }
}

async function ensureDefaultProjectInternal(args: {
  ctx: any;
  ownerId: any;
  nowMs: number;
}) {
  const existingRows = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", args.ownerId))
    .collect();
  const existing = existingRows.sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null;
  if (existing) return existing;

  const id = await args.ctx.db.insert("cloudProjects", {
    ownerId: args.ownerId,
    name: "Workspace",
    status: "active",
    providerVolumeId: undefined,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await args.ctx.db.get(id);
  if (!created) throw new Error("project_create_failed");
  return created;
}

function normalizeOptionalVolumeValue(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function readSandboxLabel(sandbox: DaytonaSandboxApiDto, key: string): string | null {
  const labels =
    sandbox.labels && typeof sandbox.labels === "object" && !Array.isArray(sandbox.labels)
      ? (sandbox.labels as Record<string, unknown>)
      : null;
  const value = String(labels?.[key] ?? "").trim();
  return value || null;
}

function buildProjectVolumeName(project: { _id?: unknown }): string {
  const projectId = normalizeIdValue(project._id);
  if (!projectId) throw new Error("project_id_required");
  return `arx-workspace-${projectId}`;
}

function normalizeOptionalProjectString(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function buildNextProjectName(existingProjects: Array<{ name?: string | null }>): string {
  const used = new Set(
    existingProjects
      .map((project) => String(project.name ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  let nextIndex = 1;
  while (used.has(`Project ${nextIndex}`.toLowerCase())) {
    nextIndex += 1;
  }
  return `Project ${nextIndex}`;
}

function shellQuote(value: string): string {
  return `'${String(value ?? "").replace(/'/g, `'\"'\"'`)}'`;
}

function buildProjectImportRunId(projectId: unknown): string {
  return `project_import_${normalizeIdValue(projectId)}_${Date.now()}`;
}

function buildProjectImportArchivePath(projectId: unknown): string {
  const safeProjectId = normalizeIdValue(projectId).replace(/[^a-zA-Z0-9_-]/g, "_") || "project";
  return `${DAYTONA_WORKSPACE_ROOT}/.arx-import-${safeProjectId}-${Date.now()}.zip`;
}

function buildProjectZipImportCommand(params: {
  zipPath: string;
  archiveUrl: string;
  workspaceRoot: string;
}): string {
  const script = String.raw`
import json
import os
import shutil
import tempfile
import urllib.error
import urllib.request
import zipfile

zip_path = os.environ["ARX_IMPORT_ZIP"]
workspace_root = os.environ["ARX_IMPORT_ROOT"]
archive_url = os.environ["ARX_IMPORT_URL"]
max_zip_bytes = ${String(PROJECT_IMPORT_MAX_BYTES)}
max_extracted_files = ${String(PROJECT_IMPORT_MAX_FILES)}
max_extracted_bytes = ${String(PROJECT_IMPORT_MAX_EXTRACTED_BYTES)}
junk_names = {"__MACOSX", ".git", "node_modules", ".next", "dist", "build", "coverage"}
blocked_dir_paths = {
    (".ssh",),
    (".aws",),
    (".azure",),
    (".kube",),
    (".config", "gcloud"),
}
blocked_file_names = {"id_rsa", "id_ed25519", "authorized_keys", "known_hosts", ".npmrc", ".netrc"}
blocked_suffixes = (".pem", ".key", ".p12", ".pfx")

summary = {
    "zip_bytes": 0,
    "imported_files": 0,
    "skipped_files": 0,
    "blocked_files": 0,
    "common_root_stripped": False,
}
staging_root = tempfile.mkdtemp(prefix=".arx-import-stage-", dir=workspace_root)

def normalize_parts(name: str):
    return [part for part in name.replace("\\", "/").split("/") if part not in ("", ".")]

def is_symlink(info):
    return ((int(info.external_attr or 0) >> 16) & 0o170000) == 0o120000

def is_blocked(parts):
    lowered = [part.lower() for part in parts]
    for candidate in blocked_dir_paths:
        candidate_len = len(candidate)
        if tuple(lowered[:candidate_len]) == candidate:
            return True
        for index in range(0, max(0, len(lowered) - candidate_len + 1)):
            if tuple(lowered[index:index + candidate_len]) == candidate:
                return True
    base = lowered[-1] if lowered else ""
    if base in blocked_file_names:
        return True
    return any(base.endswith(suffix) for suffix in blocked_suffixes)

def system_exit(code):
    raise SystemExit(code)

def copy_with_limit(src, dst, current_total):
    total = current_total
    while True:
        chunk = src.read(1024 * 1024)
        if not chunk:
            return total
        total += len(chunk)
        if total > max_extracted_bytes:
            system_exit("project_import_extracted_bytes_exceeded")
        try:
            dst.write(chunk)
        except OSError as exc:
            if getattr(exc, "errno", None) == 28:
                system_exit("project_import_storage_full")
            raise

try:
    try:
        request = urllib.request.Request(archive_url, headers={"User-Agent": "arx-import/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response, open(zip_path, "wb") as zip_dst:
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    if int(content_length) > max_zip_bytes:
                        system_exit("project_import_too_large")
                except ValueError:
                    pass
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                summary["zip_bytes"] += len(chunk)
                if summary["zip_bytes"] > max_zip_bytes:
                    system_exit("project_import_too_large")
                zip_dst.write(chunk)
    except SystemExit:
        raise
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        system_exit("project_import_download_failed")
    except OSError as exc:
        if getattr(exc, "errno", None) == 28:
            system_exit("project_import_storage_full")
        raise

    if summary["zip_bytes"] <= 0:
        system_exit("project_import_empty")

    with zipfile.ZipFile(zip_path) as archive:
        infos = archive.infolist()
        roots = set()
        for info in infos:
            parts = normalize_parts(info.filename)
            if not parts:
                continue
            if parts[0] in junk_names or is_blocked(parts):
                continue
            roots.add(parts[0])
        common_root = next(iter(roots)) if len(roots) == 1 else None
        summary["common_root_stripped"] = common_root is not None

        seen_relative_targets = set()
        validated_entries = []
        extracted_file_count = 0
        extracted_total_bytes = 0

        for info in infos:
            parts = normalize_parts(info.filename)
            if not parts:
                continue
            if common_root and parts and parts[0] == common_root:
                parts = parts[1:]
            if not parts:
                continue
            if any(part in junk_names for part in parts):
                summary["skipped_files"] += 1
                continue
            if is_blocked(parts):
                summary["blocked_files"] += 1
                continue
            if is_symlink(info):
                raise SystemExit("project_import_unsafe_entry")

            relative_target = os.path.join(*parts)
            normalized_relative_target = os.path.normpath(relative_target)
            if normalized_relative_target in ("", ".") or normalized_relative_target.startswith(".."):
                raise SystemExit("project_import_unsafe_entry")
            if normalized_relative_target in seen_relative_targets:
                raise SystemExit("project_import_unsafe_entry")
            seen_relative_targets.add(normalized_relative_target)

            target_path = os.path.abspath(os.path.join(staging_root, normalized_relative_target))
            staging_prefix = os.path.abspath(staging_root) + os.sep
            if target_path != os.path.abspath(staging_root) and not target_path.startswith(staging_prefix):
                raise SystemExit("project_import_unsafe_entry")

            if info.is_dir():
                validated_entries.append((info, normalized_relative_target, target_path, True))
                continue

            extracted_file_count += 1
            if extracted_file_count > max_extracted_files:
                system_exit("project_import_too_many_files")
            validated_entries.append((info, normalized_relative_target, target_path, False))

        for info, _relative_target, target_path, is_dir in validated_entries:
            if is_dir:
                os.makedirs(target_path, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            try:
                with archive.open(info, "r") as src, open(target_path, "wb") as dst:
                    extracted_total_bytes = copy_with_limit(src, dst, extracted_total_bytes)
            except OSError as exc:
                if getattr(exc, "errno", None) == 28:
                    system_exit("project_import_storage_full")
                raise
            summary["imported_files"] += 1

        for current_root, _dirnames, filenames in os.walk(staging_root):
            relative_root = os.path.relpath(current_root, staging_root)
            target_root = workspace_root if relative_root == "." else os.path.join(workspace_root, relative_root)
            os.makedirs(target_root, exist_ok=True)
            for filename in filenames:
                staged_path = os.path.join(current_root, filename)
                target_path = os.path.join(target_root, filename)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                try:
                    shutil.move(staged_path, target_path)
                except OSError as exc:
                    if getattr(exc, "errno", None) == 28:
                        system_exit("project_import_storage_full")
                    raise

    print(json.dumps(summary, sort_keys=True))
finally:
    shutil.rmtree(staging_root, ignore_errors=True)
`;
  return [
    `mkdir -p ${shellQuote(params.workspaceRoot)}`,
    `ARX_IMPORT_ZIP=${shellQuote(params.zipPath)} ARX_IMPORT_URL=${shellQuote(params.archiveUrl)} ARX_IMPORT_ROOT=${shellQuote(params.workspaceRoot)} python3 - <<'PY'`,
    script.trim(),
    "PY",
    `rm -f ${shellQuote(params.zipPath)}`,
  ].join("\n");
}

function parseProjectImportSummary(outputText: string): {
  zipBytes: number;
  importedFiles: number;
  skippedFiles: number;
  blockedFiles: number;
  commonRootStripped: boolean;
} {
  const lines = String(outputText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] ?? "";
  if (!lastLine) {
    return {
      zipBytes: 0,
      importedFiles: 0,
      skippedFiles: 0,
      blockedFiles: 0,
      commonRootStripped: false,
    };
  }
  try {
    const parsed = JSON.parse(lastLine) as Record<string, unknown>;
    return {
      zipBytes: Math.max(0, Math.floor(Number(parsed.zip_bytes ?? 0) || 0)),
      importedFiles: Math.max(0, Math.floor(Number(parsed.imported_files ?? 0) || 0)),
      skippedFiles: Math.max(0, Math.floor(Number(parsed.skipped_files ?? 0) || 0)),
      blockedFiles: Math.max(0, Math.floor(Number(parsed.blocked_files ?? 0) || 0)),
      commonRootStripped: Boolean(parsed.common_root_stripped),
    };
  } catch {
    return {
      zipBytes: 0,
      importedFiles: 0,
      skippedFiles: 0,
      blockedFiles: 0,
      commonRootStripped: false,
    };
  }
}

function readDaytonaCommandFailureMessage(details: unknown): string {
  const record =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  const outputPreview = String(record?.output_preview ?? "").trim();
  if (outputPreview) {
    const line = outputPreview.split("\n").map((value) => value.trim()).find(Boolean);
    if (line) return line;
  }
  const stderrPreview = String(record?.stderr_preview ?? "").trim();
  if (stderrPreview) {
    const line = stderrPreview.split("\n").map((value) => value.trim()).find(Boolean);
    if (line) return line;
  }
  return "";
}

type DaytonaVolumeApiDto = {
  id?: string | null;
  name?: string | null;
  state?: string | null;
  status?: string | null;
};

type DaytonaSandboxStatusApiDto = {
  id?: string | null;
  state?: string | null;
  status?: string | null;
};

function daytonaHeaders(config: DaytonaConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  if (config.orgId) headers["X-Daytona-Organization-ID"] = config.orgId;
  return headers;
}

async function parseDaytonaResponseBody(response: Response): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text();
  if (!text.trim()) return { text, json: null };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null };
  }
}

async function daytonaVolumeRequest<T>(params: {
  config: DaytonaConfig;
  path: string;
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown> | null;
}): Promise<
  | { ok: true; payload: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  let response: Response;
  try {
    response = await fetch(`${params.config.apiBaseUrl}${params.path}`, {
      method: params.method,
      headers: daytonaHeaders(params.config),
      ...(params.body ? { body: JSON.stringify(params.body) } : null),
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: error instanceof Error ? error.message : "Daytona API request failed.",
    };
  }
  const { text, json } = await parseDaytonaResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: response.status === 404 ? "not_found" : "runner_unavailable",
      message: `Daytona API ${params.method} ${params.path} failed (${response.status}).`,
      details: {
        response_text: text.slice(0, 2000),
      },
    };
  }
  if (!json || typeof json !== "object") {
    if (params.method === "DELETE") {
      return {
        ok: true,
        payload: {} as T,
      };
    }
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: `Daytona API ${params.path} returned invalid JSON.`,
    };
  }
  return {
    ok: true,
    payload: json as T,
  };
}

async function fetchDaytonaVolumeByName(params: {
  config: DaytonaConfig;
  volumeName: string;
}) {
  return await daytonaVolumeRequest<DaytonaVolumeApiDto>({
    config: params.config,
    path: `/volumes/by-name/${encodeURIComponent(params.volumeName)}`,
    method: "GET",
  });
}

async function fetchDaytonaVolumeById(params: {
  config: DaytonaConfig;
  volumeId: string;
}) {
  return await daytonaVolumeRequest<DaytonaVolumeApiDto>({
    config: params.config,
    path: `/volumes/${encodeURIComponent(params.volumeId)}`,
    method: "GET",
  });
}

async function createDaytonaVolume(params: {
  config: DaytonaConfig;
  volumeName: string;
}) {
  return await daytonaVolumeRequest<DaytonaVolumeApiDto>({
    config: params.config,
    path: "/volumes",
    method: "POST",
    body: {
      name: params.volumeName,
    },
  });
}

async function deleteDaytonaVolume(params: {
  config: DaytonaConfig;
  volumeId: string;
}) {
  return await daytonaVolumeRequest<DaytonaVolumeApiDto>({
    config: params.config,
    path: `/volumes/${encodeURIComponent(params.volumeId)}`,
    method: "DELETE",
  });
}

function readDaytonaFailureResponseText(result: {
  details?: Record<string, unknown>;
}): string {
  return String(result.details?.response_text ?? "").trim().slice(0, 1000);
}

function formatDaytonaFailureMessage(result: {
  message: string;
  details?: Record<string, unknown>;
}): string {
  const responseText = readDaytonaFailureResponseText(result);
  return responseText ? `${result.message} ${responseText}` : result.message;
}

function isDaytonaNotFoundFailure(result: {
  status: number;
  details?: Record<string, unknown>;
}): boolean {
  if (result.status === 404) return true;
  return readDaytonaFailureResponseText(result).toLowerCase().includes("not found");
}

function shouldRetryDaytonaVolumeDelete(result: { status: number }): boolean {
  return result.status === 400 || result.status === 409 || result.status === 423;
}

function sandboxMatchesProjectOrVolume(params: {
  sandbox: DaytonaSandboxApiDto;
  projectId: string;
  volumeId?: string | null;
}): boolean {
  if (readSandboxLabel(params.sandbox, "arx_project_id") === params.projectId) {
    return true;
  }
  const volumeId = String(params.volumeId ?? "").trim();
  if (!volumeId) return false;
  return JSON.stringify(params.sandbox).includes(volumeId);
}

async function cleanupDaytonaProjectSandboxes(params: {
  config: DaytonaConfig;
  projectId: string;
  volumeId?: string | null;
}) {
  const listed = await listDaytonaSandboxes({
    config: params.config,
  });
  if (!listed.ok) return listed;

  for (const sandbox of listed.sandboxes) {
    const sandboxId = String(sandbox.id ?? "").trim();
    if (!sandboxId) continue;
    if (!sandboxMatchesProjectOrVolume({
      sandbox,
      projectId: params.projectId,
      volumeId: params.volumeId,
    })) {
      continue;
    }

    const stopped = await stopDaytonaSandbox({
      config: params.config,
      sandboxId,
    });
    const deleted =
      stopped.ok
        ? await (async () => {
            const settled = await waitForDaytonaSandboxStopped({
              config: params.config,
              sandboxId,
            });
            return settled.ok && settled.sandbox === null
              ? ({ ok: true as const })
              : await deleteDaytonaSandbox({
                  config: params.config,
                  sandboxId,
                });
          })()
        : await deleteDaytonaSandbox({
            config: params.config,
            sandboxId,
          });

    if (!deleted.ok) {
      return deleted;
    }
  }

  return { ok: true as const };
}

async function fetchDaytonaSandboxById(params: {
  config: DaytonaConfig;
  sandboxId: string;
}) {
  return await daytonaVolumeRequest<DaytonaSandboxStatusApiDto>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}`,
    method: "GET",
  });
}

function normalizeDaytonaVolumeState(volume: DaytonaVolumeApiDto | null | undefined): string | undefined {
  const normalized = String(volume?.state ?? volume?.status ?? "").trim().toLowerCase();
  return normalized || undefined;
}

function isReadyDaytonaVolumeState(state: string | null | undefined): boolean {
  const normalized = String(state ?? "").trim().toLowerCase();
  return !normalized || normalized === "ready" || normalized === "available" || normalized === "created";
}

function isDeletableDaytonaVolumeState(state: string | null | undefined): boolean {
  const normalized = String(state ?? "").trim().toLowerCase();
  return !normalized || normalized === "ready" || normalized === "error" || normalized === "available" || normalized === "created";
}

function normalizeDaytonaSandboxState(sandbox: DaytonaSandboxStatusApiDto | null | undefined): string | undefined {
  const normalized = String(sandbox?.state ?? sandbox?.status ?? "").trim().toLowerCase();
  return normalized || undefined;
}

async function waitForDaytonaVolumeReady(params: {
  config: DaytonaConfig;
  volumeId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<DaytonaVolumeApiDto> {
  const timeoutMs = Math.max(1000, Math.floor(params.timeoutMs ?? 15_000));
  const intervalMs = Math.max(250, Math.floor(params.intervalMs ?? 1000));
  const startedAt = Date.now();
  let lastSeen: DaytonaVolumeApiDto = { id: params.volumeId };
  while (Date.now() - startedAt < timeoutMs) {
    const lookup = await fetchDaytonaVolumeById({
      config: params.config,
      volumeId: params.volumeId,
    });
    if (!lookup.ok) {
      if (lookup.status === 404) break;
      throw new Error(lookup.message);
    }
    lastSeen = lookup.payload;
    if (isReadyDaytonaVolumeState(normalizeDaytonaVolumeState(lookup.payload))) {
      return lookup.payload;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return lastSeen;
}

async function waitForDaytonaVolumeDeleteReadiness(params: {
  config: DaytonaConfig;
  volumeId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<"deletable" | "missing" | "timeout"> {
  const timeoutMs = Math.max(1000, Math.floor(params.timeoutMs ?? 60_000));
  const intervalMs = Math.max(250, Math.floor(params.intervalMs ?? 1000));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const lookup = await fetchDaytonaVolumeById({
      config: params.config,
      volumeId: params.volumeId,
    });
    if (!lookup.ok) {
      if (lookup.status === 404) return "missing";
      throw new Error(formatDaytonaFailureMessage(lookup));
    }
    if (isDeletableDaytonaVolumeState(normalizeDaytonaVolumeState(lookup.payload))) {
      return "deletable";
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return "timeout";
}

async function cleanupDaytonaDeletedProjectResources(params: {
  config: DaytonaConfig;
  projectId: string;
  volumeId: string;
  waitForVolumeMs?: number;
}): Promise<
  | { ok: true; volumeDeleted: boolean }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const cleanedSandboxes = await cleanupDaytonaProjectSandboxes({
    config: params.config,
    projectId: params.projectId,
    volumeId: params.volumeId,
  });
  if (!cleanedSandboxes.ok) return cleanedSandboxes;

  const readiness = await waitForDaytonaVolumeDeleteReadiness({
    config: params.config,
    volumeId: params.volumeId,
    timeoutMs: params.waitForVolumeMs,
  });
  if (readiness === "missing") {
    return { ok: true, volumeDeleted: true };
  }
  if (readiness === "timeout") {
    return { ok: true, volumeDeleted: false };
  }

  let deletedVolume = await deleteDaytonaVolume({
    config: params.config,
    volumeId: params.volumeId,
  });
  if (!deletedVolume.ok && shouldRetryDaytonaVolumeDelete(deletedVolume)) {
    const retriedSandboxCleanup = await cleanupDaytonaProjectSandboxes({
      config: params.config,
      projectId: params.projectId,
      volumeId: params.volumeId,
    });
    if (!retriedSandboxCleanup.ok) return retriedSandboxCleanup;

    const retryReadiness = await waitForDaytonaVolumeDeleteReadiness({
      config: params.config,
      volumeId: params.volumeId,
      timeoutMs: params.waitForVolumeMs,
    });
    if (retryReadiness === "missing") {
      return { ok: true, volumeDeleted: true };
    }
    if (retryReadiness === "timeout") {
      return { ok: true, volumeDeleted: false };
    }

    deletedVolume = await deleteDaytonaVolume({
      config: params.config,
      volumeId: params.volumeId,
    });
  }
  if (!deletedVolume.ok && !isDaytonaNotFoundFailure(deletedVolume)) {
    return deletedVolume;
  }
  return { ok: true, volumeDeleted: true };
}

async function resolveActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ authSubject: string; userId: any }> {
  const actor = (await args.ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
    authSubject: args.authSubject ?? undefined,
  })) as { authSubject?: unknown; dbUserId?: unknown } | null;
  const authSubject = normalizeIdValue(actor?.authSubject);
  if (!authSubject) throw new Error("authenticated_user_required");
  const userId = actor?.dbUserId;
  if (!userId) throw new Error("authenticated_user_required");
  return { authSubject, userId };
}

export const getCloudProjectByIdInternal = internalQuery({
  args: {
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const attachCloudProjectVolumeInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerVolumeId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.projectId);
    if (!existing) throw new Error("project_not_found");
    const nowMs = args.nowMs ?? Date.now();
    const providerVolumeId = normalizeOptionalVolumeValue(args.providerVolumeId);
    if (!providerVolumeId) throw new Error("provider_volume_id_required");
    await ctx.db.patch(existing._id, {
      providerVolumeId,
      updatedAt: nowMs,
    });
    return await ctx.db.get(existing._id);
  },
});

export const acquireCloudProjectImportLeaseInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) {
      throw new Error("project_not_found");
    }
    const nowMs = args.nowMs ?? Date.now();
    const currentLease = Number(project.importLeaseExpiresAt ?? 0);
    if (Number.isFinite(currentLease) && currentLease > nowMs) {
      throw new Error("project_import_in_progress");
    }
    const nextLeaseExpiresAt = nowMs + PROJECT_IMPORT_LEASE_MS;
    await ctx.db.patch(project._id, {
      importLeaseExpiresAt: nextLeaseExpiresAt,
      updatedAt: nowMs,
    });
    return nextLeaseExpiresAt;
  },
});

export const clearCloudProjectImportLeaseInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) {
      return null;
    }
    await ctx.db.patch(project._id, {
      importLeaseExpiresAt: undefined,
      updatedAt: args.nowMs ?? Date.now(),
    });
    return await ctx.db.get(project._id);
  },
});

export const ensureCloudProjectVolumeInternal = internalAction({
  args: {
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const project = await ctx.runQuery(internal.projects.getCloudProjectByIdInternal as any, {
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_not_found");

    const loadedDaytonaConfig = loadDaytonaConfig();
    if (!loadedDaytonaConfig.ok) {
      throw new Error(loadedDaytonaConfig.message);
    }
    const config = loadedDaytonaConfig.config;
    const expectedVolumeName = buildProjectVolumeName(project);

    let volume: DaytonaVolumeApiDto | null = null;
    const existingVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    if (existingVolumeId) {
      const lookupById = await fetchDaytonaVolumeById({
        config,
        volumeId: existingVolumeId,
      });
      if (lookupById.ok) {
        volume = lookupById.payload;
      } else if (lookupById.status !== 404) {
        throw new Error(lookupById.message);
      }
    }

    if (!volume) {
      const lookupByName = await fetchDaytonaVolumeByName({
        config,
        volumeName: expectedVolumeName,
      });
      if (lookupByName.ok) {
        volume = lookupByName.payload;
      } else if (lookupByName.status !== 404) {
        throw new Error(lookupByName.message);
      }
    }

    if (!volume) {
      const createdVolume = await createDaytonaVolume({
        config,
        volumeName: expectedVolumeName,
      });
      if (!createdVolume.ok) {
        throw new Error(createdVolume.message);
      }
      volume = createdVolume.payload;
    }

    const volumeId = normalizeOptionalVolumeValue(volume.id);
    if (!volumeId) throw new Error("daytona_volume_missing_id");
    const readyVolume = isReadyDaytonaVolumeState(normalizeDaytonaVolumeState(volume))
      ? volume
      : await waitForDaytonaVolumeReady({
          config,
          volumeId,
        });
    const volumeName = normalizeOptionalVolumeValue(readyVolume.name) ?? expectedVolumeName;
    const volumeState = normalizeDaytonaVolumeState(readyVolume) ?? "ready";

    const updated: unknown = await ctx.runMutation(internal.projects.attachCloudProjectVolumeInternal as any, {
      projectId: args.projectId,
      providerVolumeId: volumeId,
      nowMs: Date.now(),
    });
    if (!updated) throw new Error("project_not_found");
    return updated;
  },
});

export const ensureDefaultCloudProjectForOwner = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    return await ensureDefaultProjectInternal({
      ctx,
      ownerId,
      nowMs,
    });
  },
});

export const listCloudProjectsForOwner = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const rows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  },
});

export const createCloudProjectForOwner = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const canonicalTier = await ctx.runQuery(api.entitlements.getCanonicalTierByUserId as any, {
      userId: ownerId,
      authSubject: args.authSubject ?? null,
      nowMs,
    });
    if (canonicalTier !== "builder" && canonicalTier !== "architect") {
      throw new Error("plan_required");
    }

    const existingRows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    if (existingRows.length >= BUILDER_MAX_PROJECTS) {
      throw new Error("project_limit_reached");
    }

    const projectName = normalizeOptionalProjectString(args.name) ?? buildNextProjectName(existingRows);
    const description = normalizeOptionalProjectString(args.description);
    const id = await ctx.db.insert("cloudProjects", {
      ownerId,
      name: projectName,
      description,
      status: "active",
      providerVolumeId: undefined,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("project_create_failed");
    return created;
  },
});

export const updateCloudProjectForOwner = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const existing = await ctx.db.get(args.projectId);
    if (!existing || existing.ownerId !== ownerId) {
      throw new Error("project_not_found");
    }
    const nowMs = args.nowMs ?? Date.now();
    const name = normalizeOptionalProjectString(args.name);
    if (!name) throw new Error("project_name_required");
    const description = normalizeOptionalProjectString(args.description);
    await ctx.db.patch(existing._id, {
      name,
      description,
      updatedAt: nowMs,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) throw new Error("project_not_found");
    return updated;
  },
});

export const generateCloudProjectImportUploadUrl = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const canonicalTier = await ctx.runQuery(api.entitlements.getCanonicalTierByUserId as any, {
      userId: ownerId,
      authSubject: args.authSubject ?? null,
      nowMs,
    });
    if (canonicalTier !== "builder" && canonicalTier !== "architect") {
      throw new Error("plan_required");
    }
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const importCloudProjectZipForOwner = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    storageId: v.id("_storage"),
    sourceFilename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const ownerId = args.ownerId ?? userId;
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("project_not_found");
    }

    const sourceFilename = String(args.sourceFilename ?? "").trim() || "project.zip";
    if (!sourceFilename.toLowerCase().endsWith(".zip")) {
      throw new Error("project_import_zip_required");
    }

    const downloadUrl = await ctx.storage.getUrl(args.storageId);
    if (!downloadUrl) {
      throw new Error("project_import_file_missing");
    }

    const runId = buildProjectImportRunId(args.projectId);
    let session: WorkspaceSandboxSession | null = null;
    try {
      await ctx.runMutation(internal.projects.acquireCloudProjectImportLeaseInternal as any, {
        projectId: args.projectId,
        ownerId,
        nowMs: Date.now(),
      });
      const sessionResult = await createWorkspaceSandboxSession({
        ctx,
        userId,
        authSubject,
        projectId: args.projectId,
        runId,
      });
      if (!sessionResult.ok) {
        throw new Error(sessionResult.code || sessionResult.message);
      }

      session = sessionResult.session;
      const archivePath = buildProjectImportArchivePath(args.projectId);
      const imported = await executeDaytonaCommand({
        config: session.config,
        toolboxProxyUrl: session.toolboxProxyUrl,
        sandboxId: session.providerSandboxId,
        cwd: DAYTONA_WORKSPACE_ROOT,
        command: buildProjectZipImportCommand({
          archiveUrl: downloadUrl,
          zipPath: archivePath,
          workspaceRoot: DAYTONA_WORKSPACE_ROOT,
        }),
        timeoutSeconds: 120,
      });
      if (!imported.ok || imported.exitCode !== 0) {
        throw new Error(
          String(
            imported.ok
              ? imported.stdout ?? ""
              : readDaytonaCommandFailureMessage(imported.details) || imported.message,
          ).trim() ||
            "project_import_extract_failed",
        );
      }
      const importSummary = parseProjectImportSummary(imported.stdout ?? "");

      return {
        ok: true as const,
        importedBytes: importSummary.zipBytes,
        sourceFilename,
        importedFiles: importSummary.importedFiles,
        skippedFiles: importSummary.skippedFiles,
        blockedFiles: importSummary.blockedFiles,
        commonRootStripped: importSummary.commonRootStripped,
      };
    } finally {
      if (session) {
        await cleanupWorkspaceSandboxSession({
          ctx,
          userId,
          session,
          runId,
          projectId: args.projectId,
          appendRunEvent: async () => {},
        });
      }
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        // Best-effort cleanup for temporary import archives.
      }
      await ctx.runMutation(internal.projects.clearCloudProjectImportLeaseInternal as any, {
        projectId: args.projectId,
        ownerId,
        nowMs: Date.now(),
      });
    }
  },
});

export const deleteCloudProjectInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) {
      throw new Error("project_not_found");
    }
    const nowMs = args.nowMs ?? Date.now();
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    let archivedThreadCount = 0;
    for (const thread of threads) {
      if (thread.ownerId !== args.ownerId) continue;
      archivedThreadCount += 1;
      await ctx.db.patch(thread._id, {
        archivedAt: nowMs,
        updatedAt: nowMs,
      });
    }
    await ctx.db.delete(args.projectId);
    return {
      ok: true,
      archivedThreadCount,
    };
  },
});

export const cleanupDeletedCloudProjectDaytonaVolumeInternal = internalAction({
  args: {
    projectId: v.string(),
    providerVolumeId: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const projectId = normalizeIdValue(args.projectId);
    const providerVolumeId = normalizeOptionalVolumeValue(args.providerVolumeId);
    if (!projectId || !providerVolumeId) {
      return { ok: true, volumeDeleted: true };
    }
    const loadedDaytonaConfig = loadDaytonaConfig();
    if (!loadedDaytonaConfig.ok) {
      throw new Error(loadedDaytonaConfig.message);
    }

    const cleanup = await cleanupDaytonaDeletedProjectResources({
      config: loadedDaytonaConfig.config,
      projectId,
      volumeId: providerVolumeId,
      waitForVolumeMs: 120_000,
    });
    if (!cleanup.ok) {
      throw new Error(formatDaytonaFailureMessage(cleanup));
    }
    if (!cleanup.volumeDeleted) {
      const attempt = Math.max(0, Math.floor(args.attempt ?? 0));
      if (attempt >= 5) {
        throw new Error(`Daytona volume ${providerVolumeId} did not become deletable after project deletion.`);
      }
      await ctx.scheduler.runAfter(
        Math.min(5 * 60_000, 30_000 * (attempt + 1)),
        (internal.projects as any).cleanupDeletedCloudProjectDaytonaVolumeInternal,
        {
          projectId,
          providerVolumeId,
          attempt: attempt + 1,
        },
      );
    }
    return cleanup;
  },
});

export const deleteCloudProjectForOwner = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const ownerId = args.ownerId ?? userId;
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_not_found");
    const importLeaseExpiresAt = Number(project.importLeaseExpiresAt ?? 0);
    if (Number.isFinite(importLeaseExpiresAt) && importLeaseExpiresAt > nowMs) {
      throw new Error("project_import_in_progress");
    }

    const runtimeRuns = (await ctx.runQuery(api.threads.listCloudRuntimeRunsByOwner as any, {
      ownerId,
      authSubject,
      limit: 500,
    })) as Array<{ projectId?: unknown; status?: unknown }> | null;
    const hasRunningRun = Array.isArray(runtimeRuns)
      ? runtimeRuns.some(
          (run) =>
            normalizeIdValue(run?.projectId) === normalizeIdValue(args.projectId) &&
            String(run?.status ?? "").trim().toLowerCase() === "running",
        )
      : false;
    if (hasRunningRun) {
      throw new Error("project_run_in_progress");
    }

    const providerVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    if (providerVolumeId) {
      const loadedDaytonaConfig = loadDaytonaConfig();
      if (!loadedDaytonaConfig.ok) {
        throw new Error(loadedDaytonaConfig.message);
      }
      const cleanup = await cleanupDaytonaDeletedProjectResources({
        config: loadedDaytonaConfig.config,
        projectId: normalizeIdValue(args.projectId),
        volumeId: providerVolumeId,
        waitForVolumeMs: 1500,
      });
      if (!cleanup.ok) {
        throw new Error(formatDaytonaFailureMessage(cleanup));
      }
      if (!cleanup.volumeDeleted) {
        await ctx.scheduler.runAfter(
          0,
          (internal.projects as any).cleanupDeletedCloudProjectDaytonaVolumeInternal,
          {
            projectId: normalizeIdValue(args.projectId),
            providerVolumeId,
          },
        );
      }
    }

    return await ctx.runMutation(internal.projects.deleteCloudProjectInternal as any, {
      ownerId,
      projectId: args.projectId,
      nowMs,
    });
  },
});

export const ensureDefaultCloudProjectWithVolumeForOwner = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.runMutation(api.projects.ensureDefaultCloudProjectForOwner as any, {
      ownerId: args.ownerId ?? userId,
      authSubject,
      nowMs: args.nowMs,
    });
    if (!row?._id) throw new Error("default_project_missing_id");
    return await ctx.runAction(internal.projects.ensureCloudProjectVolumeInternal as any, {
      projectId: row._id,
    });
  },
});

export const ensureCloudProjectVolume = action({
  args: {
    projectId: v.id("cloudProjects"),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId: userId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_access_denied");
    return await ctx.runAction(internal.projects.ensureCloudProjectVolumeInternal as any, {
      projectId: args.projectId,
    });
  },
});

export const getCloudProjectById = query({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row) return null;
    const ownerId = args.authSubject
      ? await resolveOwnerIdForAuthenticatedRequest({
          ctx,
          ownerId: args.ownerId,
          authSubject: args.authSubject ?? null,
        })
      : args.ownerId;
    if (ownerId && row.ownerId !== ownerId) return null;
    return row;
  },
});
