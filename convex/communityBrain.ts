// The community brain's read (shared/communityBrain.ts): everything the map
// draws, for whoever is looking. The community's map holds its courses and
// lessons, what the guide learned and where each is filed, the pods the
// viewer is in, and what answers use together; a pod's map holds that pod's
// own things. A member is shown only names they may read (the rules are in
// shared/communityBrain.ts). One read, no model call.
import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { listAuthorizedCommunityChannelPage } from "./communityChannelCore";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { MAP_LESSONS, docReader, evidenceFacts, liveLessons, podRoom, type DocReader } from "./communityMemory";
import { communityScopeKey, notesByUpdated, podScopeKey, type ScopeKey } from "./communityNotesStore";
import { knowledgeUseFor } from "./communityKnowledgeUse";
import { podRecord, podVisibilityOf } from "./communityPods";
import { COMMUNITY_NOTES_MAX_PER_COMMUNITY } from "../shared/communityNotes";
import { memoryEvidenceRefusal, noteAuthorKind, parseMemoryAbout, parseMemoryEvidenceRef } from "../shared/communityMemory";
import {
  BRAIN_FRESH_MS, attachKey, brainShapeOf, brainTitleFor, chooseArcs, choosePoints, subjectsOf,
  type BrainAttach, type BrainCourse, type BrainMap, type BrainNoteInput, type BrainPod,
} from "../shared/communityBrain";

const PODS_MAX = 50;

// One note, as the map sees it before this viewer's rules: who wrote it,
// whether its posts are still readable, whether they are the viewer's own.
// The posts are checked live on every load (a removed post hides the name at
// once), each record read once through `reader`. checkSources false: this
// viewer reads every name anyway (a builder, or someone in the pod), so only
// "is it from my posts" is read.
export async function noteInput(ctx: any, communityId: any, scope: ScopeKey, row: any, viewerId: string, at: BrainAttach, opts: { reader: DocReader; checkSources: boolean }): Promise<BrainNoteInput> {
  // Taught: a host wrote it in Knowledge. Notes the guide saved from
  // conversations before it cited posts (source ask, tag, migrated) were
  // learned, not taught; with no posts to check, members see no name.
  const taught = row.source === "founder";
  let sourcesOpen = opts.checkSources && noteAuthorKind(row) === "guide" && (row.evidenceRefs ?? []).length > 0;
  let mine = false;
  for (const raw of (row.evidenceRefs ?? []) as string[]) {
    const ref = parseMemoryEvidenceRef(raw);
    if (!ref) { sourcesOpen = false; continue; }
    if (sourcesOpen && memoryEvidenceRefusal(await evidenceFacts(ctx, communityId, ref, scope, opts.reader))) sourcesOpen = false;
    const postId = ctx.db.normalizeId(ref.kind === "post" ? "communityInteractionRoots" : "communityInteractionReplies", ref.id);
    const post: any = postId ? await opts.reader.get(postId) : null;
    if (post?.actorUserId && String(post.actorUserId) === viewerId) mine = true;
  }
  return { id: `note:${String(row._id)}`, title: String(row.title), taught, sourcesOpen, mine, createdAt: Number(row.createdAt), at };
}

// Where a note hangs on the community's map: its lesson while that lesson is
// still one members are shown, else its subject, else nowhere yet.
function attachOf(row: any, lessonIds: ReadonlySet<string>, inPod: string | null): BrainAttach {
  if (inPod) return { kind: "pod", id: inPod };
  if (row.aboutLessonId && lessonIds.has(String(row.aboutLessonId))) return { kind: "lesson", id: `resource:${String(row.aboutLessonId)}` };
  const subject = row.subject ? parseMemoryAbout(row.subject) : null;
  return subject?.kind === "subject" ? { kind: "subject", name: subject.name } : { kind: "other" };
}

// Which of these lessons this person has finished. One read of their
// finished lessons rather than one per lesson; someone with more finished
// lessons than the read holds is asked lesson by lesson instead.
const PROGRESS_READ = 4_000;
async function lessonsDone(ctx: any, userId: any, lessonIds: any[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (lessonIds.length === 0) return done;
  const wanted = new Set(lessonIds.map(String));
  const rows: any[] = await ctx.db.query("communityLessonProgress").withIndex("by_user_resource", (q: any) => q.eq("userId", userId)).take(PROGRESS_READ);
  if (rows.length < PROGRESS_READ) {
    for (const row of rows) if (wanted.has(String(row.resourceId))) done.add(String(row.resourceId));
    return done;
  }
  for (const id of lessonIds) {
    const row = await ctx.db.query("communityLessonProgress").withIndex("by_user_resource", (q: any) => q.eq("userId", userId).eq("resourceId", id)).first();
    if (row) done.add(String(id));
  }
  return done;
}

// outsideShape: a listed pod's map for someone not in it, which the caller
// turns into its nameless shape (getPodBrainShape) before it leaves here.
async function brainMap(ctx: any, args: { communityId: any; userId: any; podChannelId?: any; outsideShape?: boolean }): Promise<BrainMap> {
  const community: any = await ctx.db.get(args.communityId);
  const canManage = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId }).then(() => true, () => false);
  const viewerId = String(args.userId);
  const nowMs = Date.now();
  const use = await knowledgeUseFor(ctx, args.communityId, nowMs);
  const useOf = (ref: string) => use.use[ref] ?? 0;
  const reader = docReader(ctx);

  let room: any = null;
  if (args.podChannelId) {
    room = await podRoom(ctx, args.communityId, args.podChannelId);
    if (!room) throw new Error("community_pod_not_found");
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    if (!args.outsideShape && !(await getCommunityChannelCapabilities({ ctx, channel: room, actor })).canRead) throw new Error("community_pod_not_found");
  }

  const inputs: BrainNoteInput[] = [];
  const courses: BrainCourse[] = [];
  const pods: BrainPod[] = [];
  if (room) {
    // A pod's map: its own things, filed by subject. Everyone reading it is in the pod.
    const scope = podScopeKey(room._id);
    for (const row of await notesByUpdated(ctx, scope).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY)) {
      inputs.push(await noteInput(ctx, args.communityId, scope, row, viewerId, attachOf(row, new Set(), null), { reader, checkSources: false }));
    }
  } else {
    // Every course whole: a map that silently dropped lessons would be wrong.
    const lessons = await liveLessons(ctx, args.communityId, MAP_LESSONS);
    const done = await lessonsDone(ctx, args.userId, lessons.map((lesson) => lesson.id));
    const byCourse = new Map<string, BrainCourse>();
    for (const lesson of lessons) {
      const key = String(lesson.courseId);
      if (!byCourse.has(key)) byCourse.set(key, { id: `course:${key}`, name: lesson.course, order: lesson.courseOrder, lessons: [] });
      const ref = `resource:${String(lesson.id)}`;
      byCourse.get(key)!.lessons.push({ id: ref, title: lesson.title, order: lesson.order, done: done.has(String(lesson.id)), use: useOf(ref) });
    }
    courses.push(...[...byCourse.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
    const lessonIds = new Set(lessons.map((lesson) => String(lesson.id)));
    const scope = communityScopeKey(args.communityId);
    for (const row of await notesByUpdated(ctx, scope).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY)) {
      inputs.push(await noteInput(ctx, args.communityId, scope, row, viewerId, attachOf(row, lessonIds, null), { reader, checkSources: !canManage }));
    }

    // Pods: the ones this viewer can enter, with their things; a listed one
    // they can't, as a count; a hidden one they can't, not at all.
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    const { page } = await listAuthorizedCommunityChannelPage({ ctx, communityId: args.communityId, actor, section: "private", paginationOpts: { cursor: null, numItems: PODS_MAX } });
    const inside = new Set<string>();
    for (const channel of page as any[]) {
      const record = await ctx.db.query("communityPods")
        .withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId).eq("channelId", channel._id)).first();
      if (!record) continue;
      inside.add(String(channel._id));
      const podId = `pod:${String(channel._id)}`;
      const scope = podScopeKey(channel._id);
      const rows = await notesByUpdated(ctx, scope).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY);
      for (const row of rows) inputs.push(await noteInput(ctx, args.communityId, scope, row, viewerId, attachOf(row, new Set(), podId), { reader, checkSources: false }));
      pods.push({ id: podId, name: String(channel.name ?? ""), inside: true, count: rows.length });
    }
    const records: any[] = await ctx.db.query("communityPods")
      .withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId)).take(PODS_MAX);
    for (const record of records) {
      if (record.visibility !== "listed" || inside.has(String(record.channelId))) continue;
      const channel: any = await ctx.db.get(record.channelId);
      if (!channel || channel.status !== "active") continue;
      const count = (await notesByUpdated(ctx, podScopeKey(channel._id)).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY)).length;
      pods.push({ id: `pod:${String(channel._id)}`, name: String(channel.name ?? ""), inside: false, count });
    }
  }

  // This viewer's rules, then the cap.
  const insidePodMap = Boolean(room);
  const scored = inputs.map((input) => ({ ...input, fresh: nowMs - input.createdAt <= BRAIN_FRESH_MS, use: useOf(input.id) }));
  const { kept, dropped } = choosePoints(scored);
  const hidden: Record<string, number> = {};
  for (const note of dropped) hidden[attachKey(note.at)] = (hidden[attachKey(note.at)] ?? 0) + 1;
  const points = kept.map((note) => ({
    id: note.id,
    title: brainTitleFor(note, { canManage, insidePod: insidePodMap || note.at.kind === "pod" }),
    kind: note.taught ? "taught" as const : "learned" as const,
    at: note.at, learned_at: new Date(note.createdAt).toISOString(), fresh: note.fresh, use: note.use, mine: note.mine,
  })).sort((a, b) => a.learned_at.localeCompare(b.learned_at) || a.id.localeCompare(b.id));

  const drawn = new Set<string>([...points.map((point) => point.id), ...courses.flatMap((course) => course.lessons.map((lesson) => lesson.id))]);
  const communityThings = inputs.filter((input) => input.at.kind !== "pod");
  return {
    center: room ? { name: String(room.name ?? ""), kind: "pod" } : { name: String(community?.name ?? ""), kind: "community" },
    counts: {
      courses: courses.length,
      lessons: courses.reduce((sum, course) => sum + course.lessons.length, 0),
      learned: communityThings.length,
      this_week: communityThings.filter((input) => nowMs - input.createdAt <= BRAIN_FRESH_MS).length,
    },
    can_manage: canManage,
    courses,
    subjects: subjectsOf(inputs),
    points,
    pods,
    arcs: chooseArcs(use.together, drawn),
    hidden,
  };
}

export const getBrainMap = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), podChannelId: v.optional(v.id("communityChannels")) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    return await brainMap(ctx, { communityId: args.communityId, userId, podChannelId: args.podChannelId });
  },
});

// A listed pod's map for a member outside it: its shape only (shared/communityBrain.ts
// brainShapeOf), never a name or a word of what it knows. A hidden pod, or
// someone not in the community, gets nothing.
export const getPodBrainShape = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), podChannelId: v.id("communityChannels") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const record = await podRecord(ctx, args.communityId, args.podChannelId);
    if (podVisibilityOf(record) !== "listed") throw new Error("community_pod_not_found");
    return brainShapeOf(await brainMap(ctx, { communityId: args.communityId, userId, podChannelId: args.podChannelId, outsideShape: true }));
  },
});

// Operator diagnostic: a map as a given person sees it (staging acceptance).
export const readBrainMapInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), podChannelId: v.optional(v.id("communityChannels")) },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    return await brainMap(ctx, args);
  },
});

// One learned thing on the map, picked: what this viewer may read of it. A
// member gets its name (only if they may read it), where it sits, when it was
// learned and what it is answered with; a builder also gets its text and
// slug, to open its sources and correct it. A pod's thing is for people in
// the pod. Never who said it.
export const getBrainNote = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), noteId: v.string() },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const id = ctx.db.normalizeId("communityNotes", args.noteId.replace(/^note:/, ""));
    const row: any = id ? await ctx.db.get(id) : null;
    if (!row || String(row.communityId) !== String(args.communityId)) throw new Error("semantic_not_found");
    const canManage = await requireCommunityManager({ ctx, communityId: args.communityId, userId }).then(() => true, () => false);
    const scope = (row.scopeKey ?? communityScopeKey(args.communityId)) as ScopeKey;
    let insidePod = false;
    if (scope.startsWith("pod:")) {
      const room = await podRoom(ctx, args.communityId, scope.slice(4));
      const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
      if (!room || !(await getCommunityChannelCapabilities({ ctx, channel: room, actor })).canRead) throw new Error("semantic_not_found");
      insidePod = true;
    }
    const lessons = scope.startsWith("pod:") ? [] : await liveLessons(ctx, args.communityId, MAP_LESSONS);
    const lessonIds = new Set(lessons.map((lesson) => String(lesson.id)));
    const reader = docReader(ctx);
    const checkSources = !canManage && !insidePod;
    const input = await noteInput(ctx, args.communityId, scope, row, String(userId), attachOf(row, lessonIds, null), { reader, checkSources });
    const title = brainTitleFor(input, { canManage, insidePod });
    const lesson = row.aboutLessonId && lessonIds.has(String(row.aboutLessonId)) ? lessons.find((entry) => String(entry.id) === String(row.aboutLessonId)) : null;
    // What answers read it with, among things this viewer may name.
    const use = await knowledgeUseFor(ctx, args.communityId, Date.now());
    const ref = `note:${String(row._id)}`;
    const partners: Array<{ id: string; title: string; count: number }> = [];
    for (const pair of use.together) {
      if (partners.length >= 3) break;
      const other = pair.a === ref ? pair.b : pair.b === ref ? pair.a : null;
      if (!other) continue;
      if (other.startsWith("resource:")) {
        const found = lessons.find((entry) => `resource:${String(entry.id)}` === other);
        if (found) partners.push({ id: other, title: found.title, count: pair.count });
        continue;
      }
      const otherId = ctx.db.normalizeId("communityNotes", other.replace(/^note:/, ""));
      const otherRow: any = otherId ? await ctx.db.get(otherId) : null;
      if (!otherRow || otherRow.scopeKey !== row.scopeKey) continue;
      const otherInput = await noteInput(ctx, args.communityId, scope, otherRow, String(userId), attachOf(otherRow, lessonIds, null), { reader, checkSources });
      const otherTitle = brainTitleFor(otherInput, { canManage, insidePod });
      if (otherTitle) partners.push({ id: other, title: otherTitle, count: pair.count });
    }
    return {
      id: ref,
      title,
      kind: input.taught ? "taught" as const : "learned" as const,
      learned_at: new Date(input.createdAt).toISOString(),
      at: input.at,
      lesson: lesson ? { id: `resource:${String(lesson.id)}`, title: lesson.title, course: lesson.course, order: lesson.order } : null,
      use: use.use[ref] ?? 0,
      with: partners,
      mine: input.mine,
      // A builder's only: the words, and the name the note goes by.
      ...(canManage ? { body_md: String(row.bodyMd ?? ""), slug: String(row.slug) } : {}),
    };
  },
});
