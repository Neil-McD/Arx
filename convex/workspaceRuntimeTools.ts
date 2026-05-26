import {
  editDaytonaWorkspaceFile,
  globDaytonaWorkspacePaths,
  grepDaytonaWorkspaceFiles,
  listDaytonaWorkspaceDirectory,
  normalizeWorkspacePath,
  readDaytonaWorkspaceFile,
  runDaytonaWorkspaceBash,
  sha256DaytonaWorkspaceFile,
  writeDaytonaWorkspaceFile,
} from "./daytonaWorkspaceTools";
import {
  executeBlaxelWorkspaceCommand,
  ensureBlaxelWorkspaceComputer,
  readBlaxelWorkspaceFile,
  writeBlaxelWorkspaceFile,
} from "./blaxelWorkspaceComputerProvider.ts";
import type { RuntimeWorkspaceSession } from "./workspaceRuntimeSession.ts";
import type { RetrievalToolName } from "../shared/retrievalTools";

export type WorkspaceRuntimeToolSuccess = {
  ok: true;
  relPath: string;
  outputText: string;
  exitCode: number;
};

export type WorkspaceRuntimeToolFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type WorkspaceRuntimeToolResult =
  | WorkspaceRuntimeToolSuccess
  | WorkspaceRuntimeToolFailure;

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 400;

function normalizeOptionalWorkspacePath(value: unknown): string {
  const raw = String(value ?? "").trim();
  return raw ? normalizeWorkspacePath(raw) : ".";
}

function shellQuote(value: string): string {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function dirnameOfRelativePath(relPath: string): string {
  if (!relPath || relPath === "." || !relPath.includes("/")) return ".";
  return relPath.slice(0, relPath.lastIndexOf("/")) || ".";
}

function clampReadLimit(raw: unknown): number {
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_READ_LIMIT;
  const integer = Math.floor(parsed);
  if (integer < 1) return DEFAULT_READ_LIMIT;
  return Math.min(integer, MAX_READ_LIMIT);
}

function clampReadOffset(raw: unknown): number {
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return 1;
  const integer = Math.floor(parsed);
  return integer >= 1 ? integer : 1;
}

function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function countSubstringMatches(source: string, target: string): number {
  if (!target) return 0;
  let count = 0;
  let searchIndex = 0;
  while (searchIndex <= source.length) {
    const nextIndex = source.indexOf(target, searchIndex);
    if (nextIndex < 0) break;
    count += 1;
    searchIndex = nextIndex + target.length;
  }
  return count;
}

function findTrimmedLineBlockMatches(source: string, target: string): string[] {
  const sourceLines = source.split("\n");
  const targetLines = target.split("\n");
  if (targetLines.length > 0 && targetLines[targetLines.length - 1] === "") {
    targetLines.pop();
  }
  if (targetLines.length === 0) return [];

  const matchedBlocks: string[] = [];
  for (let index = 0; index <= sourceLines.length - targetLines.length; index += 1) {
    let blockMatches = true;
    for (let offset = 0; offset < targetLines.length; offset += 1) {
      if (sourceLines[index + offset]?.trim() !== targetLines[offset]?.trim()) {
        blockMatches = false;
        break;
      }
    }
    if (!blockMatches) continue;
    const block = sourceLines.slice(index, index + targetLines.length).join("\n");
    if (!matchedBlocks.includes(block)) matchedBlocks.push(block);
  }
  return matchedBlocks;
}

function mapBlaxelProviderFailure(result: {
  status?: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): WorkspaceRuntimeToolFailure {
  return {
    ok: false,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : 503,
    code: String(result.code ?? "blaxel_workspace_tool_failed"),
    message: String(result.message ?? "Blaxel workspace tool failed."),
    details: result.details,
  };
}

function isBlaxelSandboxNotFoundFailure(
  result: WorkspaceRuntimeToolResult,
): result is WorkspaceRuntimeToolFailure {
  return result.ok === false && result.code === "blaxel_sandbox_not_found";
}

async function reensureBlaxelRuntimeWorkspace(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
}): Promise<{ ok: true } | WorkspaceRuntimeToolFailure> {
  const ensured = await ensureBlaxelWorkspaceComputer({
    sandboxName: params.session.providerSandboxId,
    volumeName: params.session.projectVolumeId,
    workspaceRoot: params.session.workspaceRoot,
    lifecycleIntent: "agent_run",
    labels: {
      purpose: "workspace-agent-tools",
      project_id: String(params.session.projectId),
    },
  });
  return ensured.ok ? { ok: true } : mapBlaxelProviderFailure(ensured);
}

async function runBlaxelCommand(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  command: string;
  relPath?: string | null;
  timeoutSeconds?: number;
  commandFailureMessage: string;
  emptyText: string;
}): Promise<WorkspaceRuntimeToolResult> {
  const normalizedPath = normalizeOptionalWorkspacePath(params.relPath);
  const result = await executeBlaxelWorkspaceCommand({
    sandboxName: params.session.providerSandboxId,
    command: params.command,
    cwd: normalizedPath,
    waitForCompletion: true,
    timeoutSeconds: params.timeoutSeconds ?? 60,
  });
  if (!result.ok) return mapBlaxelProviderFailure(result);
  const exitCode = typeof result.exitCode === "number" ? result.exitCode : 0;
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  if (exitCode !== 0) {
    return {
      ok: false,
      status: 502,
      code: "blaxel_command_failed",
      message: params.commandFailureMessage,
      details: {
        output_preview: [stdout, stderr].filter(Boolean).join("\n").trim().slice(0, 2000),
        exit_code: exitCode,
      },
    };
  }
  return {
    ok: true,
    relPath: normalizedPath,
    outputText: stdout.trim() || params.emptyText,
    exitCode,
  };
}

async function listBlaxelDirectoryAsTool(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  relPath: string;
}): Promise<WorkspaceRuntimeToolResult> {
  const command = [
    "find . -mindepth 1 -maxdepth 2 -print",
    "| sed 's#^\\./##'",
    "| while IFS= read -r path; do",
    '  [ -n "$path" ] || continue;',
    '  if [ -d "$path" ]; then',
    '    printf \'dir\\t%s\\n\' "$path";',
    '  elif [ -f "$path" ]; then',
    '    printf \'file\\t%s\\n\' "$path";',
    "  fi;",
    "done",
    "| LC_ALL=C sort",
    "| head -n 200",
  ].join(" ");
  return await runBlaxelCommand({
    session: params.session,
    command,
    relPath: params.relPath,
    timeoutSeconds: 20,
    commandFailureMessage: `Failed to list workspace directory '${params.relPath}'.`,
    emptyText: "(empty directory)",
  });
}

async function readBlaxelFileAsTool(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  relPath: string;
  offset?: number;
  limit?: number;
}): Promise<WorkspaceRuntimeToolResult> {
  const offset = clampReadOffset(params.offset);
  const limit = clampReadLimit(params.limit);
  const endLine = offset + limit - 1;
  const file = await readBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
  });
  if (!file.ok) {
    if (file.code === "workspace_path_not_file") {
      const listed = await listBlaxelDirectoryAsTool({
        session: params.session,
        relPath: params.relPath,
      });
      if (!listed.ok) return listed;
      const lines = listed.outputText.split("\n");
      return {
        ok: true,
        relPath: params.relPath,
        outputText: lines.slice(offset - 1, endLine).join("\n") || "(empty directory)",
        exitCode: 0,
      };
    }
    return mapBlaxelProviderFailure(file);
  }
  const lines = String(file.content ?? "").split("\n");
  return {
    ok: true,
    relPath: params.relPath,
    outputText: lines.slice(offset - 1, endLine).join("\n") || "(empty file)",
    exitCode: 0,
  };
}

async function writeBlaxelFileAsTool(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  relPath: string;
  content: string;
}): Promise<WorkspaceRuntimeToolResult> {
  if (params.relPath === ".") {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: "write requires a file path, not the workspace root.",
    };
  }

  const existing = await readBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
  });
  if (!existing.ok && existing.code === "workspace_path_not_file") {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: "write requires a file path, not a directory.",
    };
  }
  if (!existing.ok && existing.code !== "workspace_path_not_found") {
    return mapBlaxelProviderFailure(existing);
  }
  const existedBefore = existing.ok;

  const parentDir = dirnameOfRelativePath(params.relPath);
  if (parentDir !== ".") {
    const mkdir = await runBlaxelCommand({
      session: params.session,
      relPath: ".",
      command: `mkdir -p -- ${shellQuote(parentDir)}`,
      timeoutSeconds: 20,
      commandFailureMessage: `Failed to create workspace directory '${parentDir}'.`,
      emptyText: "",
    });
    if (!mkdir.ok) return mkdir;
  }

  const written = await writeBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
    content: params.content,
  });
  if (!written.ok) return mapBlaxelProviderFailure(written);

  const verified = await readBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
  });
  if (!verified.ok) {
    return {
      ok: false,
      status: 502,
      code: "write_verification_failed",
      message: `Write completed but verification failed for '${params.relPath}'.`,
      details: {
        verification_code: verified.code,
        verification_message: verified.message,
      },
    };
  }
  const expectedContent = String(params.content ?? "");
  const actualContent = String(verified.content ?? "");
  if (actualContent !== expectedContent) {
    return {
      ok: false,
      status: 502,
      code: "write_verification_failed",
      message: `Write verification failed for '${params.relPath}': file contents did not match requested content.`,
      details: {
        expected_bytes: countUtf8Bytes(expectedContent),
        actual_bytes: countUtf8Bytes(actualContent),
        output_preview: actualContent.slice(0, 2000),
      },
    };
  }

  return {
    ok: true,
    relPath: params.relPath,
    outputText: `${existedBefore ? "overwrote" : "created"} ${params.relPath} (${countUtf8Bytes(actualContent)} bytes)`,
    exitCode: 0,
  };
}

async function editBlaxelFileAsTool(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  relPath: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}): Promise<WorkspaceRuntimeToolResult> {
  const current = await readBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
  });
  if (!current.ok) return mapBlaxelProviderFailure(current);

  const oldText = String(params.oldText ?? "");
  const newText = String(params.newText ?? "");
  if (oldText.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: "edit requires non-empty old_text.",
    };
  }

  const source = String(current.content ?? "");
  const exactMatchCount = countSubstringMatches(source, oldText);
  const exactMatch = exactMatchCount > 0 ? oldText : null;
  const fallbackMatches = exactMatch ? [] : findTrimmedLineBlockMatches(source, oldText);
  const fallbackMatch = fallbackMatches.length === 1 ? fallbackMatches[0] : null;
  const matchText = exactMatch ?? fallbackMatch;
  if (!matchText) {
    if (fallbackMatches.length > 1) {
      return {
        ok: false,
        status: 400,
        code: "edit_target_ambiguous",
        message: "edit found multiple trimmed line matches for old_text. Narrow the selection and try again.",
        details: {
          output_preview: fallbackMatches.slice(0, 3).join("\n---\n").slice(0, 2000),
        },
      };
    }
    return {
      ok: false,
      status: 400,
      code: "edit_target_not_found",
      message: "edit could not find old_text in the target file, even after trimmed line matching.",
      details: {
        output_preview: source.slice(0, 2000),
      },
    };
  }

  const replacementCount = params.replaceAll
    ? countSubstringMatches(source, matchText)
    : 1;
  const next = params.replaceAll
    ? source.split(matchText).join(newText)
    : source.replace(matchText, newText);
  if (next === source) {
    return {
      ok: true,
      relPath: params.relPath,
      outputText: `no changes needed for ${params.relPath}`,
      exitCode: 0,
    };
  }

  const written = await writeBlaxelFileAsTool({
    session: params.session,
    relPath: params.relPath,
    content: next,
  });
  if (!written.ok) return written;
  const matchStrategy = exactMatch ? "exact" : "trimmed";
  return {
    ok: true,
    relPath: params.relPath,
    outputText: `edited ${params.relPath} (${replacementCount} replacement${replacementCount === 1 ? "" : "s"}, ${matchStrategy} match)`,
    exitCode: 0,
  };
}

async function executeBlaxelRuntimeWorkspaceToolOnce(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  toolName: RetrievalToolName;
  normalizedArgs: Record<string, unknown>;
}): Promise<WorkspaceRuntimeToolResult> {
  if (params.toolName === "list_dir") {
    const relPath = normalizeOptionalWorkspacePath(params.normalizedArgs.path);
    return await listBlaxelDirectoryAsTool({ session: params.session, relPath });
  }
  if (params.toolName === "read") {
    const relPath = normalizeWorkspacePath(String(params.normalizedArgs.path ?? "").trim());
    return await readBlaxelFileAsTool({
      session: params.session,
      relPath,
      offset: typeof params.normalizedArgs.offset === "number"
        ? params.normalizedArgs.offset
        : undefined,
      limit: typeof params.normalizedArgs.limit === "number"
        ? params.normalizedArgs.limit
        : undefined,
    });
  }
  if (params.toolName === "glob") {
    const relPath = normalizeOptionalWorkspacePath(params.normalizedArgs.path);
    const pattern = String(params.normalizedArgs.pattern ?? "").trim();
    return await runBlaxelCommand({
      session: params.session,
      relPath,
      command: [
        `find . -mindepth 1 \\( -type f -o -type d \\) -path ${shellQuote(`./${pattern}`)} -print`,
        "| sed 's#^\\./##'",
        "| LC_ALL=C sort",
        "| head -n 200",
      ].join(" "),
      timeoutSeconds: 20,
      commandFailureMessage: `Failed to glob workspace path '${relPath}'.`,
      emptyText: "(no matches)",
    });
  }
  if (params.toolName === "grep") {
    const relPath = normalizeOptionalWorkspacePath(params.normalizedArgs.path);
    const pattern = String(params.normalizedArgs.pattern ?? "").trim();
    const result = await runBlaxelCommand({
      session: params.session,
      relPath,
      command: [
        "if command -v rg >/dev/null 2>&1; then",
        `  rg --no-heading --line-number --color never --max-count 200 ${shellQuote(pattern)} .`,
        "else",
        `  grep -Rns -m 200 -- ${shellQuote(pattern)} .`,
        "fi",
      ].join("\n"),
      timeoutSeconds: 20,
      commandFailureMessage: `Failed to grep workspace path '${relPath}'.`,
      emptyText: "(no matches)",
    });
    if (!result.ok && result.details?.exit_code === 1) {
      return {
        ok: true,
        relPath,
        outputText: "(no matches)",
        exitCode: 0,
      };
    }
    return result;
  }
  if (params.toolName === "sha256") {
    const relPath = normalizeWorkspacePath(String(params.normalizedArgs.path ?? "").trim());
    return await runBlaxelCommand({
      session: params.session,
      relPath: ".",
      command: `(sha256sum ${shellQuote(relPath)} 2>/dev/null || shasum -a 256 ${shellQuote(relPath)} 2>/dev/null) | awk '{print $1}'`,
      timeoutSeconds: 20,
      commandFailureMessage: `Failed to hash workspace file '${relPath}'.`,
      emptyText: "",
    });
  }
  if (params.toolName === "write") {
    const relPath = normalizeWorkspacePath(String(params.normalizedArgs.path ?? "").trim());
    return await writeBlaxelFileAsTool({
      session: params.session,
      relPath,
      content: String(params.normalizedArgs.content ?? ""),
    });
  }
  if (params.toolName === "edit") {
    const relPath = normalizeWorkspacePath(String(params.normalizedArgs.path ?? "").trim());
    return await editBlaxelFileAsTool({
      session: params.session,
      relPath,
      oldText: String(params.normalizedArgs.old_text ?? ""),
      newText: String(params.normalizedArgs.new_text ?? ""),
      replaceAll: params.normalizedArgs.replace_all === true,
    });
  }
  if (params.toolName === "bash") {
    const relPath = normalizeOptionalWorkspacePath(params.normalizedArgs.cwd);
    return await runBlaxelCommand({
      session: params.session,
      relPath,
      command: String(params.normalizedArgs.command ?? ""),
      timeoutSeconds: 60,
      commandFailureMessage: "Blaxel command failed.",
      emptyText: "(no output)",
    });
  }
  return {
    ok: false,
    status: 400,
    code: "workspace_tool_not_supported",
    message: `${params.toolName} is not supported by the workspace runtime tool executor.`,
  };
}

async function executeBlaxelRuntimeWorkspaceTool(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  toolName: RetrievalToolName;
  normalizedArgs: Record<string, unknown>;
}): Promise<WorkspaceRuntimeToolResult> {
  const firstAttempt = await executeBlaxelRuntimeWorkspaceToolOnce(params);
  if (!isBlaxelSandboxNotFoundFailure(firstAttempt)) return firstAttempt;

  const reensured = await reensureBlaxelRuntimeWorkspace({
    session: params.session,
  });
  if (!reensured.ok) return reensured;

  return await executeBlaxelRuntimeWorkspaceToolOnce(params);
}

async function executeDaytonaRuntimeWorkspaceTool(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "daytona" }>;
  toolName: RetrievalToolName;
  normalizedArgs: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  return params.toolName === "list_dir"
    ? await listDaytonaWorkspaceDirectory({
      config: params.session.config,
      toolboxProxyUrl: params.session.toolboxProxyUrl,
      sandboxId: params.session.providerSandboxId,
      relPath: String(params.normalizedArgs.path ?? ".") || ".",
      signal: params.signal,
    })
    : params.toolName === "read"
      ? await readDaytonaWorkspaceFile({
        config: params.session.config,
        toolboxProxyUrl: params.session.toolboxProxyUrl,
        sandboxId: params.session.providerSandboxId,
        relPath: String(params.normalizedArgs.path ?? "").trim(),
        offset:
          typeof params.normalizedArgs.offset === "number"
            ? params.normalizedArgs.offset
            : undefined,
        limit:
          typeof params.normalizedArgs.limit === "number"
            ? params.normalizedArgs.limit
            : undefined,
        signal: params.signal,
      })
      : params.toolName === "glob"
        ? await globDaytonaWorkspacePaths({
          config: params.session.config,
          toolboxProxyUrl: params.session.toolboxProxyUrl,
          sandboxId: params.session.providerSandboxId,
          pattern: String(params.normalizedArgs.pattern ?? "").trim(),
          relPath:
            typeof params.normalizedArgs.path === "string"
              ? params.normalizedArgs.path
              : undefined,
          signal: params.signal,
        })
        : params.toolName === "grep"
          ? await grepDaytonaWorkspaceFiles({
            config: params.session.config,
            toolboxProxyUrl: params.session.toolboxProxyUrl,
            sandboxId: params.session.providerSandboxId,
            pattern: String(params.normalizedArgs.pattern ?? "").trim(),
            relPath:
              typeof params.normalizedArgs.path === "string"
                ? params.normalizedArgs.path
                : undefined,
            signal: params.signal,
          })
          : params.toolName === "sha256"
            ? await sha256DaytonaWorkspaceFile({
              config: params.session.config,
              toolboxProxyUrl: params.session.toolboxProxyUrl,
              sandboxId: params.session.providerSandboxId,
              relPath: String(params.normalizedArgs.path ?? "").trim(),
              signal: params.signal,
            })
            : params.toolName === "write"
              ? await writeDaytonaWorkspaceFile({
                config: params.session.config,
                toolboxProxyUrl: params.session.toolboxProxyUrl,
                sandboxId: params.session.providerSandboxId,
                relPath: String(params.normalizedArgs.path ?? "").trim(),
                content: String(params.normalizedArgs.content ?? ""),
                signal: params.signal,
              })
              : params.toolName === "edit"
                ? await editDaytonaWorkspaceFile({
                  config: params.session.config,
                  toolboxProxyUrl: params.session.toolboxProxyUrl,
                  sandboxId: params.session.providerSandboxId,
                  relPath: String(params.normalizedArgs.path ?? "").trim(),
                  oldText: String(params.normalizedArgs.old_text ?? ""),
                  newText: String(params.normalizedArgs.new_text ?? ""),
                  replaceAll: params.normalizedArgs.replace_all === true,
                  signal: params.signal,
                })
                : await runDaytonaWorkspaceBash({
                  config: params.session.config,
                  toolboxProxyUrl: params.session.toolboxProxyUrl,
                  sandboxId: params.session.providerSandboxId,
                  command: String(params.normalizedArgs.command ?? ""),
                  relPath:
                    typeof params.normalizedArgs.cwd === "string"
                      ? params.normalizedArgs.cwd
                      : undefined,
                  signal: params.signal,
                });
}

export async function executeRuntimeWorkspaceTool(params: {
  session: RuntimeWorkspaceSession;
  toolName: RetrievalToolName;
  normalizedArgs: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  try {
    if (params.session.providerId === "blaxel") {
      return await executeBlaxelRuntimeWorkspaceTool({
        session: params.session,
        toolName: params.toolName,
        normalizedArgs: params.normalizedArgs,
      });
    }
    return await executeDaytonaRuntimeWorkspaceTool({
      session: params.session,
      toolName: params.toolName,
      normalizedArgs: params.normalizedArgs,
      signal: params.signal,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error ?? "");
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace tool arguments are invalid.",
    };
  }
}
