export function shortId(id: string, currentUserId?: string, currentUserEmail?: string): string {
  if (currentUserId && id === currentUserId && currentUserEmail) {
    const prefix = currentUserEmail.split("@")[0];
    return prefix.length > 12 ? prefix.slice(0, 12) + "…" : prefix;
  }
  if (id.length > 8) return `Member #${id.slice(-4).toUpperCase()}`;
  return id;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

export function getAvatarColor(id: string): string {
  const colors = [
    "#e57373",
    "#f06292",
    "#ba68c8",
    "#9575cd",
    "#7986cb",
    "#64b5f6",
    "#4fc3f7",
    "#4dd0e1",
    "#4db6ac",
    "#81c784",
    "#aed581",
    "#dce775",
    "#fff176",
    "#ffd54f",
    "#ffb74d",
    "#ff8a65",
    "#a1887f",
    "#90a4ae",
  ];
  const index = Math.abs(hashCode(id)) % colors.length;
  return colors[index];
}

export function getInitials(id: string): string {
  return id.slice(0, 2).toUpperCase();
}

export function shouldShowDateSeparator(messages: { created_at: string }[], index: number): string | null {
  const curr = new Date(messages[index].created_at);
  const currDateStr = curr.toDateString();

  if (index === 0) return formatDateSeparator(curr);

  const prev = new Date(messages[index - 1].created_at);
  if (prev.toDateString() !== currDateStr) return formatDateSeparator(curr);
  return null;
}

export type CommunitySenderMetaMessage = {
  sender_id: string;
  created_at: string;
  reply_to_id?: string | null;
};

export function shouldShowCommunitySenderMeta(
  messages: CommunitySenderMetaMessage[],
  index: number,
  opts?: { forceBeforeDateSeparator?: boolean },
): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.sender_id !== curr.sender_id) return true;
  if (new Date(prev.created_at).toDateString() !== new Date(curr.created_at).toDateString()) return true;
  if ((prev.reply_to_id ?? null) !== (curr.reply_to_id ?? null)) return true;
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  if (currTime - prevTime > 2 * 60 * 1000) return true;
  if (opts?.forceBeforeDateSeparator) {
    const next = messages[index + 1];
    if (next && new Date(curr.created_at).toDateString() !== new Date(next.created_at).toDateString()) {
      return true;
    }
  }
  return false;
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch {
    // Ignore clipboard fallback failures.
  }
}

export function formatCommandPreview(command: string): { preview: string; truncated: boolean; cmdCount: number } {
  const segments = command.split(/\s*(?:&&|\|)\s*/).filter(Boolean);
  const cmdCount = segments.length;
  const firstSegment = segments[0] || command;
  const maxLen = 80;

  const heredocIndex = firstSegment.indexOf("<<");
  let preview = heredocIndex > 0 ? firstSegment.slice(0, heredocIndex + 10) + "..." : firstSegment;

  if (preview.length > maxLen) {
    preview = preview.slice(0, maxLen - 3) + "...";
  }

  const truncated = cmdCount > 1 || firstSegment !== preview || command.includes("<<");
  return { preview, truncated, cmdCount };
}

export function formatCommandForDisplay(command: string): string {
  return command
    .replace(/\s*&&\s*/g, " \\\n  && ")
    .replace(/\s*\|\s*/g, " \\\n  | ");
}

export type ToolLabelDetails = {
  toolName: string;
  command: string;
  path?: string;
  pattern?: string;
  srcPath?: string;
  destPath?: string;
  label?: string;
  query?: string;
};

export function formatToolLabel(
  details: ToolLabelDetails,
  cmdPreview: { preview: string } | null,
): string {
  if (details.toolName === "run_shell_command" || details.toolName === "bash") {
    return cmdPreview?.preview || details.command || "run shell command";
  }
  if (details.toolName === "read_file" || details.toolName === "read") {
    return details.path ? `read file ${details.path}` : "read file";
  }
  if (details.toolName === "list_dir") {
    return details.path ? `list dir ${details.path}` : "list dir";
  }
  if (details.toolName === "list_files") {
    return details.path ? `list files ${details.path}` : "list files";
  }
  if (details.toolName === "grep_files") {
    if (details.pattern?.trim()) {
      return `search ${details.pattern}`;
    }
    return "search files";
  }
  if (details.toolName === "grep_lines") {
    if (details.pattern?.trim()) {
      return `search lines ${details.pattern}`;
    }
    return "search lines";
  }
  if (details.toolName === "stat_file") {
    return details.path ? `stat ${details.path}` : "stat file";
  }
  if (details.toolName === "propose_memory_update") {
    return "update memory";
  }
  if (details.toolName === "write_file") {
    return details.path ? `write file ${details.path}` : "write file";
  }
  if (details.toolName === "edit_file") {
    return details.path ? `edit file ${details.path}` : "edit file";
  }
  if (details.toolName === "multi_edit") {
    return "multi edit";
  }
  if (details.toolName === "mkdir") {
    return details.path ? `mkdir ${details.path}` : "mkdir";
  }
  if (details.toolName === "delete_file") {
    return details.path ? `delete file ${details.path}` : "delete file";
  }
  if (details.toolName === "copy_file") {
    if (details.srcPath && details.destPath) return `copy ${details.srcPath} → ${details.destPath}`;
    return "copy file";
  }
  if (details.toolName === "move_file") {
    if (details.srcPath && details.destPath) return `move ${details.srcPath} → ${details.destPath}`;
    return "move file";
  }
  return details.toolName || "tool";
}
