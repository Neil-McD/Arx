import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

const MAX_ACTIVE_CLOUD_PROJECTS_PER_USER = 5;

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

async function resolveOwnerIdForAuthenticatedRequest(args: {
  ctx: any;
  ownerId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const ownerIdInput = normalizeIdValue(args.ownerId);
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const user = await args.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
    .first();
  if (!user) throw new Error("user_not_found");
  const resolvedOwnerId = normalizeIdValue(user._id);
  if (ownerIdInput && ownerIdInput !== resolvedOwnerId) {
    throw new Error("owner_id_mismatch");
  }
  return user._id;
}

function normalizeProjectName(raw: string): string {
  const cleaned = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) throw new Error("project_name_required");
  return cleaned.slice(0, 80);
}

function slugifyProjectName(raw: string): string {
  const base = normalizeProjectName(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "project";
}

async function listActiveProjectsByOwner(ctx: any, ownerId: any) {
  const rows = await ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", ownerId))
    .collect();
  return rows.filter((row: any) => row.status === "active");
}

async function ensureDefaultProjectInternal(args: {
  ctx: any;
  ownerId: any;
  nowMs: number;
}) {
  const existingGeneral = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner_slug", (q: any) => q.eq("ownerId", args.ownerId).eq("slug", "general"))
    .first();
  if (existingGeneral) {
    if (existingGeneral.status !== "active") {
      await args.ctx.db.patch(existingGeneral._id, { status: "active", updatedAt: args.nowMs });
    }
    const refreshed = await args.ctx.db.get(existingGeneral._id);
    return refreshed ?? existingGeneral;
  }

  const activeRows = await listActiveProjectsByOwner(args.ctx, args.ownerId);
  if (activeRows.length >= MAX_ACTIVE_CLOUD_PROJECTS_PER_USER) {
    throw new Error("project_limit_reached");
  }

  const id = await args.ctx.db.insert("cloudProjects", {
    ownerId: args.ownerId,
    name: "General",
    slug: "general",
    description: "Default cloud project",
    status: "active",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await args.ctx.db.get(id);
  if (!created) throw new Error("project_create_failed");
  return created;
}

async function reserveUniqueSlug(args: {
  ctx: any;
  ownerId: any;
  baseSlug: string;
  excludeProjectId?: any;
}): Promise<string> {
  const normalizedBase = String(args.baseSlug ?? "").trim() || "project";
  for (let suffix = 0; suffix < 300; suffix += 1) {
    const candidate = suffix === 0 ? normalizedBase : `${normalizedBase}-${suffix + 1}`;
    const existing = await args.ctx.db
      .query("cloudProjects")
      .withIndex("by_owner_slug", (q: any) => q.eq("ownerId", args.ownerId).eq("slug", candidate))
      .first();
    if (!existing) return candidate;
    if (args.excludeProjectId && existing._id === args.excludeProjectId) return candidate;
  }
  throw new Error("project_slug_unavailable");
}

export const listCloudProjectsByOwner = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const rows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const filtered = args.includeArchived ? rows : rows.filter((row) => row.status === "active");
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const ensureDefaultCloudProjectForOwner = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    return await ensureDefaultProjectInternal({
      ctx,
      ownerId,
      nowMs,
    });
  },
});

export const createCloudProject = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const name = normalizeProjectName(args.name);
    const activeRows = await listActiveProjectsByOwner(ctx, ownerId);
    if (activeRows.length >= MAX_ACTIVE_CLOUD_PROJECTS_PER_USER) {
      throw new Error("project_limit_reached");
    }
    const slug = await reserveUniqueSlug({
      ctx,
      ownerId,
      baseSlug: slugifyProjectName(name),
    });
    const description = String(args.description ?? "").trim() || undefined;
    const id = await ctx.db.insert("cloudProjects", {
      ownerId,
      name,
      slug,
      description,
      status: "active",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("project_create_failed");
    return created;
  },
});

export const renameCloudProject = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    name: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db.get(args.projectId);
    if (!existing) throw new Error("project_not_found");
    if (existing.ownerId !== ownerId) throw new Error("project_access_denied");

    const name = normalizeProjectName(args.name);
    const slug = await reserveUniqueSlug({
      ctx,
      ownerId,
      baseSlug: slugifyProjectName(name),
      excludeProjectId: existing._id,
    });

    await ctx.db.patch(existing._id, {
      name,
      slug,
      updatedAt: nowMs,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) throw new Error("project_not_found");
    return updated;
  },
});

export const deleteCloudProject = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db.get(args.projectId);
    if (!existing) throw new Error("project_not_found");
    if (existing.ownerId !== ownerId) throw new Error("project_access_denied");
    if (String(existing.slug ?? "").trim().toLowerCase() === "general") {
      throw new Error("general_project_protected");
    }

    const generalProject = await ensureDefaultProjectInternal({
      ctx,
      ownerId,
      nowMs,
    });

    const projectThreads = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", existing._id))
      .collect();
    let movedThreadCount = 0;
    for (const thread of projectThreads) {
      if (thread.ownerId !== ownerId) continue;
      if (thread.context !== "cloud") continue;
      await ctx.db.patch(thread._id, {
        projectId: generalProject._id,
        updatedAt: nowMs,
      });
      movedThreadCount += 1;
    }

    await ctx.db.patch(existing._id, {
      status: "archived",
      updatedAt: nowMs,
    });

    return {
      ok: true,
      movedThreadCount,
      generalProjectId: generalProject._id,
    };
  },
});

export const getCloudProjectById = query({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row) return null;
    const ownerId = args.authSubject
      ? await resolveOwnerIdForAuthenticatedRequest({
          ctx,
          ownerId: args.ownerId,
          authSubject: args.authSubject ?? null,
        })
      : args.ownerId;
    if (ownerId && row.ownerId !== ownerId) return null;
    return row;
  },
});

export const getCloudProjectBySlug = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner_slug", (q) => q.eq("ownerId", ownerId).eq("slug", args.slug))
      .first();
    return row ?? null;
  },
});

export const probeCloudProject = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("project_not_found");
    if (project.ownerId !== ownerId) throw new Error("project_access_denied");

    const status = String(project.status ?? "active").trim().toLowerCase() || "active";
    const label =
      String(project.name ?? "").trim() ||
      String(project.slug ?? "").trim() ||
      String(project._id ?? "").trim() ||
      "project";

    return {
      ok: true,
      sandbox: {
        status,
      },
      probe: {
        stdout_preview: `convex project probe ok (${label})`,
      },
    };
  },
});
