export type RuntimePreviewTransportStatus = "not_started" | "loading" | "loaded" | "failed";

export type RuntimePreviewProbeInput = {
  ok: boolean;
  status: number | null;
  finalUrl?: string | null;
  contentType?: string | null;
  bodySnippet?: string | null;
  error?: string | null;
  timedOut?: boolean | null;
};

export type RuntimePreviewProbeResult = {
  transportStatus: RuntimePreviewTransportStatus;
  previewStatus: "running" | "unreachable";
  renderStatus: "unknown" | "transport_error";
  summary: string;
};

function normalizeSnippet(value: string | null | undefined, maxLen = 180): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLen
    ? `${normalized.slice(0, maxLen - 1).trimEnd()}…`
    : normalized;
}

function hasViteShell(bodySnippet: string | null): boolean {
  const normalized = String(bodySnippet ?? "").toLowerCase();
  return (
    normalized.includes("/@vite/client") ||
    normalized.includes("vite") ||
    normalized.includes('id="root"') ||
    normalized.includes("type=\"module\"") ||
    normalized.includes("type='module'")
  );
}

export function classifyRuntimePreviewProbe(
  input: RuntimePreviewProbeInput,
): RuntimePreviewProbeResult {
  const status = typeof input.status === "number" && Number.isFinite(input.status)
    ? Math.floor(input.status)
    : null;
  const contentType = normalizeSnippet(input.contentType, 80);
  const bodySnippet = normalizeSnippet(input.bodySnippet, 180);
  const error = normalizeSnippet(input.error, 160);

  if (!input.ok || input.timedOut || error) {
    const cause = input.timedOut ? "timed out" : error ?? `HTTP ${status ?? "unavailable"}`;
    return {
      transportStatus: "failed",
      previewStatus: "unreachable",
      renderStatus: "transport_error",
      summary: `Preview transport failed: ${cause}.`,
    };
  }

  if (status !== null && (status < 200 || status >= 400)) {
    return {
      transportStatus: "failed",
      previewStatus: "unreachable",
      renderStatus: "transport_error",
      summary: `Preview transport failed: HTTP ${status}${contentType ? ` (${contentType})` : ""}.`,
    };
  }

  const shell = hasViteShell(bodySnippet);
  const parts = [
    `Preview transport loaded${status !== null ? `: HTTP ${status}` : ""}`,
    contentType ? `content-type ${contentType}` : null,
    shell ? "HTML/app shell detected" : "render not verified",
  ].filter((part): part is string => Boolean(part));

  return {
    transportStatus: "loaded",
    previewStatus: "running",
    renderStatus: "unknown",
    summary: `${parts.join("; ")}.`,
  };
}
