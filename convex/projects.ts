import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";
import { loadDaytonaConfig, type DaytonaConfig } from "./httpDaytona";

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
    providerSandboxId: undefined,
    providerSandboxState: undefined,
    providerSandboxLastSeenAt: undefined,
    providerVolumeId: undefined,
    providerVolumeName: undefined,
    providerVolumeState: undefined,
    providerVolumeLastSeenAt: undefined,
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

function normalizeOptionalVolumeValue(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function buildProjectVolumeName(project: { slug?: unknown; _id?: unknown }): string {
  const slug = String(project.slug ?? "").trim().toLowerCase() || "project";
  const safeSlug = slug.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const projectId = normalizeIdValue(project._id);
  if (!projectId) throw new Error("project_id_required");
  return `arx-${safeSlug}-${projectId}`;
}

type DaytonaVolumeApiDto = {
  id?: string | null;
  name?: string | null;
  state?: string | null;
  status?: string | null;
};

type DaytonaSandboxApiDto = {
  id?: string | null;
  state?: string | null;
  status?: string | null;
};

function daytonaHeaders(config: DaytonaConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  if (config.orgId) headers["X-Daytona-Organization-ID"] = config.orgId;
  return headers;
}

async function parseDaytonaResponseBody(response: Response): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text();
  if (!text.trim()) return { text, json: null };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null };
  }
}

async function daytonaVolumeRequest<T>(params: {
  config: DaytonaConfig;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown> | null;
}): Promise<
  | { ok: true; payload: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  let response: Response;
  try {
    response = await fetch(`${params.config.apiBaseUrl}${params.path}`, {
      method: params.method,
      headers: daytonaHeaders(params.config),
      ...(params.body ? { body: JSON.stringify(params.body) } : null),
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: error instanceof Error ? error.message : "Daytona API request failed.",
    };
  }
  const { text, json } = await parseDaytonaResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: response.status === 404 ? "not_found" : "runner_unavailable",
      message: `Daytona API ${params.method} ${params.path} failed (${response.status}).`,
      details: {
        response_text: text.slice(0, 2000),
      },
    };
  }
  if (!json || typeof json !== "object") {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: `Daytona API ${params.path} returned invalid JSON.`,
    };
  }
  return {
    ok: true,
    payload: json as T,
  };
}

async function fetchDaytonaVolumeByName(params: {
  config: DaytonaConfig;
  volumeName: string;
}) {
  return await daytonaVolumeRequest<DaytonaVolumeApiDto>({
    config: params.config,
    path: `/volumes/by-name/${encodeURIComponent(params.volumeName)}`,
    method: "GET",
  });
}

async function fetchDaytonaVolumeById(params: {
  config: DaytonaConfig;
  volumeId: string;
}) {
  return await daytonaVolumeRequest<DaytonaVolumeApiDto>({
    config: params.config,
    path: `/volumes/${encodeURIComponent(params.volumeId)}`,
    method: "GET",
  });
}

async function createDaytonaVolume(params: {
  config: DaytonaConfig;
  volumeName: string;
}) {
  return await daytonaVolumeRequest<DaytonaVolumeApiDto>({
    config: params.config,
    path: "/volumes",
    method: "POST",
    body: {
      name: params.volumeName,
    },
  });
}

async function fetchDaytonaSandboxById(params: {
  config: DaytonaConfig;
  sandboxId: string;
}) {
  return await daytonaVolumeRequest<DaytonaSandboxApiDto>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}`,
    method: "GET",
  });
}

function normalizeDaytonaVolumeState(volume: DaytonaVolumeApiDto | null | undefined): string | undefined {
  const normalized = String(volume?.state ?? volume?.status ?? "").trim().toLowerCase();
  return normalized || undefined;
}

function isReadyDaytonaVolumeState(state: string | null | undefined): boolean {
  const normalized = String(state ?? "").trim().toLowerCase();
  return !normalized || normalized === "ready" || normalized === "available" || normalized === "created";
}

function normalizeDaytonaSandboxState(sandbox: DaytonaSandboxApiDto | null | undefined): string | undefined {
  const normalized = String(sandbox?.state ?? sandbox?.status ?? "").trim().toLowerCase();
  return normalized || undefined;
}

async function waitForDaytonaVolumeReady(params: {
  config: DaytonaConfig;
  volumeId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<DaytonaVolumeApiDto> {
  const timeoutMs = Math.max(1000, Math.floor(params.timeoutMs ?? 15_000));
  const intervalMs = Math.max(250, Math.floor(params.intervalMs ?? 1000));
  const startedAt = Date.now();
  let lastSeen: DaytonaVolumeApiDto = { id: params.volumeId };
  while (Date.now() - startedAt < timeoutMs) {
    const lookup = await fetchDaytonaVolumeById({
      config: params.config,
      volumeId: params.volumeId,
    });
    if (!lookup.ok) {
      if (lookup.status === 404) break;
      throw new Error(lookup.message);
    }
    lastSeen = lookup.payload;
    if (isReadyDaytonaVolumeState(normalizeDaytonaVolumeState(lookup.payload))) {
      return lookup.payload;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return lastSeen;
}

async function resolveActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ authSubject: string; userId: any }> {
  const actor = (await args.ctx.runQuery(api.auth.getActor as any, {
    authState: "authenticated",
    authSubject: args.authSubject ?? undefined,
  })) as { authSubject?: unknown } | null;
  const authSubject = normalizeIdValue(actor?.authSubject);
  if (!authSubject) throw new Error("authenticated_user_required");
  const userId = await args.ctx.runQuery(internal.providerConnections.getUserIdByAuthSubjectInternal as any, {
    authSubject,
  });
  if (!userId) throw new Error("authenticated_user_required");
  return { authSubject, userId };
}

export const getCloudProjectByIdInternal = internalQuery({
  args: {
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const attachCloudProjectVolumeInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerVolumeId: v.string(),
    providerVolumeName: v.optional(v.string()),
    providerVolumeState: v.optional(v.string()),
    providerVolumeLastSeenAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.projectId);
    if (!existing) throw new Error("project_not_found");
    const nowMs = args.nowMs ?? Date.now();
    const providerVolumeId = normalizeOptionalVolumeValue(args.providerVolumeId);
    if (!providerVolumeId) throw new Error("provider_volume_id_required");
    const providerVolumeName =
      normalizeOptionalVolumeValue(args.providerVolumeName) ??
      existing.providerVolumeName ??
      providerVolumeId;
    const providerVolumeState =
      normalizeOptionalVolumeValue(args.providerVolumeState) ?? existing.providerVolumeState ?? "ready";
    await ctx.db.patch(existing._id, {
      providerVolumeId,
      providerVolumeName,
      providerVolumeState,
      providerVolumeLastSeenAt: args.providerVolumeLastSeenAt ?? nowMs,
      updatedAt: nowMs,
    });
    return await ctx.db.get(existing._id);
  },
});

export const ensureCloudProjectVolumeInternal = internalAction({
  args: {
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.projects.getCloudProjectByIdInternal as any, {
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_not_found");

    const loadedDaytonaConfig = loadDaytonaConfig();
    if (!loadedDaytonaConfig.ok) {
      throw new Error(loadedDaytonaConfig.message);
    }
    const config = loadedDaytonaConfig.config;
    const expectedVolumeName =
      normalizeOptionalVolumeValue(project.providerVolumeName) ?? buildProjectVolumeName(project);

    let volume: DaytonaVolumeApiDto | null = null;
    const existingVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    if (existingVolumeId) {
      const lookupById = await fetchDaytonaVolumeById({
        config,
        volumeId: existingVolumeId,
      });
      if (lookupById.ok) {
        volume = lookupById.payload;
      } else if (lookupById.status !== 404) {
        throw new Error(lookupById.message);
      }
    }

    if (!volume) {
      const lookupByName = await fetchDaytonaVolumeByName({
        config,
        volumeName: expectedVolumeName,
      });
      if (lookupByName.ok) {
        volume = lookupByName.payload;
      } else if (lookupByName.status !== 404) {
        throw new Error(lookupByName.message);
      }
    }

    if (!volume) {
      const createdVolume = await createDaytonaVolume({
        config,
        volumeName: expectedVolumeName,
      });
      if (!createdVolume.ok) {
        throw new Error(createdVolume.message);
      }
      volume = createdVolume.payload;
    }

    const volumeId = normalizeOptionalVolumeValue(volume.id);
    if (!volumeId) throw new Error("daytona_volume_missing_id");
    const readyVolume = isReadyDaytonaVolumeState(normalizeDaytonaVolumeState(volume))
      ? volume
      : await waitForDaytonaVolumeReady({
          config,
          volumeId,
        });
    const volumeName = normalizeOptionalVolumeValue(readyVolume.name) ?? expectedVolumeName;
    const volumeState = normalizeDaytonaVolumeState(readyVolume) ?? "ready";

    const updated = await ctx.runMutation(internal.projects.attachCloudProjectVolumeInternal as any, {
      projectId: args.projectId,
      providerVolumeId: volumeId,
      providerVolumeName: volumeName,
      providerVolumeState: volumeState,
      providerVolumeLastSeenAt: Date.now(),
      nowMs: Date.now(),
    });
    if (!updated) throw new Error("project_not_found");
    return updated;
  },
});

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

export const ensureDefaultCloudProjectWithVolumeForOwner = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.runMutation(api.projects.ensureDefaultCloudProjectForOwner as any, {
      ownerId: args.ownerId ?? userId,
      authSubject,
      nowMs: args.nowMs,
    });
    if (!row?._id) throw new Error("default_project_missing_id");
    return await ctx.runAction(internal.projects.ensureCloudProjectVolumeInternal as any, {
      projectId: row._id,
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
      providerSandboxId: undefined,
      providerSandboxState: undefined,
      providerSandboxLastSeenAt: undefined,
      providerVolumeId: undefined,
      providerVolumeName: undefined,
      providerVolumeState: undefined,
      providerVolumeLastSeenAt: undefined,
      status: "active",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("project_create_failed");
    return created;
  },
});

export const createCloudProjectWithVolume = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.runMutation(api.projects.createCloudProject as any, {
      ownerId: args.ownerId ?? userId,
      authSubject,
      name: args.name,
      description: args.description,
      nowMs: args.nowMs,
    });
    if (!row?._id) throw new Error("project_create_failed");
    return await ctx.runAction(internal.projects.ensureCloudProjectVolumeInternal as any, {
      projectId: row._id,
    });
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

export const attachCloudProjectVolume = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    providerVolumeId: v.string(),
    providerVolumeName: v.optional(v.string()),
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

    const providerVolumeId = normalizeOptionalVolumeValue(args.providerVolumeId);
    if (!providerVolumeId) throw new Error("provider_volume_id_required");
    const providerVolumeName = normalizeOptionalVolumeValue(args.providerVolumeName) ?? providerVolumeId;

    await ctx.db.patch(existing._id, {
      providerVolumeId,
      providerVolumeName,
      providerVolumeState: "ready",
      providerVolumeLastSeenAt: nowMs,
      updatedAt: nowMs,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) throw new Error("project_not_found");
    return updated;
  },
});

export const ensureCloudProjectVolume = action({
  args: {
    projectId: v.id("cloudProjects"),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId: userId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_access_denied");
    return await ctx.runAction(internal.projects.ensureCloudProjectVolumeInternal as any, {
      projectId: args.projectId,
    });
  },
});

export const recordCloudProjectRuntimeState = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.optional(v.string()),
    providerSandboxState: v.optional(v.string()),
    providerSandboxLastSeenAt: v.optional(v.number()),
    providerVolumeId: v.optional(v.string()),
    providerVolumeName: v.optional(v.string()),
    providerVolumeState: v.optional(v.string()),
    providerVolumeLastSeenAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.projectId);
    if (!existing) throw new Error("project_not_found");
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.patch(existing._id, {
      providerSandboxId: normalizeOptionalVolumeValue(args.providerSandboxId),
      providerSandboxState: normalizeOptionalVolumeValue(args.providerSandboxState),
      providerSandboxLastSeenAt: args.providerSandboxLastSeenAt ?? nowMs,
      providerVolumeId: normalizeOptionalVolumeValue(args.providerVolumeId) ?? existing.providerVolumeId,
      providerVolumeName: normalizeOptionalVolumeValue(args.providerVolumeName) ?? existing.providerVolumeName,
      providerVolumeState: normalizeOptionalVolumeValue(args.providerVolumeState) ?? existing.providerVolumeState,
      providerVolumeLastSeenAt:
        args.providerVolumeLastSeenAt ??
        (args.providerVolumeId || args.providerVolumeState ? nowMs : existing.providerVolumeLastSeenAt),
      updatedAt: nowMs,
    });
    return await ctx.db.get(existing._id);
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

export const probeCloudProject = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId: args.ownerId ?? userId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_access_denied");

    const loadedDaytonaConfig = loadDaytonaConfig();
    if (!loadedDaytonaConfig.ok) {
      return {
        ok: false,
        sandbox: {
          status: String(project.providerSandboxState ?? project.status ?? "active").trim().toLowerCase() || "active",
        },
        probe: {
          stdout_preview: loadedDaytonaConfig.message,
        },
      };
    }

    const config = loadedDaytonaConfig.config;
    const nowMs = Date.now();
    const providerVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    const providerSandboxId = normalizeOptionalVolumeValue(project.providerSandboxId);

    let liveVolumeState = normalizeOptionalVolumeValue(project.providerVolumeState) ?? undefined;
    let liveVolumeName = normalizeOptionalVolumeValue(project.providerVolumeName) ?? undefined;
    if (providerVolumeId) {
      const volumeLookup = await fetchDaytonaVolumeById({
        config,
        volumeId: providerVolumeId,
      });
      if (volumeLookup.ok) {
        liveVolumeState = normalizeDaytonaVolumeState(volumeLookup.payload) ?? liveVolumeState;
        liveVolumeName = normalizeOptionalVolumeValue(volumeLookup.payload.name) ?? liveVolumeName;
      } else if (volumeLookup.status === 404) {
        liveVolumeState = "missing";
      } else {
        return {
          ok: false,
          sandbox: {
            status:
              String(project.providerSandboxState ?? project.status ?? "active").trim().toLowerCase() || "active",
          },
          probe: {
            stdout_preview: volumeLookup.message,
          },
        };
      }
    }

    let liveSandboxState = normalizeOptionalVolumeValue(project.providerSandboxState) ?? undefined;
    if (providerSandboxId) {
      const sandboxLookup = await fetchDaytonaSandboxById({
        config,
        sandboxId: providerSandboxId,
      });
      if (sandboxLookup.ok) {
        liveSandboxState = normalizeDaytonaSandboxState(sandboxLookup.payload) ?? liveSandboxState;
      } else if (sandboxLookup.status === 404) {
        liveSandboxState = "deleted";
      } else {
        return {
          ok: false,
          sandbox: {
            status:
              String(project.providerSandboxState ?? project.status ?? "active").trim().toLowerCase() || "active",
          },
          probe: {
            stdout_preview: sandboxLookup.message,
          },
        };
      }
    }

    await ctx.runMutation(internal.projects.recordCloudProjectRuntimeState as any, {
      projectId: args.projectId,
      providerSandboxId: providerSandboxId ?? undefined,
      providerSandboxState: liveSandboxState ?? undefined,
      providerSandboxLastSeenAt: providerSandboxId ? nowMs : undefined,
      providerVolumeId: providerVolumeId ?? undefined,
      providerVolumeName: liveVolumeName ?? undefined,
      providerVolumeState: liveVolumeState ?? undefined,
      providerVolumeLastSeenAt: providerVolumeId ? nowMs : undefined,
      nowMs,
    });

    const status =
      String(liveSandboxState ?? "").trim().toLowerCase() ||
      String(project.status ?? "active").trim().toLowerCase() ||
      "active";
    const label =
      String(project.name ?? "").trim() ||
      String(project.slug ?? "").trim() ||
      String(project._id ?? "").trim() ||
      "project";
    const stdoutPreview = providerVolumeId
      ? providerSandboxId
        ? `daytona sandbox ${liveSandboxState ?? "unknown"} on volume ${liveVolumeName ?? providerVolumeId}`
        : `daytona volume ${liveVolumeState ?? "unknown"} attached (${liveVolumeName ?? providerVolumeId})`
      : `no daytona volume attached (${label})`;

    return {
      ok: true,
      sandbox: {
        status,
      },
      probe: {
        stdout_preview: stdoutPreview,
      },
    };
  },
});
