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
import { ENTITY_NAMES_MAX, type EntityNameRow } from "../shared/entityChips";

// The names of what this reader can open in a community: courses, lessons,
// channels, pods and upcoming events (docs/specs/guide-chips-end-state.md,
// slice 1). The app turns a bold name in the guide's reply into a chip only
// when it is on this list, so a chip never points where the reader can't go.
// Each kind uses the same visibility rule as its own page.

const EVENTS_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;
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
    const shownModuleIds = new Set<string>();
    for (const module of modules) {
      const id = normalizeIdValue(module._id);
      if (!canManage && !liveModuleIds.has(id)) continue;
      shownModuleIds.add(id);
      rows.push({ kind: "course", name: String(module.name ?? ""), id });
    }
    for (const resource of resources) {
      if (resource.role !== "page" || !resource.moduleId) continue;
      const moduleId = normalizeIdValue(resource.moduleId);
      if (!shownModuleIds.has(moduleId)) continue;
      if (!canManage && !communityResourceIsLiveModulePage(resource, liveModuleIds)) continue;
      rows.push({ kind: "lesson", name: String(resource.title ?? ""), id: normalizeIdValue(resource._id), parentId: moduleId });
    }

    // Channels and pods (a pod is an invite-only channel): only those this
    // reader can read.
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channels = await listAuthorizedCommunityChannels({ ctx, communityId: args.communityId, actor });
    for (const channel of channels as any[]) {
      rows.push({
        kind: channel.accessMode === "restricted" ? "pod" : "channel",
        name: String(channel.name ?? ""),
        id: normalizeIdValue(channel._id),
        slug: String(channel.slug ?? ""),
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
      rows.push({ kind: "event", name: String(event.title ?? ""), id: String(event.id), startsAt: event.starts_at ?? null });
    }

    return { entries: rows.filter((row) => row.name.trim()).slice(0, ENTITY_NAMES_MAX) };
  },
});
