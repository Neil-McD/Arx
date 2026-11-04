import { expect, test } from "vitest";
import { communityNoteSlug, normalizeCommunityNoteBody, normalizeCommunityNoteTitle, renderCommunityNote, COMMUNITY_NOTE_BODY_MAX_CHARS } from "../shared/communityNotes";

test("a note's file name is its title in plain lowercase words", () => {
  expect(communityNoteSlug("Liquid chalk helps!")).toBe("liquid-chalk-helps");
  expect(communityNoteSlug("Café crew — Thursday 7am")).toBe("cafe-crew-thursday-7am");
  expect(communityNoteSlug("???")).toBe("note");
  expect(communityNoteSlug("x".repeat(200)).length).toBeLessThanOrEqual(64);
});

test("titles and bodies are bounded and tidied", () => {
  expect(normalizeCommunityNoteTitle("## Saturday   carpool \n leaves 4:50")).toBe("Saturday carpool leaves 4:50");
  expect(normalizeCommunityNoteTitle("  ")).toBeNull();
  expect(normalizeCommunityNoteBody("a\r\n\n\n\nb")).toBe("a\n\nb");
  expect(normalizeCommunityNoteBody("x".repeat(9_000))!.length).toBe(COMMUNITY_NOTE_BODY_MAX_CHARS);
});

test("a rendered note is plain markdown that says where it came from", () => {
  expect(renderCommunityNote({ slug: "s", title: "Board etiquette", bodyMd: "One climber at a time.", source: "tag", createdAt: 0, updatedAt: Date.UTC(2026, 10, 3) }))
    .toBe("# Board etiquette\n\nOne climber at a time.\n\n_Community note, from a conversation in a channel. Last updated 2026-11-03._");
});
