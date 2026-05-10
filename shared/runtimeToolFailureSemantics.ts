import type { RuntimeDiagnostic } from "./runtimeDiagnostics.ts";

export type RuntimeToolFailureKind =
  | "app_auth_required"
  | "app_permission_denied"
  | "app_invalid_arguments"
  | "app_rate_limited"
  | "app_provider_unreachable"
  | "app_provider_error"
  | "app_no_accessible_resources"
  | "app_tool_failure"
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
  appName?: string;
  appScope?: "user_platform_app" | "community_app";
  appToolName?: string;
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
  details?: Record<string, unknown> | null;
};

type MountedAppFailureContext = {
  appName: string;
  appScope: "user_platform_app" | "community_app";
  appToolName?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  if (!record) return undefined;
  return normalizeText(record[key], 160);
}

function readNestedRecord(
  record: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  if (!record) return null;
  const value = record[key];
  return isRecord(value) ? value : null;
}

function inferAppNameFromRuntimeToolName(toolName: string): string | undefined {
  const withoutPrefix = toolName.replace(/^me__/, "");
  const appPart = withoutPrefix.split("__")[0]?.replace(/_\d+$/, "");
  if (!appPart || appPart === toolName) return undefined;
  return appPart
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function extractMountedAppFailureContext(params: {
  toolName: string;
  errorCode?: string | null;
  details?: Record<string, unknown> | null;
}): MountedAppFailureContext | null {
  const details = params.details ?? null;
  const userApp = readNestedRecord(details, "user_platform_app");
  const communityApp = readNestedRecord(details, "community_app");
  const appScope = userApp
    ? "user_platform_app"
    : communityApp
      ? "community_app"
      : null;
  const appRecord = userApp ?? communityApp;
  const errorCode = String(params.errorCode ?? "").trim();
  const hasMountedAppError =
    errorCode.startsWith("user_platform_app_") ||
    errorCode.startsWith("community_app_") ||
    errorCode === "mounted_app_tool_not_found";
  if (!appRecord && !hasMountedAppError) return null;
  return {
    appName:
      readString(appRecord, "app_name") ??
      inferAppNameFromRuntimeToolName(params.toolName) ??
      "Connected app",
    appScope: appScope ?? "user_platform_app",
    appToolName:
      readString(appRecord, "tool_name") ??
      readString(appRecord, "namespaced_tool_name"),
  };
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

function appToolSubject(context: MountedAppFailureContext): string {
  return context.appToolName
    ? `${context.appName} tool ${context.appToolName}`
    : `${context.appName} app tool`;
}

function classifyMountedAppFailure(params: {
  context: MountedAppFailureContext;
  raw: string;
  errorCode?: string | null;
}): Pick<RuntimeToolFailureSemantics, "kind" | "summary" | "suggestedRecovery"> {
  const raw = params.raw;
  const rawLower = raw.toLowerCase();
  const errorCode = String(params.errorCode ?? "").trim();
  const subject = appToolSubject(params.context);

  if (
    errorCode.endsWith("_app_not_found") ||
    /\b(unauthorized|unauthenticated|401|invalid token|expired token|token expired|access token|refresh token|oauth|not connected|setup needed|connection missing)\b/i.test(raw)
  ) {
    return {
      kind: "app_auth_required",
      summary: `${subject} needs a fresh connection before it can run.`,
      suggestedRecovery:
        "Open the app setup or reconnect flow, complete authentication with the intended workspace/account, then retry the app tool once.",
    };
  }

  if (/\b(rate limit|rate limited|too many requests|429)\b/i.test(raw)) {
    return {
      kind: "app_rate_limited",
      summary: `${subject} was rate limited by the provider.`,
      suggestedRecovery:
        "Back off before retrying, avoid looping on the same app tool, and continue with other apps when the task does not require this one.",
    };
  }

  if (
    /\b(no accessible|no available|no visible|has access to no|no bases|no workspaces|no projects|no resources)\b/i.test(raw) ||
    /\b(base|workspace|project|database|resource)\b.*\bnot found\b/i.test(rawLower)
  ) {
    return {
      kind: "app_no_accessible_resources",
      summary: `${subject} is connected, but no matching provider resources were accessible.`,
      suggestedRecovery:
        "Check that the connected account can access the expected workspace/resources, or retry with a known resource id instead of broad discovery.",
    };
  }

  if (
    /\b(forbidden|permission denied|access denied|not allowed|403|insufficient permission|insufficient permissions|insufficient scope|missing scope)\b/i.test(raw)
  ) {
    return {
      kind: "app_permission_denied",
      summary: `${subject} was rejected by the provider because of permissions or scopes.`,
      suggestedRecovery:
        "Check the connected account, workspace/resource permissions, and OAuth/token scopes. Skip this app and continue testing others when it is not required.",
    };
  }

  if (
    /\b(invalid input|invalid argument|invalid arguments|invalid request|invalid params|invalid parameter|bad request|schema|validation|400|422)\b/i.test(raw) ||
    /\bexpected\b.*\bto be\b/i.test(raw) ||
    /\b(cursor|argument|parameter|field)\b.*\b(string|number|boolean|object|array|required)\b/i.test(raw)
  ) {
    return {
      kind: "app_invalid_arguments",
      summary: `${subject} failed because the tool arguments were invalid.`,
      suggestedRecovery:
        "Read the tool schema and provider error, correct the arguments, and retry once. For multi-app health checks, move on to the next app instead of looping on the same bad call.",
    };
  }

  if (
    /\b(timeout|timed out|aborted|fetch failed|network|econnreset|econnrefused|enotfound|eai_again|socket|502|503|504|bad gateway|service unavailable|gateway timeout)\b/i.test(raw)
  ) {
    return {
      kind: "app_provider_unreachable",
      summary: `${subject} could not reach a healthy provider endpoint.`,
      suggestedRecovery:
        "Treat this as provider or network instability, retry later or with a safe read call, and continue with other apps when possible.",
    };
  }

  if (/\b(500|internal server error|server error|provider error)\b/i.test(raw)) {
    return {
      kind: "app_provider_error",
      summary: `${subject} failed inside the provider or MCP server.`,
      suggestedRecovery:
        "Retry once if the call is idempotent. If it fails again, preserve the error, skip the app, and research provider status/docs only if the task depends on it.",
    };
  }

  return {
    kind: "app_tool_failure",
    summary: `${subject} failed.`,
    suggestedRecovery:
      "Use the provider output as evidence, avoid repeating the same failing call, and continue with other apps or ask for setup details if this app is required.",
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
  const errorCode = normalizeText(input.errorCode, 160);
  const errorMessage = normalizeText(input.errorMessage, 500);
  const outputText = normalizeText(input.outputText, 1000);
  const raw = [errorCode, errorMessage, outputText].filter(Boolean).join("\n");
  const diagnosticSource = toolName === "bash" ? "shell" : toolName;
  const mountedAppContext = extractMountedAppFailureContext({
    toolName,
    errorCode,
    details: input.details ?? null,
  });
  let kind: RuntimeToolFailureKind = "tool_failure";
  let summary =
    errorMessage ??
    (typeof exitCode === "number" && exitCode !== 0
      ? `${toolName} failed with exit code ${exitCode}.`
      : `${toolName} failed.`);
  let suggestedRecovery =
    "Inspect the tool output and retry only after identifying the failing command or runtime condition.";
  let failedExecutable: string | undefined;

  if (mountedAppContext) {
    const classified = classifyMountedAppFailure({
      context: mountedAppContext,
      raw,
      errorCode,
    });
    kind = classified.kind;
    summary = classified.summary;
    suggestedRecovery = classified.suggestedRecovery;
  } else if (toolName === "bash") {
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
    source: mountedAppContext
      ? `connected_app:${mountedAppContext.appName}`
      : diagnosticSource,
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
    ...(mountedAppContext
      ? {
          appName: mountedAppContext.appName,
          appScope: mountedAppContext.appScope,
          ...(mountedAppContext.appToolName
            ? { appToolName: mountedAppContext.appToolName }
            : null),
        }
      : null),
    diagnostic,
  };
}
