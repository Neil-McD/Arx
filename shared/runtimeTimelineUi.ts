import { isComputerUseToolName } from "./retrievalTools.ts";
import type { CloudRuntimeRunEventTransportRow } from "./cloudThreadsRead";

export type RuntimeToolCategory =
  | "exploration"
  | "search"
  | "writes"
  | "shell"
  | "preview"
  | "computer"
  | "docs"
  | "web"
  | "community"
  | "other";

export type RuntimeTimelineToolCall = {
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

export type RuntimeTimelineToolGroup = {
  id: string;
  category: RuntimeToolCategory;
  title: string;
  status: "running" | "ok" | "error";
  calls: RuntimeTimelineToolCall[];
};

export type RuntimeLiveTimelineEntry =
  | {
      id: string;
      kind: "assistant_text";
      seqStart: number;
      seqEnd: number;
      text: string;
      isActive: boolean;
    }
  | {
      id: string;
      kind: "reasoning";
      seqStart: number;
      seqEnd: number;
      text: string;
      isActive: boolean;
    }
  | {
      id: string;
      kind: "tool_group";
      seqStart: number;
      seqEnd: number;
      group: RuntimeTimelineToolGroup;
      isActive: boolean;
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

function toFiniteNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function readRuntimeToolName(payload: Record<string, unknown> | null): string | null {
  return toStringValue(payload?.tool_name) ?? toStringValue(payload?.tool);
}

function readRuntimeToolArgs(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(payload?.args) ?? asRecord(payload?.arguments) ?? parseJsonRecord(payload?.arguments);
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeReasoningSummaryText(value: string): string {
  return value
    .replace(/\\\*\\\*/g, "**")
    .replace(/\\_\\_/g, "__")
    .trim();
}

function normalizeAssistantText(value: string): string {
  return value.trim();
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

function parseStructuredWebSources(value: unknown): Array<{
  url: string;
  host: string;
  label: string;
  snippet: string | null;
  kind: "search" | "opened";
}> {
  if (!Array.isArray(value)) return [];
  const results: Array<{
    url: string;
    host: string;
    label: string;
    snippet: string | null;
    kind: "search" | "opened";
  }> = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const url = normalizeHttpUrl(toStringValue(record.url));
    if (!url) continue;
    const normalizedKind = toStringValue(record.kind);
    const kind: "search" | "opened" =
      normalizedKind === "opened" ? "opened" : "search";
    const host =
      toStringValue(record.host) ??
      (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return url;
        }
      })();
    const label =
      toStringValue(record.label) ?? summarizeUrlLabel(url) ?? host;
    const snippet = toStringValue(record.snippet);
    results.push({
      url,
      host,
      label,
      snippet: snippet ? truncateLabel(snippet, 160) : null,
      kind,
    });
  }
  return results;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function categoryForTool(toolName: string): RuntimeToolCategory {
  if (toolName === "list_dir" || toolName === "read" || toolName === "codex_image_view") return "exploration";
  if (toolName === "glob" || toolName === "grep" || toolName === "sha256") return "search";
  if (toolName === "write" || toolName === "edit" || toolName === "codex_file_change") return "writes";
  if (toolName === "workspace_serve") return "preview";
  if (
    toolName === "bash" ||
    toolName === "terminal_start" ||
    toolName === "terminal_read" ||
    toolName === "terminal_write" ||
    toolName === "terminal_stop"
  ) {
    return "shell";
  }
  if (isComputerUseToolName(toolName)) {
    return "computer";
  }
  if (toolName === "search_product_docs" || toolName === "get_product_doc") return "docs";
  if (toolName === "web_research" || toolName === "web_crawl") return "web";
  if (
    toolName === "get_active_community_context" ||
    toolName.startsWith("community_") ||
    toolName === "polynet_list_communities" ||
    toolName === "polynet_get_community"
  ) return "community";
  return "other";
}

function buildCallTitle(toolName: string, args: Record<string, unknown> | null): string {
  const path = toStringValue(args?.path);
  const pattern = toStringValue(args?.pattern);
  const query = toStringValue(args?.query);
  const ref = toStringValue(args?.ref);
  const resourceId = toStringValue(args?.resource_id);
  const moduleId = toStringValue(args?.module_id);
  const slug = toStringValue(args?.slug);
  const url = toStringValue(args?.url);
  const action = toStringValue(args?.action);
  const port = toFiniteNumberValue(args?.port);
  const name = toStringValue(args?.name);
  const server = toStringValue(args?.server);
  const nestedTool = toStringValue(args?.tool);
  const command = toStringValue(args?.command);
  const changeCount = toFiniteNumberValue(args?.changes_count);
  const shortPath = path ? path.split("/").filter(Boolean).pop() || path : null;
  if (toolName === "search_product_docs") return `Docs search${query ? `: ${query}` : ""}`;
  if (toolName === "get_product_doc") return `Read docs${slug ? `: ${slug}` : ""}`;
  if (toolName === "get_active_community_context") return "Community context";
  if (toolName === "member_conversations_list") return "Past conversations";
  if (toolName === "member_conversation_read") return "Recall conversation";
  if (toolName === "polynet_list_communities") {
    return args?.scope === "discover" ? "Discover communities" : "Your communities";
  }
  if (toolName === "polynet_get_community") {
    const communitySlug = toStringValue(args?.community_slug) ?? toStringValue(args?.communitySlug);
    return `Community details${communitySlug ? `: ${communitySlug}` : ""}`;
  }
  if (toolName === "community_resources_map") return "Resource map";
  if (toolName === "community_resources_read") return "Read resources";
  if (toolName === "community_resources_list") return `Community resources${path ? `: ${path}` : ""}`;
  if (toolName === "community_resource_read") return `Read resource${ref ? `: ${ref}` : ""}`;
  if (toolName === "community_resources_search") return `Resource search${query ? `: ${query}` : ""}`;
  if (toolName === "community_resource_builder_list") return "Resource builder";
  if (toolName === "community_resource_builder_read") {
    const target = resourceId || moduleId;
    return `Read builder item${target ? `: ${target}` : ""}`;
  }
  if (toolName === "community_resource_builder_stage_changeset") return "Resource changeset";
  if (toolName === "community_resource_builder_apply_changeset") return "Apply resource changeset";
  if (toolName === "community_search") return `Community search${query ? `: ${query}` : ""}`;
  if (toolName === "community_memory_search") return `Memory search${query ? `: ${query}` : ""}`;
  if (toolName === "community_memory_read") return "Read community memory";
  if (toolName === "community_chat_search") return `Chat search${query ? `: ${query}` : ""}`;
  if (toolName === "community_chat_read") return "Read chat evidence";
  if (toolName === "community_ai_feed_search") return `AI Feed search${query ? `: ${query}` : ""}`;
  if (toolName === "community_ai_feed_read") return "Read AI Feed evidence";
  if (toolName === "community_write") return "Community write";
  if (toolName === "member_profile_confirm_facts") return "Profile facts";
  if (toolName === "list_dir") return `Listed ${path || "."}`;
  if (toolName === "read") return `Read ${shortPath || path || "file"}`;
  if (toolName === "glob") return `Glob ${pattern || "pattern"}`;
  if (toolName === "grep") return `Search ${pattern || "pattern"}`;
  if (toolName === "sha256") return `Hash ${shortPath || path || "file"}`;
  if (toolName === "write") return `Write ${shortPath || path || "file"}`;
  if (toolName === "edit") return `Edit ${shortPath || path || "file"}`;
  if (toolName === "bash") return command ? `Run ${truncateLabel(command, 48)}` : `Bash`;
  if (toolName === "terminal_start") return "Start terminal";
  if (toolName === "terminal_read") return "Check terminal";
  if (toolName === "terminal_write") return "Send terminal input";
  if (toolName === "terminal_stop") return "Stop terminal";
  if (toolName === "workspace_serve") {
    return `Start app preview${port !== null ? `:${Math.floor(port)}` : ""}`;
  }
  if (toolName === "computer_open_url") return `Open ${summarizeUrlLabel(url) || "browser URL"}`;
  if (toolName === "computer_screenshot") return "Capture screenshot";
  if (toolName === "computer_click") {
    const x = Number(args?.x);
    const y = Number(args?.y);
    return Number.isFinite(x) && Number.isFinite(y)
      ? `Click ${Math.floor(x)}, ${Math.floor(y)}`
      : "Click";
  }
  if (toolName === "computer_type") return "Type text";
  if (toolName === "computer_keypress") {
    const key = toStringValue(args?.key);
    return key ? `Press ${key}` : "Press key";
  }
  if (toolName === "computer_scroll") {
    const direction = toStringValue(args?.direction);
    return direction === "up" || direction === "down" ? `Scroll ${direction}` : "Scroll";
  }
  if (toolName === "computer_stop") return "Stop computer use";
  if (toolName === "web_research") {
    const querySummary = summarizeSearchQuery(query);
    const patternSummary = summarizeSearchQuery(pattern);
    const urlSummary = summarizeUrlLabel(url);
    if (action === "search") return `Web search${querySummary ? `: ${querySummary}` : ""}`;
    if (action === "open_page") return `Open page${urlSummary ? `: ${urlSummary}` : ""}`;
    if (action === "find_in_page") {
      const findSummary = patternSummary ?? querySummary;
      const parts = [
        urlSummary,
        findSummary ? `"${truncateLabel(findSummary, 28)}"` : null,
      ].filter(Boolean);
      return `Find in page${parts.length > 0 ? `: ${parts.join(" · ")}` : ""}`;
    }
    return "Web research";
  }
  if (toolName === "web_crawl") return `Web crawl${summarizeUrlLabel(url) ? `: ${summarizeUrlLabel(url)}` : ""}`;
  if (toolName === "codex_file_change") {
    if (shortPath) return `Change ${shortPath}`;
    return `Change ${changeCount !== null ? `${Math.floor(changeCount)} file${changeCount === 1 ? "" : "s"}` : "files"}`;
  }
  if (toolName === "codex_mcp_tool_call") {
    const target = [server, nestedTool].filter(Boolean).join("/");
    return `MCP tool${target ? `: ${target}` : ""}`;
  }
  if (toolName === "codex_image_view") return `View image${name || shortPath ? `: ${name || shortPath}` : ""}`;
  return toolName;
}

function buildCallHref(toolName: string, args: Record<string, unknown> | null): string | null {
  if (toolName === "computer_open_url") {
    return normalizeHttpUrl(toStringValue(args?.url));
  }
  if (toolName === "web_crawl") return normalizeHttpUrl(toStringValue(args?.url));
  if (toolName !== "web_research") return null;
  const action = toStringValue(args?.action);
  const url = toStringValue(args?.url);
  if ((action === "open_page" || action === "find_in_page") && url) return url;
  return null;
}

function buildGroupTitle(category: RuntimeToolCategory, calls: RuntimeTimelineToolCall[]): string {
  const running = calls.some((call) => call.status === "running");
  const errored = calls.some((call) => call.status === "error");
  const reads = calls.filter((call) => call.toolName === "read").length;
  const lists = calls.filter((call) => call.toolName === "list_dir").length;
  const searches = calls.filter((call) => call.toolName === "glob" || call.toolName === "grep").length;
  const digests = calls.filter((call) => call.toolName === "sha256").length;
  const writes = calls.filter(
    (call) => call.toolName === "write" || call.toolName === "edit" || call.toolName === "codex_file_change",
  ).length;
  const commands = calls.filter((call) => call.toolName === "bash").length;
  const previews = calls.filter((call) => call.toolName === "workspace_serve").length;
  const computerCalls = calls.filter((call) => call.category === "computer").length;
  const docsCalls = calls.filter((call) => call.category === "docs").length;
  const webCalls = calls.filter((call) => call.toolName === "web_research" || call.toolName === "web_crawl").length;
  const communityCalls = calls.filter(
    (call) =>
      call.toolName.startsWith("community_") ||
      call.toolName === "polynet_list_communities" ||
      call.toolName === "polynet_get_community",
  ).length;
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
            : errored
              ? "Failed to change"
              : "Changed"
          : category === "shell"
            ? running
              ? "Running"
              : "Ran"
            : category === "preview"
              ? running
                ? "Starting"
                : "Started"
              : category === "computer"
                ? running
                  ? "Using"
                  : "Used"
                : category === "web"
                  ? running
                    ? "Researching"
                    : "Researched"
                  : category === "docs"
                    ? running
                      ? "Reading"
                      : "Read"
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
  } else if (category === "preview") {
    if (previews > 0) parts.push(formatCount(previews, "app preview"));
  } else if (category === "computer") {
    if (computerCalls > 0) parts.push(formatCount(computerCalls, "computer step"));
  } else if (category === "docs") {
    if (docsCalls > 0) parts.push(formatCount(docsCalls, "docs step"));
  } else if (category === "web") {
    if (webCalls > 0) parts.push(formatCount(webCalls, "web step"));
  } else if (category === "community") {
    if (communityCalls > 0) parts.push(formatCount(communityCalls, "community step"));
  } else {
    parts.push(formatCount(calls.length, "tool call"));
  }

  const detail = parts.join(", ") || formatCount(calls.length, "step");
  return `${prefix} ${detail}`;
}

function resolveToolCallId(
  event: Pick<CloudRuntimeRunEventTransportRow, "run_id" | "seq" | "payload">,
  payload: Record<string, unknown>,
  toolName: string,
): string {
  return (
    toStringValue(payload.tool_call_id) ||
    toStringValue(payload.provider_call_id) ||
    toStringValue(payload.item_id) ||
    `${event.run_id}:${event.seq}:${toolName}`
  );
}

function extractRuntimeToolCalls(
  events: Array<Pick<CloudRuntimeRunEventTransportRow, "run_id" | "seq" | "event_type" | "payload">>,
): Map<string, RuntimeTimelineToolCall> {
  const calls = new Map<string, RuntimeTimelineToolCall>();
  for (const event of events) {
    if (event.event_type !== "tool_call_started" && event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const toolName = readRuntimeToolName(payload);
    if (!toolName) continue;
    const callId = resolveToolCallId(event, payload, toolName);
    const args = readRuntimeToolArgs(payload);
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
    }
    call.seqEnd = event.seq;
    if (event.event_type === "tool_call_finished") {
      const status = toStringValue(payload.status);
      call.status = status === "error" ? "error" : "ok";
    }
  }
  return calls;
}

export function buildRuntimeLiveTimeline(
  events: Array<Pick<CloudRuntimeRunEventTransportRow, "seq" | "event_type" | "payload">>,
): RuntimeLiveTimelineEntry[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) return [];

  const calls = extractRuntimeToolCalls(
    sorted as Array<Pick<CloudRuntimeRunEventTransportRow, "run_id" | "seq" | "event_type" | "payload">>,
  );
  const entries: RuntimeLiveTimelineEntry[] = [];
  let latestEventSeq = -1;
  const placedCallIds = new Set<string>();

  function appendTextEntry(params: {
    kind: "assistant_text" | "reasoning";
    key: string;
    seq: number;
    delta: string;
  }): void {
    if (!params.delta) return;
    const idPrefix = `${params.kind}:${params.key}:`;
    const lastEntry = entries[entries.length - 1];
    if (lastEntry?.kind === params.kind && lastEntry.id.startsWith(idPrefix)) {
      lastEntry.text += params.delta;
      lastEntry.seqEnd = Math.max(lastEntry.seqEnd, params.seq);
      return;
    }
    entries.push({
      id: `${idPrefix}${params.seq}`,
      kind: params.kind,
      seqStart: params.seq,
      seqEnd: params.seq,
      text: params.delta,
      isActive: false,
    });
  }

  function appendToolCall(call: RuntimeTimelineToolCall): void {
    const lastEntry = entries[entries.length - 1];
    if (lastEntry?.kind === "tool_group" && lastEntry.group.category === call.category) {
      lastEntry.group.calls.push(call);
      lastEntry.seqEnd = Math.max(lastEntry.seqEnd, call.seqEnd);
      return;
    }
    entries.push({
      id: `${call.category}:${call.seqStart}`,
      kind: "tool_group",
      seqStart: call.seqStart,
      seqEnd: call.seqEnd,
      group: {
        id: `${call.category}:${call.seqStart}`,
        category: call.category,
        title: "",
        status: call.status,
        calls: [call],
      },
      isActive: false,
    });
  }

  for (const event of sorted) {
    latestEventSeq = Math.max(latestEventSeq, event.seq);
    if (event.event_type === "assistant_text_delta") {
      const payload = asRecord(event.payload);
      const delta = typeof payload?.delta === "string" ? payload.delta : "";
      const itemId = toStringValue(payload?.item_id) ?? `seq-${event.seq}`;
      appendTextEntry({
        kind: "assistant_text",
        key: itemId,
        seq: event.seq,
        delta,
      });
      continue;
    }
    if (event.event_type === "tool_call_started" || event.event_type === "tool_call_finished") {
      const payload = asRecord(event.payload);
      const toolName = readRuntimeToolName(payload);
      if (!payload || !toolName) continue;
      const callId = resolveToolCallId(
        event as Pick<CloudRuntimeRunEventTransportRow, "run_id" | "seq" | "payload">,
        payload,
        toolName,
      );
      if (placedCallIds.has(callId)) continue;
      const call = calls.get(callId);
      if (!call) continue;
      appendToolCall(call);
      placedCallIds.add(callId);
      continue;
    }
    if (event.event_type === "reasoning_summary_part_added") {
      continue;
    }
    if (event.event_type === "reasoning_summary_text_delta") {
      const payload = asRecord(event.payload);
      const summaryIndex = Number(payload?.summary_index);
      const delta = typeof payload?.delta === "string" ? payload.delta : "";
      if (!Number.isFinite(summaryIndex) || !delta) continue;
      const summaryStreamId = toStringValue(payload?.summary_stream_id) ?? "default";
      const normalizedSummaryIndex = Math.max(0, Math.floor(summaryIndex));
      const sectionKey = `${summaryStreamId}:${normalizedSummaryIndex}`;
      appendTextEntry({
        kind: "reasoning",
        key: sectionKey,
        seq: event.seq,
        delta,
      });
    }
  }

  return entries.flatMap<RuntimeLiveTimelineEntry>((entry) => {
    if (entry.kind === "tool_group") {
      const group = entry.group;
      return [
        {
          ...entry,
          group: {
            ...group,
            title: buildGroupTitle(group.category, group.calls),
            status:
              group.calls.some((call) => call.status === "error")
                ? "error"
                : group.calls.some((call) => call.status === "running")
                  ? "running"
                  : "ok",
          },
          isActive: entry.seqEnd === latestEventSeq,
        },
      ];
    }
    const text =
      entry.kind === "reasoning"
        ? normalizeReasoningSummaryText(entry.text)
        : normalizeAssistantText(entry.text);
    if (!text) return [];
    return [
      {
        ...entry,
        text,
        isActive: entry.seqEnd === latestEventSeq,
      },
    ];
  });
}

export function extractRuntimeWebSources(
  events: Array<Pick<CloudRuntimeRunEventTransportRow, "seq" | "event_type" | "payload">>,
): RuntimeWebSourceRef[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const searchResultsByUrl = new Map<
    string,
    { url: string; host: string; label: string; snippet: string | null; searchSeq: number }
  >();
  const openedSeqByUrl = new Map<string, number>();

  for (const event of sorted) {
    if (event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    if (toStringValue(payload.tool_name) !== "web_research") continue;
    if (toStringValue(payload.status) === "error") continue;
    const args = asRecord(payload.args);
    const action = toStringValue(args?.action);
    const structuredSources = parseStructuredWebSources(payload.web_sources);
    if (structuredSources.length > 0) {
      for (const source of structuredSources) {
        const key = normalizeComparableUrl(source.url);
        if (!key) continue;
        if (source.kind === "search") {
          if (!searchResultsByUrl.has(key)) {
            searchResultsByUrl.set(key, { ...source, searchSeq: event.seq });
          }
          continue;
        }
        if (!openedSeqByUrl.has(key)) {
          openedSeqByUrl.set(key, event.seq);
        }
        if (!searchResultsByUrl.has(key)) {
          searchResultsByUrl.set(key, { ...source, searchSeq: event.seq });
        }
      }
      continue;
    }
    if (action === "search") {
      const output = toStringValue(payload.output) || toStringValue(payload.output_preview) || "";
      for (const result of parseSearchResultEntries(output)) {
        const key = normalizeComparableUrl(result.url);
        if (!key || searchResultsByUrl.has(key)) continue;
        searchResultsByUrl.set(key, { ...result, searchSeq: event.seq });
      }
      continue;
    }
    if (action !== "open_page" && action !== "find_in_page") continue;
    const normalizedUrl = normalizeHttpUrl(toStringValue(args?.url));
    if (!normalizedUrl) continue;
    const comparableKey = normalizeComparableUrl(normalizedUrl);
    if (!comparableKey) continue;
    if (!openedSeqByUrl.has(comparableKey)) {
      openedSeqByUrl.set(comparableKey, event.seq);
    }
  }

  return [...searchResultsByUrl.entries()]
    .map(([key, result]) => ({
      id: result.url,
      url: result.url,
      host: result.host,
      label: result.label,
      snippet: result.snippet,
      seq: openedSeqByUrl.get(key) ?? result.searchSeq,
      opened: openedSeqByUrl.has(key),
    }))
    .sort((a, b) => {
      if (a.opened !== b.opened) return a.opened ? -1 : 1;
      return a.seq - b.seq;
    })
    .slice(0, 8)
    .map(({ opened: _opened, ...source }) => source);
}
