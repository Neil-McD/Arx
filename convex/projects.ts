import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";
import { loadDaytonaConfig, type DaytonaConfig } from "./daytonaSandboxClient";

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

async function ensureDefaultProjectInternal(args: {
  ctx: any;
  ownerId: any;
  nowMs: number;
}) {
  const existing = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", args.ownerId))
    .first();
  if (existing) return existing;

  const id = await args.ctx.db.insert("cloudProjects", {
    ownerId: args.ownerId,
    providerVolumeId: undefined,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await args.ctx.db.get(id);
  if (!created) throw new Error("project_create_failed");
  return created;
}

function normalizeOptionalVolumeValue(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function buildProjectVolumeName(project: { _id?: unknown }): string {
  const projectId = normalizeIdValue(project._id);
  if (!projectId) throw new Error("project_id_required");
  return `arx-workspace-${projectId}`;
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
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.projectId);
    if (!existing) throw new Error("project_not_found");
    const nowMs = args.nowMs ?? Date.now();
    const providerVolumeId = normalizeOptionalVolumeValue(args.providerVolumeId);
    if (!providerVolumeId) throw new Error("provider_volume_id_required");
    await ctx.db.patch(existing._id, {
      providerVolumeId,
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
    const expectedVolumeName = buildProjectVolumeName(project);

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
      nowMs: Date.now(),
    });
    if (!updated) throw new Error("project_not_found");
    return updated;
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

export const getCloudProjectDisplayLabel = query({
  args: {
    projectId: v.id("cloudProjects"),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row) return null;
    if (args.authSubject) {
      const ownerId = await resolveOwnerIdForAuthenticatedRequest({
        ctx,
        authSubject: args.authSubject ?? null,
      });
      if (row.ownerId !== ownerId) return null;
    }
    return "Workspace";
  },
});
