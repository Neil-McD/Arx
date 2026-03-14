import {
  DAYTONA_WORKSPACE_ROOT,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import {
  createDaytonaToolboxFolder,
  downloadDaytonaToolboxFileText,
  getDaytonaToolboxFileInfo,
  uploadDaytonaToolboxFile,
} from "./daytonaToolboxFileSystem";
import { executeDaytonaCommand } from "./daytonaToolboxExecutor";

type DaytonaWorkspaceToolSuccess = {
  ok: true;
  relPath: string;
  outputText: string;
  exitCode: number;
};

type DaytonaWorkspaceToolFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type DaytonaWorkspaceToolResult =
  | DaytonaWorkspaceToolSuccess
  | DaytonaWorkspaceToolFailure;

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 400;

function normalizeRelativeWorkspacePath(raw: unknown): string {
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

function normalizeOptionalRelativeWorkspacePath(raw: unknown): string {
  const candidate = String(raw ?? "").trim();
  if (!candidate) return ".";
  return normalizeRelativeWorkspacePath(candidate);
}

function dirnameOfRelativePath(relPath: string): string {
  if (!relPath || relPath === "." || !relPath.includes("/")) return ".";
  return relPath.slice(0, relPath.lastIndexOf("/")) || ".";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function resolveWorkspaceCwd(relPath: string): string {
  return relPath === "."
    ? DAYTONA_WORKSPACE_ROOT
    : `${DAYTONA_WORKSPACE_ROOT}/${relPath}`;
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

function mapCommandResult(args: {
  normalizedPath: string;
  result: Awaited<ReturnType<typeof executeDaytonaCommand>>;
  commandFailureMessage: string;
  emptyText: string;
}): DaytonaWorkspaceToolResult {
  if (!args.result.ok) return args.result;
  if (args.result.exitCode !== 0) {
    return {
      ok: false,
      status: 502,
      code: "daytona_command_failed",
      message: args.commandFailureMessage,
      details: {
        output_preview: String(args.result.stdout ?? "").slice(0, 2000),
        exit_code: args.result.exitCode,
      },
    };
  }
  return {
    ok: true,
    relPath: args.normalizedPath,
    outputText: String(args.result.stdout ?? "").trim() || args.emptyText,
    exitCode: args.result.exitCode,
  };
}

export function normalizeWorkspacePath(raw: unknown): string {
  return normalizeRelativeWorkspacePath(raw);
}

async function ensureDaytonaWorkspaceDirectoryExists(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
}): Promise<DaytonaWorkspaceToolFailure | null> {
  const segments = String(params.relPath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  const currentSegments: string[] = [];
  for (const segment of segments) {
    currentSegments.push(segment);
    const absolutePath = resolveWorkspaceCwd(currentSegments.join("/"));
    const info = await getDaytonaToolboxFileInfo({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      path: absolutePath,
    });
    if (!info.ok) return info;
    if (info.value.exists) {
      if (!info.value.isDirectory) {
        return {
          ok: false,
          status: 400,
          code: "invalid_tool_args",
          message: `Workspace path '${currentSegments.join("/")}' is not a directory.`,
        };
      }
      continue;
    }
    const created = await createDaytonaToolboxFolder({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      path: absolutePath,
    });
    if (!created.ok) return created;
  }

  return null;
}

async function readDaytonaWorkspaceFileRaw(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  normalizedPath: string;
}): Promise<
  | {
      ok: true;
      content: string;
    }
  | DaytonaWorkspaceToolFailure
> {
  const result = await downloadDaytonaToolboxFileText({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    path: resolveWorkspaceCwd(params.normalizedPath),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    content: String(result.value ?? ""),
  };
}

async function listDaytonaWorkspaceSuggestions(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  basename: string;
}): Promise<string[]> {
  const needle = String(params.basename ?? "").trim();
  if (!needle) return [];
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: [
      "find . -mindepth 1 -maxdepth 4 -print",
      "| sed 's#^\\./##'",
      `| grep -Fi -- ${shellQuote(needle)}`,
      "| head -n 3",
    ].join(" "),
    cwd: DAYTONA_WORKSPACE_ROOT,
    timeoutSeconds: 10,
    allowNonZero: true,
  });
  if (!result.ok || result.exitCode !== 0) return [];
  return String(result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
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

export async function listDaytonaWorkspaceDirectory(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
}): Promise<DaytonaWorkspaceToolResult> {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeRelativeWorkspacePath(params.relPath);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace directory path is invalid.",
    };
  }

  const command = [
    "find . -mindepth 1 -maxdepth 2 -print",
    "| sed 's#^\\./##'",
    "| while IFS= read -r path; do",
    '  [ -n "$path" ] || continue;',
    '  if [ -d "$path" ]; then',
    '    printf \'dir\\t%s\\n\' \"$path\";',
    '  elif [ -f "$path" ]; then',
    '    printf \'file\\t%s\\n\' \"$path\";',
    "  fi;",
    "done",
    "| LC_ALL=C sort",
    "| head -n 200",
  ].join(" ");

  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command,
    cwd: resolveWorkspaceCwd(normalizedPath),
    timeoutSeconds: 20,
    allowNonZero: true,
  });

  return mapCommandResult({
    normalizedPath,
    result,
    commandFailureMessage: `Failed to list workspace directory '${normalizedPath}'.`,
    emptyText: "(empty directory)",
  });
}

export async function readDaytonaWorkspaceFile(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
  offset?: number;
  limit?: number;
}): Promise<DaytonaWorkspaceToolResult> {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeRelativeWorkspacePath(params.relPath);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace file path is invalid.",
    };
  }

  const offset = clampReadOffset(params.offset);
  const limit = clampReadLimit(params.limit);
  const endLine = offset + limit - 1;
  const absolutePath = resolveWorkspaceCwd(normalizedPath);
  const fileInfo = await getDaytonaToolboxFileInfo({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    path: absolutePath,
  });
  if (!fileInfo.ok) return fileInfo;
  if (fileInfo.value.exists && fileInfo.value.isDirectory) {
    const result = await executeDaytonaCommand({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      command: [
        "find . -mindepth 1 -maxdepth 1 -print",
        "| sed 's#^\\./##'",
        "| while IFS= read -r path; do",
        '  [ -n "$path" ] || continue;',
        '  if [ -d "$path" ]; then',
        '    printf \'dir\\t%s\\n\' \"$path\";',
        '  elif [ -f "$path" ]; then',
        '    printf \'file\\t%s\\n\' \"$path\";',
        "  fi;",
        "done",
        "| LC_ALL=C sort",
        `| sed -n '${offset},${endLine}p'`,
      ].join(" "),
      cwd: resolveWorkspaceCwd(normalizedPath),
      timeoutSeconds: 20,
      allowNonZero: true,
    });
    return mapCommandResult({
      normalizedPath,
      result,
      commandFailureMessage: `Failed to read workspace directory '${normalizedPath}'.`,
      emptyText: "(empty directory)",
    });
  }

  if (!fileInfo.value.exists) {
    const suggestions = await listDaytonaWorkspaceSuggestions({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      basename: normalizedPath.split("/").filter(Boolean).pop() || normalizedPath,
    });
    const suggestionText =
      suggestions.length > 0
        ? ` Did you mean: ${suggestions.map((item) => `'${item}'`).join(", ")}?`
        : "";
    return {
      ok: false,
      status: 404,
      code: "file_not_found",
      message: `Workspace path '${normalizedPath}' does not exist.${suggestionText}`,
        details: suggestions.length > 0 ? { output_preview: suggestions.join("\n") } : undefined,
      };
  }

  if (fileInfo.value.isDirectory) {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: `Path '${normalizedPath}' is not readable as a file or directory.`,
    };
  }

  const raw = await readDaytonaWorkspaceFileRaw({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    normalizedPath,
  });
  if (!raw.ok) return raw;

  const lines = raw.content.split("\n");
  const slice = lines.slice(offset - 1, endLine);
  return {
    ok: true,
    relPath: normalizedPath,
    outputText: slice.join("\n") || "(empty file)",
    exitCode: 0,
  };
}

export async function globDaytonaWorkspacePaths(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  pattern: string;
  relPath?: string;
}): Promise<DaytonaWorkspaceToolResult> {
  const normalizedPath = normalizeOptionalRelativeWorkspacePath(params.relPath);
  const pattern = String(params.pattern ?? "").trim();
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: [
      `find . -mindepth 1 \\( -type f -o -type d \\) -path ${shellQuote(`./${pattern}`)} -print`,
      "| sed 's#^\\./##'",
      "| LC_ALL=C sort",
      "| head -n 200",
    ].join(" "),
    cwd: resolveWorkspaceCwd(normalizedPath),
    timeoutSeconds: 20,
    allowNonZero: true,
  });

  return mapCommandResult({
    normalizedPath,
    result,
    commandFailureMessage: `Failed to glob workspace path '${normalizedPath}'.`,
    emptyText: "(no matches)",
  });
}

export async function grepDaytonaWorkspaceFiles(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  pattern: string;
  relPath?: string;
}): Promise<DaytonaWorkspaceToolResult> {
  const normalizedPath = normalizeOptionalRelativeWorkspacePath(params.relPath);
  const pattern = String(params.pattern ?? "").trim();
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: [
      "if command -v rg >/dev/null 2>&1; then",
      `  rg --no-heading --line-number --color never --max-count 200 ${shellQuote(pattern)} .`,
      "else",
      `  grep -RIn --binary-files=without-match -m 200 -- ${shellQuote(pattern)} .`,
      "fi",
    ].join("\n"),
    cwd: resolveWorkspaceCwd(normalizedPath),
    timeoutSeconds: 20,
    allowNonZero: true,
  });
  if (!result.ok) return result;
  if (result.exitCode === 1) {
    return {
      ok: true,
      relPath: normalizedPath,
      outputText: "(no matches)",
      exitCode: 0,
    };
  }
  return mapCommandResult({
    normalizedPath,
    result,
    commandFailureMessage: `Failed to grep workspace path '${normalizedPath}'.`,
    emptyText: "(no matches)",
  });
}

export async function sha256DaytonaWorkspaceFile(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
}): Promise<DaytonaWorkspaceToolResult> {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeRelativeWorkspacePath(params.relPath);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace file path is invalid.",
    };
  }

  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: `(sha256sum ${shellQuote(normalizedPath)} 2>/dev/null || shasum -a 256 ${shellQuote(normalizedPath)} 2>/dev/null) | awk '{print $1}'`,
    cwd: DAYTONA_WORKSPACE_ROOT,
    timeoutSeconds: 20,
    allowNonZero: true,
  });

  return mapCommandResult({
    normalizedPath,
    result,
    commandFailureMessage: `Failed to hash workspace file '${normalizedPath}'.`,
    emptyText: "",
  });
}

export async function writeDaytonaWorkspaceFile(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
  content: string;
}): Promise<DaytonaWorkspaceToolResult> {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeRelativeWorkspacePath(params.relPath);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace file path is invalid.",
    };
  }

  if (normalizedPath === ".") {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: "write requires a file path, not the workspace root.",
    };
  }

  const absolutePath = resolveWorkspaceCwd(normalizedPath);
  const existedBeforeInfo = await getDaytonaToolboxFileInfo({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    path: absolutePath,
  });
  if (!existedBeforeInfo.ok) return existedBeforeInfo;
  if (existedBeforeInfo.value.exists && existedBeforeInfo.value.isDirectory) {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: "write requires a file path, not a directory.",
    };
  }
  const existedBefore = existedBeforeInfo.value.exists;

  const parentDir = dirnameOfRelativePath(normalizedPath);
  if (parentDir !== ".") {
    const ensuredParent = await ensureDaytonaWorkspaceDirectoryExists({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      relPath: parentDir,
    });
    if (ensuredParent) return ensuredParent;
  }

  const uploaded = await uploadDaytonaToolboxFile({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    path: absolutePath,
    content: String(params.content ?? ""),
  });
  if (!uploaded.ok) {
    return {
      ok: false,
      status: uploaded.status,
      code: uploaded.code,
      message: `Failed to write workspace file '${normalizedPath}'.`,
      details: uploaded.details,
    };
  }

  const verified = await downloadDaytonaToolboxFileText({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    path: absolutePath,
  });
  if (!verified.ok) {
    return {
      ok: false,
      status: 502,
      code: "write_verification_failed",
      message: `Write completed but verification failed for '${normalizedPath}'.`,
      details: {
        verification_code: verified.code,
        verification_message: verified.message,
        output_preview: String(verified.details?.output_preview ?? "").slice(0, 2000),
      },
    };
  }

  const expectedContent = String(params.content ?? "");
  if (verified.value !== expectedContent) {
    return {
      ok: false,
      status: 502,
      code: "write_verification_failed",
      message: `Write verification failed for '${normalizedPath}': file contents did not match requested content.`,
      details: {
        expected_bytes: countUtf8Bytes(expectedContent),
        actual_bytes: countUtf8Bytes(verified.value),
        output_preview: verified.value.slice(0, 2000),
      },
    };
  }

  const byteCount = countUtf8Bytes(verified.value);
  return {
    ok: true,
    relPath: normalizedPath,
    outputText: `${existedBefore ? "overwrote" : "created"} ${normalizedPath} (${byteCount} bytes)`,
    exitCode: 0,
  };
}

export async function editDaytonaWorkspaceFile(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}): Promise<DaytonaWorkspaceToolResult> {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeRelativeWorkspacePath(params.relPath);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace file path is invalid.",
    };
  }

  const current = await readDaytonaWorkspaceFileRaw({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    normalizedPath,
  });
  if (!current.ok) return current;

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
  const source = current.content;
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
      relPath: normalizedPath,
      outputText: `no changes needed for ${normalizedPath}`,
      exitCode: 0,
    };
  }
  const written = await writeDaytonaWorkspaceFile({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    relPath: normalizedPath,
    content: next,
  });
  if (!written.ok) return written;
  const matchStrategy = exactMatch ? "exact" : "trimmed";
  return {
    ok: true,
    relPath: normalizedPath,
    outputText: `edited ${normalizedPath} (${replacementCount} replacement${replacementCount === 1 ? "" : "s"}, ${matchStrategy} match)`,
    exitCode: 0,
  };
}

export async function runDaytonaWorkspaceBash(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  command: string;
  relPath?: string;
}): Promise<DaytonaWorkspaceToolResult> {
  const normalizedPath = normalizeOptionalRelativeWorkspacePath(params.relPath);
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: String(params.command ?? ""),
    cwd: resolveWorkspaceCwd(normalizedPath),
    timeoutSeconds: 60,
    allowNonZero: true,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    relPath: normalizedPath,
    outputText: String(result.stdout ?? "").trim() || "(no output)",
    exitCode: result.exitCode,
  };
}
