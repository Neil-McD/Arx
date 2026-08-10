export type CommunityComposerSelection = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export type CommunityComposerEdit = CommunityComposerSelection & {
  changed: boolean;
};

export type CommunityComposerInlineFormat = "bold" | "italic" | "strike" | "code";
export type CommunityComposerLineFormat = "bullet" | "ordered" | "quote";

const INLINE_MARKERS: Record<CommunityComposerInlineFormat, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  code: "`",
};

const LIST_MARKER_PATTERN = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+)(.*)$/;
const MAX_LIST_INDENT = 4;

function normalizeSelection(selection: CommunityComposerSelection): CommunityComposerSelection {
  const value = String(selection.value ?? "");
  const start = Math.max(0, Math.min(value.length, selection.selectionStart));
  const end = Math.max(start, Math.min(value.length, selection.selectionEnd));
  return { value, selectionStart: start, selectionEnd: end };
}

function unchanged(selection: CommunityComposerSelection): CommunityComposerEdit {
  return { ...normalizeSelection(selection), changed: false };
}

function selectedLineRange(selection: CommunityComposerSelection) {
  const normalized = normalizeSelection(selection);
  const { value, selectionStart, selectionEnd } = normalized;
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const inclusiveEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
    ? selectionEnd - 1
    : selectionEnd;
  const nextBreak = value.indexOf("\n", inclusiveEnd);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { ...normalized, lineStart, lineEnd };
}

function replaceSelectedLines(
  selection: CommunityComposerSelection,
  transform: (line: string, index: number) => string,
): CommunityComposerEdit {
  const range = selectedLineRange(selection);
  const source = range.value.slice(range.lineStart, range.lineEnd);
  const lines = source.split("\n");
  const replacement = lines.map(transform).join("\n");
  if (replacement === source) return unchanged(selection);
  return {
    value: `${range.value.slice(0, range.lineStart)}${replacement}${range.value.slice(range.lineEnd)}`,
    selectionStart: range.lineStart,
    selectionEnd: range.lineStart + replacement.length,
    changed: true,
  };
}

export function insertCommunityComposerText(
  selection: CommunityComposerSelection,
  text: string,
): CommunityComposerEdit {
  const normalized = normalizeSelection(selection);
  const inserted = String(text ?? "");
  const caret = normalized.selectionStart + inserted.length;
  return {
    value: `${normalized.value.slice(0, normalized.selectionStart)}${inserted}${normalized.value.slice(normalized.selectionEnd)}`,
    selectionStart: caret,
    selectionEnd: caret,
    changed: normalized.selectionStart !== normalized.selectionEnd || inserted.length > 0,
  };
}

export function toggleCommunityComposerInlineFormat(
  selection: CommunityComposerSelection,
  format: CommunityComposerInlineFormat,
): CommunityComposerEdit {
  const normalized = normalizeSelection(selection);
  const marker = INLINE_MARKERS[format];
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  if (!selected) {
    const value = `${normalized.value.slice(0, normalized.selectionStart)}${marker}${marker}${normalized.value.slice(normalized.selectionEnd)}`;
    const caret = normalized.selectionStart + marker.length;
    return { value, selectionStart: caret, selectionEnd: caret, changed: true };
  }

  const lines = selected.split("\n");
  const nonEmptyLines = lines.filter((line) => line.length > 0);
  const shouldUnwrap = nonEmptyLines.length > 0 && nonEmptyLines.every(
    (line) => {
      if (!line.startsWith(marker) || !line.endsWith(marker) || line.length < marker.length * 2) return false;
      if (format !== "italic") return true;
      return !line.startsWith("**") && !line.endsWith("**");
    },
  );
  const replacement = lines.map((line) => {
    if (!line) return line;
    if (shouldUnwrap) return line.slice(marker.length, line.length - marker.length);
    return `${marker}${line}${marker}`;
  }).join("\n");
  return {
    value: `${normalized.value.slice(0, normalized.selectionStart)}${replacement}${normalized.value.slice(normalized.selectionEnd)}`,
    selectionStart: normalized.selectionStart,
    selectionEnd: normalized.selectionStart + replacement.length,
    changed: replacement !== selected,
  };
}

export function insertCommunityComposerLink(
  selection: CommunityComposerSelection,
): CommunityComposerEdit {
  const normalized = normalizeSelection(selection);
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  const label = selected || "link text";
  const replacement = `[${label}](https://)`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${replacement}${normalized.value.slice(normalized.selectionEnd)}`;
  const editableStart = selected
    ? normalized.selectionStart + label.length + 3
    : normalized.selectionStart + 1;
  const editableEnd = selected
    ? editableStart + "https://".length
    : editableStart + label.length;
  return { value, selectionStart: editableStart, selectionEnd: editableEnd, changed: true };
}

function lineFormatPattern(format: CommunityComposerLineFormat): RegExp {
  if (format === "bullet") return /^(\s*)[-*+]\s+(.*)$/;
  if (format === "ordered") return /^(\s*)\d+[.)]\s+(.*)$/;
  return /^(\s*)>\s?(.*)$/;
}

export function toggleCommunityComposerLineFormat(
  selection: CommunityComposerSelection,
  format: CommunityComposerLineFormat,
): CommunityComposerEdit {
  const range = selectedLineRange(selection);
  const lines = range.value.slice(range.lineStart, range.lineEnd).split("\n");
  const pattern = lineFormatPattern(format);
  const contentLines = lines.filter((line) => line.trim().length > 0);
  const shouldRemove = contentLines.length > 0 && contentLines.every((line) => pattern.test(line));
  let orderedIndex = 0;
  return replaceSelectedLines(selection, (line) => {
    if (!line.trim()) return line;
    if (shouldRemove) {
      const match = line.match(pattern);
      return match ? `${match[1]}${match[2]}` : line;
    }
    const indentation = line.match(/^\s*/)?.[0] ?? "";
    const rawContent = line.slice(indentation.length);
    const existingList = rawContent.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
    const content = format === "bullet" || format === "ordered"
      ? existingList?.[1] ?? rawContent
      : rawContent;
    if (format === "quote") return `${indentation}> ${content}`;
    if (format === "bullet") return `${indentation}- ${content}`;
    orderedIndex += 1;
    return `${indentation}${orderedIndex}. ${content}`;
  });
}

export function indentCommunityComposerList(
  selection: CommunityComposerSelection,
  direction: "indent" | "outdent",
): CommunityComposerEdit {
  return replaceSelectedLines(selection, (line) => {
    const match = line.match(LIST_MARKER_PATTERN);
    if (!match) return line;
    const indentation = match[1].replace(/\t/g, "  ");
    const nextIndent = direction === "indent"
      ? `${indentation}  `.slice(0, MAX_LIST_INDENT)
      : indentation.slice(0, Math.max(0, indentation.length - 2));
    return `${nextIndent}${line.slice(match[1].length)}`;
  });
}

export function continueCommunityComposerList(
  selection: CommunityComposerSelection,
): CommunityComposerEdit | null {
  const normalized = normalizeSelection(selection);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineStart = normalized.value.lastIndexOf("\n", Math.max(0, normalized.selectionStart - 1)) + 1;
  const lineBeforeCaret = normalized.value.slice(lineStart, normalized.selectionStart);
  const match = lineBeforeCaret.match(/^(\s*)([-*+]\s+|(\d+)([.)])\s+)(.*)$/);
  if (!match) return null;

  const indentation = match[1];
  const itemText = match[5];
  if (!itemText.trim()) {
    const value = `${normalized.value.slice(0, lineStart)}\n${normalized.value.slice(normalized.selectionStart)}`;
    const caret = lineStart + 1;
    return { value, selectionStart: caret, selectionEnd: caret, changed: true };
  }

  const marker = match[3]
    ? `${Number(match[3]) + 1}${match[4]} `
    : match[2];
  return insertCommunityComposerText(normalized, `\n${indentation}${marker}`);
}
