import { expect, test } from "vitest";
import { applyPersonalMemoryOperations, parsePersonalMemoryOperations, PERSONAL_MEMORY_MAX_CHARS, renderPersonalMemory } from "../shared/personalMemory";
import { loadCommunityTurnLayers } from "../shared/communityTurnLayers";

const source = { sourceRef: "run:r1", at: 1 };
const apply = (entries: any[], ops: unknown) => {
  const parsed = parsePersonalMemoryOperations(ops);
  if (!Array.isArray(parsed)) return parsed;
  return applyPersonalMemoryOperations(entries, parsed, source);
};
const texts = (result: any) => result.entries.map((entry: any) => entry.text);

test("add, the same entry twice, patch part of an entry, remove, clear", () => {
  let result: any = apply([], [{ action: "add", content: "Keep answers short." }, { action: "add", content: "Keep answers short." }, { action: "add", content: "Climbs on Tuesdays and Thursdays." }]);
  expect(texts(result)).toEqual(["Keep answers short.", "Climbs on Tuesdays and Thursdays."]);
  result = apply(result.entries, [{ action: "patch", old_text: "Tuesdays and Thursdays", content: "Wednesdays" }]);
  expect(texts(result)).toEqual(["Keep answers short.", "Climbs on Wednesdays."]);
  expect(result.entries[1].sourceRef).toBe("run:r1");
  result = apply(result.entries, [{ action: "remove", old_text: "wednesdays" }]);
  expect(texts(result)).toEqual(["Keep answers short."]);
  result = apply(result.entries, [{ action: "clear" }]);
  expect(result).toMatchObject({ entries: [], changed: true });
});

test("a span in two entries, or none, is refused and nothing changes", () => {
  const entries = [{ text: "Likes slab.", ...source }, { text: "Likes overhang.", ...source }];
  expect(apply(entries, [{ action: "remove", old_text: "Likes" }])).toMatchObject({ code: "ambiguous_match" });
  expect(apply(entries, [{ action: "remove", old_text: "crimps" }])).toMatchObject({ code: "no_match" });
  expect(apply(entries, [{ action: "dance" }])).toMatchObject({ code: "operations_invalid" });
});

test("full: a write past the cap fails; the same batch can free room and add", () => {
  const entries = [0, 1, 2].map((i) => ({ text: `${i}`.repeat(450), ...source }));
  expect(apply(entries, [{ action: "add", content: "One more thing worth keeping." }])).toMatchObject({ code: "memory_full" });
  const result: any = apply(entries, [{ action: "remove", old_text: "0".repeat(450) }, { action: "add", content: "One more thing worth keeping." }]);
  expect(result.entries).toHaveLength(3);
  expect(result.entries.reduce((sum: number, entry: any) => sum + entry.text.length, 0)).toBeLessThanOrEqual(PERSONAL_MEMORY_MAX_CHARS);
});

test("hidden characters are dropped and long entries refused", () => {
  const result: any = apply([], [{ action: "add", content: "Keep​ answers‮ short." }]);
  expect(texts(result)).toEqual(["Keep answers short."]);
  expect(apply([], [{ action: "add", content: "x".repeat(501) }])).toMatchObject({ code: "entry_too_long" });
  expect(renderPersonalMemory([])).toContain("_Nothing yet._");
});

test("the personal layer is read only for the member's own private talk", async () => {
  const contract = { uses: { communityCard: true, handbook: false } } as any;
  const reads: string[] = [];
  const read = async (path: string) => { reads.push(path); return { status: "ok", outputText: JSON.stringify({ body: `body of ${path}` }) }; };
  const shared = await loadCommunityTurnLayers({ contract, communitySlug: "club", read });
  expect(shared.personalMemoryMd).toBeNull();
  expect(reads).not.toContain("/communities/club/members/me/memory.md");
  const personal = await loadCommunityTurnLayers({ contract, communitySlug: "club", read, personal: true });
  expect(personal.personalMemoryMd).toBe("body of /communities/club/members/me/memory.md");
});

test("the private talk's prompt holds the memory and how to keep it; no slug, no block", async () => {
  const { buildPersonalMemoryPromptBlock } = await import("../shared/runtimePrompt");
  const block = buildPersonalMemoryPromptBlock("- Keep answers short.", "club")!;
  expect(block).toContain("PERSONAL_MEMORY");
  expect(block).toContain("/communities/club/capabilities/member.memory.remember.json");
  expect(block).toContain("- Keep answers short.");
  expect(buildPersonalMemoryPromptBlock(null, "club")).toContain("_Nothing yet._");
  expect(buildPersonalMemoryPromptBlock("x", "")).toBeNull();
});
