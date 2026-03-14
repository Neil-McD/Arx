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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function categoryForTool(toolName: string): RuntimeToolCategory {
  if (toolName === "list_dir" || toolName === "read") return "exploration";
  if (toolName === "glob" || toolName === "grep" || toolName === "sha256") return "search";
  if (toolName === "write" || toolName === "edit") return "writes";
  if (toolName === "bash") return "shell";
  if (toolName === "web_research" || toolName === "web_search" || toolName === "web_fetch") return "web";
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
    if (action === "search") return `Web search${query ? `: ${query}` : ""}`;
    if (action === "open_page") return `Open page${url ? `: ${url}` : ""}`;
    if (action === "find_in_page") return `Find in page${query ? `: ${query}` : ""}`;
    return "Web research";
  }
  if (toolName === "web_search") return "Web search";
  if (toolName === "web_fetch") return "Fetch page";
  return toolName;
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
  const webCalls = calls.filter((call) => call.toolName === "web_research" || call.toolName === "web_search" || call.toolName === "web_fetch").length;
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
