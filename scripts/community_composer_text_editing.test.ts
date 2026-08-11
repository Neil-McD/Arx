import { describe, expect, it } from "vitest";
import {
  continueCommunityComposerList,
  indentCommunityComposerList,
  insertCommunityComposerText,
  toggleCommunityComposerInlineFormat,
} from "../apps/web/src/controllers/communityComposerTextEditing";

describe("community composer text editing", () => {
  it("inserts text at the current selection", () => {
    expect(insertCommunityComposerText({ value: "hello world", selectionStart: 6, selectionEnd: 11 }, "🚀"))
      .toEqual({ value: "hello 🚀", selectionStart: 8, selectionEnd: 8, changed: true });
  });

  it("wraps, unwraps, and creates collapsed inline formatting", () => {
    expect(toggleCommunityComposerInlineFormat({ value: "hello", selectionStart: 0, selectionEnd: 5 }, "bold"))
      .toEqual({ value: "**hello**", selectionStart: 0, selectionEnd: 9, changed: true });
    expect(toggleCommunityComposerInlineFormat({ value: "**hello**", selectionStart: 0, selectionEnd: 9 }, "bold"))
      .toEqual({ value: "hello", selectionStart: 0, selectionEnd: 5, changed: true });
    expect(toggleCommunityComposerInlineFormat({ value: "**hello**", selectionStart: 0, selectionEnd: 9 }, "italic").value)
      .toBe("***hello***");
    expect(toggleCommunityComposerInlineFormat({ value: "hello", selectionStart: 5, selectionEnd: 5 }, "italic"))
      .toEqual({ value: "hello**", selectionStart: 6, selectionEnd: 6, changed: true });
  });

  it("formats every selected line without creating markdown that spans line breaks", () => {
    expect(toggleCommunityComposerInlineFormat({ value: "one\ntwo", selectionStart: 0, selectionEnd: 7 }, "bold").value)
      .toBe("**one**\n**two**");
  });

  it("indents only list lines, caps nesting at two levels, and outdents", () => {
    expect(indentCommunityComposerList({ value: "- one\nplain", selectionStart: 0, selectionEnd: 11 }, "indent").value)
      .toBe("  - one\nplain");
    expect(indentCommunityComposerList({ value: "    - one", selectionStart: 0, selectionEnd: 9 }, "indent").value)
      .toBe("    - one");
    expect(indentCommunityComposerList({ value: "    - one", selectionStart: 0, selectionEnd: 9 }, "outdent").value)
      .toBe("  - one");
    expect(indentCommunityComposerList({ value: "plain", selectionStart: 0, selectionEnd: 5 }, "indent").changed)
      .toBe(false);
  });

  it("continues bullet and ordered markers on Shift+Enter", () => {
    expect(continueCommunityComposerList({ value: "- one", selectionStart: 5, selectionEnd: 5 }))
      .toEqual({ value: "- one\n- ", selectionStart: 8, selectionEnd: 8, changed: true });
    expect(continueCommunityComposerList({ value: "2. two", selectionStart: 6, selectionEnd: 6 }))
      .toEqual({ value: "2. two\n3. ", selectionStart: 10, selectionEnd: 10, changed: true });
  });

  it("exits an empty list item and ignores non-list lines", () => {
    expect(continueCommunityComposerList({ value: "before\n  - ", selectionStart: 11, selectionEnd: 11 }))
      .toEqual({ value: "before\n\n", selectionStart: 8, selectionEnd: 8, changed: true });
    expect(continueCommunityComposerList({ value: "plain", selectionStart: 5, selectionEnd: 5 })).toBeNull();
  });
});
