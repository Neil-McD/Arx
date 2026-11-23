import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { canManageCommunityResources } from "./communityResourceShared";
import { resolveCommunityChannelActor } from "./communityChannelAccess";
import { listAuthorizedCommunityChannels } from "./communityChannelCore";
import { eventViewer, visibleEvents } from "./communityEventAudience";
import { expandCommunityEventRows, listCommunityEventExpansionCandidates } from "./communityEvents";
import { ENTITY_NAMES_MAX, clipAbout, type EntityNameRow } from "../shared/entityChips";
import { lessonVideoProvider } from "../shared/videoEmbed";
import { podRecord } from "./communityPods";

// The names of what this reader can open in a community: courses, lessons,
// channels, pods and upcoming events (docs/specs/guide-chips-end-state.md,
// slice 1). The app turns a bold name in the guide's reply into a chip only
// when it is on this list, so a chip never points where the reader can't go.
// Each kind uses the same visibility rule as its own page.

// Inside what the Events page loads (today - 21 days to + 40,
// getWebCommunityEventsListRange), so a chip always opens its event.
const EVENTS_AHEAD_MS = 35 * 24 * 60 * 60 * 1000;
const EVENTS_MAX = 100;

export const listEntityNamesForViewer = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const rows: EntityNameRow[] = [];

    // Courses and lessons: members see published ones; hosts see drafts too,
    // as on Knowledge.
    const canManage = await canManageCommunityResources({ ctx, communityId: args.communityId, userId });
    const [modules, resources] = await Promise.all([
      ctx.db.query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect() as Promise<any[]>,
      ctx.db.query("communityResources" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect() as Promise<any[]>,
    ]);
    const liveModuleIds = new Set(modules.filter(communityResourceModuleIsLive).map((row) => normalizeIdValue(row._id)));
    // This reader's finished lessons, for progress on the cards.
    const finished = new Set(((await ctx.db.query("communityLessonProgress" as any)
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", userId))
      .collect()) as any[]).map((row) => normalizeIdValue(row.resourceId)));
    const shownModules = modules
      .filter((module) => canManage || liveModuleIds.has(normalizeIdValue(module._id)))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const moduleNames = new Map(shownModules.map((module) => [normalizeIdValue(module._id), String(module.name ?? "")]));
    // Each course's lessons this reader can open, in course order.
    const lessonsByModule = new Map<string, any[]>();
    for (const resource of resources) {
      if (resource.role !== "page" || !resource.moduleId) continue;
      const moduleId = normalizeIdValue(resource.moduleId);
      if (!moduleNames.has(moduleId)) continue;
      if (!canManage && !communityResourceIsLiveModulePage(resource, liveModuleIds)) continue;
      lessonsByModule.set(moduleId, [...(lessonsByModule.get(moduleId) ?? []), resource]);
    }
    for (const module of shownModules) {
      const id = normalizeIdValue(module._id);
      const lessons = (lessonsByModule.get(id) ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const done = lessons.filter((lesson) => finished.has(normalizeIdValue(lesson._id))).length;
      const next = lessons.find((lesson) => !finished.has(normalizeIdValue(lesson._id))) ?? null;
      rows.push({ kind: "course", name: String(module.name ?? ""), id, facts: {
        about: clipAbout(module.descriptionMd), lessons: lessons.length, done,
        nextLessonId: next ? normalizeIdValue(next._id) : null, nextLessonTitle: next ? String(next.title ?? "") : null,
      } });
      for (const lesson of lessons) {
        const lessonId = normalizeIdValue(lesson._id);
        rows.push({ kind: "lesson", name: String(lesson.title ?? ""), id: lessonId, parentId: id, facts: {
          courseName: moduleNames.get(id) ?? null, finished: finished.has(lessonId), hasVideo: Boolean(lessonVideoProvider(lesson.url)),
        } });
      }
    }

    // Channels and pods (a pod is an invite-only channel): only those this
    // reader can read.
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channels = await listAuthorizedCommunityChannels({ ctx, communityId: args.communityId, actor });
    for (const channel of channels as any[]) {
      const isPod = channel.accessMode === "restricted";
      const pod = isPod ? await podRecord(ctx, args.communityId, channel._id) : null;
      rows.push({
        kind: isPod ? "pod" : "channel",
        name: String(channel.name ?? ""),
        id: normalizeIdValue(channel._id),
        slug: String(channel.slug ?? ""),
        facts: isPod
          ? { about: clipAbout((pod as any)?.purpose), seats: typeof (pod as any)?.seats === "number" ? (pod as any).seats : null }
          : { about: clipAbout(channel.description) },
      });
    }

    // Upcoming events this reader may see; a repeating event once, at its next time.
    const nowMs = Date.now();
    const candidates = await listCommunityEventExpansionCandidates({
      ctx, communityId: args.communityId, startMs: nowMs, endMs: nowMs + EVENTS_AHEAD_MS, includeCancelled: false,
    });
    const visible = await visibleEvents(candidates, eventViewer(ctx, args.communityId, userId));
    const upcoming = expandCommunityEventRows({
      rows: visible, startMs: nowMs, endMs: nowMs + EVENTS_AHEAD_MS, includeCancelled: false, limit: EVENTS_MAX,
    });
    const seenEvents = new Set<string>();
    for (const event of upcoming) {
      const parent = String(event.parent_event_id ?? event.id);
      if (seenEvents.has(parent)) continue;
      seenEvents.add(parent);
      const repeats = event.recurrence_frequency;
      rows.push({ kind: "event", name: String(event.title ?? ""), id: String(event.id), startsAt: event.starts_at ?? null, facts: {
        where: (event.location_type as any) ?? null, place: event.location_label ?? null,
        repeats: repeats === "daily" || repeats === "weekly" || repeats === "monthly" ? repeats : null,
      } });
    }

    return { entries: rows.filter((row) => row.name.trim()).slice(0, ENTITY_NAMES_MAX) };
  },
});
