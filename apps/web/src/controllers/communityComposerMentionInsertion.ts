export type CommunityComposerMentionInsertion = {
  value: string;
  atIndex: number;
  caret: number;
};

export function buildCommunityComposerMentionInsertion(
  rawValue: string,
  rawSelectionStart: number,
  rawSelectionEnd: number,
): CommunityComposerMentionInsertion {
  const value = String(rawValue ?? "");
  const selectionStart = Math.max(
    0,
    Math.min(value.length, Math.floor(rawSelectionStart)),
  );
  const selectionEnd = Math.max(
    selectionStart,
    Math.min(value.length, Math.floor(rawSelectionEnd)),
  );
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const leadingSpace = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const trailingSpace = after.length > 0 && !/^\s/.test(after) ? " " : "";
  const atIndex = before.length + leadingSpace.length;

  return {
    value: `${before}${leadingSpace}@${trailingSpace}${after}`,
    atIndex,
    caret: atIndex + 1,
  };
}
