import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { DAYTONA_WORKSPACE_ROOT } from "./daytonaSandboxClient";
import { resolveProjectBackgroundSandboxIfReady } from "./workspaceTerminalBackgroundService";
import {
  ensureBlaxelWorkspaceComputer,
  listBlaxelWorkspaceDirectory,
  readBlaxelWorkspaceFile,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";
import {
  normalizeWorkspacePath,
  runDaytonaWorkspaceBash,
} from "./daytonaWorkspaceTools";

const DIRECTORY_ENTRY_LIMIT = 200;
const TEXT_PREVIEW_MAX_BYTES = 64 * 1024;
const IMAGE_PREVIEW_MAX_BYTES = 512 * 1024;

const HEAVY_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const TEXT_EXTENSION_ALLOWLIST = new Set([
  "c",
  "conf",
  "config",
  "css",
  "csv",
  "env",
  "go",
  "html",
  "js",
  "json",
  "jsx",
  "lock",
  "log",
  "md",
  "mdx",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const TEXT_BASENAME_ALLOWLIST = new Set([
  "dockerfile",
  "gemfile",
  "license",
  "makefile",
  "procfile",
  "readme",
]);

type WorkspaceInspectorFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

type WorkspaceInspectorSession = {
  config: any;
  providerSandboxId: string;
  toolboxProxyUrl: string;
};

type WorkspaceInspectorProject = {
  actor: any;
  project: any;
};

type WorkspaceInspectorPathKind = "file" | "directory" | "missing" | "other";
type WorkspaceInspectorResolvedPath =
  | {
      kind: Exclude<WorkspaceInspectorPathKind, "missing">;
      rootPath: string;
      resolvedPath: string;
    }
  | {
      kind: "missing";
      rootPath: string;
      resolvedPath: null;
    };

const WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER = "__POLYNET_UNSAFE_WORKSPACE_PATH__";

function normalizeInspectorPath(raw: unknown):
  | { ok: true; relPath: string }
  | WorkspaceInspectorFailure {
  const candidate = String(raw ?? "").trim();
  try {
    return {
      ok: true,
      relPath: normalizeWorkspacePath(candidate || "."),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_tool_args";
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace path is outside the computer workspace.",
    };
  }
}

function shellQuote(value: string): string {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function basenameOfPath(path: string): string {
  if (path === ".") return ".";
  return path.split("/").filter(Boolean).pop() ?? path;
}

function extensionOfPath(path: string): string {
  const basename = basenameOfPath(path).toLowerCase();
  const index = basename.lastIndexOf(".");
  return index >= 0 ? basename.slice(index + 1) : "";
}

function isTextPreviewCandidate(path: string): boolean {
  const basename = basenameOfPath(path).toLowerCase();
  const extension = extensionOfPath(path);
  return TEXT_BASENAME_ALLOWLIST.has(basename) || TEXT_EXTENSION_ALLOWLIST.has(extension);
}

function joinWorkspacePath(directoryPath: string, entryPath: string): string {
  const entry = String(entryPath ?? "").replace(/^\.\/+/, "").replace(/^\/+/, "").trim();
  if (!entry) return directoryPath || ".";
  return directoryPath === "." ? entry : `${directoryPath}/${entry}`;
}

function parentWorkspacePath(path: string): string {
  const normalized = String(path ?? "").trim();
  if (!normalized || normalized === ".") return ".";
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : ".";
}

function safeBlaxelResourcePart(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (normalized || "project").slice(0, 40);
}

function buildBlaxelProjectWorkspaceNames(projectId: unknown): {
  sandboxName: string;
  volumeName: string;
} {
  const resourcePart = safeBlaxelResourcePart(projectId);
  return {
    sandboxName: `pn-p-${resourcePart}`,
    volumeName: `pn-p-${resourcePart}-v`,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function blaxelEntryName(value: unknown): string | null {
  const record = asRecord(value);
  const rawName = String(record?.name ?? "").trim();
  if (rawName) return basenameOfPath(rawName);
  const rawPath = String(record?.path ?? "").trim();
  return rawPath ? basenameOfPath(rawPath) : null;
}

function blaxelEntrySize(value: unknown): number | null {
  const record = asRecord(value);
  const parsed = Number(record?.size);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

type BlaxelDirectoryEntryKind = "file" | "directory" | "missing";

function findBlaxelDirectoryEntry(rawEntries: unknown, relPath: string): {
  kind: BlaxelDirectoryEntryKind;
  entry: unknown | null;
} {
  if (relPath === ".") return { kind: "directory", entry: null };
  const record = asRecord(rawEntries);
  const targetName = basenameOfPath(relPath);
  const files = Array.isArray(record?.files) ? record.files : [];
  const subdirectories = Array.isArray(record?.subdirectories)
    ? record.subdirectories
    : [];
  const directoryEntry = subdirectories.find((entry) => blaxelEntryName(entry) === targetName);
  if (directoryEntry) return { kind: "directory", entry: directoryEntry };
  const fileEntry = files.find((entry) => blaxelEntryName(entry) === targetName);
  if (fileEntry) return { kind: "file", entry: fileEntry };
  return { kind: "missing", entry: null };
}

function isLikelyBinaryText(value: string): boolean {
  if (!value) return false;
  if (value.includes("\0")) return true;
  const sample = value.slice(0, 4096);
  let controlCount = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    const isAllowedControl = code === 9 || code === 10 || code === 13;
    if (code < 32 && !isAllowedControl) controlCount += 1;
  }
  return controlCount > Math.max(8, sample.length * 0.02);
}

function parseBlaxelDirectoryEntries(rawEntries: unknown, directoryPath: string) {
  const record = asRecord(rawEntries);
  const files = Array.isArray(record?.files) ? record.files : [];
  const subdirectories = Array.isArray(record?.subdirectories)
    ? record.subdirectories
    : [];
  const rows = [
    ...subdirectories.flatMap((entry) => {
      const name = blaxelEntryName(entry);
      if (!name) return [];
      return [{
        name,
        path: joinWorkspacePath(directoryPath, name),
        type: "directory" as const,
        extension: null,
        heavy: HEAVY_DIRECTORY_NAMES.has(name),
        previewable: false,
      }];
    }),
    ...files.flatMap((entry) => {
      const name = blaxelEntryName(entry);
      if (!name) return [];
      const extension = extensionOfPath(name);
      return [{
        name,
        path: joinWorkspacePath(directoryPath, name),
        type: "file" as const,
        extension,
        heavy: false,
        previewable:
          Boolean(IMAGE_MIME_BY_EXTENSION[extension]) ||
          isTextPreviewCandidate(name),
      }];
    }),
  ];
  return rows
    .sort((left, right) =>
      `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`),
    )
    .slice(0, DIRECTORY_ENTRY_LIMIT);
}

async function ensureBlaxelInspectorWorkspace(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
}): Promise<
  | { ok: true; sandboxName: string; volumeName: string }
  | WorkspaceInspectorFailure
> {
  const resolvedProject = await resolveInspectorProject(params);
  if (!resolvedProject.ok) return resolvedProject;
  const names = buildBlaxelProjectWorkspaceNames(params.projectId);
  const ensured = await ensureBlaxelWorkspaceComputer({
    sandboxName: names.sandboxName,
    volumeName: names.volumeName,
    labels: {
      purpose: "workspace-inspector",
      project_id: String(params.projectId),
      owner_id: String(resolvedProject.resolved.actor.dbUserId),
    },
  });
  if (!ensured.ok) return mapFailure(ensured);
  return {
    ok: true,
    sandboxName: names.sandboxName,
    volumeName: names.volumeName,
  };
}

function mapFailure(result: {
  status?: number;
  code?: string;
  message?: string;
}): WorkspaceInspectorFailure {
  return {
    ok: false,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : 503,
    code: String(result.code ?? "workspace_inspector_unavailable"),
    message: String(result.message ?? "Workspace inspector unavailable."),
  };
}

async function resolveActor(ctx: any, authSubject: string | null | undefined) {
  return await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
    authSubject: authSubject ?? null,
  });
}

async function resolveInspectorProject(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
}): Promise<
  | { ok: true; resolved: WorkspaceInspectorProject }
  | WorkspaceInspectorFailure
> {
  const actor = await resolveActor(params.ctx, params.authSubject);
  const project = await params.ctx.runQuery(api.projects.getCloudProjectById as any, {
    authSubject: params.authSubject ?? null,
    ownerId: actor.dbUserId,
    projectId: params.projectId,
  });
  if (!project) {
    return {
      ok: false,
      status: 404,
      code: "project_not_found",
      message: "Computer not found.",
    };
  }
  return {
    ok: true,
    resolved: { actor, project },
  };
}

async function resolveInspectorSession(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
}): Promise<
  | { ok: true; session: WorkspaceInspectorSession }
  | WorkspaceInspectorFailure
> {
  const resolvedProject = await resolveInspectorProject(params);
  if (!resolvedProject.ok) return resolvedProject;

  const resolved = await resolveProjectBackgroundSandboxIfReady({
    ctx: params.ctx,
    authSubject: params.authSubject ?? null,
    userId: resolvedProject.resolved.actor.dbUserId,
    projectId: params.projectId,
  });
  if (!resolved.ok) return mapFailure(resolved);

  return {
    ok: true,
    session: resolved,
  };
}

async function listBlaxelInspectorDirectory(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
  relPath: string;
}): Promise<unknown> {
  const workspace = await ensureBlaxelInspectorWorkspace(params);
  if (!workspace.ok) return workspace;

  const listed = await listBlaxelWorkspaceDirectory({
    sandboxName: workspace.sandboxName,
    path: params.relPath,
  });
  if (!listed.ok) return mapFailure(listed);
  const entries = parseBlaxelDirectoryEntries(listed.entries, params.relPath);
  return {
    ok: true,
    providerId: "blaxel",
    status: "active",
    path: params.relPath,
    entries,
    truncated: entries.length >= DIRECTORY_ENTRY_LIMIT,
  };
}

async function readBlaxelInspectorFilePreview(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
  relPath: string;
}): Promise<unknown> {
  const workspace = await ensureBlaxelInspectorWorkspace(params);
  if (!workspace.ok) return workspace;
  const parentPath = parentWorkspacePath(params.relPath);
  const parentListing = await listBlaxelWorkspaceDirectory({
    sandboxName: workspace.sandboxName,
    path: parentPath,
  });
  if (!parentListing.ok) return mapFailure(parentListing);

  const target = findBlaxelDirectoryEntry(parentListing.entries, params.relPath);
  if (target.kind === "missing") {
    return {
      ok: false,
      status: 404,
      code: "file_not_found",
      message: "Workspace file not found.",
    };
  }
  if (target.kind === "directory") {
    return {
      ok: true,
      path: params.relPath,
      name: basenameOfPath(params.relPath),
      type: "directory",
      previewKind: "directory",
    };
  }

  const sizeBytes = blaxelEntrySize(target.entry);
  const extension = extensionOfPath(params.relPath);
  const imageMimeType = IMAGE_MIME_BY_EXTENSION[extension] ?? null;
  if (imageMimeType) {
    return {
      ok: true,
      path: params.relPath,
      name: basenameOfPath(params.relPath),
      type: "file",
      previewKind: "unsupported",
      mimeType: imageMimeType,
      sizeBytes,
      reason: "Image preview is not available for Blaxel workspaces yet.",
    };
  }

  if (!isTextPreviewCandidate(params.relPath)) {
    return {
      ok: true,
      path: params.relPath,
      name: basenameOfPath(params.relPath),
      type: "file",
      previewKind: "unsupported",
      sizeBytes,
      reason: "This file type is not previewed yet.",
    };
  }

  if (sizeBytes === null) {
    return {
      ok: true,
      path: params.relPath,
      name: basenameOfPath(params.relPath),
      type: "file",
      previewKind: "unsupported",
      sizeBytes,
      reason: "File size is unavailable, so this file is not previewed.",
    };
  }

  if (typeof sizeBytes === "number" && sizeBytes > TEXT_PREVIEW_MAX_BYTES) {
    return {
      ok: true,
      path: params.relPath,
      name: basenameOfPath(params.relPath),
      type: "file",
      previewKind: "unsupported",
      sizeBytes,
      reason: "Text file is too large to preview in the workspace panel.",
    };
  }

  const read = await readBlaxelWorkspaceFile({
    sandboxName: workspace.sandboxName,
    path: params.relPath,
  });
  if (!read.ok) return mapFailure(read);
  const text = String(read.content ?? "");
  if (isLikelyBinaryText(text)) {
    return {
      ok: true,
      path: params.relPath,
      name: basenameOfPath(params.relPath),
      type: "file",
      previewKind: "unsupported",
      sizeBytes,
      reason: "Binary files are not previewed in the workspace panel.",
    };
  }

  return {
    ok: true,
    path: params.relPath,
    name: basenameOfPath(params.relPath),
    type: "file",
    previewKind: "text",
    sizeBytes,
    text: text.slice(0, TEXT_PREVIEW_MAX_BYTES),
    truncated: text.length > TEXT_PREVIEW_MAX_BYTES,
  };
}

function parseDirectoryEntries(outputText: string, directoryPath: string) {
  const rows = String(outputText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "(empty directory)")
    .slice(0, DIRECTORY_ENTRY_LIMIT);

  return rows.flatMap((line) => {
    const separatorIndex = line.indexOf("\t");
    if (separatorIndex <= 0) return [];
    const rawType = line.slice(0, separatorIndex);
    const rawPath = line.slice(separatorIndex + 1).trim();
    const type = rawType === "dir" ? "directory" : rawType === "file" ? "file" : null;
    if (!type || !rawPath) return [];
    const name = basenameOfPath(rawPath);
    const path = joinWorkspacePath(directoryPath, rawPath);
    return [{
      name,
      path,
      type,
      extension: type === "file" ? extensionOfPath(name) : null,
      heavy: type === "directory" && HEAVY_DIRECTORY_NAMES.has(name),
      previewable:
        type === "file" &&
        (Boolean(IMAGE_MIME_BY_EXTENSION[extensionOfPath(name)]) ||
          isTextPreviewCandidate(name)),
    }];
  });
}

async function readWorkspacePathSize(params: {
  session: WorkspaceInspectorSession;
  path: Extract<WorkspaceInspectorResolvedPath, { resolvedPath: string }>;
}): Promise<number | null> {
  const result = await runDaytonaWorkspaceBash({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    relPath: ".",
    command: [
      ...buildGuardedResolvedPathPrelude(params.path),
      `if [ ! -f "$safe_path" ]; then printf ${shellQuote(WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER)}; exit 0; fi;`,
      `wc -c < "$safe_path" | tr -d '[:space:]'`,
    ].join(" "),
  });
  if (!result.ok) return null;
  if (String(result.outputText ?? "").trim() === WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER) return null;
  const parsed = Number(String(result.outputText ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildGuardedResolvedPathPrelude(path: Extract<WorkspaceInspectorResolvedPath, { resolvedPath: string }>): string[] {
  return [
    "set -f;",
    `root=${shellQuote(path.rootPath)};`,
    `safe_path=${shellQuote(path.resolvedPath)};`,
    'resolved_root="$(realpath -- "$root" 2>/dev/null || readlink -f -- "$root" 2>/dev/null || true)";',
    `if [ "$resolved_root" != "$root" ]; then printf ${shellQuote(WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER)}; exit 0; fi;`,
    'resolved_again="$(realpath -- "$safe_path" 2>/dev/null || readlink -f -- "$safe_path" 2>/dev/null || true)";',
    `if [ "$resolved_again" != "$safe_path" ]; then printf ${shellQuote(WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER)}; exit 0; fi;`,
    `case "$resolved_again" in "$root"|"$root"/*) ;; *) printf ${shellQuote(WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER)}; exit 0;; esac;`,
  ];
}

function mapGuardedPathFailure(): WorkspaceInspectorFailure {
  return {
    ok: false,
    status: 400,
    code: "path_outside_workspace",
    message: "Workspace path is outside the computer workspace.",
  };
}

async function inspectWorkspacePathBoundary(params: {
  session: WorkspaceInspectorSession;
  relPath: string;
}): Promise<
  | { ok: true; path: WorkspaceInspectorResolvedPath }
  | WorkspaceInspectorFailure
> {
  const result = await runDaytonaWorkspaceBash({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    relPath: ".",
    command: [
      "set -f;",
      `root_input=${shellQuote(DAYTONA_WORKSPACE_ROOT)};`,
      'root="$(realpath -- "$root_input" 2>/dev/null || readlink -f -- "$root_input" 2>/dev/null || true)";',
      'if [ -z "$root" ]; then printf unresolved; exit 0; fi;',
      `rel=${shellQuote(params.relPath)};`,
      'abs="$root_input";',
      'if [ "$rel" != "." ]; then',
      '  old_ifs="$IFS"; IFS="/"; set -- $rel; IFS="$old_ifs";',
      '  for part do',
      '    [ -n "$part" ] || continue;',
      '    abs="$abs/$part";',
      '    if [ -L "$abs" ]; then printf symlink; exit 0; fi;',
      "  done;",
      "fi;",
      'if [ ! -e "$abs" ]; then printf "missing\\t%s" "$root"; exit 0; fi;',
      'resolved="$(realpath -- "$abs" 2>/dev/null || readlink -f -- "$abs" 2>/dev/null || true)";',
      'if [ -z "$resolved" ]; then printf unresolved; exit 0; fi;',
      'case "$resolved" in "$root"|"$root"/*) ;; *) printf outside; exit 0;; esac;',
      'if [ -d "$abs" ]; then printf "directory\\t%s\\t%s" "$root" "$resolved";',
      'elif [ -f "$abs" ]; then printf "file\\t%s\\t%s" "$root" "$resolved";',
      'elif [ -e "$abs" ]; then printf "other\\t%s\\t%s" "$root" "$resolved";',
      "else printf missing; fi",
    ].join(" "),
  });
  if (!result.ok) return mapFailure(result);
  const value = String(result.outputText ?? "").trim();
  const [kind, rootPath, resolvedPath] = value.split("\t");
  if (kind === "missing" && rootPath) {
    return {
      ok: true,
      path: {
        kind,
        rootPath,
        resolvedPath: null,
      },
    };
  }
  if ((kind === "file" || kind === "directory" || kind === "other") && rootPath && resolvedPath) {
    return {
      ok: true,
      path: {
        kind,
        rootPath,
        resolvedPath,
      },
    };
  }
  if (value === "symlink") {
    return {
      ok: false,
      status: 400,
      code: "workspace_symlink_not_supported",
      message: "Workspace symlinks are not previewed in the workspace panel.",
    };
  }
  return {
    ok: false,
    status: 400,
    code: value === "outside" ? "path_outside_workspace" : "workspace_path_unresolved",
    message: "Workspace path is outside the computer workspace.",
  };
}

export const listWorkspaceDirectory = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const normalized = normalizeInspectorPath(args.path ?? ".");
    if (!normalized.ok) return normalized;
    const relPath = normalized.relPath;
    if (resolveWorkspaceComputerProviderFromServerEnv().providerId === "blaxel") {
      return await listBlaxelInspectorDirectory({
        ctx,
        authSubject: args.authSubject ?? null,
        projectId: args.projectId,
        relPath,
      });
    }
    const session = await resolveInspectorSession({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    if (!session.ok) return session;

    const boundaryResult = await inspectWorkspacePathBoundary({ session: session.session, relPath });
    if (!boundaryResult.ok) return boundaryResult;
    const boundary = boundaryResult.path;
    if (boundary.kind === "missing") {
      return {
        ok: false,
        status: 404,
        code: "directory_not_found",
        message: "Workspace folder not found.",
      };
    }
    if (boundary.kind !== "directory") {
      return {
        ok: false,
        status: 400,
        code: "workspace_path_not_directory",
        message: "Workspace path is not a folder.",
      };
    }

    const listed = await runDaytonaWorkspaceBash({
      config: session.session.config,
      toolboxProxyUrl: session.session.toolboxProxyUrl,
      sandboxId: session.session.providerSandboxId,
      relPath: ".",
      command: [
        ...buildGuardedResolvedPathPrelude(boundary),
        `if [ ! -d "$safe_path" ]; then printf ${shellQuote(WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER)}; exit 0; fi;`,
        'cd -- "$safe_path" || exit 1;',
        "find . -mindepth 1 -maxdepth 1 -print",
        "| sed 's#^\\./##'",
        "| while IFS= read -r path; do",
        '  [ -n "$path" ] || continue;',
        '  if [ -L "$path" ]; then',
        "    continue;",
        '  elif [ -d "$path" ]; then',
        '    printf \'dir\\t%s\\n\' "$path";',
        '  elif [ -f "$path" ]; then',
        '    printf \'file\\t%s\\n\' "$path";',
        "  fi;",
        "done",
        "| LC_ALL=C sort",
        `| sed -n '1,${DIRECTORY_ENTRY_LIMIT}p'`,
      ].join(" "),
    });
    if (!listed.ok) return mapFailure(listed);
    if (String(listed.outputText ?? "").trim() === WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER) {
      return mapGuardedPathFailure();
    }

    const entries = parseDirectoryEntries(listed.outputText, relPath);
    return {
      ok: true,
      providerId: "daytona",
      status: "active",
      path: relPath,
      entries,
      truncated: entries.length >= DIRECTORY_ENTRY_LIMIT,
    };
  },
});

export const readWorkspaceFilePreview = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    path: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const normalized = normalizeInspectorPath(args.path);
    if (!normalized.ok) return normalized;
    const relPath = normalized.relPath;
    if (resolveWorkspaceComputerProviderFromServerEnv().providerId === "blaxel") {
      return await readBlaxelInspectorFilePreview({
        ctx,
        authSubject: args.authSubject ?? null,
        projectId: args.projectId,
        relPath,
      });
    }
    const session = await resolveInspectorSession({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    if (!session.ok) return session;

    const boundaryResult = await inspectWorkspacePathBoundary({ session: session.session, relPath });
    if (!boundaryResult.ok) return boundaryResult;
    const boundary = boundaryResult.path;
    if (boundary.kind === "missing") {
      return {
        ok: false,
        status: 404,
        code: "file_not_found",
        message: "Workspace file not found.",
      };
    }
    if (boundary.kind === "directory") {
      return {
        ok: true,
        path: relPath,
        name: basenameOfPath(relPath),
        type: "directory",
        previewKind: "directory",
      };
    }
    if (boundary.kind !== "file") {
      return {
        ok: true,
        path: relPath,
        name: basenameOfPath(relPath),
        type: "other",
        previewKind: "unsupported",
        reason: "This workspace path is not a regular file.",
      };
    }

    const sizeBytes = await readWorkspacePathSize({ session: session.session, path: boundary });
    const extension = extensionOfPath(relPath);
    const imageMimeType = IMAGE_MIME_BY_EXTENSION[extension] ?? null;
    if (imageMimeType) {
      if (sizeBytes != null && sizeBytes > IMAGE_PREVIEW_MAX_BYTES) {
        return {
          ok: true,
          path: relPath,
          name: basenameOfPath(relPath),
          type: "file",
          previewKind: "unsupported",
          mimeType: imageMimeType,
          sizeBytes,
          reason: "Image is too large to preview in the workspace panel.",
        };
      }
      const encoded = await runDaytonaWorkspaceBash({
        config: session.session.config,
        toolboxProxyUrl: session.session.toolboxProxyUrl,
        sandboxId: session.session.providerSandboxId,
        relPath: ".",
        command: [
          ...buildGuardedResolvedPathPrelude(boundary),
          `if [ ! -f "$safe_path" ]; then printf ${shellQuote(WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER)}; exit 0; fi;`,
          "(base64 -w 0 \"$safe_path\" 2>/dev/null || base64 \"$safe_path\" | tr -d '\\n')",
        ].join(" "),
      });
      if (!encoded.ok) return mapFailure(encoded);
      if (String(encoded.outputText ?? "").trim() === WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER) {
        return mapGuardedPathFailure();
      }
      return {
        ok: true,
        path: relPath,
        name: basenameOfPath(relPath),
        type: "file",
        previewKind: "image",
        mimeType: imageMimeType,
        sizeBytes,
        dataUrl: `data:${imageMimeType};base64,${String(encoded.outputText ?? "").trim()}`,
      };
    }

    if (!isTextPreviewCandidate(relPath)) {
      return {
        ok: true,
        path: relPath,
        name: basenameOfPath(relPath),
        type: "file",
        previewKind: "unsupported",
        sizeBytes,
        reason: "This file type is not previewed yet.",
      };
    }

    const textPreview = await runDaytonaWorkspaceBash({
      config: session.session.config,
      toolboxProxyUrl: session.session.toolboxProxyUrl,
      sandboxId: session.session.providerSandboxId,
      relPath: ".",
      command: [
        ...buildGuardedResolvedPathPrelude(boundary),
        `if [ ! -f "$safe_path" ]; then printf ${shellQuote(WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER)}; exit 0; fi;`,
        'if ! LC_ALL=C grep -Iq . "$safe_path" && [ "$(wc -c < "$safe_path" | tr -d \'[:space:]\')" != "0" ]; then',
        "  printf '__POLYNET_BINARY_FILE__';",
        "else",
        `  head -c ${TEXT_PREVIEW_MAX_BYTES} "$safe_path";`,
        "fi",
      ].join(" "),
    });
    if (!textPreview.ok) return mapFailure(textPreview);
    if (String(textPreview.outputText ?? "").trim() === WORKSPACE_INSPECTOR_UNSAFE_PATH_MARKER) {
      return mapGuardedPathFailure();
    }
    if (String(textPreview.outputText ?? "").trim() === "__POLYNET_BINARY_FILE__") {
      return {
        ok: true,
        path: relPath,
        name: basenameOfPath(relPath),
        type: "file",
        previewKind: "unsupported",
        sizeBytes,
        reason: "Binary files are not previewed in the workspace panel.",
      };
    }

    return {
      ok: true,
      path: relPath,
      name: basenameOfPath(relPath),
      type: "file",
      previewKind: "text",
      sizeBytes,
      text: String(textPreview.outputText ?? ""),
      truncated: typeof sizeBytes === "number" && sizeBytes > TEXT_PREVIEW_MAX_BYTES,
    };
  },
});
