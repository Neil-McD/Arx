import { isVerificationShellCommand } from "./runtimeWorkingStateLedger.ts";

export type AgentActivityKind =
  | "exploring"
  | "reading"
  | "editing"
  | "verifying"
  | "blocked"
  | "completed";

export type AgentActivityStatus = "running" | "ok" | "error";

export type AgentActivityItem = {
  id: string;
  title: string;
  detail: string | null;
  toolName: string | null;
  status: AgentActivityStatus;
  seqStart: number;
  seqEnd: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

export type AgentActivityStats = {
  directoriesScanned?: number;
  searches?: number;
  filesRead?: number;
  filesChanged?: number;
  commandsRun?: number;
  checksPassed?: number;
  checksFailed?: number;
  linesAdded?: number;
  linesRemoved?: number;
  totalDurationMs?: number;
};

export type AgentActivityStep = {
  id: string;
  kind: AgentActivityKind;
  title: string;
  summary: string;
  status: AgentActivityStatus;
  seqStart: number;
  seqEnd: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  isActive: boolean;
  stats: AgentActivityStats;
  items: AgentActivityItem[];
};

type RuntimeActivityEvent = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

type ToolActivityItem = AgentActivityItem & {
  kind: AgentActivityKind;
  stats: AgentActivityStats;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateLabel(value: string, maxChars: number): string {
  const normalized = normalizeInlineWhitespace(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationBetweenMs(startedAt: string | null, finishedAt: string | null): number | null {
  const start = parseTimestampMs(startedAt);
  const finish = parseTimestampMs(finishedAt);
  if (start === null || finish === null || finish < start) return null;
  return finish - start;
}

function mergeDurationMs(items: AgentActivityItem[]): number | null {
  const starts = items
    .map((item) => parseTimestampMs(item.startedAt))
    .filter((value): value is number => value !== null);
  const finishes = items
    .map((item) => parseTimestampMs(item.finishedAt ?? item.startedAt))
    .filter((value): value is number => value !== null);
  if (starts.length === 0 || finishes.length === 0) return null;
  const minStart = Math.min(...starts);
  const maxFinish = Math.max(...finishes);
  return maxFinish >= minStart ? maxFinish - minStart : null;
}

function resolveToolCallId(event: RuntimeActivityEvent, payload: Record<string, unknown>, toolName: string): string {
  return (
    toStringValue(payload.tool_call_id) ||
    toStringValue(payload.provider_call_id) ||
    `${event.run_id}:${event.seq}:${toolName}`
  );
}

function shortPathLabel(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() || normalized || path;
}

function summarizeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .join("/");
    return truncateLabel(path ? `${host}/${path}` : host, 48);
  } catch {
    return truncateLabel(url, 48);
  }
}

function classifyBashCommand(command: string | null): AgentActivityKind {
  const value = normalizeInlineWhitespace(String(command ?? "")).toLowerCase();
  if (!value) return "exploring";
  if (isVerificationShellCommand(value)) return "verifying";
  if (/^(cat|head|tail|nl|less|sed -n|awk\b|wc\b)/.test(value)) return "reading";
  if (/^(ls|pwd|tree|find|fd|rg|grep|git status|git diff|git log|git show)\b/.test(value)) {
    return "exploring";
  }
  if (
    /^(mkdir|touch|rm|mv|cp|chmod|chown|npm install|pnpm install|yarn install|bun install)\b/.test(value) ||
    />|>>|\btee\b/.test(value)
  ) {
    return "editing";
  }
  return "exploring";
}

function classifyTool(toolName: string, args: Record<string, unknown> | null): AgentActivityKind {
  if (toolName === "list_dir" || toolName === "glob" || toolName === "grep" || toolName === "sha256") {
    return "exploring";
  }
  if (toolName === "read") return "reading";
  if (toolName === "write" || toolName === "edit") return "editing";
  if (toolName === "bash") return classifyBashCommand(toStringValue(args?.command));
  if (
    toolName === "web_research" ||
    toolName === "web_crawl" ||
    toolName === "search_product_docs" ||
    toolName === "get_product_doc" ||
    toolName === "get_active_community_context" ||
    toolName.startsWith("community_")
  ) return "exploring";
  if (toolName === "terminal_start" || toolName === "terminal_read" || toolName === "terminal_write") {
    return classifyBashCommand(toStringValue(args?.command));
  }
  return "exploring";
}

function extractDiffStats(payload: Record<string, unknown>): Pick<AgentActivityStats, "linesAdded" | "linesRemoved"> {
  const details = asRecord(payload.details);
  const diffStats = asRecord(details?.diff_stats) ?? asRecord(payload.diff_stats);
  const added =
    toFiniteNumber(diffStats?.lines_added) ??
    toFiniteNumber(diffStats?.added_lines) ??
    toFiniteNumber(payload.lines_added) ??
    toFiniteNumber(payload.added_lines);
  const removed =
    toFiniteNumber(diffStats?.lines_removed) ??
    toFiniteNumber(diffStats?.removed_lines) ??
    toFiniteNumber(payload.lines_removed) ??
    toFiniteNumber(payload.removed_lines);
  return {
    linesAdded: added === null ? undefined : Math.max(0, Math.floor(added)),
    linesRemoved: removed === null ? undefined : Math.max(0, Math.floor(removed)),
  };
}

function buildToolTitle(toolName: string, args: Record<string, unknown> | null): string {
  const path = toStringValue(args?.path);
  const shortPath = shortPathLabel(path);
  const command = toStringValue(args?.command);
  const pattern = toStringValue(args?.pattern);
  const query = toStringValue(args?.query);
  const ref = toStringValue(args?.ref);
  const resourceId = toStringValue(args?.resource_id);
  const moduleId = toStringValue(args?.module_id);
  const slug = toStringValue(args?.slug);
  const url = toStringValue(args?.url);
  const action = toStringValue(args?.action);

  if (toolName === "list_dir") return `Scanned ${path || "."}`;
  if (toolName === "glob") return `Matched ${pattern || "files"}`;
  if (toolName === "grep") return `Searched ${pattern || "code"}`;
  if (toolName === "sha256") return `Checked ${shortPath || path || "file"}`;
  if (toolName === "read") return `Opened ${path || "file"}`;
  if (toolName === "write") return `Changed ${path || "file"}`;
  if (toolName === "edit") return `Edited ${path || "file"}`;
  if (toolName === "bash") return command ? `Ran ${truncateLabel(command, 80)}` : "Ran command";
  if (toolName === "terminal_start") return command ? `Started ${truncateLabel(command, 80)}` : "Started terminal";
  if (toolName === "terminal_read") return "Checked terminal";
  if (toolName === "terminal_write") return "Sent terminal input";
  if (toolName === "web_research") {
    if (action === "search") return `Searched web${query ? ` for ${truncateLabel(query, 48)}` : ""}`;
    if (action === "open_page") return `Opened ${summarizeUrl(url) || "web page"}`;
    if (action === "find_in_page") return `Searched page${query ? ` for ${truncateLabel(query, 48)}` : ""}`;
    return "Used web research";
  }
  if (toolName === "web_crawl") return `Crawled ${summarizeUrl(url) || "site"}`;
  if (toolName === "search_product_docs") return `Searched docs${query ? ` for ${truncateLabel(query, 48)}` : ""}`;
  if (toolName === "get_product_doc") return `Read docs${slug ? ` ${truncateLabel(slug, 48)}` : ""}`;
  if (toolName === "get_active_community_context") return "Read community context";
  if (toolName === "community_resources_map") return "Mapped community resources";
  if (toolName === "community_resources_read") return "Read community resources";
  if (toolName === "community_resources_list") return `Listed community resources${path ? ` at ${truncateLabel(path, 48)}` : ""}`;
  if (toolName === "community_resource_read") return `Read community resource${ref ? ` ${truncateLabel(ref, 48)}` : ""}`;
  if (toolName === "community_resources_search") return `Searched resources${query ? ` for ${truncateLabel(query, 48)}` : ""}`;
  if (toolName === "community_resource_builder_list") return "Listed resource builder state";
  if (toolName === "community_resource_builder_read") {
    const target = resourceId || moduleId;
    return `Read resource builder item${target ? ` ${truncateLabel(target, 48)}` : ""}`;
  }
  if (toolName === "community_resource_builder_stage_changeset") return "Staged resource changeset";
  if (toolName === "community_resource_builder_apply_changeset") return "Applied resource changeset";
  if (toolName === "community_search") return `Searched community${query ? ` for ${truncateLabel(query, 48)}` : ""}`;
  if (toolName === "community_write") return "Updated community";
  return toolName;
}

function buildToolDetail(toolName: string, args: Record<string, unknown> | null): string | null {
  const path = toStringValue(args?.path);
  const command = toStringValue(args?.command);
  const pattern = toStringValue(args?.pattern);
  const query = toStringValue(args?.query);
  const url = toStringValue(args?.url);
  if (toolName === "bash" || toolName.startsWith("terminal_")) return command ? truncateLabel(command, 160) : null;
  if (path) return path;
  const ref = toStringValue(args?.ref);
  if (ref) return ref;
  if (pattern) return pattern;
  if (query) return query;
  if (url) return url;
  return null;
}

function statsForTool(toolName: string, kind: AgentActivityKind, payload: Record<string, unknown>): AgentActivityStats {
  const args = asRecord(payload.args);
  const command = toStringValue(args?.command);
  const stats: AgentActivityStats = {};

  if (toolName === "list_dir") stats.directoriesScanned = 1;
  if (
    toolName === "glob" ||
    toolName === "grep" ||
    toolName === "web_research" ||
    toolName === "web_crawl" ||
    toolName === "search_product_docs" ||
    toolName === "community_resources_search" ||
    toolName === "community_search"
  ) {
    stats.searches = 1;
  }
  if (toolName === "read" || kind === "reading") stats.filesRead = toolName === "read" ? 1 : undefined;
  if (toolName === "write" || toolName === "edit" || kind === "editing") {
    stats.filesChanged = toolName === "write" || toolName === "edit" ? 1 : undefined;
    Object.assign(stats, extractDiffStats(payload));
  }
  if (toolName === "bash" || toolName.startsWith("terminal_")) {
    stats.commandsRun = 1;
    if (isVerificationShellCommand(command)) {
      const status = toStringValue(payload.status) === "error" ? "error" : "ok";
      if (status === "error") stats.checksFailed = 1;
      else stats.checksPassed = 1;
    }
  }

  return stats;
}

function extractToolItems(events: RuntimeActivityEvent[]): Map<string, ToolActivityItem> {
  const calls = new Map<string, ToolActivityItem>();
  for (const event of events) {
    if (event.event_type !== "tool_call_started" && event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const toolName = toStringValue(payload.tool_name);
    if (!toolName) continue;
    const args = asRecord(payload.args);
    const callId = resolveToolCallId(event, payload, toolName);
    const kind = classifyTool(toolName, args);
    let call = calls.get(callId);
    if (!call) {
      call = {
        id: callId,
        kind,
        title: buildToolTitle(toolName, args),
        detail: buildToolDetail(toolName, args),
        toolName,
        status: event.event_type === "tool_call_started" ? "running" : "ok",
        seqStart: event.seq,
        seqEnd: event.seq,
        startedAt: event.created_at,
        finishedAt: event.event_type === "tool_call_finished" ? event.created_at : null,
        durationMs: null,
        stats: {},
      };
      calls.set(callId, call);
    }
    call.seqStart = Math.min(call.seqStart, event.seq);
    call.seqEnd = Math.max(call.seqEnd, event.seq);
    call.startedAt = call.startedAt ?? event.created_at;
    if (event.event_type === "tool_call_finished") {
      const status = toStringValue(payload.status) === "error" ? "error" : "ok";
      call.status = status;
      call.finishedAt = event.created_at;
      call.title = buildToolTitle(toolName, args);
      call.detail = buildToolDetail(toolName, args);
      call.stats = statsForTool(toolName, kind, payload);
    }
    call.durationMs = durationBetweenMs(call.startedAt, call.finishedAt);
  }
  return calls;
}

function addStats(left: AgentActivityStats, right: AgentActivityStats): AgentActivityStats {
  const next: AgentActivityStats = { ...left };
  const writable = next as Record<keyof AgentActivityStats, number | undefined>;
  for (const key of Object.keys(right) as Array<keyof AgentActivityStats>) {
    const value = right[key];
    if (typeof value !== "number") continue;
    writable[key] = Math.max(0, Math.floor((writable[key] ?? 0) + value));
  }
  return next;
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function titleForKind(kind: AgentActivityKind): string {
  if (kind === "exploring") return "Exploring";
  if (kind === "reading") return "Reading";
  if (kind === "editing") return "Editing";
  if (kind === "verifying") return "Verifying";
  if (kind === "blocked") return "Blocked";
  return "Completed";
}

function summarizeStep(kind: AgentActivityKind, stats: AgentActivityStats, items: AgentActivityItem[]): string {
  const parts: string[] = [];
  if (kind === "exploring") {
    if (stats.directoriesScanned) parts.push(formatCount(stats.directoriesScanned, "directory", "directories"));
    if (stats.searches) parts.push(formatCount(stats.searches, "search"));
    if (stats.commandsRun) parts.push(formatCount(stats.commandsRun, "command"));
    return parts.join(" · ") || formatCount(items.length, "exploration step");
  }
  if (kind === "reading") {
    if (stats.filesRead) parts.push(`Opened ${formatCount(stats.filesRead, "file")}`);
    if (stats.commandsRun) parts.push(formatCount(stats.commandsRun, "read command"));
    return parts.join(" · ") || formatCount(items.length, "read");
  }
  if (kind === "editing") {
    if (stats.filesChanged) parts.push(`Changed ${formatCount(stats.filesChanged, "file")}`);
    if (stats.linesAdded || stats.linesRemoved) {
      parts.push(`+${stats.linesAdded ?? 0} -${stats.linesRemoved ?? 0}`);
    }
    if (stats.commandsRun) parts.push(formatCount(stats.commandsRun, "command"));
    return parts.join(" · ") || formatCount(items.length, "change");
  }
  if (kind === "verifying") {
    if (stats.checksPassed) parts.push(`${formatCount(stats.checksPassed, "check")} passed`);
    if (stats.checksFailed) parts.push(`${formatCount(stats.checksFailed, "check")} failed`);
    if (stats.commandsRun && !stats.checksPassed && !stats.checksFailed) parts.push(formatCount(stats.commandsRun, "command"));
    return parts.join(" · ") || formatCount(items.length, "verification step");
  }
  if (kind === "blocked") {
    return items[0]?.detail || items[0]?.title || "The run stopped before completing.";
  }
  const duration = formatDuration(stats.totalDurationMs ?? null);
  return duration ? `Finished in ${duration}.` : "Finished the run.";
}

function createStep(kind: AgentActivityKind, index: number, items: ToolActivityItem[]): AgentActivityStep {
  const seqStart = Math.min(...items.map((item) => item.seqStart));
  const seqEnd = Math.max(...items.map((item) => item.seqEnd));
  const startedAt =
    items
      .map((item) => item.startedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => (parseTimestampMs(a) ?? 0) - (parseTimestampMs(b) ?? 0))[0] ?? null;
  const finishedAt =
    items
      .map((item) => item.finishedAt ?? item.startedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => (parseTimestampMs(b) ?? 0) - (parseTimestampMs(a) ?? 0))[0] ?? null;
  const status = items.some((item) => item.status === "error")
    ? "error"
    : items.some((item) => item.status === "running")
      ? "running"
      : "ok";
  const stats = items.reduce((merged, item) => addStats(merged, item.stats), {} as AgentActivityStats);
  const durationMs = mergeDurationMs(items);
  return {
    id: `${kind}:${seqStart}:${index}`,
    kind,
    title: titleForKind(kind),
    summary: summarizeStep(kind, stats, items),
    status,
    seqStart,
    seqEnd,
    startedAt,
    finishedAt,
    durationMs,
    isActive: false,
    stats,
    items: items.map(({ kind: _kind, stats: _stats, ...item }) => item),
  };
}

function runFinishedItem(event: RuntimeActivityEvent, firstEventCreatedAt: string | null): ToolActivityItem {
  const payload = asRecord(event.payload);
  const status = toStringValue(payload?.status);
  const errorMessage = toStringValue(payload?.error_message) || toStringValue(payload?.error_code);
  const kind: AgentActivityKind = status === "ok" ? "completed" : "blocked";
  const totalDurationMs = durationBetweenMs(firstEventCreatedAt, event.created_at);
  return {
    id: `${event.run_id}:${event.seq}:run_finished`,
    kind,
    title: kind === "completed" ? "Finished run" : "Run stopped",
    detail: kind === "completed" ? null : errorMessage || "The run stopped before completing.",
    toolName: null,
    status: kind === "completed" ? "ok" : "error",
    seqStart: event.seq,
    seqEnd: event.seq,
    startedAt: event.created_at,
    finishedAt: event.created_at,
    durationMs: null,
    stats: totalDurationMs === null ? {} : { totalDurationMs },
  };
}

export function buildAgentActivityTimeline(events: RuntimeActivityEvent[]): AgentActivityStep[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) return [];

  const toolItems = extractToolItems(sorted);
  const placedToolCallIds = new Set<string>();
  const stepInputs: Array<{ kind: AgentActivityKind; items: ToolActivityItem[] }> = [];
  let current: { kind: AgentActivityKind; items: ToolActivityItem[] } | null = null;
  const firstEventCreatedAt = sorted[0]?.created_at ?? null;
  const latestSeq = sorted[sorted.length - 1]?.seq ?? 0;

  const pushItem = (item: ToolActivityItem) => {
    if (!current || current.kind !== item.kind) {
      current = { kind: item.kind, items: [] };
      stepInputs.push(current);
    }
    current.items.push(item);
  };

  for (const event of sorted) {
    if (event.event_type === "run_started") {
      continue;
    }
    if (event.event_type === "tool_call_started" || event.event_type === "tool_call_finished") {
      const payload = asRecord(event.payload);
      const toolName = toStringValue(payload?.tool_name);
      if (!payload || !toolName) continue;
      const callId = resolveToolCallId(event, payload, toolName);
      if (placedToolCallIds.has(callId)) continue;
      const item = toolItems.get(callId);
      if (!item) continue;
      pushItem(item);
      placedToolCallIds.add(callId);
      continue;
    }
    if (event.event_type === "run_finished") {
      pushItem(runFinishedItem(event, firstEventCreatedAt));
      continue;
    }
  }

  return stepInputs
    .filter((step) => step.items.length > 0)
    .map((step, index) => createStep(step.kind, index, step.items))
    .map((step) => ({
      ...step,
      isActive: step.seqEnd === latestSeq && step.status === "running",
    }));
}
