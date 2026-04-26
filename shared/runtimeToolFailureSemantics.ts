import type { RuntimeDiagnostic } from "./runtimeDiagnostics.ts";

export type RuntimeToolFailureKind =
  | "command_not_found"
  | "command_not_executable"
  | "command_interrupted"
  | "command_terminated"
  | "command_killed"
  | "missing_package_script"
  | "module_resolution"
  | "nonzero_exit"
  | "tool_failure";

export type RuntimeToolFailureSemantics = {
  kind: RuntimeToolFailureKind;
  summary: string;
  suggestedRecovery: string;
  toolName: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  failedExecutable?: string;
  diagnostic: RuntimeDiagnostic;
};

export type RuntimeToolFailureSemanticsInput = {
  toolName: string;
  command?: string | null;
  cwd?: string | null;
  exitCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  outputText?: string | null;
};

function normalizeText(value: unknown, maxLen = 500): string | undefined {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLen
    ? `${normalized.slice(0, maxLen - 1).trimEnd()}...`
    : normalized;
}

function normalizeExitCode(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return undefined;
  return numeric;
}

function firstShellToken(command: string | null | undefined): string | undefined {
  const normalized = normalizeText(command, 500);
  if (!normalized) return undefined;
  const tokens = normalized.match(/(?:[^\s"'`]+|"[^"]*"|'[^']*')+/g) ?? [];
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^["']|["']$/g, "");
    if (!token || token.includes("=")) continue;
    if (token === "command" || token === "env" || token === "exec") continue;
    return token;
  }
  return undefined;
}

function extractMissingExecutable(params: {
  command?: string;
  outputText?: string;
}): string | undefined {
  const output = params.outputText ?? "";
  const patterns = [
    /\b(?:bash|sh|zsh):\s*(?:line\s+\d+:\s*)?([^:\s]+):\s*command not found\b/i,
    /\b([^:\s]+):\s*command not found\b/i,
    /\b(?:bash|sh):\s*(?:\d+:\s*)?([^:\s]+):\s*not found\b/i,
    /\benv:\s+['"]?([^:'"\s]+)['"]?:\s*(?:No such file or directory|not found)\b/i,
  ];
  for (const pattern of patterns) {
    const match = output.match(pattern);
    const value = normalizeText(match?.[1], 120);
    if (value) return value;
  }
  return firstShellToken(params.command);
}

function buildDiagnostic(params: {
  kind: RuntimeToolFailureKind;
  summary: string;
  source: string;
  raw?: string;
}): RuntimeDiagnostic {
  return {
    source: params.source,
    severity: "error",
    code: params.kind,
    message: params.summary,
    ...(params.raw ? { raw: params.raw } : null),
  };
}

export function inferRuntimeToolFailureSemantics(
  input: RuntimeToolFailureSemanticsInput,
): RuntimeToolFailureSemantics | null {
  const toolName = normalizeText(input.toolName, 80);
  if (!toolName) return null;

  const command = normalizeText(input.command, 500);
  const cwd = normalizeText(input.cwd, 260);
  const exitCode = normalizeExitCode(input.exitCode);
  const errorMessage = normalizeText(input.errorMessage, 500);
  const outputText = normalizeText(input.outputText, 1000);
  const raw = [errorMessage, outputText].filter(Boolean).join("\n");
  const diagnosticSource = toolName === "bash" ? "shell" : toolName;
  let kind: RuntimeToolFailureKind = "tool_failure";
  let summary =
    errorMessage ??
    (typeof exitCode === "number" && exitCode !== 0
      ? `${toolName} failed with exit code ${exitCode}.`
      : `${toolName} failed.`);
  let suggestedRecovery =
    "Inspect the tool output and retry only after identifying the failing command or runtime condition.";
  let failedExecutable: string | undefined;

  if (toolName === "bash") {
    if (exitCode === 127 || /\b(command not found|not found|No such file or directory)\b/i.test(raw)) {
      kind = "command_not_found";
      failedExecutable = extractMissingExecutable({ command, outputText: raw });
      summary = failedExecutable
        ? `Command not found: ${failedExecutable}.`
        : "Command not found.";
      suggestedRecovery =
        "Inspect package.json and the sandbox PATH, then use an available script/binary or install the missing command before retrying.";
    } else if (exitCode === 126 || /\bpermission denied\b/i.test(raw)) {
      kind = "command_not_executable";
      failedExecutable = firstShellToken(command);
      summary = failedExecutable
        ? `Command is not executable: ${failedExecutable}.`
        : "Command is not executable.";
      suggestedRecovery =
        "Check executable permissions and the command path before retrying.";
    } else if (exitCode === 130) {
      kind = "command_interrupted";
      summary = "Command was interrupted.";
      suggestedRecovery =
        "Confirm whether the interruption was intentional, then continue from the last verified state.";
    } else if (exitCode === 137) {
      kind = "command_killed";
      summary = "Command was killed before completion.";
      suggestedRecovery =
        "Check for memory/time pressure or an overly broad command, then retry with a narrower command.";
    } else if (exitCode === 143) {
      kind = "command_terminated";
      summary = "Command was terminated before completion.";
      suggestedRecovery =
        "Check whether the terminal or sandbox was stopped, then continue from the latest persisted state.";
    } else if (/\bMissing script:\s+['"]?([^'"\n]+)['"]?/i.test(raw)) {
      const script = raw.match(/\bMissing script:\s+['"]?([^'"\n]+)['"]?/i)?.[1];
      kind = "missing_package_script";
      summary = script ? `Missing package script: ${script}.` : "Missing package script.";
      suggestedRecovery =
        "Inspect package.json scripts and run an existing script or add the expected script before retrying.";
    } else if (/\b(cannot find module|failed to resolve import|could not resolve)\b/i.test(raw)) {
      kind = "module_resolution";
      summary = "Command failed because a module or import could not be resolved.";
      suggestedRecovery =
        "Inspect the import path/package dependency and fix the missing module before retrying.";
    } else if (typeof exitCode === "number" && exitCode !== 0) {
      kind = "nonzero_exit";
      summary = `Command exited with code ${exitCode}.`;
      suggestedRecovery =
        "Inspect the command output and fix the reported runtime/build issue before retrying.";
    }
  } else if (typeof exitCode === "number" && exitCode !== 0) {
    kind = "nonzero_exit";
    summary = `${toolName} exited with code ${exitCode}.`;
  }

  const diagnostic = buildDiagnostic({
    kind,
    summary,
    source: diagnosticSource,
    raw: raw || undefined,
  });
  return {
    kind,
    summary,
    suggestedRecovery,
    toolName,
    ...(command ? { command } : null),
    ...(cwd ? { cwd } : null),
    ...(typeof exitCode === "number" ? { exitCode } : null),
    ...(failedExecutable ? { failedExecutable } : null),
    diagnostic,
  };
}
