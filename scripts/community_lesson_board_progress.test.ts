// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("katex/dist/katex.min.css", () => ({}));

import { WebCommunityLessonBoard } from "../apps/web/src/components/WebCommunityLessonBoard";
import type { CommunityResource } from "../apps/web/src/components/communityResourcesContracts";
import { buildCommunityResourceEvidenceRef } from "../shared/communityEvidenceContract";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as typeof import("react");
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as typeof import("react-dom/server");

function lesson(id: string, title: string, stage: string, stageOrder: number, order: number): CommunityResource {
  return {
    id, module_id: "course-1", directory_uri: `community://resources/${id}`, directory_path: `/${id}`,
    type: "post", resource_role: "page", resource_status: "published", title, body_md: "Body",
    url: null, lesson: { kind: "lesson", stage, stage_order: stageOrder, order }, pinned: false, sort_order: order,
    created_at: "2026-10-25T00:00:00.000Z",
  };
}

function renderBoard(statusByRef: Record<string, "not_started" | "in_progress" | "done">, owner = false, about?: Record<string, unknown>) {
  const resources = [
    lesson("l1", "Set up your workspace", "Start", 1, 1),
    lesson("l2", "Map your week", "Start", 1, 2),
    lesson("l3", "Build your first employee", "Build", 2, 1),
  ];
  const progress = {
    statusByRef, responsesByRef: {}, loaded: true, error: null,
    setStatus: () => {}, answer: async () => ({ ok: true }) as never,
  };
  return renderToStaticMarkup(createElement(WebCommunityLessonBoard, {
    resources, progress, signedIn: true, onRequireSignIn: () => {},
    editing: owner ? { save: async () => true, addLesson: async () => null, editLesson: () => {} } : null,
    title: "Your first employee",
    ...(about ? { about: about as never } : {}),
  }));
}

describe("roadmap progress", () => {
  it("shows how much is done, the stage the member is on and the next lesson to open", () => {
    const markup = renderBoard({ [buildCommunityResourceEvidenceRef("l1")]: "done" });

    expect(markup).toContain('aria-valuetext="1 of 3 lessons done"');
    expect(markup).toContain("Module 1 of 2");
    expect(markup).toMatch(/class="lesson-journey-next"[^>]*>.*?<small>Up next<\/small><strong>Map your week<\/strong>/);
    expect(markup).toMatch(/data-state="current" data-open=""/);
    expect(markup).toMatch(/lesson-journey-lesson is-next"[^>]*>.*?Map your week/);
    // Members see only the stage they're on; later stages stay folded.
    expect(markup).not.toContain("Build your first employee");
    expect(markup).not.toContain("Add a lesson");
  });

  it("folds a finished stage and says when every lesson is done", () => {
    const done = Object.fromEntries(["l1", "l2", "l3"].map((id) => [buildCommunityResourceEvidenceRef(id), "done" as const]));
    const markup = renderBoard(done);

    expect(markup).toContain('aria-valuenow="100"');
    expect(markup).toContain("Every lesson is done");
    expect(markup).not.toContain("Up next");
    expect(markup).toMatch(/data-state="done"(?! data-open)/);
  });

  it("gives owners every stage open with rename, reorder, add and edit", () => {
    const markup = renderBoard({}, true);

    expect(markup).toContain("Build your first employee");
    expect(markup).toContain('aria-label="Move Build up"');
    expect(markup).toContain('aria-label="Move Map your week down"');
    expect(markup).toContain("Edit lesson");
    expect(markup).toContain("Add a lesson");
    expect(markup).toContain("Add a module");
    expect(markup).toContain('draggable="true"');
  });

  it("opens a track like a course: modules in the outline, the track's page beside them", () => {
    const markup = renderBoard({ [buildCommunityResourceEvidenceRef("l1")]: "done" }, false, {
      eyebrow: "Skill track", summary: "From install to your first employee.", outcomes: ["Map your week"], audience: "New owners.",
    });

    expect(markup).toContain("lesson-step-outline");
    expect(markup).toContain("Track overview");
    expect(markup).toMatch(/Module 1<\/span><span class="lesson-step-module-name">Start/);
    expect(markup).toContain("Skill track · 2 modules · 3 lessons");
    expect(markup).toContain("Start here: Map your week");
    expect(markup).toContain("Module 1 · 1 of 3 done");
    expect(markup).toContain("Who it&#x27;s for");
    // The module you're on is open; the next one folds to its name.
    expect(markup).toContain("Set up your workspace");
    expect(markup).not.toContain("Build your first employee</span></span></button>");
    expect(markup).not.toContain("lesson-journey-stages");
  });
});
