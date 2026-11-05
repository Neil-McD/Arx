// The community overview: its lessons and its community notes around the
// community, for members in Studio only. Kept under
// this module's name because cached Studio pages call these two queries by
// name; the old memory store they used to read is gone (POL-39).
import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  normalizeSlug,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  type CommunityResourceLike,
  type CommunityResourceModuleLike,
} from "./communityCore";

const OVERVIEW_DEFAULT_NODE_LIMIT = 80;
const OVERVIEW_MAX_NODE_LIMIT = 120;
const OVERVIEW_MODULE_SCAN_LIMIT = 500;

type NoteRow = { _id: any; slug: string; title: string; updatedAt: number };

function rootId(communityId: any): string {
  return `community:${normalizeIdValue(communityId)}`;
}

async function readOverviewResources(ctx: any, communityId: any, limit: number): Promise<{ rows: CommunityResourceLike[]; hasMore: boolean }> {
  const modules = ((await ctx.db.query("communityResourceModules")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(OVERVIEW_MODULE_SCAN_LIMIT)) as CommunityResourceModuleLike[])
    .filter(communityResourceModuleIsLive)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const liveModuleIds = new Set(modules.map((module) => normalizeIdValue(module._id)));
  const rows: CommunityResourceLike[] = [];
  let hasMore = false;
  for (const module of modules) {
    if (rows.length >= limit) { hasMore = true; break; }
    const page = (await ctx.db.query("communityResources")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id))
      .take(limit - rows.length + 1)) as CommunityResourceLike[];
    for (const row of page) if (communityResourceIsLiveModulePage(row, liveModuleIds) && rows.length < limit) rows.push(row);
    if (page.length > limit - rows.length) hasMore = true;
  }
  return { rows, hasMore };
}

async function readOverviewNotes(ctx: any, communityId: any, limit: number): Promise<{ rows: NoteRow[]; hasMore: boolean }> {
  const rows = (await ctx.db.query("communityNotes")
    .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", communityId))
    .order("desc").take(limit + 1)) as NoteRow[];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

async function buildOverview(ctx: any, community: any, args: { isManager: boolean; limit: number }) {
  const half = Math.max(1, Math.floor(args.limit / 2));
  const [notes, resources] = await Promise.all([
    readOverviewNotes(ctx, community._id, half),
    readOverviewResources(ctx, community._id, args.limit - half),
  ]);
  const root = rootId(community._id);
  const label = (text: string) => text;
  const noteNodes = notes.rows.map((note) => ({
    id: `note:${normalizeIdValue(note._id)}`, lineage_id: `note:${normalizeIdValue(note._id)}`, kind: "directory_node",
    node_id: normalizeIdValue(note._id),
    type: "note", label: label(note.title), title: label(note.title), status: "note", updated_at: toIsoString(note.updatedAt),
  }));
  const resourceNodes = resources.rows.map((row) => ({
    id: `resource_node:${normalizeIdValue(row._id)}`, lineage_id: `resource:${normalizeIdValue(row._id)}`, kind: "resource_node",
    type: "resource", label: label(String(row.title ?? "")), title: label(String(row.title ?? "")), status: "source",
    updated_at: toIsoString(row.updatedAt),
  }));
  const edges = [...noteNodes, ...resourceNodes].map((node) => ({
    id: `edge:${node.id}`, kind: node.kind === "resource_node" ? "resource_edge" : "directory_edge", edge_id: node.id,
    from: root, to: node.id, type: node.kind === "resource_node" ? "contains_resource" : "contains_note", confidence: 1,
    updated_at: node.updated_at,
  }));
  const hasMoreNodes = notes.hasMore || resources.hasMore;
  return {
    community: { id: normalizeIdValue(community._id), name: community.name, slug: community.slug },
    viewer: { is_manager: args.isManager },
    agent: {
      key: "community_agent", status: "not_started", activity_state: "resting", last_run_at: null, last_run_status: null,
      last_wake_reason: null, recent_actions_summary: { applied: 0 }, recent_runs: [],
    },
    graph: {
      root_node_id: root,
      nodes: [
        { id: root, lineage_id: root, kind: "community", community_id: normalizeIdValue(community._id), label: community.name, type: "community" },
        ...noteNodes,
        ...resourceNodes,
      ],
      edges,
      node_limit: args.limit,
      edge_limit: args.limit,
      has_more_nodes: hasMoreNodes,
      has_more_edges: hasMoreNodes,
    },
    memory: {
      total_visible_nodes: noteNodes.length + resourceNodes.length,
      learned_node_count: noteNodes.length,
      source_node_count: resourceNodes.length,
      counts_by_type: { note: noteNodes.length, resource: resourceNodes.length },
      counts_by_status: { note: noteNodes.length, source: resourceNodes.length },
      stale_count: 0,
      contested_count: 0,
      node_counts_are_lower_bound: hasMoreNodes,
      edge_counts_are_lower_bound: hasMoreNodes,
    },
  };
}

export const getCommunityPolynetOverview = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nodeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const { community } = await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const isManager = await requireCommunityManager({ ctx, communityId: args.communityId, userId }).then(() => true, () => false);
    const limit = Math.max(1, Math.min(OVERVIEW_MAX_NODE_LIMIT, Math.floor(args.nodeLimit ?? OVERVIEW_DEFAULT_NODE_LIMIT)));
    return await buildOverview(ctx, community, { isManager, limit });
  },
});

// Retired Nov 5: visitors no longer see any of a community's notes or lessons
// (it leaked activity for unlisted communities, and nothing rendered it). Kept
// by name for one release because cached Studio pages call it; then deleted.
export const resolvePublicCommunityMemoryOverviewBySlug = query({
  args: { communitySlug: v.string() },
  handler: async () => ({ ok: false as const }),
});
