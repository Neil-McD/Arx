import { describe, expect, it } from "vitest";
import { buildEntityNameIndex, entityNameKey, entityPath, matchEntityName, type EntityNameRow } from "../shared/entityChips";

const rows: EntityNameRow[] = [
  { kind: "course", name: "Start here", id: "m1" },
  { kind: "lesson", name: "A tour", id: "l1", parentId: "m1" },
  { kind: "lesson", name: "Pods", id: "l2", parentId: "m2" },
  { kind: "channel", name: "General", id: "c1", slug: "general" },
  { kind: "channel", name: "wins", id: "c2", slug: "wins" },
  { kind: "pod", name: "Founders", id: "p1", slug: "founders" },
  { kind: "event", name: "Group Call", id: "e1:1795600000000", startsAt: "2026-11-27T15:00:00.000Z" },
];

describe("chips: names in the guide's words", () => {
  const index = buildEntityNameIndex("polynet", rows);

  it("matches a whole bold name, ignoring case, a leading # and end punctuation", () => {
    expect(entityNameKey("  #General. ")).toBe("general");
    expect(matchEntityName(index, "Start here")?.path).toBe("/c/polynet/knowledge/m1");
    expect(matchEntityName(index, "start HERE")?.kind).toBe("course");
    expect(matchEntityName(index, "#General")?.path).toBe("/c/polynet/chat");
    expect(matchEntityName(index, "wins")?.path).toBe("/c/polynet/chat/wins");
  });

  it("builds each kind's own address", () => {
    expect(matchEntityName(index, "A tour")?.path).toBe("/c/polynet/knowledge/m1/l1");
    expect(matchEntityName(index, "Founders")?.path).toBe("/c/polynet/pods/founders");
    expect(matchEntityName(index, "Group Call")?.path).toBe("/c/polynet/events/e1_1795600000000");
    expect(matchEntityName(index, "Home")?.path).toBe("/c/polynet/home");
    expect(matchEntityName(index, "Events")?.kind).toBe("page");
  });

  it("gives no chip for a name two things share, or for words that name nothing", () => {
    // The lesson "Pods" and the Pods page.
    expect(matchEntityName(index, "Pods")).toBeNull();
    expect(matchEntityName(index, "Start")).toBeNull();
    expect(matchEntityName(index, "Start here course")).toBeNull();
    expect(matchEntityName(index, "")).toBeNull();
  });

  it("knows nothing without a community, and skips rows it can't address", () => {
    expect(buildEntityNameIndex(null, rows).size).toBe(0);
    expect(entityPath("polynet", { kind: "lesson", name: "Orphan", id: "l9" })).toBeNull();
    expect(entityPath("polynet", { kind: "channel", name: "No slug", id: "c9" })).toBeNull();
  });
});
