import {
  executeBlaxelWorkspaceCommand,
  readBlaxelWorkspaceFile,
  stopBlaxelWorkspaceProcess,
  writeBlaxelWorkspaceFile,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  reensureBlaxelWorkspaceComputerForPaidSession,
} from "./blaxelWorkspaceWake.ts";
import {
  WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE,
} from "./workspaceCreditBudgetSignal.ts";
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

function normalizeWorkspacePath(raw: unknown): string {
  const candidate = String(raw ?? "").trim().replaceAll("\\", "/");
  if (!candidate) throw new Error("tool_path_required");
  if (candidate.startsWith("/")) throw new Error("path_outside_workspace");
  const parts = candidate
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error("path_outside_workspace");
  }
  const segments =
    parts[0]?.toLowerCase() === "workspace" ? parts.slice(1) : parts;
  if (segments.length === 0) return ".";
  return segments.join("/");
}

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

function abortReasonCode(reason: unknown): string | null {
  const value = reason as { code?: unknown; name?: unknown; message?: unknown } | null;
  const code = String(value?.code ?? "").trim();
  if (code) return code;
  const name = String(value?.name ?? "").trim();
  if (name === "RuntimeRunCancelledError") return "user_cancelled";
  if (name === "WorkspaceCreditBudgetExpiredError") {
    return WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE;
  }
  return null;
}

function workspaceBudgetExpiredFailure(): WorkspaceRuntimeToolFailure {
  return {
    ok: false,
    status: 402,
    code: WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE,
    message: "This workspace tool budget expired. Add balance to keep using workspace tools.",
    details: {
      tool_kind: "workspace_tools",
      paid_usage_billing_mode: "prepaid_required",
    },
  };
}

function runtimeAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const message = String(reason ?? "").trim();
  return new Error(message || "Workspace tool was aborted.");
}

function signalAbortFailureOrThrow(
  signal?: AbortSignal,
): WorkspaceRuntimeToolFailure | null {
  if (!signal?.aborted) return null;
  const code = abortReasonCode(signal.reason);
  if (code === WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE) {
    return workspaceBudgetExpiredFailure();
  }
  throw runtimeAbortError(signal);
}

async function raceWorkspaceToolWithAbort<T extends { ok: boolean }>(params: {
  signal?: AbortSignal;
  operation: () => Promise<T>;
  onAbort?: () => void | Promise<void>;
}): Promise<T | WorkspaceRuntimeToolFailure> {
  const initialAbort = signalAbortFailureOrThrow(params.signal);
  if (initialAbort) return initialAbort;
  const signal = params.signal;
  if (!signal) return await params.operation();

  let settled = false;
  let removeAbortListener: (() => void) | null = null;
  const operationPromise = params.operation();
  const abortPromise = new Promise<WorkspaceRuntimeToolFailure | never>(
    (resolve, reject) => {
      const onAbort = () => {
        if (settled) return;
        settled = true;
        if (removeAbortListener) removeAbortListener();
        void Promise.resolve(params.onAbort?.()).catch(() => {});
        try {
          const failure = signalAbortFailureOrThrow(signal);
          if (failure) {
            resolve(failure);
            return;
          }
          reject(runtimeAbortError(signal));
        } catch (error) {
          reject(error);
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    },
  );

  try {
    return await Promise.race([
      operationPromise.then((result) => {
        if (settled) return result;
        settled = true;
        if (removeAbortListener) removeAbortListener();
        return result;
      }),
      abortPromise,
    ]);
  } finally {
    operationPromise.catch(() => {});
  }
}

async function reensureBlaxelRuntimeWorkspace(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
}): Promise<{ ok: true } | WorkspaceRuntimeToolFailure> {
  const ensured = await reensureBlaxelWorkspaceComputerForPaidSession({
    providerSandboxId: params.session.providerSandboxId,
    projectVolumeId: params.session.projectVolumeId,
    workspaceRoot: params.session.workspaceRoot,
    projectId: params.session.projectId,
    lifecycleIntent: "agent_run",
    labels: {
      purpose: "workspace-agent-tools",
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
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  const initialAbort = signalAbortFailureOrThrow(params.signal);
  if (initialAbort) return initialAbort;
  const normalizedPath = normalizeOptionalWorkspacePath(params.relPath);
  const processName = `polynet-runtime-${crypto.randomUUID().slice(0, 8)}`;
  const result = await raceWorkspaceToolWithAbort({
    signal: params.signal,
    operation: async () =>
      await executeBlaxelWorkspaceCommand({
        sandboxName: params.session.providerSandboxId,
        command: params.command,
        cwd: normalizedPath,
        processName,
        waitForCompletion: true,
        timeoutSeconds: params.timeoutSeconds ?? 60,
      }),
    onAbort: async () => {
      await stopBlaxelWorkspaceProcess({
        sandboxName: params.session.providerSandboxId,
        processName,
      });
    },
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
  signal?: AbortSignal;
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
    signal: params.signal,
  });
}

async function readBlaxelFileAsTool(params: {
  session: Extract<RuntimeWorkspaceSession, { providerId: "blaxel" }>;
  relPath: string;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  const initialAbort = signalAbortFailureOrThrow(params.signal);
  if (initialAbort) return initialAbort;
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
        signal: params.signal,
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
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  const initialAbort = signalAbortFailureOrThrow(params.signal);
  if (initialAbort) return initialAbort;
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
  const abortAfterExistingRead = signalAbortFailureOrThrow(params.signal);
  if (abortAfterExistingRead) return abortAfterExistingRead;
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
      signal: params.signal,
    });
    if (!mkdir.ok) return mkdir;
  }

  const written = await writeBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
    content: params.content,
  });
  const abortAfterWrite = signalAbortFailureOrThrow(params.signal);
  if (abortAfterWrite) return abortAfterWrite;
  if (!written.ok) return mapBlaxelProviderFailure(written);

  const verified = await readBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
  });
  const abortAfterVerification = signalAbortFailureOrThrow(params.signal);
  if (abortAfterVerification) return abortAfterVerification;
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
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  const initialAbort = signalAbortFailureOrThrow(params.signal);
  if (initialAbort) return initialAbort;
  const current = await readBlaxelWorkspaceFile({
    sandboxName: params.session.providerSandboxId,
    path: params.relPath,
  });
  const abortAfterRead = signalAbortFailureOrThrow(params.signal);
  if (abortAfterRead) return abortAfterRead;
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
    signal: params.signal,
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
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  const initialAbort = signalAbortFailureOrThrow(params.signal);
  if (initialAbort) return initialAbort;
  if (params.toolName === "list_dir") {
    const relPath = normalizeOptionalWorkspacePath(params.normalizedArgs.path);
    return await listBlaxelDirectoryAsTool({
      session: params.session,
      relPath,
      signal: params.signal,
    });
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
      signal: params.signal,
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
      signal: params.signal,
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
      signal: params.signal,
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
      signal: params.signal,
    });
  }
  if (params.toolName === "write") {
    const relPath = normalizeWorkspacePath(String(params.normalizedArgs.path ?? "").trim());
    return await writeBlaxelFileAsTool({
      session: params.session,
      relPath,
      content: String(params.normalizedArgs.content ?? ""),
      signal: params.signal,
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
      signal: params.signal,
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
      signal: params.signal,
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
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  const firstAttempt = await executeBlaxelRuntimeWorkspaceToolOnce(params);
  if (!isBlaxelSandboxNotFoundFailure(firstAttempt)) return firstAttempt;

  const reensured = await reensureBlaxelRuntimeWorkspace({
    session: params.session,
  });
  if (!reensured.ok) return reensured;

  return await executeBlaxelRuntimeWorkspaceToolOnce(params);
}

export async function executeRuntimeWorkspaceTool(params: {
  session: RuntimeWorkspaceSession;
  toolName: RetrievalToolName;
  normalizedArgs: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<WorkspaceRuntimeToolResult> {
  try {
    const initialAbort = signalAbortFailureOrThrow(params.signal);
    if (initialAbort) return initialAbort;
    return await executeBlaxelRuntimeWorkspaceTool({
      session: params.session,
      toolName: params.toolName,
      normalizedArgs: params.normalizedArgs,
      signal: params.signal,
    });
  } catch (error) {
    if (params.signal?.aborted) {
      const abortFailure = signalAbortFailureOrThrow(params.signal);
      if (abortFailure) return abortFailure;
    }
    const code = error instanceof Error ? error.message : String(error ?? "");
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace tool arguments are invalid.",
    };
  }
}
