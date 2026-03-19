import {
  daytonaHeaders,
  type DaytonaConfig,
} from "./daytonaSandboxClient";

type DaytonaProcessExecuteDto = {
  result?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  exitCode?: number | null;
  code?: number | null;
  message?: unknown;
  error?: unknown;
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function wrapShellCommand(command: string): string {
  return `sh -lc ${shellQuote(command)}`;
}

function normalizeUrlPath(pathname: string): string {
  const cleaned = String(pathname ?? "").trim();
  if (!cleaned || cleaned === "/") return "/";
  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function joinUrlPath(pathname: string, ...segments: string[]): string {
  const base = normalizeUrlPath(pathname).replace(/^\/+|\/+$/g, "");
  const normalizedSegments = segments
    .map((segment) => String(segment ?? "").trim().replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  const parts = [base, ...normalizedSegments].filter((part) => part.length > 0);
  return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

export function buildDaytonaToolboxBaseCandidates(toolboxProxyUrl: string, sandboxId: string): string[] {
  const out: string[] = [];
  const pushUnique = (value: string) => {
    const normalized = value.replace(/\/+$/, "");
    if (!normalized) return;
    if (!out.includes(normalized)) out.push(normalized);
  };
  let parsed: URL;
  try {
    parsed = new URL(String(toolboxProxyUrl ?? "").trim());
  } catch {
    pushUnique(String(toolboxProxyUrl ?? "").trim());
    return out;
  }
  const encodedSandboxId = encodeURIComponent(String(sandboxId ?? "").trim());
  if (!encodedSandboxId) {
    pushUnique(parsed.toString());
    return out;
  }
  const normalizedPath = normalizeUrlPath(parsed.pathname);
  const toolboxIndex = normalizedPath.indexOf("/toolbox");
  if (toolboxIndex >= 0) {
    const pathPrefix = normalizedPath.slice(0, toolboxIndex);
    // Daytona's toolbox proxy URL is a root prefix like /toolbox, but the actual
    // process and file APIs are sandbox-scoped under /toolbox/{sandboxId}/...
    parsed.pathname = joinUrlPath(pathPrefix, "toolbox", encodedSandboxId);
    pushUnique(parsed.toString());
    parsed.pathname = joinUrlPath(pathPrefix, "toolbox", encodedSandboxId, "toolbox");
    pushUnique(parsed.toString());
    parsed.pathname = joinUrlPath(pathPrefix, "toolbox");
    pushUnique(parsed.toString());
  } else {
    for (const candidatePath of [
      joinUrlPath(normalizedPath, encodedSandboxId),
      joinUrlPath(normalizedPath, "toolbox", encodedSandboxId),
      joinUrlPath(normalizedPath, "toolbox", encodedSandboxId, "toolbox"),
      joinUrlPath("/", "toolbox", encodedSandboxId),
      joinUrlPath("/", "toolbox", encodedSandboxId, "toolbox"),
      normalizedPath,
    ]) {
      parsed.pathname = candidatePath;
      pushUnique(parsed.toString());
    }
  }
  if (out.length === 0) {
    parsed.pathname = normalizedPath;
    pushUnique(parsed.toString());
  }
  return out;
}

export function shouldRetryWithAlternateToolboxBase(status: number, text: string): boolean {
  const body = String(text ?? "").toLowerCase();
  if (status === 401) return true;
  if (body.includes("invalid host format")) return true;
  if (body.includes("sandbox id not found")) return true;
  if (status === 404 && body.includes("toolbox")) return true;
  return false;
}

function readLooseString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
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

export async function executeDaytonaCommand(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
  allowNonZero?: boolean;
}): Promise<
  | { ok: true; stdout: string; exitCode: number }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const timeout = typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
    ? Math.max(1, Math.min(900, Math.floor(params.timeoutSeconds)))
    : null;
  const baseCandidates = buildDaytonaToolboxBaseCandidates(params.toolboxProxyUrl, params.sandboxId);
  let lastFailure: { status: number; code: string; message: string; details?: Record<string, unknown> } | null = null;
  for (let index = 0; index < baseCandidates.length; index += 1) {
    const baseUrl = baseCandidates[index];
    const hasNext = index < baseCandidates.length - 1;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/process/execute`, {
        method: "POST",
        headers: daytonaHeaders(params.config, true),
        body: JSON.stringify({
          command: wrapShellCommand(params.command),
          ...(params.cwd ? { cwd: params.cwd } : null),
          ...(timeout !== null ? { timeout } : null),
        }),
      });
    } catch (error) {
      lastFailure = {
        status: 503,
        code: "runner_unavailable",
        message: error instanceof Error ? error.message : "Failed to call Daytona toolbox.",
      };
      continue;
    }

    const { text, json } = await parseDaytonaResponseBody(response);
    if (!response.ok) {
      const retryable = hasNext && shouldRetryWithAlternateToolboxBase(response.status, text);
      const failure = {
        status: 503,
        code: "runner_unavailable",
        message: `Daytona toolbox command failed (${response.status}).`,
        details: { response_text: text.slice(0, 2000), base_url: baseUrl },
      };
      if (retryable) {
        lastFailure = failure;
        continue;
      }
      return { ok: false, ...failure };
    }

    const parsed = (json ?? {}) as DaytonaProcessExecuteDto;
    const hadStructuredJson = json !== null;
    const nestedResult = parsed.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)
      ? (parsed.result as Record<string, unknown>)
      : null;
    const exitCodeCandidates = [parsed.exitCode, parsed.code, nestedResult?.exitCode, nestedResult?.code];
    let exitCode = 0;
    for (const candidate of exitCodeCandidates) {
      const parsedCode = Number(candidate);
      if (Number.isFinite(parsedCode)) {
        exitCode = parsedCode;
        break;
      }
    }
    const resultText = readLooseString(parsed.result);
    const nestedResultText = nestedResult
      ? readLooseString(nestedResult.result) ||
        readLooseString(nestedResult.output) ||
        readLooseString(nestedResult.message) ||
        readLooseString(nestedResult.error)
      : "";
    const stdoutText = readLooseString(parsed.stdout) || readLooseString(nestedResult?.stdout);
    const stderrText = readLooseString(parsed.stderr) || readLooseString(nestedResult?.stderr);
    const messageText = readLooseString(parsed.message);
    const errorText = readLooseString(parsed.error) || readLooseString(nestedResult?.error);
    const primaryOutput = resultText || stdoutText || nestedResultText || messageText || errorText;
    const fallbackOutput = hadStructuredJson ? "" : text;
    if (exitCode !== 0 && params.allowNonZero !== true) {
      return {
        ok: false,
        status: 502,
        code: "daytona_command_failed",
        message: `Daytona command failed with exit code ${exitCode}.`,
        details: {
          output_preview: (primaryOutput || fallbackOutput).slice(0, 2000),
          stderr_preview: stderrText.slice(0, 1000),
        },
      };
    }
    return {
      ok: true,
      exitCode,
      stdout: primaryOutput || stderrText || fallbackOutput,
    };
  }
  if (lastFailure) return { ok: false, ...lastFailure };
  return {
    ok: false,
    status: 503,
    code: "runner_unavailable",
    message: "Daytona toolbox command failed with no usable execution endpoint.",
  };
}
