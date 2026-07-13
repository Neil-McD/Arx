export type ChatMarkdownListItem = {
  text: string;
  children: ChatMarkdownListBlock[];
};

export type ChatMarkdownListBlock = {
  kind: "list";
  ordered: boolean;
  start: number;
  items: ChatMarkdownListItem[];
};

export type ChatMarkdownBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "divider" }
  | { kind: "code_block"; text: string; language: string | null }
  | ChatMarkdownListBlock;

type FlatListEntry = {
  depth: number;
  ordered: boolean;
  ordinal: number;
  text: string;
};

const FENCE_START_RE = /^\s{0,3}```([A-Za-z0-9_+-]*)\s*$/;
const FENCE_END_RE = /^\s{0,3}```\s*$/;
const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const LIST_ITEM_RE = /^(\s*)([-+*]|\d+[.)])\s+(.+)$/;
const DIVIDER_RE = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;

function findClosingFence(lines: string[], startIndex: number): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (FENCE_END_RE.test(lines[index] ?? "")) return index;
  }
  return -1;
}

function listEntryFromLine(line: string): Omit<FlatListEntry, "depth"> & { rawDepth: number } | null {
  const match = line.match(LIST_ITEM_RE);
  if (!match) return null;
  const indentation = String(match[1] ?? "").replace(/\t/g, "  ").length;
  const marker = String(match[2] ?? "");
  const ordered = /^\d/.test(marker);
  const ordinal = ordered ? Math.max(1, Number.parseInt(marker, 10) || 1) : 1;
  return {
    rawDepth: Math.min(2, Math.floor(indentation / 2)),
    ordered,
    ordinal,
    text: String(match[3] ?? "").trim(),
  };
}

function nestListEntries(
  entries: FlatListEntry[],
  startIndex: number,
  depth: number,
): { blocks: ChatMarkdownListBlock[]; nextIndex: number } {
  const blocks: ChatMarkdownListBlock[] = [];
  let index = startIndex;

  while (index < entries.length && entries[index]!.depth === depth) {
    const ordered = entries[index]!.ordered;
    const list: ChatMarkdownListBlock = {
      kind: "list",
      ordered,
      start: entries[index]!.ordinal,
      items: [],
    };

    while (index < entries.length) {
      const entry = entries[index]!;
      if (entry.depth < depth) break;
      if (entry.depth === depth && entry.ordered !== ordered) break;

      if (entry.depth > depth) {
        const parent = list.items[list.items.length - 1];
        if (!parent) break;
        const nested = nestListEntries(entries, index, depth + 1);
        parent.children.push(...nested.blocks);
        index = nested.nextIndex;
        continue;
      }

      const item: ChatMarkdownListItem = { text: entry.text, children: [] };
      list.items.push(item);
      index += 1;

      if (index < entries.length && entries[index]!.depth > depth) {
        const nested = nestListEntries(entries, index, depth + 1);
        item.children.push(...nested.blocks);
        index = nested.nextIndex;
      }
    }

    if (list.items.length > 0) blocks.push(list);
    if (index >= entries.length || entries[index]!.depth < depth) break;
  }

  return { blocks, nextIndex: index };
}

function parseListRun(lines: string[], startIndex: number): { blocks: ChatMarkdownListBlock[]; nextIndex: number } {
  const entries: FlatListEntry[] = [];
  let index = startIndex;
  let previousDepth = 0;

  while (index < lines.length) {
    const parsed = listEntryFromLine(lines[index] ?? "");
    if (!parsed) break;
    const depth = entries.length === 0 ? 0 : Math.min(parsed.rawDepth, previousDepth + 1);
    entries.push({
      depth,
      ordered: parsed.ordered,
      ordinal: parsed.ordinal,
      text: parsed.text,
    });
    previousDepth = depth;
    index += 1;
  }

  return {
    blocks: nestListEntries(entries, 0, 0).blocks,
    nextIndex: index,
  };
}

function startsStructuredBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (!line.trim()) return true;
  if (HEADING_RE.test(line) || BLOCKQUOTE_RE.test(line) || DIVIDER_RE.test(line)) return true;
  if (listEntryFromLine(line)) return true;
  return Boolean(FENCE_START_RE.test(line) && findClosingFence(lines, index) >= 0);
}

export function parseChatBlockMarkdown(rawInput: unknown): ChatMarkdownBlock[] {
  const raw = String(rawInput ?? "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return [];

  const lines = raw.split("\n");
  const blocks: ChatMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceStart = line.match(FENCE_START_RE);
    if (fenceStart) {
      const closingIndex = findClosingFence(lines, index);
      if (closingIndex >= 0) {
        blocks.push({
          kind: "code_block",
          language: String(fenceStart[1] ?? "").trim().toLowerCase() || null,
          text: lines.slice(index + 1, closingIndex).join("\n").replace(/\n$/, ""),
        });
        index = closingIndex + 1;
        continue;
      }
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: String(heading[1] ?? "").length as 1 | 2 | 3,
        text: String(heading[2] ?? "").trim(),
      });
      index += 1;
      continue;
    }

    if (DIVIDER_RE.test(line)) {
      blocks.push({ kind: "divider" });
      index += 1;
      continue;
    }

    const quote = line.match(BLOCKQUOTE_RE);
    if (quote) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(BLOCKQUOTE_RE);
        if (!match) break;
        quoteLines.push(String(match[1] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "blockquote", text: quoteLines.join("\n").trim() });
      continue;
    }

    if (listEntryFromLine(line)) {
      const listRun = parseListRun(lines, index);
      blocks.push(...listRun.blocks);
      index = listRun.nextIndex;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      if (paragraphLines.length > 0 && startsStructuredBlock(lines, index)) break;
      const paragraphLine = lines[index] ?? "";
      if (!paragraphLine.trim()) break;
      paragraphLines.push(paragraphLine);
      index += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraphLines.join("\n").trim() });
      continue;
    }
    index += 1;
  }

  return blocks;
}
