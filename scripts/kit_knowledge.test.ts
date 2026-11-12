import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { noteOrigin, noteIsNew } = await import("../apps/web/src/v1/KitKnowledgeNotes");

const now = Date.parse("2026-11-11T20:00:00Z");
const note = (slug: string, kind: string, daysAgo: number, written_by: string | null = null) => ({
  slug, title: slug, body_md: "", source: "", kind, written_by,
  created_at: new Date(now - daysAgo * 86_400_000).toISOString(), updated_at: new Date(now).toISOString(),
}) as any;

test("where a note came from never names the member whose conversation it was saved from", () => {
  expect(noteOrigin(note("a", "founder", 1, "Neil McDevitt"))).toBe("Written by Neil McDevitt");
  expect(noteOrigin(note("b", "ask", 1, "Jon"))).toBe("Saved from a conversation with the guide");
  expect(noteOrigin(note("c", "tag", 1))).toBe("Saved from a conversation in a channel");
  expect(noteOrigin(note("d", "migrated", 1))).toBe("From earlier community memory");
});

test("new this week counts from when a note was made, not last edited", () => {
  expect(noteIsNew(note("x", "founder", 2), now)).toBe(true);
  expect(noteIsNew(note("x", "founder", 8), now)).toBe(false);
});
