import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { liveChangeStep, type LiveChangeSeen } from "../shared/liveQuery";

// A page that loads its own data watches the same read live and loads again
// when someone else changes it.
const start: LiveChangeSeen = { key: null, answer: null };
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the first answer is not a change; a different one is; an equal one is not", () => {
  let step = liveChangeStep(start, "k", undefined);
  expect(step.changed).toBe(false);
  step = liveChangeStep(step.seen, "k", { rows: [1] });
  expect(step.changed).toBe(false);
  step = liveChangeStep(step.seen, "k", { rows: [1] });
  expect(step.changed).toBe(false);
  step = liveChangeStep(step.seen, "k", { rows: [1, 2] });
  expect(step.changed).toBe(true);
});

test("another read (another community, another pod) starts again", () => {
  let step = liveChangeStep(start, "a", { n: 1 });
  step = liveChangeStep(step.seen, "b", { n: 2 });
  expect(step.changed).toBe(false);
  step = liveChangeStep(step.seen, "b", { n: 3 });
  expect(step.changed).toBe(true);
});

test("the same answer with its keys in another order is not a change", () => {
  let step = liveChangeStep(start, "k", { a: 1, b: 2 });
  step = liveChangeStep(step.seen, "k", { b: 2, a: 1 });
  expect(step.changed).toBe(false);
});

test("join requests, Members, Knowledge and pods watch their reads", () => {
  expect(read("shared/useCommunityMembersReviewLifecycle.ts")).toContain('"communityAdmin:listCommunityJoinRequests"');
  expect(read("apps/web/src/v1/KitMembersPage.tsx")).toContain('"communityMemberRecords:getCommunityMemberSummary"');
  const content = read("apps/web/src/controllers/useWebCommunityContentController.ts");
  expect(content).toContain('useLiveChange(session, "communityResources:listCommunityResources", knowledgeLiveArgs, reloadKnowledge);');
  expect(content).toContain('useLiveChange(session, "communityResources:listCommunityResourceModules", knowledgeLiveArgs, reloadKnowledge);');
  // Pods and the guide's notes show the live answer itself.
  expect(read("apps/web/src/v1/KitClassroom.tsx")).toContain('useLiveAnswer<{ can_manage: boolean; notes: CommunityNoteView[] }>(props.session, "communityNotes:listCommunityNotes"');
  expect(read("apps/web/src/v1/KitPodRail.tsx")).toContain('useLiveAnswer<CloudPodDetail>(session, "communityPods:getPod"');
  expect(read("apps/web/src/v1/KitPodKnowledge.tsx")).toContain('useLiveAnswer<CloudPodNotes>(props.session, "communityPodNotes:listPodNotes"');
});

test("the Members table is not blanked by a change; its rows stay until the new ones arrive", () => {
  const page = read("apps/web/src/v1/KitMembersPage.tsx");
  expect(page).toMatch(/\}, \[scope\?\.session, scope\?\.communityId, view\]\);/);
  expect(page).toMatch(/if \(!changeSeen\.current\) \{ changeSeen\.current = true; return; \}\s*loadingRef\.current = false;\s*void loadMore\(true\);/);
});
