import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

type ThreadLike = {
  _id: any;
  ownerId: any;
  title?: string;
  titleSource: "auto" | "manual";
  projectId?: any;
  communityId?: string;
  modelId?: string;
  contextVersion?: number;
  workingState?: ThreadWorkingStateLike;
  lastSeq?: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  threadKey?: string;
};

type CloudMessageLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  messageKey: string;
  seq: number;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
  engineId?: string;
  modelId?: string;
  runId?: string;
  createdAt: number;
};

type RuntimeRunLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  runId: string;
  lane: string;
  requestedExecutionTarget?: "chat" | "daytona_workspace";
  requiresWorkspaceTools?: boolean;
  projectId?: any;
  modelId?: string;
  engineId?: string;
  executionMode?: string;
  sandboxMode?: string;
  contractName?: string;
  contractVersion?: string;
  harnessProfile?: string;
  harnessProfileSource?: string;
  capabilityFamilies?: string[];
  status: "running" | "ok" | "error" | "cancelled";
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  lastEventSeq: number;
  startedAt: number;
  finishedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type RuntimeRunEventLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  runId: string;
  seq: number;
  eventType: string;
  eventKey?: string;
  payload: unknown;
  createdAt: number;
};

type ThreadWorkingStateLike = {
  goal?: string;
  lastResult?: string;
  filesChanged: string[];
  verifiedFindings: string[];
  openIssue?: string;
  updatedAt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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

function normalizeThreadKey(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("thread_key_required");
  return value.slice(0, 200);
}

function normalizeThreadTitle(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  return value.slice(0, 140);
}

function normalizeOptionalSummaryText(raw: unknown, maxLen = 240): string | null {
  const value = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return null;
  return value.slice(0, maxLen);
}

function normalizeWorkingStateText(raw: unknown, maxLen = 240): string | undefined {
  const value = normalizeOptionalSummaryText(raw, maxLen);
  return value ?? undefined;
}

function normalizeWorkingStateList(raw: string[], maxItems = 6, maxLen = 180): string[] {
  const out: string[] = [];
  for (const value of raw) {
    const normalized = normalizeWorkingStateText(value, maxLen);
    if (!normalized) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function extractThreadMessageText(contentJson: unknown): string | null {
  if (typeof contentJson === "string") {
    return normalizeOptionalSummaryText(contentJson, 400);
  }
  const record = asRecord(contentJson);
  if (!record) return null;
  const textCandidate =
    typeof record.text === "string"
      ? record.text
      : typeof record.content === "string"
        ? record.content
        : null;
  return normalizeOptionalSummaryText(textCandidate, 400);
}

function extractToolArgsPath(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  const argsRecord = asRecord(payloadRecord?.args);
  return normalizeOptionalSummaryText(argsRecord?.path, 180);
}

function extractToolName(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  return normalizeOptionalSummaryText(payloadRecord?.tool_name, 64);
}

function extractToolStatus(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  return normalizeOptionalSummaryText(payloadRecord?.status, 32);
}

function extractToolErrorMessage(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  return (
    normalizeOptionalSummaryText(payloadRecord?.error_message, 240) ??
    normalizeOptionalSummaryText(payloadRecord?.error_code, 120)
  );
}

function summarizeThreadWorkingState(args: {
  latestUserText: string | null;
  runStatus: "ok" | "error" | "cancelled";
  runReason?: string;
  runErrorMessage?: string;
  events: RuntimeRunEventLike[];
  nowMs: number;
}): ThreadWorkingStateLike {
  const successfulReadPaths: string[] = [];
  const changedFiles: string[] = [];
  let successfulSearchCount = 0;
  let successfulShellCount = 0;
  let firstFailedTool: { toolName: string; path: string | null; message: string | null } | null = null;

  for (const event of args.events) {
    if (event.eventType !== "tool_call_finished") continue;
    const toolName = extractToolName(event.payload);
    if (!toolName) continue;
    const status = extractToolStatus(event.payload);
    const path = extractToolArgsPath(event.payload);
    if (status === "ok") {
      if (toolName === "read" && path && path !== ".") {
        successfulReadPaths.push(path);
      } else if ((toolName === "write" || toolName === "edit") && path) {
        changedFiles.push(path);
      } else if (toolName === "glob" || toolName === "grep") {
        successfulSearchCount += 1;
      } else if (toolName === "bash") {
        successfulShellCount += 1;
      }
      continue;
    }
    if (!firstFailedTool) {
      firstFailedTool = {
        toolName,
        path,
        message: extractToolErrorMessage(event.payload),
      };
    }
  }

  const filesChanged = normalizeWorkingStateList(changedFiles, 8, 180);
  const verifiedFindingsRaw: string[] = [];
  const readPaths = normalizeWorkingStateList(successfulReadPaths, 3, 180);
  for (const path of readPaths) {
    verifiedFindingsRaw.push(`Inspected ${path}.`);
  }
  if (successfulSearchCount > 0) {
    verifiedFindingsRaw.push(
      `Completed ${successfulSearchCount} workspace ${successfulSearchCount === 1 ? "search" : "searches"}.`,
    );
  }
  if (filesChanged.length > 0) {
    verifiedFindingsRaw.push(
      `Changed ${filesChanged.length} workspace ${filesChanged.length === 1 ? "file" : "files"}.`,
    );
  } else if (successfulShellCount > 0) {
    verifiedFindingsRaw.push(
      `Ran ${successfulShellCount} shell ${successfulShellCount === 1 ? "command" : "commands"} successfully.`,
    );
  }
  const verifiedFindings = normalizeWorkingStateList(verifiedFindingsRaw, 4, 220);

  let lastResult: string | undefined;
  if (args.runStatus === "ok") {
    if (filesChanged.length > 0) {
      lastResult = normalizeWorkingStateText(
        `Completed the last workspace run and verified changes in ${filesChanged.join(", ")}.`,
        240,
      );
    } else if (readPaths.length > 0) {
      lastResult = normalizeWorkingStateText(
        `Completed the last workspace run after inspecting ${readPaths.join(", ")}.`,
        240,
      );
    } else {
      lastResult = "Completed the last workspace run successfully.";
    }
  } else if (firstFailedTool) {
    lastResult = normalizeWorkingStateText(
      `The last workspace run failed during ${firstFailedTool.toolName}${firstFailedTool.path ? ` on ${firstFailedTool.path}` : ""}.`,
      240,
    );
  } else {
    lastResult = normalizeWorkingStateText(
      `The last workspace run ended with status ${args.runStatus}.`,
      240,
    );
  }

  let openIssue: string | undefined;
  if (args.runStatus !== "ok") {
    openIssue =
      normalizeWorkingStateText(
        firstFailedTool
          ? `${firstFailedTool.toolName}${firstFailedTool.path ? ` on ${firstFailedTool.path}` : ""} failed${firstFailedTool.message ? `: ${firstFailedTool.message}` : "."}`
          : args.runErrorMessage || args.runReason || "The last workspace run did not complete successfully.",
        240,
      ) ?? "The last workspace run did not complete successfully.";
  }

  return {
    goal: normalizeWorkingStateText(args.latestUserText, 240),
    lastResult,
    filesChanged,
    verifiedFindings,
    openIssue,
    updatedAt: args.nowMs,
  };
}

function normalizeRunId(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("run_id_required");
  return value.slice(0, 200);
}

function normalizeRunStatus(raw: unknown): "running" | "ok" | "error" | "cancelled" {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "running" || value === "ok" || value === "error" || value === "cancelled") {
    return value;
  }
  throw new Error("run_status_invalid");
}

function normalizeRunLane(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "platform";
  return value.slice(0, 64);
}

async function ensureDefaultProjectId(args: {
  ctx: any;
  ownerId: any;
  nowMs: number;
}): Promise<any> {
  const existing = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", args.ownerId))
    .first();
  if (existing) return existing._id;

  return await args.ctx.db.insert("cloudProjects", {
    ownerId: args.ownerId,
    providerVolumeId: undefined,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function getCloudThreadByThreadKeyInternal(args: {
  ctx: any;
  ownerId: any;
  threadKey: string;
}): Promise<ThreadLike | null> {
  const row = await args.ctx.db
    .query("threads")
    .withIndex("by_owner_threadKey", (q: any) => q.eq("ownerId", args.ownerId).eq("threadKey", args.threadKey))
    .first();
  if (!row) return null;
  if (typeof row.archivedAt === "number") return null;
  return row as ThreadLike;
}

async function requireOwnedCloudThread(args: {
  ctx: any;
  ownerId: any;
  threadId: any;
}): Promise<ThreadLike> {
  const row = (await args.ctx.db.get(args.threadId)) as ThreadLike | null;
  if (!row) throw new Error("thread_not_found");
  if (row.ownerId !== args.ownerId) throw new Error("thread_access_denied");
  return row;
}

async function getRuntimeRunByOwnerRunId(args: {
  ctx: any;
  ownerId: any;
  runId: string;
}): Promise<RuntimeRunLike | null> {
  return (await args.ctx.db
    .query("runtimeRuns")
    .withIndex("by_owner_runId", (q: any) => q.eq("ownerId", args.ownerId).eq("runId", args.runId))
    .first()) as RuntimeRunLike | null;
}

async function getRunningRuntimeRunByThread(args: {
  ctx: any;
  threadId: any;
}): Promise<RuntimeRunLike | null> {
  return (await args.ctx.db
    .query("runtimeRuns")
    .withIndex("by_thread_status_startedAt", (q: any) => q.eq("threadId", args.threadId).eq("status", "running"))
    .order("desc")
    .first()) as RuntimeRunLike | null;
}


function deriveTitleFromContent(contentJson: unknown): string | undefined {
  if (typeof contentJson === "string") {
    const text = contentJson.trim().replace(/\s+/g, " ");
    if (!text) return undefined;
    return text.slice(0, 80);
  }
  if (contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)) {
    const record = contentJson as Record<string, unknown>;
    const candidate = typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
    const normalized = String(candidate ?? "").trim().replace(/\s+/g, " ");
    if (!normalized) return undefined;
    return normalized.slice(0, 80);
  }
  return undefined;
}

export const listCloudThreadsByOwner = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
    projectId: v.optional(v.id("cloudProjects")),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const includeArchived = Boolean(args.includeArchived);
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const filtered = rows.filter((row) => {
      if (!includeArchived && typeof row.archivedAt === "number") return false;
      if (args.projectId && row.projectId !== args.projectId) return false;
      return true;
    });
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getCloudThreadById = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const row = (await ctx.db.get(args.threadId)) as ThreadLike | null;
    if (!row) return null;
    if (row.ownerId !== ownerId) return null;
    if (!args.includeArchived && typeof row.archivedAt === "number") return null;
    return row;
  },
});

export const getCloudThreadByThreadKey = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    return await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey: normalizeThreadKey(args.threadKey),
    });
  },
});

export const getCloudThreadContext = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const row = (await ctx.db.get(args.threadId)) as ThreadLike | null;
    if (!row) return null;
    if (row.ownerId !== ownerId) return null;
    if (typeof row.archivedAt === "number") return null;
    return {
      thread_id: String(row._id),
      community_id: row.communityId ?? null,
      context_version: Number.isFinite(Number(row.contextVersion ?? 0)) ? Number(row.contextVersion ?? 0) : 0,
      updated_at: new Date(row.updatedAt).toISOString(),
    };
  },
});

export const setCloudThreadContext = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    expectedContextVersion: v.number(),
    communityId: v.optional(v.union(v.string(), v.null())),
    updateCommunityId: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const existing = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    if (typeof existing.archivedAt === "number") return null;

    const currentContextVersion = Number.isFinite(Number(existing.contextVersion ?? 0))
      ? Number(existing.contextVersion ?? 0)
      : 0;
    const expectedContextVersion = Math.max(0, Math.floor(args.expectedContextVersion));
    if (currentContextVersion !== expectedContextVersion) {
      throw new Error("thread_context_version_conflict");
    }

    const nextContextVersion = currentContextVersion + 1;
    const patch: Record<string, unknown> = {
      contextVersion: nextContextVersion,
      updatedAt: nowMs,
    };
    if (args.updateCommunityId ?? true) {
      const nextCommunityId = String(args.communityId ?? "").trim() || undefined;
      patch.communityId = nextCommunityId;
    }
    await ctx.db.patch(existing._id, patch);
    const updated = (await ctx.db.get(existing._id)) as ThreadLike | null;
    if (!updated) return null;
    return {
      thread_id: String(updated._id),
      community_id: updated.communityId ?? null,
      context_version: Number.isFinite(Number(updated.contextVersion ?? nextContextVersion))
        ? Number(updated.contextVersion ?? nextContextVersion)
        : nextContextVersion,
      updated_at: new Date(updated.updatedAt).toISOString(),
    };
  },
});

export const ensureCloudThread = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
    title: v.optional(v.string()),
    titleSource: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
    modelId: v.optional(v.string()),
    projectId: v.optional(v.id("cloudProjects")),
    communityId: v.optional(v.string()),
    contextVersion: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const threadKey = normalizeThreadKey(args.threadKey);
    const existing = await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey,
    });
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: nowMs };
      if (args.projectId && existing.projectId !== args.projectId) {
        patch.projectId = args.projectId;
      }
      if (typeof args.modelId === "string" && args.modelId.trim() && existing.modelId !== args.modelId.trim()) {
        patch.modelId = args.modelId.trim();
      }
      if (typeof args.communityId === "string") {
        const nextCommunityId = args.communityId.trim() || undefined;
        if (existing.communityId !== nextCommunityId) {
          patch.communityId = nextCommunityId;
        }
      }
      if (
        typeof args.contextVersion === "number" &&
        Number.isFinite(args.contextVersion) &&
        (existing.contextVersion ?? 0) < args.contextVersion
      ) {
        patch.contextVersion = Math.floor(args.contextVersion);
      }
      if (Object.keys(patch).length > 1) {
        await ctx.db.patch(existing._id, patch);
      }
      const refreshed = (await ctx.db.get(existing._id)) as ThreadLike | null;
      return refreshed ?? existing;
    }

    const projectId = args.projectId ?? (await ensureDefaultProjectId({ ctx, ownerId, nowMs }));
    const id = await ctx.db.insert("threads", {
      ownerId,
      threadKey,
      title: normalizeThreadTitle(args.title) ?? "New thread",
      titleSource: args.titleSource ?? "auto",
      projectId,
      communityId: String(args.communityId ?? "").trim() || undefined,
      modelId: String(args.modelId ?? "").trim() || undefined,
      contextVersion:
        typeof args.contextVersion === "number" && Number.isFinite(args.contextVersion)
          ? Math.floor(args.contextVersion)
          : 0,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id)) as ThreadLike | null;
    if (!created) throw new Error("thread_create_failed");
    return created;
  },
});

export const updateCloudThread = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    title: v.optional(v.string()),
    titleSource: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
    modelId: v.optional(v.string()),
    projectId: v.optional(v.id("cloudProjects")),
    lastSeq: v.optional(v.number()),
    archivedAt: v.optional(v.union(v.number(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const existing = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    const patch: Record<string, unknown> = {
      updatedAt: nowMs,
    };
    if (typeof args.title === "string") {
      patch.title = normalizeThreadTitle(args.title) ?? null;
    }
    if (args.titleSource) patch.titleSource = args.titleSource;
    if (typeof args.modelId === "string") patch.modelId = args.modelId.trim() || undefined;
    if (args.projectId) patch.projectId = args.projectId;
    if (typeof args.lastSeq === "number" && Number.isFinite(args.lastSeq)) {
      patch.lastSeq = Math.max(0, Math.floor(args.lastSeq));
    }
    if (args.archivedAt === null) {
      patch.archivedAt = undefined;
    } else if (typeof args.archivedAt === "number" && Number.isFinite(args.archivedAt)) {
      patch.archivedAt = Math.floor(args.archivedAt);
    }
    await ctx.db.patch(existing._id, patch);
    const updated = (await ctx.db.get(existing._id)) as ThreadLike | null;
    if (!updated) throw new Error("thread_not_found");
    return updated;
  },
});

export const archiveCloudThread = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const existing = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    await ctx.db.patch(existing._id, {
      archivedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const listCloudThreadMessages = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    afterSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    const safeLimit = Math.max(1, Math.min(2000, Math.floor(args.limit ?? 1000)));
    const afterSeq =
      typeof args.afterSeq === "number" && Number.isFinite(args.afterSeq) ? Math.floor(args.afterSeq) : null;
    const rows = await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) =>
        afterSeq === null ? q.eq("threadId", args.threadId) : q.eq("threadId", args.threadId).gt("seq", afterSeq),
      )
      .take(safeLimit);
    return rows.sort((a, b) => a.seq - b.seq);
  },
});

export const getCloudThreadMessageByOwnerMessageKey = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageKey: v.string(),
    threadId: v.optional(v.id("threads")),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const messageKey = String(args.messageKey ?? "").trim();
    if (!messageKey) return null;
    const row = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_owner_messageKey", (q) => q.eq("ownerId", ownerId).eq("messageKey", messageKey))
      .first()) as CloudMessageLike | null;
    if (!row) return null;
    if (args.threadId && row.threadId !== args.threadId) return null;
    return row;
  },
});

export const addCloudThreadMessage = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    messageKey: v.optional(v.string()),
    seq: v.optional(v.number()),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    contentJson: v.any(),
    engineId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    runId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });

    const explicitSeq =
      typeof args.seq === "number" && Number.isFinite(args.seq) ? Math.max(0, Math.floor(args.seq)) : null;
    const seq = explicitSeq ?? Math.max(0, Math.floor((thread.lastSeq ?? 0) + 1));
    const explicitMessageKey = String(args.messageKey ?? "").trim();
    const messageKey = explicitMessageKey || `${String(thread._id)}:${seq}`;

    if (explicitMessageKey) {
      const existingByMessageKey = (await ctx.db
        .query("cloudMessages")
        .withIndex("by_owner_messageKey", (q) => q.eq("ownerId", ownerId).eq("messageKey", explicitMessageKey))
        .first()) as CloudMessageLike | null;
      if (existingByMessageKey) {
        if (existingByMessageKey.threadId !== thread._id) {
          throw new Error("message_key_conflict");
        }
        return existingByMessageKey;
      }
    }

    const existingBySeq = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) => q.eq("threadId", thread._id).eq("seq", seq))
      .first()) as CloudMessageLike | null;
    if (existingBySeq) {
      return existingBySeq;
    }

    const createdAt =
      typeof args.createdAt === "number" && Number.isFinite(args.createdAt) ? Math.floor(args.createdAt) : nowMs;
    const id = await ctx.db.insert("cloudMessages", {
      ownerId,
      threadId: thread._id,
      messageKey,
      seq,
      role: args.role,
      contentJson: args.contentJson,
      engineId: String(args.engineId ?? "").trim() || undefined,
      modelId: String(args.modelId ?? "").trim() || undefined,
      runId: String(args.runId ?? "").trim() || undefined,
      createdAt,
    });

    const nextLastSeq = Math.max(0, Math.floor(Math.max(thread.lastSeq ?? 0, seq)));
    const patch: Record<string, unknown> = {
      updatedAt: nowMs,
      lastSeq: nextLastSeq,
    };
    if ((thread.titleSource ?? "auto") === "auto" && (!thread.title || !thread.title.trim()) && args.role === "user") {
      const derivedTitle = deriveTitleFromContent(args.contentJson);
      if (derivedTitle) patch.title = derivedTitle;
    }
    await ctx.db.patch(thread._id, patch);

    const created = (await ctx.db.get(id)) as CloudMessageLike | null;
    if (!created) throw new Error("message_create_failed");
    return created;
  },
});

export const deleteCloudThreadMessage = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    messageId: v.optional(v.id("cloudMessages")),
    messageKey: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });

    let message: CloudMessageLike | null = null;
    if (args.messageId) {
      const found = (await ctx.db.get(args.messageId)) as CloudMessageLike | null;
      if (found?.ownerId === ownerId && found.threadId === thread._id) {
        message = found;
      }
    } else {
      const messageKey = String(args.messageKey ?? "").trim();
      if (!messageKey) throw new Error("message_identifier_required");
      const found = (await ctx.db
        .query("cloudMessages")
        .withIndex("by_owner_messageKey", (q) => q.eq("ownerId", ownerId).eq("messageKey", messageKey))
        .first()) as CloudMessageLike | null;
      if (found?.threadId === thread._id) {
        message = found;
      }
    }

    if (!message) {
      return { ok: true, deleted: false };
    }

    await ctx.db.delete(message._id);
    const remaining = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
      .collect()) as CloudMessageLike[];
    const lastSeq = remaining.reduce((max, row) => Math.max(max, row.seq), 0);
    await ctx.db.patch(thread._id, {
      updatedAt: nowMs,
      lastSeq,
    });
    return { ok: true, deleted: true };
  },
});

export const getCloudRuntimeRunByOwnerRunId = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    runId: v.string(),
    threadId: v.optional(v.id("threads")),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const runId = normalizeRunId(args.runId);
    const row = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId,
      runId,
    });
    if (!row) return null;
    if (args.threadId && row.threadId !== args.threadId) return null;
    return row;
  },
});

export const ensureCloudRuntimeRunStarted = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    runId: v.string(),
    lane: v.optional(v.string()),
    requestedExecutionTarget: v.optional(v.union(v.literal("chat"), v.literal("daytona_workspace"))),
    requiresWorkspaceTools: v.optional(v.boolean()),
    projectId: v.optional(v.id("cloudProjects")),
    modelId: v.optional(v.string()),
    engineId: v.optional(v.string()),
    executionMode: v.optional(v.string()),
    sandboxMode: v.optional(v.string()),
    contractName: v.optional(v.string()),
    contractVersion: v.optional(v.string()),
    harnessProfile: v.optional(v.string()),
    harnessProfileSource: v.optional(v.string()),
    capabilityFamilies: v.optional(v.array(v.string())),
    startedAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const existing = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId,
      runId,
    });
    if (existing) {
      if (existing.threadId !== thread._id) throw new Error("run_thread_conflict");
      return existing;
    }

    const runningRun = await getRunningRuntimeRunByThread({
      ctx,
      threadId: thread._id,
    });
    if (runningRun) {
      if (runningRun.runId === runId) return runningRun;
      throw new Error("thread_run_in_progress");
    }

    const startedAt =
      typeof args.startedAt === "number" && Number.isFinite(args.startedAt) ? Math.floor(args.startedAt) : nowMs;
    const lane = normalizeRunLane(args.lane);
    const requestedExecutionTarget = args.requestedExecutionTarget === "daytona_workspace" ? "daytona_workspace" : "chat";
    const requiresWorkspaceTools =
      typeof args.requiresWorkspaceTools === "boolean"
        ? args.requiresWorkspaceTools
        : requestedExecutionTarget === "daytona_workspace";
    const executionMode =
      String(args.executionMode ?? "").trim() || (requiresWorkspaceTools ? "agentic" : "chat");
    const contractName = String(args.contractName ?? "").trim() || "canonical_cloud_run_v1";
    const contractVersion = String(args.contractVersion ?? "").trim() || "v1";
    const modelId = String(args.modelId ?? "").trim() || undefined;
    const engineId = String(args.engineId ?? "").trim() || undefined;
    const projectId = args.projectId;
    const sandboxMode = String(args.sandboxMode ?? "").trim() || undefined;
    const harnessProfile = String(args.harnessProfile ?? "").trim() || undefined;
    const harnessProfileSource = String(args.harnessProfileSource ?? "").trim() || undefined;
    const capabilityFamilies = Array.isArray(args.capabilityFamilies)
      ? args.capabilityFamilies
          .map((value) => String(value ?? "").trim())
          .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index)
      : undefined;

    const id = await ctx.db.insert("runtimeRuns", {
      ownerId,
      threadId: thread._id,
      runId,
      lane,
      requestedExecutionTarget,
      requiresWorkspaceTools,
      projectId,
      modelId,
      engineId,
      executionMode,
      sandboxMode,
      contractName,
      contractVersion,
      harnessProfile,
      harnessProfileSource,
      capabilityFamilies,
      status: "running",
      lastEventSeq: 1,
      startedAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    await ctx.db.insert("runtimeRunEvents", {
      ownerId,
      threadId: thread._id,
      runId,
      seq: 1,
      eventType: "run_started",
      eventKey: "run_started",
      payload: {
        run_id: runId,
        lane,
        requires_workspace_tools: requiresWorkspaceTools,
        project_id: projectId ?? null,
        model_id: modelId ?? null,
        engine_id: engineId ?? null,
        execution_mode: executionMode,
        sandbox_mode: sandboxMode ?? null,
        contract_name: contractName,
        contract_version: contractVersion,
        harness_profile: harnessProfile ?? null,
        harness_profile_source: harnessProfileSource ?? null,
        capability_families: capabilityFamilies ?? [],
      },
      createdAt: startedAt,
    });

    const created = (await ctx.db.get(id)) as RuntimeRunLike | null;
    if (!created) throw new Error("runtime_run_create_failed");
    return created;
  },
});

export const appendCloudRuntimeRunEvent = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    runId: v.string(),
    eventType: v.string(),
    eventKey: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId,
      runId,
    });
    if (!run) throw new Error("runtime_run_not_found");
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");

    const eventType = String(args.eventType ?? "").trim();
    if (!eventType) throw new Error("runtime_event_type_required");
    const eventKey = String(args.eventKey ?? "").trim() || undefined;
    if (eventKey) {
      const existing = (await ctx.db
        .query("runtimeRunEvents")
        .withIndex("by_owner_run_eventKey", (q: any) => q.eq("ownerId", ownerId).eq("runId", runId).eq("eventKey", eventKey))
        .first()) as RuntimeRunEventLike | null;
      if (existing) return existing;
    }

    const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;
    const createdAt =
      typeof args.createdAt === "number" && Number.isFinite(args.createdAt) ? Math.floor(args.createdAt) : nowMs;
    const id = await ctx.db.insert("runtimeRunEvents", {
      ownerId,
      threadId: thread._id,
      runId,
      seq,
      eventType,
      eventKey,
      payload: args.payload,
      createdAt,
    });
    await ctx.db.patch(run._id, {
      lastEventSeq: seq,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id)) as RuntimeRunEventLike | null;
    if (!created) throw new Error("runtime_event_create_failed");
    return created;
  },
});

export const finishCloudRuntimeRun = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    runId: v.string(),
    status: v.string(),
    reason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const status = normalizeRunStatus(args.status);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId,
      runId,
    });
    if (!run) throw new Error("runtime_run_not_found");
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");
    if (run.status !== "running") return run;

    const finishedAt =
      typeof args.finishedAt === "number" && Number.isFinite(args.finishedAt) ? Math.floor(args.finishedAt) : nowMs;
    const reason = String(args.reason ?? "").trim() || undefined;
    const errorCode = String(args.errorCode ?? "").trim() || undefined;
    const errorMessage = String(args.errorMessage ?? "").trim() || undefined;
    const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;

    const recentMessages = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(50)) as CloudMessageLike[];
    const latestRunUserMessage = recentMessages.find(
      (message) => message.runId === runId && message.role === "user",
    );
    const runEvents = (await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_seq", (q: any) =>
        q.eq("ownerId", ownerId).eq("runId", runId),
      )
      .collect()) as RuntimeRunEventLike[];
    const workingState = summarizeThreadWorkingState({
      latestUserText: extractThreadMessageText(latestRunUserMessage?.contentJson ?? null),
      runStatus: status,
      runReason: reason,
      runErrorMessage: errorMessage,
      events: runEvents,
      nowMs,
    });

    await ctx.db.insert("runtimeRunEvents", {
      ownerId,
      threadId: thread._id,
      runId,
      seq,
      eventType: "run_finished",
      eventKey: "run_finished",
      payload: {
        run_id: runId,
        status,
        reason: reason ?? null,
        error_code: errorCode ?? null,
        error_message: errorMessage ?? null,
      },
      createdAt: finishedAt,
    });
    await ctx.db.patch(run._id, {
      status,
      reason,
      errorCode,
      errorMessage,
      finishedAt,
      lastEventSeq: seq,
      updatedAt: nowMs,
    });
    await ctx.db.patch(thread._id, {
      workingState,
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(run._id)) as RuntimeRunLike | null;
    if (!updated) throw new Error("runtime_run_not_found");
    return updated;
  },
});

export const getCloudRunningRuntimeRunByThreadKey = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const threadKey = String(args.threadKey ?? "").trim();
    if (!threadKey) throw new Error("thread_key_required");
    const thread = await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey,
    });
    if (!thread) return null;
    const run = await getRunningRuntimeRunByThread({
      ctx,
      threadId: thread._id,
    });
    if (!run) return null;
    return run;
  },
});

export const listCloudRuntimeRunEvents = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    runId: v.string(),
    threadId: v.optional(v.id("threads")),
    afterSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const runId = normalizeRunId(args.runId);
    if (args.threadId) {
      await requireOwnedCloudThread({
        ctx,
        ownerId,
        threadId: args.threadId,
      });
    }

    const safeLimit = Math.max(1, Math.min(2000, Math.floor(args.limit ?? 1000)));
    const afterSeq =
      typeof args.afterSeq === "number" && Number.isFinite(args.afterSeq) ? Math.floor(args.afterSeq) : null;
    const rows = await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_seq", (q: any) =>
        afterSeq === null ? q.eq("ownerId", ownerId).eq("runId", runId) : q.eq("ownerId", ownerId).eq("runId", runId).gt("seq", afterSeq),
      )
      .take(safeLimit);
    const out = rows.sort((a: RuntimeRunEventLike, b: RuntimeRunEventLike) => a.seq - b.seq);
    if (!args.threadId) return out;
    return out.filter((row: RuntimeRunEventLike) => row.threadId === args.threadId);
  },
});
