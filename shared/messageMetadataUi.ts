export type MemoryUsedItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  updated_at: string;
};

export type MemorySuggestion = {
  content: string;
  pinned: boolean;
};

export type HistoryUsedItem = {
  thread_id: string;
  message_id: string;
  created_at: string;
  snippet: string;
};

export function communityInitials(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "AR";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  const combined = initials.join("");
  return combined || trimmed.slice(0, 2).toUpperCase();
}

export function parseMemoryUsedArray(value: unknown): MemoryUsedItem[] {
  if (!Array.isArray(value)) return [];
  const out: MemoryUsedItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (!id || !content) continue;
    out.push({
      id,
      content,
      scope: record.scope === "workspace" ? "workspace" : "global",
      scope_id: typeof record.scope_id === "string" ? record.scope_id : null,
      pinned: Boolean(record.pinned),
      updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
    });
  }
  return out;
}

export function parseHistoryUsedArray(value: unknown): HistoryUsedItem[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryUsedItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const thread_id = typeof record.thread_id === "string" ? record.thread_id.trim() : "";
    const message_id = typeof record.message_id === "string" ? record.message_id.trim() : "";
    const snippet = typeof record.snippet === "string" ? record.snippet.trim() : "";
    if (!thread_id || !message_id || !snippet) continue;
    out.push({
      thread_id,
      message_id,
      created_at: typeof record.created_at === "string" ? record.created_at : "",
      snippet,
    });
  }
  return out.slice(0, 12);
}
