import { expect, test } from "vitest";

import { computeCommunityCourseProgress } from "../shared/communityCourseProgress";

const lesson = (id: string, module_id: string, title: string, fields: Record<string, unknown> | null = null) => ({
  id, module_id, title, resource_role: "page", lesson: fields as never,
});

test("course cards count done lessons per course", () => {
  const progress = computeCommunityCourseProgress({
    lessons: [lesson("a", "c1", "One"), lesson("b", "c1", "Two"), lesson("c", "c2", "Three"), { ...lesson("s", "c1", "Source"), resource_role: "source" }],
    statusByRef: { "resource:a": "done", "resource:b": "in_progress" },
  });
  expect(progress).toEqual({ c1: { done: 1, total: 2 }, c2: { done: 0, total: 1 } });
});

test("a course behind an unfinished gate is locked and names the gate", () => {
  const lessons = [
    lesson("setup", "start", "Connect and onboard", { stage: "Get set up", stage_order: 0, gate: true }),
    lesson("map", "xray", "Map the business", { stage: "Map the business", stage_order: 1 }),
  ];
  expect(computeCommunityCourseProgress({ lessons, statusByRef: {} }).xray).toEqual({
    done: 0, total: 1, lockedReason: 'Finish "Connect and onboard" first',
  });
  expect(computeCommunityCourseProgress({ lessons, statusByRef: { "resource:setup": "done" } }).xray).toEqual({ done: 0, total: 1 });
});

test("with course names, a locked course names the course to finish, not a lesson", () => {
  const lessons = [
    lesson("setup", "start", "Connect and onboard", { stage: "Get set up", stage_order: 0, gate: true }),
    lesson("map", "xray", "Map the business", { stage: "Map the business", stage_order: 1 }),
  ];
  expect(computeCommunityCourseProgress({ lessons, statusByRef: {}, courseTitles: { start: "Get set up", xray: "Business X-Ray" } }).xray).toEqual({
    done: 0, total: 1, lockedReason: 'Opens after "Get set up"',
  });
});
