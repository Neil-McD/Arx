import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveProjectBackgroundSandboxIfReady } from "./workspaceTerminalBackgroundService";
import {
  normalizeWorkspacePath,
  readDaytonaWorkspaceFile,
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

function normalizeInspectorPath(raw: unknown): string {
  const candidate = String(raw ?? "").trim();
  return normalizeWorkspacePath(candidate || ".");
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

async function resolveInspectorSession(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
}): Promise<
  | { ok: true; session: WorkspaceInspectorSession }
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

  const resolved = await resolveProjectBackgroundSandboxIfReady({
    ctx: params.ctx,
    authSubject: params.authSubject ?? null,
    userId: actor.dbUserId,
    projectId: params.projectId,
  });
  if (!resolved.ok) return mapFailure(resolved);

  return {
    ok: true,
    session: resolved,
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
  relPath: string;
}): Promise<number | null> {
  const result = await runDaytonaWorkspaceBash({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    relPath: ".",
    command: `wc -c < ${shellQuote(params.relPath)} | tr -d '[:space:]'`,
  });
  if (!result.ok) return null;
  const parsed = Number(String(result.outputText ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

async function readWorkspacePathKind(params: {
  session: WorkspaceInspectorSession;
  relPath: string;
}): Promise<"file" | "directory" | "missing" | "other"> {
  const result = await runDaytonaWorkspaceBash({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    relPath: ".",
    command: [
      `if [ -d ${shellQuote(params.relPath)} ]; then printf directory;`,
      `elif [ -f ${shellQuote(params.relPath)} ]; then printf file;`,
      `elif [ -e ${shellQuote(params.relPath)} ]; then printf other;`,
      "else printf missing; fi",
    ].join(" "),
  });
  if (!result.ok) return "missing";
  const value = String(result.outputText ?? "").trim();
  if (value === "file" || value === "directory" || value === "other") return value;
  return "missing";
}

export const listWorkspaceDirectory = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const relPath = normalizeInspectorPath(args.path ?? ".");
    const session = await resolveInspectorSession({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    if (!session.ok) return session;

    const listed = await readDaytonaWorkspaceFile({
      config: session.session.config,
      toolboxProxyUrl: session.session.toolboxProxyUrl,
      sandboxId: session.session.providerSandboxId,
      relPath,
      offset: 1,
      limit: DIRECTORY_ENTRY_LIMIT,
    });
    if (!listed.ok) return mapFailure(listed);

    const entries = parseDirectoryEntries(listed.outputText, relPath);
    return {
      ok: true,
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
    const relPath = normalizeInspectorPath(args.path);
    const session = await resolveInspectorSession({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    if (!session.ok) return session;

    const kind = await readWorkspacePathKind({ session: session.session, relPath });
    if (kind === "missing") {
      return {
        ok: false,
        status: 404,
        code: "file_not_found",
        message: "Workspace file not found.",
      };
    }
    if (kind === "directory") {
      return {
        ok: true,
        path: relPath,
        name: basenameOfPath(relPath),
        type: "directory",
        previewKind: "directory",
      };
    }
    if (kind !== "file") {
      return {
        ok: true,
        path: relPath,
        name: basenameOfPath(relPath),
        type: "other",
        previewKind: "unsupported",
        reason: "This workspace path is not a regular file.",
      };
    }

    const sizeBytes = await readWorkspacePathSize({ session: session.session, relPath });
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
        command: `(base64 -w 0 ${shellQuote(relPath)} 2>/dev/null || base64 ${shellQuote(relPath)} | tr -d '\\n')`,
      });
      if (!encoded.ok) return mapFailure(encoded);
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
        `if ! LC_ALL=C grep -Iq . ${shellQuote(relPath)} && [ "$(wc -c < ${shellQuote(relPath)} | tr -d '[:space:]')" != "0" ]; then`,
        "  printf '__POLYNET_BINARY_FILE__';",
        "else",
        `  head -c ${TEXT_PREVIEW_MAX_BYTES} ${shellQuote(relPath)};`,
        "fi",
      ].join(" "),
    });
    if (!textPreview.ok) return mapFailure(textPreview);
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
