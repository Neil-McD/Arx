import type { DaytonaCloudRuntimeRunEventTransportRow } from "./daytonaCloudThreadsRead";

export type RuntimeToolCategory =
  | "exploration"
  | "search"
  | "writes"
  | "shell"
  | "web"
  | "community"
  | "other";

export type RuntimeToolTraceCall = {
  id: string;
  toolName: string;
  category: RuntimeToolCategory;
  title: string;
  href: string | null;
  detailLabel: string | null;
  status: "running" | "ok" | "error";
  seqStart: number;
  seqEnd: number;
};

export type RuntimeToolTraceGroup = {
  id: string;
  category: RuntimeToolCategory;
  title: string;
  status: "running" | "ok" | "error";
  calls: RuntimeToolTraceCall[];
};

export type RuntimeWebSourceRef = {
  id: string;
  url: string;
  host: string;
  label: string;
  snippet: string | null;
  seq: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateLabel(value: string, maxChars: number): string {
  const normalized = normalizeInlineWhitespace(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function summarizeSearchQuery(query: string | null, maxChars = 56): string | null {
  if (!query) return null;
  return truncateLabel(query, maxChars);
}

function summarizeUrlLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathSegments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2);
    const path = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
    return truncateLabel(`${host}${path}`, 44);
  } catch {
    return truncateLabel(url, 44);
  }
}

function normalizeHttpUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeComparableUrl(url: string | null): string | null {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    parsed.search = "";
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function parseSearchResultEntries(output: string): Array<{
  url: string;
  host: string;
  label: string;
  snippet: string | null;
}> {
  const matches = [...output.matchAll(/(?:^|\n)\d+\.\s(.+?)\nURL:\s(.+?)\nSnippet:\s([\s\S]*?)(?=\n\d+\.\s|\s*$)/g)];
  const results: Array<{ url: string; host: string; label: string; snippet: string | null }> = [];
  for (const match of matches) {
    const rawTitle = typeof match[1] === "string" ? match[1].trim() : "";
    const rawUrl = typeof match[2] === "string" ? match[2].trim() : "";
    const normalizedUrl = normalizeHttpUrl(rawUrl);
    if (!normalizedUrl) continue;
    const host = (() => {
      try {
        return new URL(normalizedUrl).hostname.replace(/^www\./, "");
      } catch {
        return rawUrl;
      }
    })();
    const snippetRaw = typeof match[3] === "string" ? normalizeInlineWhitespace(match[3]) : "";
    results.push({
      url: normalizedUrl,
      host,
      label: rawTitle || summarizeUrlLabel(normalizedUrl) || host,
      snippet: snippetRaw && snippetRaw !== "(none)" ? truncateLabel(snippetRaw, 160) : null,
    });
  }
  return results;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function categoryForTool(toolName: string): RuntimeToolCategory {
  if (toolName === "list_dir" || toolName === "read") return "exploration";
  if (toolName === "glob" || toolName === "grep" || toolName === "sha256") return "search";
  if (toolName === "write" || toolName === "edit") return "writes";
  if (toolName === "bash") return "shell";
  if (toolName === "web_research") return "web";
  if (toolName.startsWith("community_")) return "community";
  return "other";
}

function buildCallTitle(toolName: string, args: Record<string, unknown> | null): string {
  const path = toStringValue(args?.path);
  const pattern = toStringValue(args?.pattern);
  const query = toStringValue(args?.query);
  const url = toStringValue(args?.url);
  const action = toStringValue(args?.action);
  const shortPath = path ? path.split("/").filter(Boolean).pop() || path : null;
  if (toolName === "community_search") return `Community search${query ? `: ${query}` : ""}`;
  if (toolName === "community_write") return "Community write";
  if (toolName === "list_dir") return `Listed ${path || "."}`;
  if (toolName === "read") return `Read ${shortPath || path || "file"}`;
  if (toolName === "glob") return `Glob ${pattern || "pattern"}`;
  if (toolName === "grep") return `Search ${pattern || "pattern"}`;
  if (toolName === "sha256") return `Hash ${shortPath || path || "file"}`;
  if (toolName === "write") return `Write ${shortPath || path || "file"}`;
  if (toolName === "edit") return `Edit ${shortPath || path || "file"}`;
  if (toolName === "bash") return `Bash`;
  if (toolName === "web_research") {
    const querySummary = summarizeSearchQuery(query);
    const urlSummary = summarizeUrlLabel(url);
    if (action === "search") return `Web search${querySummary ? `: ${querySummary}` : ""}`;
    if (action === "open_page") return `Open page${urlSummary ? `: ${urlSummary}` : ""}`;
    if (action === "find_in_page") {
      const parts = [urlSummary, querySummary ? `"${truncateLabel(querySummary, 28)}"` : null].filter(Boolean);
      return `Find in page${parts.length > 0 ? `: ${parts.join(" · ")}` : ""}`;
    }
    return "Web research";
  }
  return toolName;
}

function buildCallHref(toolName: string, args: Record<string, unknown> | null): string | null {
  if (toolName !== "web_research") return null;
  const action = toStringValue(args?.action);
  const url = toStringValue(args?.url);
  if ((action === "open_page" || action === "find_in_page") && url) return url;
  return null;
}

function buildGroupTitle(category: RuntimeToolCategory, calls: RuntimeToolTraceCall[]): string {
  const running = calls.some((call) => call.status === "running");
  const okCount = calls.filter((call) => call.status === "ok").length;
  const errorCount = calls.filter((call) => call.status === "error").length;
  const reads = calls.filter((call) => call.toolName === "read").length;
  const lists = calls.filter((call) => call.toolName === "list_dir").length;
  const searches = calls.filter((call) => call.toolName === "glob" || call.toolName === "grep").length;
  const digests = calls.filter((call) => call.toolName === "sha256").length;
  const writes = calls.filter((call) => call.toolName === "write" || call.toolName === "edit").length;
  const commands = calls.filter((call) => call.toolName === "bash").length;
  const webCalls = calls.filter((call) => call.toolName === "web_research").length;
  const communityCalls = calls.filter((call) => call.toolName.startsWith("community_")).length;
  const prefix =
    category === "exploration"
      ? running
        ? "Exploring"
        : "Explored"
      : category === "search"
        ? running
          ? "Searching"
          : "Searched"
        : category === "writes"
          ? running
            ? "Writing"
            : "Changed"
          : category === "shell"
            ? running
              ? "Running"
              : "Ran"
          : category === "web"
            ? running
              ? "Researching"
              : "Researched"
            : category === "community"
              ? running
                ? "Working"
                : "Worked"
              : running
                ? "Processing"
                : "Processed";

  const parts: string[] = [];
  if (category === "exploration") {
    if (reads > 0) parts.push(formatCount(reads, "file"));
    if (lists > 0) parts.push(formatCount(lists, "directory", "directories"));
  } else if (category === "search") {
    if (searches > 0) parts.push(formatCount(searches, "search"));
    if (digests > 0) parts.push(formatCount(digests, "digest"));
  } else if (category === "writes") {
    if (writes > 0) parts.push(formatCount(writes, "change"));
  } else if (category === "shell") {
    if (commands > 0) parts.push(formatCount(commands, "command"));
  } else if (category === "web") {
    if (webCalls > 0) parts.push(formatCount(webCalls, "web step"));
  } else if (category === "community") {
    if (communityCalls > 0) parts.push(formatCount(communityCalls, "community step"));
  } else {
    parts.push(formatCount(calls.length, "tool call"));
  }

  const detail = parts.join(", ") || formatCount(calls.length, "step");
  if (errorCount > 0 && okCount === 0 && !running) return `${prefix} ${detail} with errors`;
  if (errorCount > 0 && !running) return `${prefix} ${detail} (${formatCount(errorCount, "error")})`;
  return `${prefix} ${detail}`;
}

export function buildRuntimeToolTraceGroups(
  events: DaytonaCloudRuntimeRunEventTransportRow[],
): RuntimeToolTraceGroup[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const calls = new Map<string, RuntimeToolTraceCall>();
  const orderedIds: string[] = [];

  for (const event of sorted) {
    if (event.event_type !== "tool_call_started" && event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const toolName = toStringValue(payload.tool_name);
    if (!toolName) continue;
    const callId =
      toStringValue(payload.tool_call_id) ||
      toStringValue(payload.provider_call_id) ||
      `${event.run_id}:${event.seq}:${toolName}`;
    const args = asRecord(payload.args);
    let call = calls.get(callId);
    if (!call) {
      call = {
        id: callId,
        toolName,
        category: categoryForTool(toolName),
        title: buildCallTitle(toolName, args),
        href: buildCallHref(toolName, args),
        detailLabel: null,
        status: event.event_type === "tool_call_started" ? "running" : "ok",
        seqStart: event.seq,
        seqEnd: event.seq,
      };
      calls.set(callId, call);
      orderedIds.push(callId);
    }
    call.seqEnd = event.seq;
    if (event.event_type === "tool_call_finished") {
      const status = toStringValue(payload.status);
      call.status = status === "error" ? "error" : "ok";
    }
  }

  const grouped: RuntimeToolTraceGroup[] = [];
  for (const callId of orderedIds) {
    const call = calls.get(callId);
    if (!call) continue;
    const lastGroup = grouped[grouped.length - 1] ?? null;
    if (!lastGroup || lastGroup.category !== call.category) {
      grouped.push({
        id: `${call.category}:${call.seqStart}`,
        category: call.category,
        title: "",
        status: call.status,
        calls: [call],
      });
      continue;
    }
    lastGroup.calls.push(call);
    if (lastGroup.status !== "error") {
      lastGroup.status = call.status === "error" ? "error" : lastGroup.status === "running" || call.status === "running" ? "running" : "ok";
    }
  }

  return grouped.map((group) => ({
    ...group,
    title: buildGroupTitle(group.category, group.calls),
    status:
      group.calls.some((call) => call.status === "error")
        ? "error"
        : group.calls.some((call) => call.status === "running")
          ? "running"
          : "ok",
  }));
}

export function extractRuntimeWebSources(
  events: Array<Pick<DaytonaCloudRuntimeRunEventTransportRow, "seq" | "event_type" | "payload">>,
): RuntimeWebSourceRef[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const deduped = new Map<string, RuntimeWebSourceRef>();
  const searchResultsByUrl = new Map<
    string,
    { url: string; host: string; label: string; snippet: string | null }
  >();

  for (const event of sorted) {
    if (event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    if (toStringValue(payload.tool_name) !== "web_research") continue;
    if (toStringValue(payload.status) === "error") continue;
    const args = asRecord(payload.args);
    const action = toStringValue(args?.action);
    if (action === "search") {
      const output = toStringValue(payload.output) || toStringValue(payload.output_preview) || "";
      for (const result of parseSearchResultEntries(output)) {
        const key = normalizeComparableUrl(result.url);
        if (!key || searchResultsByUrl.has(key)) continue;
        searchResultsByUrl.set(key, result);
      }
      continue;
    }
    if (action !== "open_page" && action !== "find_in_page") continue;
    const normalizedUrl = normalizeHttpUrl(toStringValue(args?.url));
    if (!normalizedUrl) continue;
    const comparableKey = normalizeComparableUrl(normalizedUrl);
    if (!comparableKey) continue;
    const matchedSearchResult = searchResultsByUrl.get(comparableKey);
    if (!matchedSearchResult) continue;
    if (deduped.has(matchedSearchResult.url)) continue;
    deduped.set(matchedSearchResult.url, {
      id: matchedSearchResult.url,
      url: matchedSearchResult.url,
      host: matchedSearchResult.host,
      label: matchedSearchResult.label,
      snippet: matchedSearchResult.snippet,
      seq: event.seq,
    });
  }

  return [...deduped.values()].sort((a, b) => a.seq - b.seq);
}
