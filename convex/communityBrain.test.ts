/// <reference types="vite/client" />
// The community brain's read (convex/communityBrain.ts): one map, as each
// viewer may see it.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { BRAIN_POINTS_MAX, brainTitleFor, chooseArcs, choosePoints, subjectsOf } from "../shared/communityBrain";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();
const DAY = 86_400_000;

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const user = (subject: string, name: string) => ctx.db.insert("users", { authSubject: subject, displayName: name, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner", "Owner");
    const memberId = await user("member", "Jon");
    await user("stranger", "Stranger");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "brain-club", name: "Brain club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    const channel = (slug: string, accessMode: "all_members" | "restricted", position: number) => ctx.db.insert("communityChannels", {
      communityId, slug, name: slug, accessMode, postingPolicy: "members", status: "active", position, createdAt: NOW, updatedAt: NOW });
    const general = await channel("general", "all_members", 0);
    const climbers = await channel("climbers", "restricted", 1);
    const scouts = await channel("scouts", "restricted", 2);
    const secret = await channel("secret", "restricted", 3);
    for (const [id, visibility] of [[climbers, "listed"], [scouts, "listed"], [secret, "hidden"]] as const) {
      await ctx.db.insert("communityPods", { communityId, channelId: id, purpose: "x", visibility, createdAt: NOW, updatedAt: NOW });
    }
    // The member is in the climbers pod only.
    await ctx.db.insert("communityChannelParticipants", { communityId, channelId: climbers, principalKey: `user:${memberId}`, membershipId,
      membershipActivationSequence: 0, status: "active", reasons: ["host"], createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW });
    const post = (by: any, text: string, channelId: any = general) => ctx.db.insert("communityInteractionRoots", {
      communityId, channelId, actorType: "human", actorUserId: by, kind: "discussion", status: "live", visibilityScope: "community",
      contentSummary: text, replyCount: 0, reactionSummary: [], idempotencyKey: `k${Math.random()}`, createdAt: NOW, updatedAt: NOW });
    const jonsPost = await post(memberId, "Toe-hook the volume.");
    const ownersPost = await post(ownerId, "Chalk is restocked Tuesdays.");
    const goneLater = await post(ownerId, "Guest passes are ten dollars.");
    // Courses: one members can take, one in draft.
    const module = (name: string, status: "live" | "draft", sortOrder: number) => ctx.db.insert("communityResourceModules", {
      communityId, createdByUserId: ownerId, status, name, sortOrder, createdAt: NOW, updatedAt: NOW });
    const basics = await module("Board basics", "live", 0);
    const draft = await module("Not yet", "draft", 1);
    const lesson = (moduleId: any, title: string, sortOrder: number) => ctx.db.insert("communityResources", {
      communityId, moduleId, createdByUserId: ownerId, type: "page", title, bodyMd: "Words.", bodyChars: 6, sortOrder, pinned: false, createdAt: NOW, updatedAt: NOW } as any);
    const reading = await lesson(basics, "Reading the board", 0);
    const warmup = await lesson(basics, "Warming up", 1);
    const gone = await lesson(basics, "Gone soon", 2);
    await lesson(draft, "Secret lesson", 0);
    await ctx.db.insert("communityLessonProgress", { communityId, userId: memberId, resourceId: reading, completedAt: NOW });
    const note = (scopeKey: string, slug: string, title: string, extra: Record<string, unknown>) => ctx.db.insert("communityNotes", {
      communityId, scopeKey, slug, title, bodyMd: `TEXT OF ${title}`, source: "learned", authorKind: "guide", searchText: slug,
      createdAt: NOW - DAY, updatedAt: NOW - DAY, ...extra });
    const scope = `community:${String(communityId)}`;
    const toeHook = await note(scope, "toe-hook", "Yellow V5: toe-hook", { evidenceRefs: [`post:${jonsPost}`], aboutLessonId: reading, createdAt: NOW - 1_000 });
    const chalk = await note(scope, "chalk", "Chalk day", { evidenceRefs: [`post:${ownersPost}`], subject: "Gym logistics", createdAt: NOW - 20 * DAY });
    const refunds = await note(scope, "refunds", "VIP refund exceptions", { source: "founder", authorKind: "builder", subject: "Gym logistics", createdAt: NOW - 30 * DAY });
    const passes = await note(scope, "passes", "Guest passes", { evidenceRefs: [`post:${goneLater}`], subject: "Gym logistics", createdAt: NOW - 10 * DAY });
    const loose = await note(scope, "loose", "Unfiled thing", { evidenceRefs: [`post:${ownersPost}`], createdAt: NOW - 9 * DAY });
    const orphan = await note(scope, "orphan", "Was on a lesson", { evidenceRefs: [`post:${ownersPost}`], aboutLessonId: gone, createdAt: NOW - 8 * DAY });
    const older = await note(scope, "older", "OLDER SAVED NOTE", { source: "tag", authorKind: undefined, subject: "Gym logistics", createdAt: NOW - 60 * DAY });
    await note(`pod:${String(climbers)}`, "rota", "Reset rota", { evidenceRefs: [], subject: "Resets" });
    await note(`pod:${String(scouts)}`, "scouting", "SCOUTS NOTE", { evidenceRefs: [] });
    await note(`pod:${String(secret)}`, "hush", "SECRET NOTE", { evidenceRefs: [] });
    // What answers read together.
    await ctx.db.insert("communityKnowledgeUse", { communityId, day: Math.floor(NOW / DAY), uses: [{ ref: `note:${toeHook}`, count: 5 }, { ref: `resource:${reading}`, count: 3 }, { ref: `note:${refunds}`, count: 2 }],
      pairs: [{ a: `note:${toeHook}`, b: `resource:${reading}`, count: 3 }, { a: `note:${refunds}`, b: "note:not-drawn", count: 9 }] });
    // Taken down after it was learned from.
    await ctx.db.patch(goneLater, { status: "hidden" });
    await ctx.db.delete(gone);
    return { ownerId, memberId, communityId, general, climbers, scouts, secret, reading, warmup, toeHook, chalk, refunds, passes, loose, orphan, older };
  });
}

const as = (t: any, subject: string) => t.withIdentity({ subject });

test("a member's map: courses and lessons members can take, their own progress, names only for what they may read, never a note's text", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const map: any = await as(t, "member").query(api.communityBrain.getBrainMap, { communityId: w.communityId });
  expect(map.center).toEqual({ name: "Brain club", kind: "community" });
  expect(map.can_manage).toBe(false);
  expect(map.courses).toEqual([{ id: expect.stringMatching(/^course:/), name: "Board basics", order: 0, lessons: [
    { id: `resource:${w.reading}`, title: "Reading the board", order: 1, done: true, use: 3 },
    { id: `resource:${w.warmup}`, title: "Warming up", order: 2, done: false, use: 0 },
  ] }]);
  const point = (id: any) => map.points.find((entry: any) => entry.id === `note:${id}`);
  // Learned from a post they can read, and from their own post.
  expect(point(w.toeHook)).toMatchObject({ title: "Yellow V5: toe-hook", kind: "learned", at: { kind: "lesson", id: `resource:${w.reading}` }, fresh: true, use: 5, mine: true });
  expect(point(w.chalk)).toMatchObject({ title: "Chalk day", at: { kind: "subject", name: "Gym logistics" }, fresh: false, mine: false });
  // A host taught it: a point with no name. Its post is gone: no name either.
  expect(point(w.refunds)).toMatchObject({ title: null, kind: "taught" });
  expect(point(w.passes)).toMatchObject({ title: null, kind: "learned" });
  // Saved by the guide from a conversation before notes cited posts: learned, and no name for a member.
  expect(point(w.older)).toMatchObject({ title: null, kind: "learned" });
  // Unfiled, or filed under a lesson that's gone: nowhere yet.
  expect(point(w.loose).at).toEqual({ kind: "other" });
  expect(point(w.orphan).at).toEqual({ kind: "other" });
  expect(map.subjects.map((subject: any) => [subject.name, subject.size])).toEqual([["Gym logistics", 4]]);
  // Pods: the one they're in with its things; a listed one as a count; a hidden one not at all.
  expect(map.pods).toEqual([
    { id: `pod:${w.climbers}`, name: "climbers", inside: true, count: 1 },
    { id: `pod:${w.scouts}`, name: "scouts", inside: false, count: 1 },
  ]);
  expect(map.points.find((entry: any) => entry.title === "Reset rota")).toMatchObject({ at: { kind: "pod", id: `pod:${w.climbers}` } });
  // Arcs only between things this map draws.
  expect(map.arcs).toEqual([{ a: `note:${w.toeHook}`, b: `resource:${w.reading}`, count: 3 }]);
  expect(map.counts).toEqual({ courses: 1, lessons: 2, learned: 7, this_week: 1 });
  const text = JSON.stringify(map);
  for (const never of ["TEXT OF", "VIP refund", "Guest passes", "OLDER SAVED", "Secret lesson", "SCOUTS NOTE", "SECRET NOTE", "secret"]) expect(text).not.toContain(never);
});

test("a builder sees every name and every pod's things; a pod's own map is for the people in it", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const map: any = await as(t, "owner").query(api.communityBrain.getBrainMap, { communityId: w.communityId });
  expect(map.can_manage).toBe(true);
  const titles = map.points.map((point: any) => point.title);
  expect(titles).toEqual(expect.arrayContaining(["VIP refund exceptions", "Guest passes", "SCOUTS NOTE", "SECRET NOTE"]));
  expect(map.pods.every((pod: any) => pod.inside)).toBe(true);
  expect(JSON.stringify(map)).not.toContain("TEXT OF");

  const pod: any = await as(t, "member").query(api.communityBrain.getBrainMap, { communityId: w.communityId, podChannelId: w.climbers });
  expect(pod).toMatchObject({ center: { name: "climbers", kind: "pod" }, courses: [], pods: [] });
  expect(pod.points.map((point: any) => [point.title, point.at])).toEqual([["Reset rota", { kind: "subject", name: "Resets" }]]);
  await expect(as(t, "member").query(api.communityBrain.getBrainMap, { communityId: w.communityId, podChannelId: w.scouts })).rejects.toThrow("community_pod_not_found");
  await expect(as(t, "stranger").query(api.communityBrain.getBrainMap, { communityId: w.communityId })).rejects.toThrow();
});

test("the rules: who reads a name, which points a busy map keeps, which arcs it draws, where subjects sit", () => {
  const learned = { title: "T", taught: false, sourcesOpen: true };
  expect(brainTitleFor(learned, { canManage: false })).toBe("T");
  expect(brainTitleFor({ ...learned, sourcesOpen: false }, { canManage: false })).toBeNull();
  expect(brainTitleFor({ ...learned, taught: true }, { canManage: false })).toBeNull();
  expect(brainTitleFor({ ...learned, taught: true }, { canManage: true })).toBe("T");
  expect(brainTitleFor({ ...learned, taught: true }, { canManage: false, insidePod: true })).toBe("T");

  const many = Array.from({ length: BRAIN_POINTS_MAX + 10 }, (_, i) => ({ id: i, fresh: i === 0, use: i === 1 ? 50 : 0, createdAt: i }));
  const { kept, dropped } = choosePoints(many);
  expect(kept).toHaveLength(BRAIN_POINTS_MAX);
  expect(dropped).toHaveLength(10);
  // New this week first, then most used, then newest.
  expect(kept.slice(0, 3).map((note) => note.id)).toEqual([0, 1, BRAIN_POINTS_MAX + 9]);

  const arcs = chooseArcs([{ a: "x", b: "y", count: 1 }, { a: "x", b: "z", count: 5 }, { a: "x", b: "gone", count: 9 }], new Set(["x", "y", "z"]), 1);
  expect(arcs).toEqual([{ a: "x", b: "z", count: 5 }]);

  expect(subjectsOf([
    { at: { kind: "subject", name: "Late" }, createdAt: 50 }, { at: { kind: "subject", name: "Early" }, createdAt: 10 },
    { at: { kind: "subject", name: "Late" }, createdAt: 5 }, { at: { kind: "other" }, createdAt: 1 },
  ]).map((subject) => [subject.name, subject.size])).toEqual([["Late", 2], ["Early", 1]]);
});

test("an operator reads a map as a given person", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const map: any = await t.query(internal.communityBrain.readBrainMapInternal, { communityId: w.communityId, userId: w.memberId });
  expect(map.can_manage).toBe(false);
});
