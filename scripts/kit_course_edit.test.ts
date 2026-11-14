import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { courseEditPatch } = await import("../apps/web/src/v1/KitCourseEdit");

describe("changing a course in the page", () => {
  it("needs a name, and sends trimmed words", () => {
    expect(courseEditPatch({ name: "  ", description: "x", cover: { kind: "keep" } })).toBeNull();
    expect(courseEditPatch({ name: " Diagnosis Tools ", description: " Visual tools. ", cover: { kind: "keep" } }))
      .toEqual({ name: "Diagnosis Tools", description: "Visual tools.", cover: { kind: "keep" } });
  });
  it("carries the cover only as a change", () => {
    expect(courseEditPatch({ name: "A", description: "", cover: { kind: "remove" } })?.cover).toEqual({ kind: "remove" });
    expect(courseEditPatch({ name: "A", description: "", cover: { kind: "new", dataUrl: "data:image/png;base64,AA" } })?.cover.kind).toBe("new");
  });
  // Neil, Nov 14: a course's tools are in the page, and only a draft can be
  // deleted, with one question. The pop-ups are not reachable from here.
  it("the course page opens no pop-up for details or delete, and guards delete to drafts", () => {
    const page = readFileSync(new URL("../apps/web/src/v1/KitClassroom.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/onEditCourseDetails|Course details/);
    expect(page).toMatch(/module_status === "draft" \? \(\s*<button[^>]*onClick=\{\(\) => void deleteCourse\(\)\}/);
    expect(page).toMatch(/To delete this course, unpublish it first\./);
    const panel = readFileSync(new URL("../apps/web/src/components/WebCommunityKnowledgePanel.tsx", import.meta.url), "utf8");
    expect(panel).not.toMatch(/handleEditModule|openNewModuleModal|handleDeleteModule/);
    expect(panel).toMatch(/course\.module_status !== "draft"\) return \{ ok: false/);
  });
});

const { courseOrderAfterMove } = await import("../apps/web/src/v1/KitClassroom");

describe("arranging the shelf, and the old editor's retirement", () => {
  it("moves one book one place, and refuses to move off the end", () => {
    expect(courseOrderAfterMove(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(courseOrderAfterMove(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(courseOrderAfterMove(["a", "b", "c"], 0, -1)).toBeNull();
    expect(courseOrderAfterMove(["a", "b", "c"], 2, 1)).toBeNull();
  });
  // Neil, Nov 14: one way to edit. The new design has no way into the earlier
  // editor ("More tools") or its preview switch.
  it("the new Knowledge page cannot open the earlier editor", () => {
    const page = readFileSync(new URL("../apps/web/src/v1/KitClassroom.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/More tools|onEditCourse\b/);
    const panel = readFileSync(new URL("../apps/web/src/components/WebCommunityKnowledgePanel.tsx", import.meta.url), "utf8");
    const v1 = panel.slice(panel.indexOf("function KnowledgeV1"), panel.indexOf("function KnowledgeClassic"));
    expect(v1.length).toBeGreaterThan(200);
    expect(v1).not.toMatch(/CommunityResourcesPanel|Done editing/);
  });
});
