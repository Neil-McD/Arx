import { createRequire } from "node:module";
import * as React from "react";
import { describe, expect, test, vi } from "vitest";
import {
  BRAIN_MAP_MIN_NODES,
  brainCanDrawMap,
  brainFact,
  brainHasContent,
  brainNodeCount,
  type BrainMap,
} from "../shared/communityBrain";
import { fitStage, layoutBrain, lensLayout } from "../shared/communityBrainLayout";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { renderToStaticMarkup } = await import("react-dom/server");
const { PanelBrain, PanelBrainMap } = await import("../apps/web/src/v1/KitBrain");
const { KitBrainPageView } = await import("../apps/web/src/v1/KitBrainPage");

const NOW = Date.UTC(2026, 10, 23);

function makeMap(overrides: Partial<BrainMap> = {}): BrainMap {
  return {
    center: { name: "Polynet", kind: "community" },
    counts: { courses: 0, lessons: 0, learned: 0, this_week: 0 },
    can_manage: true,
    courses: [],
    subjects: [],
    points: [],
    pods: [],
    arcs: [],
    hidden: {},
    ...overrides,
  };
}

function makeCourseMap(lessonCount: number): BrainMap {
  const lessons = Array.from({ length: lessonCount }, (_, i) => ({
    id: `resource:l${i + 1}`,
    title: `Lesson ${i + 1}`,
    order: i + 1,
    done: i === 0,
    use: 0,
  }));
  return makeMap({
    counts: { courses: 1, lessons: lessonCount, learned: 0, this_week: 0 },
    courses: [{ id: "course:c1", name: "Foundations", order: 0, lessons }],
  });
}

describe("community brain visibility with published courses and pods", () => {
  test("counts lessons, notes, and pods toward showing and drawing the brain", () => {
    const empty = makeMap();
    expect(brainNodeCount(empty)).toBe(0);
    expect(brainHasContent(empty)).toBe(false);
    expect(brainCanDrawMap(empty)).toBe(false);
    expect(brainFact(empty)).toBeNull();

    const shortCourse = makeCourseMap(2);
    expect(brainNodeCount(shortCourse)).toBe(2);
    expect(brainHasContent(shortCourse)).toBe(true);
    expect(brainCanDrawMap(shortCourse)).toBe(false);
    expect(brainFact(shortCourse)).toBe("1 course · 2 lessons");

    const courseWithThreeLessons = makeCourseMap(BRAIN_MAP_MIN_NODES);
    expect(brainNodeCount(courseWithThreeLessons)).toBe(3);
    expect(brainHasContent(courseWithThreeLessons)).toBe(true);
    expect(brainCanDrawMap(courseWithThreeLessons)).toBe(true);
    expect(brainFact(courseWithThreeLessons)).toBe("1 course · 3 lessons");

    const podsOnly = makeMap({
      pods: [{ id: "pod:p1", name: "Founders", inside: true, count: 2 }],
      points: [
        { id: "note:1", title: "Note 1", kind: "learned", at: { kind: "pod", id: "pod:p1" }, learned_at: new Date(NOW).toISOString(), fresh: true, use: 1, mine: false },
        { id: "note:2", title: "Note 2", kind: "learned", at: { kind: "pod", id: "pod:p1" }, learned_at: new Date(NOW).toISOString(), fresh: true, use: 0, mine: false },
      ],
    });
    expect(brainHasContent(podsOnly)).toBe(true);
    expect(brainCanDrawMap(podsOnly)).toBe(true);
    expect(brainFact(podsOnly)).toBe("1 pod");
  });

  test("PanelBrain and PanelBrainMap render the SVG network for a published course even with 0 learned notes", () => {
    const courseMap = makeCourseMap(4);
    const panelHtml = renderToStaticMarkup(
      React.createElement(PanelBrain, { map: courseMap, now: NOW, onOpen: () => undefined }),
    );
    expect(panelHtml).toContain("The community brain");
    expect(panelHtml).toContain("1 course · 4 lessons");
    expect(panelHtml).toContain("<svg");
    expect(panelHtml).toContain("Open the community brain");

    const miniHtml = renderToStaticMarkup(
      React.createElement(PanelBrainMap, { map: courseMap, now: NOW }),
    );
    expect(miniHtml).toContain("<svg");

    const emptyHtml = renderToStaticMarkup(
      React.createElement(PanelBrain, { map: makeMap(), now: NOW, onOpen: () => undefined }),
    );
    expect(emptyHtml).toBe("");

    // Hosts on empty desktop communities still get an entry into the community brain
    // (where "Notes & files" lives) when a prompt child is passed to PanelBrain.
    const hostEmptyHtml = renderToStaticMarkup(
      React.createElement(
        PanelBrain,
        { map: makeMap(), now: NOW, onOpen: () => undefined },
        React.createElement("span", null, "Add notes, links, or files for your guide."),
      ),
    );
    expect(hostEmptyHtml).toContain("The community brain");
    expect(hostEmptyHtml).toContain("Open");
    expect(hostEmptyHtml).toContain("Add notes, links, or files for your guide.");
  });

  test("KitBrainPageView exposes Notes & files for hosts even when the brain is empty", () => {
    const emptyHostHtml = renderToStaticMarkup(
      React.createElement(KitBrainPageView, {
        session: null,
        communityId: "comm1",
        canManage: true,
        onOpenCourse: () => undefined,
        onOpenGuideMemory: () => undefined,
        map: makeMap(),
      }),
    );
    expect(emptyHostHtml).toContain("Notes &amp; files");

    const emptyMemberHtml = renderToStaticMarkup(
      React.createElement(KitBrainPageView, {
        session: null,
        communityId: "comm1",
        canManage: false,
        onOpenCourse: () => undefined,
        onOpenGuideMemory: () => undefined,
        map: makeMap(),
      }),
    );
    expect(emptyMemberHtml).not.toContain("Notes &amp; files");
  });

  test("KitBrainPageView renders the full interactive map with clickable course hubs for courses-only communities", () => {
    const courseMap = makeCourseMap(4);
    const html = renderToStaticMarkup(
      React.createElement(KitBrainPageView, {
        session: null,
        communityId: "comm1",
        canManage: true,
        onOpenCourse: () => undefined,
        map: courseMap,
      }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain('aria-label="Course: Foundations"');
    expect(html).toContain('aria-label="Lesson 1: Lesson 1"');
    expect(html).toContain("1 course · 4 lessons · 0 learned · 0 this week");
  });

  test("KitBrainPageView small-state fallback lists published courses instead of saying Nothing yet", () => {
    const tinyCourseMap = makeCourseMap(2);
    const html = renderToStaticMarkup(
      React.createElement(KitBrainPageView, {
        session: null,
        communityId: "comm1",
        canManage: true,
        onOpenCourse: () => undefined,
        map: tinyCourseMap,
      }),
    );
    expect(html).not.toContain("<svg");
    expect(html).toContain("Courses");
    expect(html).toContain("Foundations");
    expect(html).toContain("2 lessons");
    expect(html).toContain("No learned notes yet.");
    expect(html).not.toContain("Nothing yet.");
  });

  test("layoutBrain, fitStage, and lensLayout produce finite geometry for courses-only maps with 0 notes", () => {
    const courseMap = makeCourseMap(4);
    const layout = layoutBrain(courseMap, NOW);
    // One line in from the centre, and one to each of the four lessons.
    expect(layout.fibres).toHaveLength(5);
    expect(layout.lessons).toHaveLength(4);
    expect(layout.hubs).toHaveLength(1);

    const small = lensLayout(layout, { w: 240, h: 200 });
    for (const point of [small.center, ...small.hubs, ...small.lessons]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }

    const stage = fitStage(layout, { w: 1000, h: 700 }, { inset: { x: 100, y: 64 }, hubCharW: 8.2, edge: 16 });
    expect(Number.isFinite(stage.scale)).toBe(true);
    expect(stage.scale).toBeGreaterThan(0);
  });
});
