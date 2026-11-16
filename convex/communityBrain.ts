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
import { evidenceFacts, liveLessons, podRoom } from "./communityMemory";
import { communityScopeKey, notesByUpdated, podScopeKey, type ScopeKey } from "./communityNotesStore";
import { knowledgeUseFor } from "./communityKnowledgeUse";
import { COMMUNITY_NOTES_MAX_PER_COMMUNITY } from "../shared/communityNotes";
import { memoryEvidenceRefusal, noteAuthorKind, parseMemoryAbout, parseMemoryEvidenceRef } from "../shared/communityMemory";
import {
  BRAIN_FRESH_MS, attachKey, brainTitleFor, chooseArcs, choosePoints, subjectsOf,
  type BrainAttach, type BrainCourse, type BrainMap, type BrainNoteInput, type BrainPod,
} from "../shared/communityBrain";

const PODS_MAX = 50;

// One note, as the map sees it before this viewer's rules: who wrote it,
// whether its posts are still readable, whether they are the viewer's own.
async function noteInput(ctx: any, communityId: any, scope: ScopeKey, row: any, viewerId: string, at: BrainAttach): Promise<BrainNoteInput> {
  const taught = noteAuthorKind(row) !== "guide";
  let sourcesOpen = !taught && (row.evidenceRefs ?? []).length > 0;
  let mine = false;
  for (const raw of (row.evidenceRefs ?? []) as string[]) {
    const ref = parseMemoryEvidenceRef(raw);
    if (!ref) { sourcesOpen = false; continue; }
    if (sourcesOpen && memoryEvidenceRefusal(await evidenceFacts(ctx, communityId, ref, scope))) sourcesOpen = false;
    const post: any = await ctx.db.get(ctx.db.normalizeId(ref.kind === "post" ? "communityInteractionRoots" : "communityInteractionReplies", ref.id)!);
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

async function brainMap(ctx: any, args: { communityId: any; userId: any; podChannelId?: any }): Promise<BrainMap> {
  const community: any = await ctx.db.get(args.communityId);
  const canManage = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId }).then(() => true, () => false);
  const viewerId = String(args.userId);
  const nowMs = Date.now();
  const use = await knowledgeUseFor(ctx, args.communityId, nowMs);
  const useOf = (ref: string) => use.use[ref] ?? 0;

  let room: any = null;
  if (args.podChannelId) {
    room = await podRoom(ctx, args.communityId, args.podChannelId);
    if (!room) throw new Error("community_pod_not_found");
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    if (!(await getCommunityChannelCapabilities({ ctx, channel: room, actor })).canRead) throw new Error("community_pod_not_found");
  }

  const inputs: BrainNoteInput[] = [];
  const courses: BrainCourse[] = [];
  const pods: BrainPod[] = [];
  if (room) {
    // A pod's map: its own things, filed by subject. Everyone reading it is in the pod.
    const scope = podScopeKey(room._id);
    for (const row of await notesByUpdated(ctx, scope).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY)) {
      inputs.push(await noteInput(ctx, args.communityId, scope, row, viewerId, attachOf(row, new Set(), null)));
    }
  } else {
    const lessons = await liveLessons(ctx, args.communityId);
    const done = new Set<string>();
    for (const lesson of lessons) {
      const row = await ctx.db.query("communityLessonProgress")
        .withIndex("by_user_resource", (q: any) => q.eq("userId", args.userId).eq("resourceId", lesson.id)).first();
      if (row) done.add(String(lesson.id));
    }
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
      inputs.push(await noteInput(ctx, args.communityId, scope, row, viewerId, attachOf(row, lessonIds, null)));
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
      for (const row of rows) inputs.push({ ...(await noteInput(ctx, args.communityId, scope, row, viewerId, attachOf(row, new Set(), podId))), sourcesOpen: true });
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

// Operator diagnostic: a map as a given person sees it (staging acceptance).
export const readBrainMapInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), podChannelId: v.optional(v.id("communityChannels")) },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    return await brainMap(ctx, args);
  },
});
