import { isComputerUseToolName } from "./retrievalTools";
import type { DaytonaCloudRuntimeRunEventTransportRow } from "./daytonaCloudThreadsRead";

export type RuntimeToolCategory =
  | "exploration"
  | "search"
  | "writes"
  | "shell"
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

export type RuntimeComputerUseStep = {
  id: string;
  seq: number;
  title: string;
  summary: string | null;
  status: "running" | "ok" | "error";
};

export type RuntimeComputerUseViewerState = {
  latestFrameUrl: string | null;
  latestActionTitle: string | null;
  latestSummary: string | null;
  pendingActionTitle: string | null;
  status: "active" | "stopped" | "error";
  recentSteps: RuntimeComputerUseStep[];
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toStringValue(item))
    .filter((item): item is string => Boolean(item));
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
  if (toolName === "list_dir" || toolName === "read") return "exploration";
  if (toolName === "glob" || toolName === "grep" || toolName === "sha256") return "search";
  if (toolName === "write" || toolName === "edit") return "writes";
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
  if (toolName === "web_research") return "web";
  if (toolName === "get_active_community_context" || toolName.startsWith("community_")) return "community";
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
  const shortPath = path ? path.split("/").filter(Boolean).pop() || path : null;
  if (toolName === "search_product_docs") return `Docs search${query ? `: ${query}` : ""}`;
  if (toolName === "get_product_doc") return `Read docs${slug ? `: ${slug}` : ""}`;
  if (toolName === "get_active_community_context") return "Community context";
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
  if (toolName === "community_resource_builder_health") return "Resource health";
  if (toolName === "community_resource_builder_stage_changeset") return "Resource changeset";
  if (toolName === "community_resource_builder_apply_changeset") return "Apply resource changeset";
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
  if (toolName === "terminal_start") return "Start terminal";
  if (toolName === "terminal_read") return "Check terminal";
  if (toolName === "terminal_write") return "Send terminal input";
  if (toolName === "terminal_stop") return "Stop terminal";
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
  if (toolName === "computer_open_url") {
    return normalizeHttpUrl(toStringValue(args?.url));
  }
  if (toolName !== "web_research") return null;
  const action = toStringValue(args?.action);
  const url = toStringValue(args?.url);
  if ((action === "open_page" || action === "find_in_page") && url) return url;
  return null;
}

function buildGroupTitle(category: RuntimeToolCategory, calls: RuntimeTimelineToolCall[]): string {
  const running = calls.some((call) => call.status === "running");
  const reads = calls.filter((call) => call.toolName === "read").length;
  const lists = calls.filter((call) => call.toolName === "list_dir").length;
  const searches = calls.filter((call) => call.toolName === "glob" || call.toolName === "grep").length;
  const digests = calls.filter((call) => call.toolName === "sha256").length;
  const writes = calls.filter((call) => call.toolName === "write" || call.toolName === "edit").length;
  const commands = calls.filter((call) => call.toolName === "bash").length;
  const computerCalls = calls.filter((call) => call.category === "computer").length;
  const docsCalls = calls.filter((call) => call.category === "docs").length;
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
  event: Pick<DaytonaCloudRuntimeRunEventTransportRow, "run_id" | "seq" | "payload">,
  payload: Record<string, unknown>,
  toolName: string,
): string {
  return (
    toStringValue(payload.tool_call_id) ||
    toStringValue(payload.provider_call_id) ||
    `${event.run_id}:${event.seq}:${toolName}`
  );
}

function readComputerUseDetails(payload: Record<string, unknown> | null): {
  frameUrl: string | null;
  summary: string | null;
} {
  const details = asRecord(payload?.details);
  const computerUse = asRecord(details?.computer_use);
  const requestedX = toFiniteNumberValue(computerUse?.requested_x);
  const requestedY = toFiniteNumberValue(computerUse?.requested_y);
  const mouseX = toFiniteNumberValue(computerUse?.mouse_x);
  const mouseY = toFiniteNumberValue(computerUse?.mouse_y);
  const browserWindowTitle = toStringValue(computerUse?.browser_window_title);
  const windowTitlesBefore = toStringArray(computerUse?.window_titles_before);
  const windowTitlesAfter = toStringArray(computerUse?.window_titles_after);
  const networkProbeStatus = toStringValue(computerUse?.network_probe_status);
  const networkProbeMessage = toStringValue(computerUse?.network_probe_message);
  const networkProbeOutput = toStringValue(computerUse?.network_probe_output);
  const diagnostics: string[] = [];

  if (
    requestedX !== null &&
    requestedY !== null &&
    mouseX !== null &&
    mouseY !== null
  ) {
    diagnostics.push(
      requestedX === mouseX && requestedY === mouseY
        ? `Cursor confirmed at (${mouseX}, ${mouseY}).`
        : `Requested (${requestedX}, ${requestedY}); cursor ended at (${mouseX}, ${mouseY}).`,
    );
  }

  if (browserWindowTitle) {
    diagnostics.push(`Browser window: ${browserWindowTitle}.`);
  }

  if (windowTitlesBefore.length > 0 || windowTitlesAfter.length > 0) {
    const beforeLabel = windowTitlesBefore.length > 0 ? windowTitlesBefore.join(", ") : "(none)";
    const afterLabel = windowTitlesAfter.length > 0 ? windowTitlesAfter.join(", ") : "(none)";
    diagnostics.push(`Windows before: ${beforeLabel}. After: ${afterLabel}.`);
  }

  if (networkProbeStatus && networkProbeStatus !== "reachable") {
    diagnostics.push(
      networkProbeMessage
        ? `Navigation blocker: ${networkProbeMessage}.`
        : `Navigation blocker: ${networkProbeStatus}.`,
    );
    if (networkProbeOutput) {
      diagnostics.push(`Probe output: ${truncateLabel(networkProbeOutput, 180)}.`);
    }
  }

  const summary = toStringValue(computerUse?.summary);
  return {
    frameUrl: toStringValue(computerUse?.frame_url),
    summary: [summary, diagnostics.join(" ")].filter((value): value is string => Boolean(value)).join(" ").trim() || null,
  };
}

export function buildRuntimeComputerUseViewer(
  events: Array<Pick<DaytonaCloudRuntimeRunEventTransportRow, "run_id" | "seq" | "event_type" | "payload">>,
): RuntimeComputerUseViewerState | null {
  const pendingTitles = new Map<string, string>();
  const recentSteps: RuntimeComputerUseStep[] = [];
  let latestFrameUrl: string | null = null;
  let latestActionTitle: string | null = null;
  let latestSummary: string | null = null;
  let lastFinishedToolName: string | null = null;
  let lastFinishedStatus: "ok" | "error" | null = null;

  for (const event of events) {
    if (event.event_type !== "tool_call_started" && event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const toolName = toStringValue(payload.tool_name);
    if (!toolName || !isComputerUseToolName(toolName)) continue;
    const args = asRecord(payload.args);
    const callId = resolveToolCallId(event, payload, toolName);
    const title = buildCallTitle(toolName, args);
    if (event.event_type === "tool_call_started") {
      pendingTitles.set(callId, title);
      continue;
    }

    pendingTitles.delete(callId);
    const status = toStringValue(payload.status) === "error" ? "error" : "ok";
    const { frameUrl, summary } = readComputerUseDetails(payload);
    recentSteps.push({
      id: callId,
      seq: event.seq,
      title,
      summary,
      status,
    });
    latestActionTitle = title;
    latestSummary = summary;
    if (frameUrl) {
      latestFrameUrl = frameUrl;
    }
    lastFinishedToolName = toolName;
    lastFinishedStatus = status;
  }

  if (!latestFrameUrl && recentSteps.length === 0 && pendingTitles.size === 0) return null;

  const pendingActionTitle =
    pendingTitles.size > 0 ? Array.from(pendingTitles.values())[pendingTitles.size - 1] ?? null : null;
  const status =
    lastFinishedStatus === "error"
      ? "error"
      : lastFinishedToolName === "computer_stop"
        ? "stopped"
        : "active";

  return {
    latestFrameUrl,
    latestActionTitle,
    latestSummary,
    pendingActionTitle,
    status,
    recentSteps: recentSteps.slice(-5).reverse(),
  };
}

function extractRuntimeToolCalls(
  events: Array<Pick<DaytonaCloudRuntimeRunEventTransportRow, "run_id" | "seq" | "event_type" | "payload">>,
): Map<string, RuntimeTimelineToolCall> {
  const calls = new Map<string, RuntimeTimelineToolCall>();
  for (const event of events) {
    if (event.event_type !== "tool_call_started" && event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const toolName = toStringValue(payload.tool_name);
    if (!toolName) continue;
    const callId = resolveToolCallId(event, payload, toolName);
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
  events: Array<Pick<DaytonaCloudRuntimeRunEventTransportRow, "seq" | "event_type" | "payload">>,
): RuntimeLiveTimelineEntry[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) return [];

  const calls = extractRuntimeToolCalls(
    sorted as Array<Pick<DaytonaCloudRuntimeRunEventTransportRow, "run_id" | "seq" | "event_type" | "payload">>,
  );
  const reasoningSections = new Map<
    string,
    {
      id: string;
      seqStart: number;
      seqEnd: number;
      text: string;
    }
  >();
  const toolGroups: RuntimeTimelineToolGroup[] = [];
  let latestEventSeq = -1;
  const placedCallIds = new Set<string>();
  let currentToolGroup: RuntimeTimelineToolGroup | null = null;

  for (const event of sorted) {
    latestEventSeq = Math.max(latestEventSeq, event.seq);
    if (event.event_type === "tool_call_started" || event.event_type === "tool_call_finished") {
      const payload = asRecord(event.payload);
      const toolName = toStringValue(payload?.tool_name);
      if (!payload || !toolName) continue;
      const callId = resolveToolCallId(
        event as Pick<DaytonaCloudRuntimeRunEventTransportRow, "run_id" | "seq" | "payload">,
        payload,
        toolName,
      );
      if (placedCallIds.has(callId)) continue;
      const call = calls.get(callId);
      if (!call) continue;
      if (!currentToolGroup || currentToolGroup.category !== call.category) {
        currentToolGroup = {
          id: `${call.category}:${call.seqStart}`,
          category: call.category,
          title: "",
          status: call.status,
          calls: [call],
        };
        toolGroups.push(currentToolGroup);
      } else {
        currentToolGroup.calls.push(call);
        if (currentToolGroup.status !== "error") {
          currentToolGroup.status =
            call.status === "error"
              ? "error"
              : currentToolGroup.status === "running" || call.status === "running"
                ? "running"
                : "ok";
        }
      }
      placedCallIds.add(callId);
      continue;
    }
    if (event.event_type === "reasoning_summary_part_added") {
      const payload = asRecord(event.payload);
      const summaryIndex = Number(payload?.summary_index);
      if (!Number.isFinite(summaryIndex)) continue;
      const summaryStreamId = toStringValue(payload?.summary_stream_id) ?? "default";
      const normalizedSummaryIndex = Math.max(0, Math.floor(summaryIndex));
      const sectionKey = `${summaryStreamId}:${normalizedSummaryIndex}`;
      if (!reasoningSections.has(sectionKey)) {
        reasoningSections.set(sectionKey, {
          id: `reasoning:${sectionKey}`,
          seqStart: event.seq,
          seqEnd: event.seq,
          text: "",
        });
      }
      currentToolGroup = null;
      const section = reasoningSections.get(sectionKey);
      if (section) {
        section.seqEnd = Math.max(section.seqEnd, event.seq);
      }
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
      const section =
        reasoningSections.get(sectionKey) ??
        (() => {
          const created = {
            id: `reasoning:${sectionKey}`,
            seqStart: event.seq,
            seqEnd: event.seq,
            text: "",
          };
          reasoningSections.set(sectionKey, created);
          return created;
        })();
      currentToolGroup = null;
      section.text += delta;
      section.seqEnd = Math.max(section.seqEnd, event.seq);
    }
  }

  const normalizedToolGroups: RuntimeTimelineToolGroup[] = toolGroups.map((group) => ({
    ...group,
    title: buildGroupTitle(group.category, group.calls),
    status:
      group.calls.some((call) => call.status === "error")
        ? "error"
        : group.calls.some((call) => call.status === "running")
          ? "running"
          : "ok",
  }));

  const reasoningEntries: RuntimeLiveTimelineEntry[] = [...reasoningSections.values()]
    .map((section) => ({
      id: section.id,
      kind: "reasoning" as const,
      seqStart: section.seqStart,
      seqEnd: section.seqEnd,
      text: section.text.trim(),
      isActive: section.seqEnd === latestEventSeq,
    }))
    .filter((entry) => entry.text);

  const toolEntries: RuntimeLiveTimelineEntry[] = normalizedToolGroups.map((group) => {
    const seqStart = group.calls[0]?.seqStart ?? 0;
    const seqEnd = group.calls[group.calls.length - 1]?.seqEnd ?? seqStart;
    return {
      id: group.id,
      kind: "tool_group" as const,
      seqStart,
      seqEnd,
      group,
      isActive: seqEnd === latestEventSeq,
    };
  });

  return [...reasoningEntries, ...toolEntries].sort((a, b) => {
    if (a.seqStart !== b.seqStart) return a.seqStart - b.seqStart;
    if (a.seqEnd !== b.seqEnd) return a.seqEnd - b.seqEnd;
    return a.kind === b.kind ? 0 : a.kind === "reasoning" ? -1 : 1;
  });
}

export function extractRuntimeWebSources(
  events: Array<Pick<DaytonaCloudRuntimeRunEventTransportRow, "seq" | "event_type" | "payload">>,
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
