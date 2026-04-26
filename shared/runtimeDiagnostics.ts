export type RuntimeDiagnosticSeverity = "error" | "warning" | "info";

export type RuntimeDiagnostic = {
  source: string;
  severity: RuntimeDiagnosticSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  raw?: string;
};

export type RuntimeDiagnosticsParseInput = {
  command?: string | null;
  outputText?: string | null;
  maxDiagnostics?: number;
};

function normalizeText(value: unknown, maxLen = 500): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLen
    ? `${normalized.slice(0, maxLen - 1).trimEnd()}...`
    : normalized;
}

function normalizePath(value: unknown): string | undefined {
  const normalized = normalizeText(value, 260);
  if (!normalized) return undefined;
  return normalized.replace(/^file:\/\//, "");
}

function normalizeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return undefined;
  return Math.floor(numeric);
}

function normalizeSeverity(value: unknown): RuntimeDiagnosticSeverity {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "warning" || normalized === "warn") return "warning";
  if (normalized === "info") return "info";
  return "error";
}

function inferDiagnosticSource(command: string | null | undefined): string {
  const normalized = String(command ?? "").toLowerCase();
  if (/\b(tsc|typecheck)\b/.test(normalized)) return "typescript";
  if (/\b(eslint|lint)\b/.test(normalized)) return "eslint";
  if (/\b(vitest|jest|playwright|test)\b/.test(normalized)) return "test";
  if (/\b(vite|build)\b/.test(normalized)) return "build";
  return "shell";
}

function pushDiagnostic(
  diagnostics: RuntimeDiagnostic[],
  diagnostic: RuntimeDiagnostic,
  maxDiagnostics: number,
): void {
  if (diagnostics.length >= maxDiagnostics) return;
  const key = [
    diagnostic.source,
    diagnostic.severity,
    diagnostic.file ?? "",
    diagnostic.line ?? "",
    diagnostic.column ?? "",
    diagnostic.code ?? "",
    diagnostic.message,
  ].join("\u0000");
  const exists = diagnostics.some(
    (existing) =>
      [
        existing.source,
        existing.severity,
        existing.file ?? "",
        existing.line ?? "",
        existing.column ?? "",
        existing.code ?? "",
        existing.message,
      ].join("\u0000") === key,
  );
  if (!exists) diagnostics.push(diagnostic);
}

function buildDiagnostic(params: {
  source: string;
  severity?: unknown;
  file?: unknown;
  line?: unknown;
  column?: unknown;
  code?: unknown;
  message?: unknown;
  raw?: unknown;
}): RuntimeDiagnostic | null {
  const message = normalizeText(params.message, 600);
  if (!message) return null;
  const diagnostic: RuntimeDiagnostic = {
    source: params.source,
    severity: normalizeSeverity(params.severity),
    message,
  };
  const file = normalizePath(params.file);
  const line = normalizeNumber(params.line);
  const column = normalizeNumber(params.column);
  const code = normalizeText(params.code, 80);
  const raw = normalizeText(params.raw, 800);
  if (file) diagnostic.file = file;
  if (line) diagnostic.line = line;
  if (column) diagnostic.column = column;
  if (code) diagnostic.code = code;
  if (raw) diagnostic.raw = raw;
  return diagnostic;
}

export function parseRuntimeDiagnosticsFromText(
  input: RuntimeDiagnosticsParseInput,
): RuntimeDiagnostic[] {
  const outputText = String(input.outputText ?? "");
  if (!outputText.trim()) return [];

  const maxDiagnostics = Math.max(
    1,
    Math.min(20, Math.floor(input.maxDiagnostics ?? 8)),
  );
  const fallbackSource = inferDiagnosticSource(input.command);
  const diagnostics: RuntimeDiagnostic[] = [];
  const lines = outputText.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tscMatch = trimmed.match(
      /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/i,
    );
    if (tscMatch) {
      const diagnostic = buildDiagnostic({
        source: "typescript",
        file: tscMatch[1],
        line: tscMatch[2],
        column: tscMatch[3],
        severity: tscMatch[4],
        code: tscMatch[5],
        message: tscMatch[6],
        raw: trimmed,
      });
      if (diagnostic) pushDiagnostic(diagnostics, diagnostic, maxDiagnostics);
      continue;
    }

    const prettyTsMatch = trimmed.match(
      /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s*(.+)$/i,
    );
    if (prettyTsMatch) {
      const diagnostic = buildDiagnostic({
        source: "typescript",
        file: prettyTsMatch[1],
        line: prettyTsMatch[2],
        column: prettyTsMatch[3],
        severity: prettyTsMatch[4],
        code: prettyTsMatch[5],
        message: prettyTsMatch[6],
        raw: trimmed,
      });
      if (diagnostic) pushDiagnostic(diagnostics, diagnostic, maxDiagnostics);
      continue;
    }

    const eslintMatch = trimmed.match(
      /^(.+?):(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s+([@\w./-]+))?$/i,
    );
    if (eslintMatch && /\b(error|warning)\b/i.test(trimmed)) {
      const diagnostic = buildDiagnostic({
        source: "eslint",
        file: eslintMatch[1],
        line: eslintMatch[2],
        column: eslintMatch[3],
        severity: eslintMatch[4],
        message: eslintMatch[5],
        code: eslintMatch[6],
        raw: trimmed,
      });
      if (diagnostic) pushDiagnostic(diagnostics, diagnostic, maxDiagnostics);
      continue;
    }

    const fileLineMatch = trimmed.match(
      /^(.+?):(\d+):(\d+):\s*(error|warning|info)?\s*(.+)$/i,
    );
    if (fileLineMatch && /error|warning|failed|cannot|not found|expected/i.test(trimmed)) {
      const diagnostic = buildDiagnostic({
        source: fallbackSource,
        file: fileLineMatch[1],
        line: fileLineMatch[2],
        column: fileLineMatch[3],
        severity: fileLineMatch[4] ?? "error",
        message: fileLineMatch[5],
        raw: trimmed,
      });
      if (diagnostic) pushDiagnostic(diagnostics, diagnostic, maxDiagnostics);
      continue;
    }

    const viteImportMatch = trimmed.match(
      /(?:failed to resolve import|could not resolve|cannot find module)\s+["']([^"']+)["'](?:\s+from\s+["']?([^"']+)["']?)?/i,
    );
    if (viteImportMatch) {
      const diagnostic = buildDiagnostic({
        source: fallbackSource === "shell" ? "build" : fallbackSource,
        file: viteImportMatch[2],
        severity: "error",
        code: "module_resolution",
        message: trimmed,
        raw: trimmed,
      });
      if (diagnostic) pushDiagnostic(diagnostics, diagnostic, maxDiagnostics);
      continue;
    }

    if (/^(error|failed|failure|fatal):\s+/i.test(trimmed)) {
      const diagnostic = buildDiagnostic({
        source: fallbackSource,
        severity: "error",
        message: trimmed,
        raw: trimmed,
      });
      if (diagnostic) pushDiagnostic(diagnostics, diagnostic, maxDiagnostics);
    }
  }

  return diagnostics;
}

export function formatRuntimeDiagnosticSummary(
  diagnostic: RuntimeDiagnostic | null | undefined,
): string | null {
  if (!diagnostic) return null;
  const location = [
    diagnostic.file,
    diagnostic.line ? String(diagnostic.line) : null,
    diagnostic.column ? String(diagnostic.column) : null,
  ]
    .filter(Boolean)
    .join(":");
  const code = diagnostic.code ? ` ${diagnostic.code}` : "";
  const prefix = location || diagnostic.source;
  return normalizeText(`${prefix}${code}: ${diagnostic.message}`, 260);
}

export function selectTopRuntimeDiagnostic(
  diagnostics: readonly RuntimeDiagnostic[],
): RuntimeDiagnostic | null {
  return (
    diagnostics.find((diagnostic) => diagnostic.severity === "error") ??
    diagnostics[0] ??
    null
  );
}
