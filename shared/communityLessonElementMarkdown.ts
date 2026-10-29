import { COMMUNITY_LESSON_ELEMENT_TYPES } from "./communityLessonContract";

// The same fence rule as the lesson contract's parser, so the app shows an
// element exactly where the server found it.
const FENCE = /^(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)(?:[ \t]+(.*?))?\s*$/;

export const LESSON_ELEMENT_LANGUAGE_PREFIX = "polynet-element-";

/**
 * Renames each follow-along block's fence to `polynet-element-<id>`, so the
 * markdown renderer can put the element in its place. Blocks the server
 * doesn't know (not in `ids`) are left as they are and show as plain code.
 */
export function markCommunityLessonElementBlocks(markdown: string, ids: ReadonlySet<string>): string {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const open = FENCE.exec(lines[i]);
    if (!open) continue;
    const language = open[2] ?? "";
    const id = (open[3] ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if ((COMMUNITY_LESSON_ELEMENT_TYPES as readonly string[]).includes(language) && ids.has(id)) {
      lines[i] = `${open[1]}${LESSON_ELEMENT_LANGUAGE_PREFIX}${id}`;
    }
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith(open[1])) j += 1;
    i = j;
  }
  return lines.join("\n");
}
