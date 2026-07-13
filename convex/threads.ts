import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";
import {
  applyRuntimeHarnessTelemetryEvent,
  buildRuntimeHarnessScorecard,
  buildRuntimeHarnessTelemetrySummaryFromEvents,
  createEmptyRuntimeHarnessTelemetrySummary,
  type RuntimeHarnessTelemetrySummary,
} from "../shared/runtimeHarnessScorecard";
import {
  mergeRuntimeWorkingStateTaskLedger,
  summarizeRuntimeWorkingStateFromEvents,
} from "../shared/runtimeWorkingStateLedger";
import { requireCommunityChatAccess } from "./communityCore";
import { recordTrustedCommunitySourceTraceCore } from "./communityIntelligenceDirectory";
import {
  normalizeActiveWorkspaceRuntimeEngine,
  normalizeRuntimeEngine,
  type RuntimeEngine,
} from "../shared/runtimeEngine";
import { normalizeWorkspacePreviewPort } from "../shared/workspacePreviewPort";
import { DEFAULT_ACTIVE_MODEL_ID } from "../shared/modelCatalog";
import {
  MEMBER_AGENT_GLOBAL_SCOPE_KEY,
  MEMBER_AGENT_THREAD_KEY_PREFIX,
  buildGlobalMemberAgentEpisodeThreadKey,
  buildMemberAgentEpisodeThreadKey,
  buildMemberAgentThreadKey,
  isGlobalMemberAgentEpisodeThreadKey,
  isMemberAgentThreadKeyForCommunity,
} from "../shared/runtimeInvocationSurface";
import { MEMBER_AGENT_CONTEXT_MAX_MESSAGES } from "../shared/memberAgentConversationContext";
import {
  MEMBER_CONVERSATION_LIST_DEFAULT_LIMIT,
  MEMBER_CONVERSATION_LIST_MAX_LIMIT,
  buildMemberConversationRecallTranscript,
  deriveMemberConversationTitle,
} from "../shared/memberAgentEpisodeRecall";

type ThreadLike = {
  _id: any;
  ownerId: any;
  title?: string;
  titleSource: "auto" | "manual";
  projectId?: any;
  communityId?: string;
  modelId?: string;
  runtimeEngine?: RuntimeEngine;
  contextVersion?: number;
  workingState?: ThreadWorkingStateLike;
  latestUserVisibleCompletedRunId?: string;
  lastSeenUserVisibleCompletedRunId?: string;
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

type MemberAgentChannelLike = {
  _id: any;
  ownerId: any;
  scopeKey?: "global";
  communityId?: any;
  activeEpisodeId?: any;
  communityNameSnapshot?: string;
  communityDeletedAt?: number;
  nextOrdinal: number;
  createdAt: number;
  updatedAt: number;
};

type MemberAgentEpisodeLike = {
  _id: any;
  channelId: any;
  threadId: any;
  ordinal: number;
  status: "active" | "closed";
  startedAt: number;
  closedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type StoredCloudMessageAttachment = {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string | null;
  size: number;
  storageId?: string | null;
  dataUrl?: string | null;
  text?: string | null;
  truncated?: boolean | null;
};

type RuntimeRunLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  runId: string;
  lane: string;
  visibility?: "user_visible" | "internal_hidden";
  internalFollowupKind?: string;
  projectId?: any;
  communityId?: any;
  communityContextVersion?: number;
  modelId?: string;
  engineId?: string;
  executionMode?: string;
  sandboxMode?: string;
  contractName?: string;
  contractVersion?: string;
  harnessProfile?: string;
  harnessProfileSource?: string;
  capabilityFamilies?: string[];
  workspaceSessionState?: string;
  workspaceProviderSandboxId?: string;
  workspaceToolboxProxyUrl?: string;
  workspaceSessionRegion?: string;
  workspaceSessionUpdatedAt?: number;
  runtimeHarnessTelemetrySummary?: RuntimeHarnessTelemetrySummary;
  startedContextSnapshot?: unknown;
  activeContextSnapshot?: unknown;
  activeContextSnapshotUpdatedAt?: number;
  finishedContextSnapshot?: unknown;
  pendingUserSteering?: Array<{
    text: string;
    receivedAt: number;
    messageKey?: string;
  }>;
  stopRequestedAt?: number;
  stopReason?: string;
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

function createAttachmentId(): string {
  return `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

async function maybeResolveCloudMessageStorageUrl(ctx: any, storageId: unknown): Promise<string | null> {
  const resolvedStorageId = String(storageId ?? "").trim();
  if (!resolvedStorageId) return null;
  const resolved = await ctx.storage.getUrl(resolvedStorageId as any);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
}

function normalizeStoredCloudMessageAttachment(raw: unknown): StoredCloudMessageAttachment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : createAttachmentId();
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 256) : "attachment";
  const type = record.type === "image" ? "image" : "file";
  const mime = typeof record.mime === "string" && record.mime.trim() ? record.mime.trim().slice(0, 160) : null;
  const sizeRaw = Number(record.size);
  const size = Number.isFinite(sizeRaw) ? Math.max(0, Math.floor(sizeRaw)) : 0;
  const storageIdRaw =
    typeof record.storageId === "string"
      ? record.storageId
      : typeof record.storage_id === "string"
        ? record.storage_id
        : "";
  const storageId = storageIdRaw.trim() ? storageIdRaw.trim() : null;
  const dataUrl =
    typeof record.data_url === "string" && record.data_url.trim().startsWith("data:")
      ? record.data_url.trim()
      : null;
  const text = typeof record.text === "string" && record.text.trim() ? record.text.slice(0, 20_000) : null;
  const truncated = typeof record.truncated === "boolean" ? record.truncated : null;
  if (!storageId && !dataUrl && !text) return null;
  return {
    id,
    name,
    type,
    mime,
    size,
    ...(storageId ? { storageId } : null),
    ...(dataUrl ? { dataUrl } : null),
    ...(text ? { text } : null),
    ...(truncated !== null ? { truncated } : null),
  };
}

function normalizeStoredCloudMessageAttachments(raw: unknown): StoredCloudMessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredCloudMessageAttachment[] = [];
  for (const item of raw) {
    const normalized = normalizeStoredCloudMessageAttachment(item);
    if (normalized) out.push(normalized);
  }
  return out;
}

async function mapCloudMessageContentJsonForRead(ctx: any, contentJson: unknown): Promise<unknown> {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return contentJson;
  const record = contentJson as Record<string, unknown>;
  const attachments = normalizeStoredCloudMessageAttachments(record.attachments);
  if (attachments.length === 0) return contentJson;
  const resolvedAttachments = await Promise.all(
    attachments.map(async (attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mime: attachment.mime,
      size: attachment.size,
      ...(attachment.storageId ? { storage_id: attachment.storageId } : null),
      ...(attachment.storageId ? { url: await maybeResolveCloudMessageStorageUrl(ctx, attachment.storageId) } : null),
      ...(attachment.dataUrl ? { data_url: attachment.dataUrl } : null),
      ...(attachment.text ? { text: attachment.text } : null),
      ...(attachment.truncated !== null && typeof attachment.truncated !== "undefined"
        ? { truncated: attachment.truncated }
        : null),
    })),
  );
  return {
    ...record,
    attachments: resolvedAttachments,
  };
}

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
  version?: number;
  goal?: string;
  status?: "idle" | "in_progress" | "blocked" | "needs_verification" | "complete";
  currentStep?: string;
  plan?: string[];
  completedSteps?: string[];
  decisions?: string[];
  openQuestions?: string[];
  focusFiles?: string[];
  lastResult?: string;
  verificationStatus?: "not_needed" | "needed" | "passed" | "failed";
  filesTouched?: string[];
  filesChanged: string[];
  verifiedFindings: string[];
  recentActions?: string[];
  lastDiagnostic?: string;
  openIssue?: string;
  blocker?: string;
  nextAction?: string;
  updatedAt: number;
};

const RUNTIME_RUN_STALE_AFTER_MS = 8 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function hydrateRuntimeEventPayload(ctx: any, payload: unknown): Promise<unknown> {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return payload;
  const detailsRecord = asRecord(payloadRecord.details);
  const computerUseRecord = asRecord(detailsRecord?.computer_use);
  const frameStorageId = String(computerUseRecord?.frame_storage_id ?? "").trim();
  if (!frameStorageId) return payload;
  const frameUrl = await ctx.storage.getUrl(frameStorageId as any);
  return {
    ...payloadRecord,
    details: {
      ...detailsRecord,
      computer_use: {
        ...computerUseRecord,
        frame_url: frameUrl ?? null,
      },
    },
  };
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
  const user =
    args.ctx?.db?.query
      ? await args.ctx.db
          .query("users")
          .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
          .first()
      : await args.ctx.runQuery(internal.threads.getUserByAuthSubjectInternal as any, {
          authSubject,
        });
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

function normalizeOptionalRuntimeEngine(raw: unknown): RuntimeEngine | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const engine = normalizeRuntimeEngine(value);
  if (!engine) throw new Error("invalid_runtime_engine");
  return normalizeActiveWorkspaceRuntimeEngine(engine);
}

function normalizeThreadTitle(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  return value.slice(0, 140);
}

async function validateThreadCommunityLensAccess(args: {
  ctx: any;
  communityId: string | null | undefined;
  userId: any;
}): Promise<string | undefined> {
  const communityId = String(args.communityId ?? "").trim();
  if (!communityId) return undefined;
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId,
    userId: args.userId,
  });
  return communityId;
}

function normalizeContextVersion(value: unknown): number {
  return Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;
}

async function resolveRuntimeRunCanonicalCommunityLens(args: {
  ctx: any;
  thread: ThreadLike;
  ownerId: any;
  requestedCommunityId?: any;
  requestedContextVersion?: number;
}): Promise<{
  communityId?: any;
  communityContextVersion?: number;
}> {
  const threadCommunityId = normalizeIdValue(args.thread.communityId);
  const requestedCommunityId = normalizeIdValue(args.requestedCommunityId);
  const hasRequestedContextVersion =
    typeof args.requestedContextVersion === "number" &&
    Number.isFinite(args.requestedContextVersion);

  if (!threadCommunityId) {
    if (requestedCommunityId || hasRequestedContextVersion) {
      throw new Error("runtime_run_community_lens_mismatch");
    }
    return {};
  }

  if (requestedCommunityId && requestedCommunityId !== threadCommunityId) {
    throw new Error("runtime_run_community_lens_mismatch");
  }

  const currentContextVersion = Math.max(0, Math.floor(normalizeContextVersion(args.thread.contextVersion)));
  if (hasRequestedContextVersion) {
    const requestedContextVersion = Math.max(0, Math.floor(Number(args.requestedContextVersion)));
    if (requestedContextVersion !== currentContextVersion) {
      throw new Error("runtime_run_community_context_version_conflict");
    }
  }

  const communityId = await validateThreadCommunityLensAccess({
    ctx: args.ctx,
    communityId: threadCommunityId,
    userId: args.ownerId,
  });
  if (!communityId) throw new Error("runtime_run_community_lens_mismatch");
  return {
    communityId,
    communityContextVersion: currentContextVersion,
  };
}

function assertRuntimeRunMatchesRequestedCommunityLens(args: {
  run: RuntimeRunLike;
  requestedCommunityId?: any;
  requestedContextVersion?: number;
}): void {
  const runCommunityId = normalizeIdValue(args.run.communityId);
  const requestedCommunityId = normalizeIdValue(args.requestedCommunityId);
  const hasRequestedContextVersion =
    typeof args.requestedContextVersion === "number" &&
    Number.isFinite(args.requestedContextVersion);

  if (!runCommunityId) {
    if (requestedCommunityId || hasRequestedContextVersion) {
      throw new Error("runtime_run_community_lens_mismatch");
    }
    return;
  }

  if (requestedCommunityId && requestedCommunityId !== runCommunityId) {
    throw new Error("runtime_run_community_lens_mismatch");
  }

  if (hasRequestedContextVersion) {
    const requestedContextVersion = Math.max(0, Math.floor(Number(args.requestedContextVersion)));
    const runContextVersion = Math.max(0, Math.floor(normalizeContextVersion(args.run.communityContextVersion)));
    if (requestedContextVersion !== runContextVersion) {
      throw new Error("runtime_run_community_context_version_conflict");
    }
  }
}

function buildThreadContextResponse(row: ThreadLike, fallbackContextVersion: number): {
  thread_id: string;
  community_id: string | null;
  context_version: number;
  updated_at: string;
} {
  return {
    thread_id: String(row._id),
    community_id: row.communityId ?? null,
    context_version: Number.isFinite(Number(row.contextVersion ?? fallbackContextVersion))
      ? Number(row.contextVersion ?? fallbackContextVersion)
      : fallbackContextVersion,
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

async function setCloudThreadContextForOwnedThread(args: {
  ctx: any;
  ownerId: any;
  existing: ThreadLike;
  expectedContextVersion: number;
  communityId?: string | null;
  updateCommunityId?: boolean;
  nowMs: number;
}): Promise<{
  thread_id: string;
  community_id: string | null;
  context_version: number;
  updated_at: string;
} | null> {
  const existing = args.existing;
  if (typeof existing.archivedAt === "number") return null;

  const currentContextVersion = normalizeContextVersion(existing.contextVersion);
  const expectedContextVersion = Math.max(0, Math.floor(args.expectedContextVersion));
  if (currentContextVersion !== expectedContextVersion) {
    throw new Error("thread_context_version_conflict");
  }

  const nextContextVersion = currentContextVersion + 1;
  const patch: Record<string, unknown> = {
    contextVersion: nextContextVersion,
    updatedAt: args.nowMs,
  };
  if (args.updateCommunityId ?? true) {
    const nextCommunityId = await validateThreadCommunityLensAccess({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.ownerId,
    });
    patch.communityId = nextCommunityId;
  }
  await args.ctx.db.patch(existing._id, patch);
  const updated = (await args.ctx.db.get(existing._id)) as ThreadLike | null;
  if (!updated) return null;
  return buildThreadContextResponse(updated, nextContextVersion);
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

const TASK_PIVOT_PATTERN =
  /^(new task|new topic|switch(ing)? to|change topic|different task|ignore that|forget that|now let's|let's move to|moving on|separate question|unrelated|actually|instead)\b/i;

const TASK_PIVOT_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "what",
  "when",
  "where",
  "into",
  "onto",
  "then",
  "than",
  "your",
  "our",
  "can",
  "you",
  "lets",
  "let",
  "now",
]);

function tokenizeTaskGoal(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TASK_PIVOT_STOP_WORDS.has(token));
}

function shouldPreserveActiveTaskLedger(args: {
  previous: ThreadWorkingStateLike | null;
  latestUserText?: string | null;
}): boolean {
  const previous = args.previous;
  if (!previous || previous.status === "complete") return false;
  const latest = normalizeWorkingStateText(args.latestUserText, 240);
  const previousGoal = normalizeWorkingStateText(previous.goal, 240);
  if (!latest || !previousGoal) return true;
  if (TASK_PIVOT_PATTERN.test(latest)) return false;
  if (latest.length < 28) return true;
  const latestLower = latest.toLowerCase();
  const previousLower = previousGoal.toLowerCase();
  if (latestLower.includes(previousLower) || previousLower.includes(latestLower)) {
    return true;
  }
  const latestTokens = tokenizeTaskGoal(latest);
  const previousTokens = new Set(tokenizeTaskGoal(previousGoal));
  if (latestTokens.length < 4 || previousTokens.size < 4) return true;
  const overlap = latestTokens.filter((token) => previousTokens.has(token)).length;
  const overlapRatio = overlap / Math.min(latestTokens.length, previousTokens.size);
  return overlapRatio >= 0.25;
}

function normalizePreviousWorkingState(raw: unknown): ThreadWorkingStateLike | null {
  const record = asRecord(raw);
  if (!record) return null;
  const filesChanged = Array.isArray(record.filesChanged)
    ? normalizeWorkingStateList(
        record.filesChanged.map((value) => String(value ?? "")),
        8,
        180,
      )
    : [];
  const filesTouched = Array.isArray(record.filesTouched)
    ? normalizeWorkingStateList(
        record.filesTouched.map((value) => String(value ?? "")),
        10,
        180,
      )
    : filesChanged;
  const verifiedFindings = Array.isArray(record.verifiedFindings)
    ? normalizeWorkingStateList(
        record.verifiedFindings.map((value) => String(value ?? "")),
        4,
        220,
      )
    : [];
  const recentActions = Array.isArray(record.recentActions)
    ? normalizeWorkingStateList(
        record.recentActions.map((value) => String(value ?? "")),
        6,
        180,
      )
    : [];
  const plan = Array.isArray(record.plan)
    ? normalizeWorkingStateList(
        record.plan.map((value) => String(value ?? "")),
        5,
        180,
      )
    : [];
  const completedSteps = Array.isArray(record.completedSteps)
    ? normalizeWorkingStateList(
        record.completedSteps.map((value) => String(value ?? "")),
        8,
        180,
      )
    : [];
  const decisions = Array.isArray(record.decisions)
    ? normalizeWorkingStateList(
        record.decisions.map((value) => String(value ?? "")),
        5,
        200,
      )
    : [];
  const openQuestions = Array.isArray(record.openQuestions)
    ? normalizeWorkingStateList(
        record.openQuestions.map((value) => String(value ?? "")),
        4,
        200,
      )
    : [];
  const focusFiles = Array.isArray(record.focusFiles)
    ? normalizeWorkingStateList(
        record.focusFiles.map((value) => String(value ?? "")),
        8,
        180,
      )
    : [];
  const statusRaw = String(record.status ?? "").trim();
  const status =
    statusRaw === "idle" ||
    statusRaw === "in_progress" ||
    statusRaw === "blocked" ||
    statusRaw === "needs_verification" ||
    statusRaw === "complete"
      ? statusRaw
      : undefined;
  const verificationStatusRaw = String(record.verificationStatus ?? "").trim();
  const verificationStatus =
    verificationStatusRaw === "not_needed" ||
    verificationStatusRaw === "needed" ||
    verificationStatusRaw === "passed" ||
    verificationStatusRaw === "failed"
      ? verificationStatusRaw
      : undefined;
  return {
    version: Number.isFinite(Number(record.version)) ? Math.max(1, Math.floor(Number(record.version))) : 1,
    goal: normalizeWorkingStateText(record.goal, 240),
    status,
    currentStep: normalizeWorkingStateText(record.currentStep, 180),
    plan,
    completedSteps,
    decisions,
    openQuestions,
    focusFiles,
    lastResult: normalizeWorkingStateText(record.lastResult, 240),
    verificationStatus,
    filesTouched,
    filesChanged,
    verifiedFindings,
    recentActions,
    lastDiagnostic: normalizeWorkingStateText(record.lastDiagnostic, 240),
    openIssue: normalizeWorkingStateText(record.openIssue, 240),
    blocker: normalizeWorkingStateText(record.blocker ?? record.openIssue, 240),
    nextAction: normalizeWorkingStateText(record.nextAction, 200),
    updatedAt: Number.isFinite(Number(record.updatedAt)) ? Math.floor(Number(record.updatedAt)) : Date.now(),
  };
}

function compactThreadWorkingState(state: ThreadWorkingStateLike): ThreadWorkingStateLike {
  const out: Partial<ThreadWorkingStateLike> = {
    version: Number.isFinite(Number(state.version)) ? Math.floor(Number(state.version)) : undefined,
    status: state.status,
    verificationStatus: state.verificationStatus,
    plan: Array.isArray(state.plan) && state.plan.length > 0 ? state.plan : undefined,
    completedSteps: Array.isArray(state.completedSteps) && state.completedSteps.length > 0 ? state.completedSteps : undefined,
    decisions: Array.isArray(state.decisions) && state.decisions.length > 0 ? state.decisions : undefined,
    openQuestions: Array.isArray(state.openQuestions) && state.openQuestions.length > 0 ? state.openQuestions : undefined,
    focusFiles: Array.isArray(state.focusFiles) && state.focusFiles.length > 0 ? state.focusFiles : undefined,
    filesTouched: Array.isArray(state.filesTouched) ? state.filesTouched : undefined,
    filesChanged: Array.isArray(state.filesChanged) ? state.filesChanged : [],
    verifiedFindings: Array.isArray(state.verifiedFindings) ? state.verifiedFindings : [],
    recentActions: Array.isArray(state.recentActions) ? state.recentActions : undefined,
    updatedAt: Number.isFinite(Number(state.updatedAt)) ? Math.floor(Number(state.updatedAt)) : Date.now(),
  };
  for (const key of [
    "goal",
    "currentStep",
    "lastResult",
    "lastDiagnostic",
    "openIssue",
    "blocker",
    "nextAction",
  ] as const) {
    const value = normalizeWorkingStateText(state[key], key === "goal" ? 240 : 260);
    if (value) out[key] = value;
  }
  for (const key of Object.keys(out) as Array<keyof ThreadWorkingStateLike>) {
    if (out[key] === undefined || out[key] === null) {
      delete out[key];
    }
  }
  return out as ThreadWorkingStateLike;
}

function buildRunStartedWorkingState(args: {
  previous: unknown;
  latestUserText?: string | null;
  nowMs: number;
}): ThreadWorkingStateLike {
  const previous = normalizePreviousWorkingState(args.previous);
  const goal = normalizeWorkingStateText(args.latestUserText, 240) ?? previous?.goal;
  const taskStillActive = shouldPreserveActiveTaskLedger({
    previous,
    latestUserText: args.latestUserText,
  });
  return compactThreadWorkingState({
    version: 3,
    goal,
    status: "in_progress",
    currentStep: "Run is in progress.",
    plan: taskStillActive ? previous?.plan : undefined,
    completedSteps: taskStillActive ? previous?.completedSteps : undefined,
    decisions: taskStillActive ? previous?.decisions : undefined,
    openQuestions: taskStillActive ? previous?.openQuestions : undefined,
    focusFiles: taskStillActive ? previous?.focusFiles : undefined,
    lastResult: previous?.lastResult,
    verificationStatus: "not_needed",
    filesTouched: [],
    filesChanged: [],
    verifiedFindings: [],
    lastDiagnostic: undefined,
    recentActions: normalizeWorkingStateList(
      ["Started a new workspace run.", ...(previous?.recentActions ?? [])],
      6,
      180,
    ),
    openIssue: undefined,
    blocker: undefined,
    nextAction: "Wait for the current run to finish or inspect the latest runtime events.",
    updatedAt: args.nowMs,
  });
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

async function validateOwnedCloudProjectId(args: {
  ctx: any;
  ownerId: any;
  projectId: any;
}): Promise<any> {
  const row = await args.ctx.db.get(args.projectId);
  if (!row) throw new Error("project_not_found");
  if (row.ownerId !== args.ownerId) throw new Error("project_forbidden");
  const status = String(row.status ?? "active").trim().toLowerCase();
  if (status === "archived" || status === "deleted") throw new Error("project_not_found");
  return args.projectId;
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

async function listRecentRuntimeRunsForScorecard(args: {
  ctx: any;
  ownerId: any;
  limit: number;
  includeInternalHidden: boolean;
}): Promise<RuntimeRunLike[]> {
  const out: RuntimeRunLike[] = [];
  const pageSize = Math.max(50, Math.min(200, args.limit * 2));
  let cursorStartedAt: number | null = null;
  let scannedPages = 0;

  while (out.length < args.limit && scannedPages < 10) {
    const rows = (await args.ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_startedAt", (q: any) =>
        cursorStartedAt === null
          ? q.eq("ownerId", args.ownerId)
          : q.eq("ownerId", args.ownerId).lt("startedAt", cursorStartedAt),
      )
      .order("desc")
      .take(pageSize)) as RuntimeRunLike[];
    if (rows.length === 0) break;
    scannedPages += 1;
    for (const row of rows) {
      if (!args.includeInternalHidden && row.visibility === "internal_hidden") continue;
      out.push(row);
      if (out.length >= args.limit) break;
    }
    const nextCursor = rows[rows.length - 1]?.startedAt;
    if (typeof nextCursor !== "number" || !Number.isFinite(nextCursor)) break;
    cursorStartedAt = Math.floor(nextCursor);
  }

  return out.slice(0, args.limit);
}

function isRuntimeRunStale(args: {
  run: RuntimeRunLike;
  nowMs: number;
}): boolean {
  const lastProgressAt =
    typeof args.run.updatedAt === "number" && Number.isFinite(args.run.updatedAt)
      ? Math.floor(args.run.updatedAt)
      : Math.floor(args.run.startedAt);
  return Math.max(0, args.nowMs - lastProgressAt) >= RUNTIME_RUN_STALE_AFTER_MS;
}

function buildRuntimeRunSourceTraceSummary(args: {
  run: RuntimeRunLike;
  status: "ok" | "error" | "cancelled";
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  finishedAt: number;
}): string {
  const durationMs = Math.max(0, args.finishedAt - Math.floor(args.run.startedAt));
  return [
    `Runtime agent run finished with status ${args.status}.`,
    `Run id: ${args.run.runId}.`,
    `Lane: ${args.run.lane || "unknown"}.`,
    `Visibility: ${args.run.visibility ?? "user_visible"}.`,
    `Execution mode: ${args.run.executionMode ?? "chat"}.`,
    `Model: ${args.run.modelId ?? "unknown"}.`,
    `Engine: ${args.run.engineId ?? "unknown"}.`,
    `Contract: ${args.run.contractName ?? "unknown"} ${args.run.contractVersion ?? ""}`.trim(),
    `Started at ms: ${Math.floor(args.run.startedAt)}.`,
    `Finished at ms: ${args.finishedAt}.`,
    `Duration ms: ${durationMs}.`,
    args.reason ? `Reason: ${args.reason}.` : "",
    args.errorCode ? `Error code: ${args.errorCode}.` : "",
    "Message content, tool arguments, raw error details, and raw runtime transcript are intentionally excluded from this evidence trace.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 4000);
}

async function recordRuntimeRunCommunitySourceTraceBestEffort(args: {
  ctx: any;
  ownerId: any;
  run: RuntimeRunLike;
  status: "ok" | "error" | "cancelled";
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  finishedAt: number;
  nowMs: number;
}): Promise<void> {
  const runCommunityId = normalizeIdValue(args.run.communityId);
  if (!runCommunityId) return;
  try {
    await recordTrustedCommunitySourceTraceCore({
      ctx: args.ctx,
      communityId: runCommunityId,
      sourceType: "agent_run",
      sourceId: `runtime_run:${normalizeRunId(args.run.runId)}`,
      title: `Runtime agent run: ${args.status}`,
      summary: buildRuntimeRunSourceTraceSummary(args),
      visibilityScope: "admin",
      sourceVisibility: "redacted",
      actorType: "agent",
      actorUserId: args.ownerId,
      actorAgentKey: "runtime_run_finalizer",
      nowMs: args.nowMs,
    });
  } catch {
    // Source traces are compiler evidence. Runtime completion remains authoritative even if evidence capture fails.
  }
}

async function finalizeRuntimeRunRecord(args: {
  ctx: any;
  ownerId: any;
  thread: ThreadLike;
  run: RuntimeRunLike;
  status: "running" | "ok" | "error" | "cancelled";
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  nowMs: number;
  finishedAt?: number;
}): Promise<RuntimeRunLike> {
  const normalizedStatus = normalizeRunStatus(args.status);
  if (normalizedStatus === "running") {
    throw new Error("runtime_run_finish_status_invalid");
  }
  const status = normalizedStatus;
  const run = args.run;
  if (run.threadId !== args.thread._id) throw new Error("run_thread_conflict");
  if (run.status !== "running") return run;

  const finishedAt =
    typeof args.finishedAt === "number" && Number.isFinite(args.finishedAt) ? Math.floor(args.finishedAt) : args.nowMs;
  const reason = String(args.reason ?? "").trim() || undefined;
  const errorCode = String(args.errorCode ?? "").trim() || undefined;
  const errorMessage = String(args.errorMessage ?? "").trim() || undefined;
  const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;

  const recentMessages = (await args.ctx.db
    .query("cloudMessages")
    .withIndex("by_thread_seq", (q: any) => q.eq("threadId", args.thread._id))
    .order("desc")
    .take(50)) as CloudMessageLike[];
  const latestRunUserMessage = recentMessages.find(
    (message) => message.runId === run.runId && message.role === "user",
  );
  const runEvents = (await args.ctx.db
    .query("runtimeRunEvents")
    .withIndex("by_owner_run_seq", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("runId", run.runId),
    )
    .collect()) as RuntimeRunEventLike[];
  const workingState = compactThreadWorkingState(
    mergeRuntimeWorkingStateTaskLedger({
      previous: args.thread.workingState,
      current: summarizeRuntimeWorkingStateFromEvents({
        latestUserText: extractThreadMessageText(latestRunUserMessage?.contentJson ?? null),
        runStatus: status,
        runReason: reason,
        runErrorMessage: errorMessage,
        events: runEvents,
        nowMs: args.nowMs,
      }),
    }),
  );

  await args.ctx.db.insert("runtimeRunEvents", {
    ownerId: args.ownerId,
    threadId: args.thread._id,
    runId: run.runId,
    seq,
    eventType: "run_finished",
    eventKey: "run_finished",
    payload: {
      run_id: run.runId,
      status,
      reason: reason ?? null,
      error_code: errorCode ?? null,
      error_message: errorMessage ?? null,
    },
    createdAt: finishedAt,
  });
  await args.ctx.db.patch(run._id, {
    status,
    reason,
    errorCode,
    errorMessage,
    ...(status === "cancelled"
      ? {
          stopRequestedAt: run.stopRequestedAt ?? args.nowMs,
          stopReason: reason ?? errorCode ?? "cancelled",
        }
      : {}),
    finishedAt,
    lastEventSeq: seq,
    updatedAt: args.nowMs,
  });
  await args.ctx.db.patch(args.thread._id, {
    workingState,
    ...(status === "ok" && run.visibility !== "internal_hidden"
      ? {
          latestUserVisibleCompletedRunId: run.runId,
        }
      : null),
    updatedAt: args.nowMs,
  });
  const updated = (await args.ctx.db.get(run._id)) as RuntimeRunLike | null;
  if (!updated) throw new Error("runtime_run_not_found");
  await recordRuntimeRunCommunitySourceTraceBestEffort({
    ctx: args.ctx,
    ownerId: args.ownerId,
    run: updated,
    status,
    reason,
    errorCode,
    errorMessage,
    finishedAt,
    nowMs: args.nowMs,
  });
  return updated;
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

function deriveAutoThreadTitlePatch(args: {
  thread: ThreadLike;
  role: CloudMessageLike["role"];
  contentJson: unknown;
}): Record<string, unknown> {
  if (
    args.role !== "user" ||
    (args.thread.titleSource ?? "auto") !== "auto" ||
    String(args.thread.title ?? "").trim()
  ) {
    return {};
  }
  const title = deriveTitleFromContent(args.contentJson);
  return title ? { title } : {};
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
    return buildThreadContextResponse(row, 0);
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
    return await setCloudThreadContextForOwnedThread({
      ctx,
      ownerId,
      existing,
      expectedContextVersion: args.expectedContextVersion,
      communityId: args.communityId,
      updateCommunityId: args.updateCommunityId,
      nowMs,
    });
  },
});

export const setCloudThreadContextByThreadKey = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
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
    const existing = await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey: normalizeThreadKey(args.threadKey),
    });
    if (!existing) return null;
    return await setCloudThreadContextForOwnedThread({
      ctx,
      ownerId,
      existing,
      expectedContextVersion: args.expectedContextVersion,
      communityId: args.communityId,
      updateCommunityId: args.updateCommunityId,
      nowMs: args.nowMs ?? Date.now(),
    });
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
    runtimeEngine: v.optional(v.union(v.literal("polynet"), v.literal("codex"))),
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
    const requestedRuntimeEngine = normalizeOptionalRuntimeEngine(args.runtimeEngine);
    const requestedProjectId = args.projectId
      ? await validateOwnedCloudProjectId({
          ctx,
          ownerId,
          projectId: args.projectId,
        })
      : null;
    const existing = await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey,
    });
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: nowMs };
      if (requestedProjectId && existing.projectId !== requestedProjectId) {
        patch.projectId = requestedProjectId;
      }
      if (typeof args.modelId === "string" && args.modelId.trim() && existing.modelId !== args.modelId.trim()) {
        patch.modelId = args.modelId.trim();
      }
      if (requestedRuntimeEngine && existing.runtimeEngine !== requestedRuntimeEngine) {
        patch.runtimeEngine = requestedRuntimeEngine;
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

    const initialCommunityId = await validateThreadCommunityLensAccess({
      ctx,
      communityId: args.communityId,
      userId: ownerId,
    });
    const id = await ctx.db.insert("threads", {
      ownerId,
      threadKey,
      title: normalizeThreadTitle(args.title) ?? "New thread",
      titleSource: args.titleSource ?? "auto",
      ...(requestedProjectId ? { projectId: requestedProjectId } : {}),
      communityId: initialCommunityId,
      modelId: String(args.modelId ?? "").trim() || undefined,
      runtimeEngine: requestedRuntimeEngine,
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

async function getMemberAgentChannel(args: {
  ctx: any;
  ownerId: any;
  communityId: any;
}): Promise<MemberAgentChannelLike | null> {
  return (await args.ctx.db
    .query("memberAgentChannels")
    .withIndex("by_owner_community", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("communityId", args.communityId),
    )
    .unique()) as MemberAgentChannelLike | null;
}

async function getGlobalMemberAgentChannel(args: {
  ctx: any;
  ownerId: any;
}): Promise<MemberAgentChannelLike | null> {
  return (await args.ctx.db
    .query("memberAgentChannels")
    .withIndex("by_owner_scope", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("scopeKey", MEMBER_AGENT_GLOBAL_SCOPE_KEY),
    )
    .unique()) as MemberAgentChannelLike | null;
}

async function requireActiveMemberAgentEpisodeForUserMessage(args: {
  ctx: any;
  ownerId: any;
  thread: ThreadLike;
}): Promise<void> {
  const threadKey = String(args.thread.threadKey ?? "").trim();
  if (!threadKey.startsWith(`${MEMBER_AGENT_THREAD_KEY_PREFIX}:`)) return;
  const communityId = String(args.thread.communityId ?? "").trim();
  const isGlobalEpisode = isGlobalMemberAgentEpisodeThreadKey(threadKey);
  if (!isGlobalEpisode && (!communityId || !isMemberAgentThreadKeyForCommunity(threadKey, communityId))) {
    throw new Error("member_agent_thread_context_mismatch");
  }
  const channel = isGlobalEpisode
    ? await getGlobalMemberAgentChannel({
        ctx: args.ctx,
        ownerId: args.ownerId,
      })
    : await getMemberAgentChannel({
        ctx: args.ctx,
        ownerId: args.ownerId,
        communityId,
      });
  if (typeof channel?.communityDeletedAt === "number") {
    throw new Error("member_agent_community_deleted");
  }
  if (!channel?.activeEpisodeId) throw new Error("member_agent_episode_not_active");
  const episode = (await args.ctx.db.get(
    channel.activeEpisodeId,
  )) as MemberAgentEpisodeLike | null;
  if (
    !episode ||
    episode.channelId !== channel._id ||
    episode.threadId !== args.thread._id ||
    episode.status !== "active"
  ) {
    throw new Error("member_agent_episode_not_active");
  }
}

async function prepareActiveMemberAgentThread(args: {
  ctx: any;
  thread: ThreadLike;
  communityId: string;
  episodeOrdinal: number;
  nowMs: number;
}): Promise<ThreadLike> {
  const threadKey = String(args.thread.threadKey ?? "").trim();
  const legacyThreadKey = buildMemberAgentThreadKey(args.communityId);
  const expectedEpisodeThreadKey = buildMemberAgentEpisodeThreadKey(
    args.communityId,
    args.episodeOrdinal,
  );
  if (
    String(args.thread.communityId ?? "").trim() !== args.communityId ||
    !isMemberAgentThreadKeyForCommunity(threadKey, args.communityId) ||
    (threadKey !== expectedEpisodeThreadKey &&
      !(args.episodeOrdinal === 1 && threadKey === legacyThreadKey))
  ) {
    throw new Error("member_agent_thread_context_mismatch");
  }
  const patch: Record<string, unknown> = {};
  if (args.thread.modelId !== DEFAULT_ACTIVE_MODEL_ID) patch.modelId = DEFAULT_ACTIVE_MODEL_ID;
  if (args.thread.runtimeEngine !== "polynet") patch.runtimeEngine = "polynet";
  if (typeof args.thread.archivedAt === "number") patch.archivedAt = undefined;
  if (Object.keys(patch).length === 0) return args.thread;
  patch.updatedAt = args.nowMs;
  await args.ctx.db.patch(args.thread._id, patch);
  return ((await args.ctx.db.get(args.thread._id)) as ThreadLike | null) ?? args.thread;
}

async function prepareActiveGlobalMemberAgentThread(args: {
  ctx: any;
  thread: ThreadLike;
  episodeOrdinal: number;
  nowMs: number;
}): Promise<ThreadLike> {
  const threadKey = String(args.thread.threadKey ?? "").trim();
  if (
    threadKey !== buildGlobalMemberAgentEpisodeThreadKey(args.episodeOrdinal) ||
    !isGlobalMemberAgentEpisodeThreadKey(threadKey)
  ) {
    throw new Error("member_agent_thread_context_mismatch");
  }
  const patch: Record<string, unknown> = {};
  if (args.thread.modelId !== DEFAULT_ACTIVE_MODEL_ID) patch.modelId = DEFAULT_ACTIVE_MODEL_ID;
  if (args.thread.runtimeEngine !== "polynet") patch.runtimeEngine = "polynet";
  if (typeof args.thread.archivedAt === "number") patch.archivedAt = undefined;
  if (Object.keys(patch).length === 0) return args.thread;
  patch.updatedAt = args.nowMs;
  await args.ctx.db.patch(args.thread._id, patch);
  return ((await args.ctx.db.get(args.thread._id)) as ThreadLike | null) ?? args.thread;
}

function buildMemberAgentChannelResponse(args: {
  channel: MemberAgentChannelLike;
  episode: MemberAgentEpisodeLike;
  thread: ThreadLike;
  communityId: string;
}) {
  const threadKey = String(args.thread.threadKey ?? "").trim();
  if (!threadKey) throw new Error("member_agent_thread_key_missing");
  return {
    channel_id: String(args.channel._id),
    episode_id: String(args.episode._id),
    episode_ordinal: args.episode.ordinal,
    thread_id: String(args.thread._id),
    thread_key: threadKey,
    community_id: args.communityId,
    model_id: DEFAULT_ACTIVE_MODEL_ID,
    runtime_engine: "polynet" as const,
    context_version: normalizeContextVersion(args.thread.contextVersion),
  };
}

async function ensureMemberAgentCommunityChannelCore(args: {
  ctx: any;
  ownerId: any;
  community: any;
  nowMs: number;
}) {
  const communityId = String(args.community._id);
  const existingChannel = await getMemberAgentChannel({
    ctx: args.ctx,
    ownerId: args.ownerId,
    communityId: args.community._id,
  });
  if (existingChannel) {
    if (typeof existingChannel.communityDeletedAt === "number") {
      throw new Error("member_agent_community_deleted");
    }
    if (!existingChannel.activeEpisodeId) throw new Error("member_agent_active_episode_missing");
    const episode = (await args.ctx.db.get(
      existingChannel.activeEpisodeId,
    )) as MemberAgentEpisodeLike | null;
    if (
      !episode ||
      episode.channelId !== existingChannel._id ||
      episode.status !== "active"
    ) {
      throw new Error("member_agent_active_episode_invalid");
    }
    const storedThread = (await args.ctx.db.get(episode.threadId)) as ThreadLike | null;
    if (!storedThread || storedThread.ownerId !== args.ownerId) {
      throw new Error("member_agent_thread_not_found");
    }
    const thread = await prepareActiveMemberAgentThread({
      ctx: args.ctx,
      thread: storedThread,
      communityId,
      episodeOrdinal: episode.ordinal,
      nowMs: args.nowMs,
    });
    return buildMemberAgentChannelResponse({
      channel: existingChannel,
      episode,
      thread,
      communityId,
    });
  }

  const legacyThreadKey = buildMemberAgentThreadKey(communityId);
  const episodeOneThreadKey = buildMemberAgentEpisodeThreadKey(communityId, 1);
  const adoptedThread =
    (await getCloudThreadByThreadKeyInternal({
      ctx: args.ctx,
      ownerId: args.ownerId,
      threadKey: legacyThreadKey,
    })) ??
    (await getCloudThreadByThreadKeyInternal({
      ctx: args.ctx,
      ownerId: args.ownerId,
      threadKey: episodeOneThreadKey,
    }));
  const threadId = adoptedThread
    ? adoptedThread._id
    : await args.ctx.db.insert("threads", {
        ownerId: args.ownerId,
        threadKey: episodeOneThreadKey,
        titleSource: "auto",
        communityId,
        modelId: DEFAULT_ACTIVE_MODEL_ID,
        runtimeEngine: "polynet",
        contextVersion: 0,
        lastSeq: 0,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
  const storedThread = (await args.ctx.db.get(threadId)) as ThreadLike | null;
  if (!storedThread) throw new Error("member_agent_thread_create_failed");
  const thread = await prepareActiveMemberAgentThread({
    ctx: args.ctx,
    thread: storedThread,
    communityId,
    episodeOrdinal: 1,
    nowMs: args.nowMs,
  });
  const channelId = await args.ctx.db.insert("memberAgentChannels", {
    ownerId: args.ownerId,
    communityId: args.community._id,
    communityNameSnapshot:
      String(args.community.name ?? "Community").trim() || "Community",
    nextOrdinal: 2,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const episodeId = await args.ctx.db.insert("memberAgentEpisodes", {
    channelId,
    threadId,
    ordinal: 1,
    status: "active",
    startedAt: thread.createdAt,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await args.ctx.db.patch(channelId, { activeEpisodeId: episodeId });
  const channel = (await args.ctx.db.get(channelId)) as MemberAgentChannelLike | null;
  const episode = (await args.ctx.db.get(episodeId)) as MemberAgentEpisodeLike | null;
  if (!channel || !episode) throw new Error("member_agent_channel_create_failed");
  return buildMemberAgentChannelResponse({ channel, episode, thread, communityId });
}

async function ensureGlobalMemberAgentChannelCore(args: {
  ctx: any;
  ownerId: any;
  initialCommunity: any;
  nowMs: number;
}) {
  const existingChannel = await getGlobalMemberAgentChannel({
    ctx: args.ctx,
    ownerId: args.ownerId,
  });
  if (existingChannel) {
    if (!existingChannel.activeEpisodeId) throw new Error("member_agent_active_episode_missing");
    const episode = (await args.ctx.db.get(
      existingChannel.activeEpisodeId,
    )) as MemberAgentEpisodeLike | null;
    if (!episode || episode.channelId !== existingChannel._id || episode.status !== "active") {
      throw new Error("member_agent_active_episode_invalid");
    }
    const storedThread = (await args.ctx.db.get(episode.threadId)) as ThreadLike | null;
    if (!storedThread || storedThread.ownerId !== args.ownerId) {
      throw new Error("member_agent_thread_not_found");
    }
    const thread = await prepareActiveGlobalMemberAgentThread({
      ctx: args.ctx,
      thread: storedThread,
      episodeOrdinal: episode.ordinal,
      nowMs: args.nowMs,
    });
    const communityId = String(thread.communityId ?? "").trim();
    if (!communityId) throw new Error("member_agent_community_required");
    return buildMemberAgentChannelResponse({
      channel: existingChannel,
      episode,
      thread,
      communityId,
    });
  }

  const communityId = String(args.initialCommunity._id);
  const threadKey = buildGlobalMemberAgentEpisodeThreadKey(1);
  const collision = await getCloudThreadByThreadKeyInternal({
    ctx: args.ctx,
    ownerId: args.ownerId,
    threadKey,
  });
  if (collision) throw new Error("member_agent_episode_thread_collision");
  const threadId = await args.ctx.db.insert("threads", {
    ownerId: args.ownerId,
    threadKey,
    titleSource: "auto",
    communityId,
    modelId: DEFAULT_ACTIVE_MODEL_ID,
    runtimeEngine: "polynet",
    contextVersion: 0,
    lastSeq: 0,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const channelId = await args.ctx.db.insert("memberAgentChannels", {
    ownerId: args.ownerId,
    scopeKey: MEMBER_AGENT_GLOBAL_SCOPE_KEY,
    nextOrdinal: 2,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const episodeId = await args.ctx.db.insert("memberAgentEpisodes", {
    channelId,
    threadId,
    ordinal: 1,
    status: "active",
    startedAt: args.nowMs,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await args.ctx.db.patch(channelId, { activeEpisodeId: episodeId });
  const channel = (await args.ctx.db.get(channelId)) as MemberAgentChannelLike | null;
  const episode = (await args.ctx.db.get(episodeId)) as MemberAgentEpisodeLike | null;
  const thread = (await args.ctx.db.get(threadId)) as ThreadLike | null;
  if (!channel || !episode || !thread) throw new Error("member_agent_channel_create_failed");
  return buildMemberAgentChannelResponse({ channel, episode, thread, communityId });
}

export const ensureMemberAgentGlobalChannel = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    initialCommunityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.initialCommunityId,
      userId: ownerId,
    });
    return await ensureGlobalMemberAgentChannelCore({
      ctx,
      ownerId,
      initialCommunity: community,
      nowMs: args.nowMs ?? Date.now(),
    });
  },
});

export const startNewMemberAgentGlobalEpisode = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    initialCommunityId: v.id("communities"),
    expectedActiveEpisodeId: v.id("memberAgentEpisodes"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.initialCommunityId,
      userId: ownerId,
    });
    const nowMs = args.nowMs ?? Date.now();
    await ensureGlobalMemberAgentChannelCore({
      ctx,
      ownerId,
      initialCommunity: community,
      nowMs,
    });
    const channel = await getGlobalMemberAgentChannel({ ctx, ownerId });
    if (!channel || !channel.activeEpisodeId) {
      throw new Error("member_agent_active_episode_missing");
    }
    if (channel.activeEpisodeId !== args.expectedActiveEpisodeId) {
      throw new Error("member_agent_active_episode_changed");
    }
    const currentEpisode = (await ctx.db.get(
      channel.activeEpisodeId,
    )) as MemberAgentEpisodeLike | null;
    if (!currentEpisode || currentEpisode.channelId !== channel._id || currentEpisode.status !== "active") {
      throw new Error("member_agent_active_episode_invalid");
    }
    const ordinal = Math.max(
      currentEpisode.ordinal + 1,
      Number.isSafeInteger(channel.nextOrdinal) ? channel.nextOrdinal : 2,
    );
    const communityId = String(community._id);
    const threadKey = buildGlobalMemberAgentEpisodeThreadKey(ordinal);
    const collision = await getCloudThreadByThreadKeyInternal({ ctx, ownerId, threadKey });
    if (collision) throw new Error("member_agent_episode_thread_collision");
    const threadId = await ctx.db.insert("threads", {
      ownerId,
      threadKey,
      titleSource: "auto",
      communityId,
      modelId: DEFAULT_ACTIVE_MODEL_ID,
      runtimeEngine: "polynet",
      contextVersion: 0,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const episodeId = await ctx.db.insert("memberAgentEpisodes", {
      channelId: channel._id,
      threadId,
      ordinal,
      status: "active",
      startedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(currentEpisode._id, {
      status: "closed",
      closedAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(channel._id, {
      activeEpisodeId: episodeId,
      nextOrdinal: ordinal + 1,
      updatedAt: nowMs,
    });
    const nextChannel = (await ctx.db.get(channel._id)) as MemberAgentChannelLike | null;
    const episode = (await ctx.db.get(episodeId)) as MemberAgentEpisodeLike | null;
    const thread = (await ctx.db.get(threadId)) as ThreadLike | null;
    if (!nextChannel || !episode || !thread) throw new Error("member_agent_episode_create_failed");
    return buildMemberAgentChannelResponse({
      channel: nextChannel,
      episode,
      thread,
      communityId,
    });
  },
});

export const ensureMemberAgentCommunityThread = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: ownerId,
    });
    return await ensureMemberAgentCommunityChannelCore({
      ctx,
      ownerId,
      community,
      nowMs: args.nowMs ?? Date.now(),
    });
  },
});

export const startNewMemberAgentCommunityEpisode = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedActiveEpisodeId: v.id("memberAgentEpisodes"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: ownerId,
    });
    const nowMs = args.nowMs ?? Date.now();
    await ensureMemberAgentCommunityChannelCore({ ctx, ownerId, community, nowMs });
    const channel = await getMemberAgentChannel({
      ctx,
      ownerId,
      communityId: community._id,
    });
    if (!channel || !channel.activeEpisodeId) {
      throw new Error("member_agent_active_episode_missing");
    }
    if (channel.activeEpisodeId !== args.expectedActiveEpisodeId) {
      throw new Error("member_agent_active_episode_changed");
    }
    const currentEpisode = (await ctx.db.get(
      channel.activeEpisodeId,
    )) as MemberAgentEpisodeLike | null;
    if (
      !currentEpisode ||
      currentEpisode.channelId !== channel._id ||
      currentEpisode.status !== "active"
    ) {
      throw new Error("member_agent_active_episode_invalid");
    }
    const ordinal = Math.max(
      currentEpisode.ordinal + 1,
      Number.isSafeInteger(channel.nextOrdinal) ? channel.nextOrdinal : 2,
    );
    const communityId = String(community._id);
    const threadKey = buildMemberAgentEpisodeThreadKey(communityId, ordinal);
    const collision = await getCloudThreadByThreadKeyInternal({ ctx, ownerId, threadKey });
    if (collision) throw new Error("member_agent_episode_thread_collision");
    const threadId = await ctx.db.insert("threads", {
      ownerId,
      threadKey,
      titleSource: "auto",
      communityId,
      modelId: DEFAULT_ACTIVE_MODEL_ID,
      runtimeEngine: "polynet",
      contextVersion: 0,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const episodeId = await ctx.db.insert("memberAgentEpisodes", {
      channelId: channel._id,
      threadId,
      ordinal,
      status: "active",
      startedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(currentEpisode._id, {
      status: "closed",
      closedAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(channel._id, {
      activeEpisodeId: episodeId,
      nextOrdinal: ordinal + 1,
      updatedAt: nowMs,
    });
    const nextChannel = (await ctx.db.get(channel._id)) as MemberAgentChannelLike | null;
    const episode = (await ctx.db.get(episodeId)) as MemberAgentEpisodeLike | null;
    const thread = (await ctx.db.get(threadId)) as ThreadLike | null;
    if (!nextChannel || !episode || !thread) {
      throw new Error("member_agent_episode_create_failed");
    }
    return buildMemberAgentChannelResponse({
      channel: nextChannel,
      episode,
      thread,
      communityId,
    });
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
    runtimeEngine: v.optional(v.union(v.literal("polynet"), v.literal("codex"))),
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
    const requestedProjectId = args.projectId
      ? await validateOwnedCloudProjectId({
          ctx,
          ownerId,
          projectId: args.projectId,
        })
      : null;
    const patch: Record<string, unknown> = {
      updatedAt: nowMs,
    };
    if (typeof args.title === "string") {
      patch.title = normalizeThreadTitle(args.title) ?? null;
    }
    if (args.titleSource) patch.titleSource = args.titleSource;
    if (typeof args.modelId === "string") patch.modelId = args.modelId.trim() || undefined;
    const requestedRuntimeEngine = normalizeOptionalRuntimeEngine(args.runtimeEngine);
    if (requestedRuntimeEngine) patch.runtimeEngine = requestedRuntimeEngine;
    if (requestedProjectId) patch.projectId = requestedProjectId;
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
    const sorted = rows.sort((a, b) => a.seq - b.seq);
    return await Promise.all(
      sorted.map(async (row) => ({
        ...row,
        contentJson: await mapCloudMessageContentJsonForRead(ctx, row.contentJson),
      })),
    );
  },
});

export const listNewestCloudThreadMessages = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
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
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 200)));
    const newestFirst = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(safeLimit)) as CloudMessageLike[];
    const chronological = newestFirst.slice().reverse();
    return await Promise.all(
      chronological.map(async (row) => ({
        ...row,
        contentJson: await mapCloudMessageContentJsonForRead(ctx, row.contentJson),
      })),
    );
  },
});

export const listMemberAgentRuntimeMessagesInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    expectedUserMessageKey: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = (await ctx.db.get(args.threadId)) as ThreadLike | null;
    if (!thread || thread.ownerId !== args.ownerId || typeof thread.archivedAt === "number") {
      throw new Error("member_agent_thread_not_found");
    }
    const expectedUserMessageKey = String(args.expectedUserMessageKey ?? "").trim();
    if (!expectedUserMessageKey) throw new Error("member_agent_user_message_key_required");
    const expected = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_owner_messageKey", (q) =>
        q.eq("ownerId", args.ownerId).eq("messageKey", expectedUserMessageKey),
      )
      .first()) as CloudMessageLike | null;
    if (!expected || expected.threadId !== thread._id) {
      throw new Error("member_agent_user_message_not_found");
    }
    if (expected.role !== "user") throw new Error("member_agent_expected_message_not_user");

    const newestFirst = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) =>
        q.eq("threadId", thread._id).lte("seq", expected.seq),
      )
      .order("desc")
      .take(MEMBER_AGENT_CONTEXT_MAX_MESSAGES)) as CloudMessageLike[];
    return newestFirst.map((row) => ({
      messageKey: row.messageKey,
      seq: row.seq,
      role: row.role,
      contentJson: row.contentJson,
    }));
  },
});

function isMemberConversationThreadForChannel(args: {
  channel: MemberAgentChannelLike;
  thread: ThreadLike;
  ownerId: any;
}): boolean {
  if (args.thread.ownerId !== args.ownerId) return false;
  const threadKey = String(args.thread.threadKey ?? "").trim();
  if (args.channel.scopeKey === MEMBER_AGENT_GLOBAL_SCOPE_KEY) {
    return isGlobalMemberAgentEpisodeThreadKey(threadKey);
  }
  const communityId = String(args.channel.communityId ?? "").trim();
  return (
    Boolean(communityId) &&
    String(args.thread.communityId ?? "").trim() === communityId &&
    isMemberAgentThreadKeyForCommunity(threadKey, communityId)
  );
}

async function buildMemberConversationLensHistory(args: {
  ctx: any;
  thread: ThreadLike;
  channel: MemberAgentChannelLike;
}): Promise<Array<{ community_id: string; community_name: string | null }>> {
  const runs = (await args.ctx.db
    .query("runtimeRuns")
    .withIndex("by_thread_startedAt", (q: any) => q.eq("threadId", args.thread._id))
    .order("asc")
    .collect()) as RuntimeRunLike[];
  const ids = runs
    .map((run) => String(run.communityId ?? "").trim())
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
  const fallbackCommunityId = String(args.thread.communityId ?? "").trim();
  if (ids.length === 0 && fallbackCommunityId) ids.push(fallbackCommunityId);
  return await Promise.all(
    ids.map(async (communityId) => {
      const community = (await args.ctx.db.get(communityId as any)) as { name?: unknown } | null;
      const legacySnapshot =
        String(args.channel.communityId ?? "") === communityId
          ? String(args.channel.communityNameSnapshot ?? "").trim() || null
          : null;
      return {
        community_id: communityId,
        community_name: String(community?.name ?? "").trim() || legacySnapshot,
      };
    }),
  );
}

export const listMemberConversationsForToolInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const safeLimit = Math.max(
      1,
      Math.min(
        MEMBER_CONVERSATION_LIST_MAX_LIMIT,
        Math.floor(args.limit ?? MEMBER_CONVERSATION_LIST_DEFAULT_LIMIT),
      ),
    );
    const channels = (await ctx.db
      .query("memberAgentChannels")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect()) as MemberAgentChannelLike[];
    const candidates: Array<{ channel: MemberAgentChannelLike; episode: MemberAgentEpisodeLike }> = [];
    for (const channel of channels) {
      const episodes = (await ctx.db
        .query("memberAgentEpisodes")
        .withIndex("by_channel_ordinal", (q) => q.eq("channelId", channel._id))
        .collect()) as MemberAgentEpisodeLike[];
      for (const episode of episodes) candidates.push({ channel, episode });
    }
    candidates.sort(
      (a, b) => b.episode.startedAt - a.episode.startedAt || b.episode.ordinal - a.episode.ordinal,
    );
    const conversations = [];
    for (const { channel, episode } of candidates) {
      if (conversations.length >= safeLimit) break;
      const thread = (await ctx.db.get(episode.threadId)) as ThreadLike | null;
      if (!thread || !isMemberConversationThreadForChannel({ channel, thread, ownerId: args.ownerId })) {
        continue;
      }
      const firstRows = (await ctx.db
        .query("cloudMessages")
        .withIndex("by_thread_seq", (q) => q.eq("threadId", thread._id))
        .order("asc")
        .take(32)) as CloudMessageLike[];
      const firstUserMessage = firstRows.find((row) => row.role === "user");
      conversations.push({
        episode_id: String(episode._id),
        ordinal: episode.ordinal,
        status:
          channel.scopeKey === MEMBER_AGENT_GLOBAL_SCOPE_KEY ? episode.status : "historical",
        storage_scope:
          channel.scopeKey === MEMBER_AGENT_GLOBAL_SCOPE_KEY ? "global" : "legacy_community",
        title: deriveMemberConversationTitle({
          storedTitle: thread.title,
          communityName: channel.communityNameSnapshot,
          firstUserContentJson: firstUserMessage?.contentJson,
          ordinal: episode.ordinal,
        }),
        started_at: episode.startedAt,
        closed_at: episode.closedAt ?? null,
        message_count_estimate: Math.max(0, Math.floor(thread.lastSeq ?? 0)),
        lens_history: await buildMemberConversationLensHistory({ ctx, thread, channel }),
      });
    }
    return { conversations };
  },
});

export const readMemberConversationForToolInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    episodeId: v.id("memberAgentEpisodes"),
  },
  handler: async (ctx, args) => {
    const episode = (await ctx.db.get(args.episodeId)) as MemberAgentEpisodeLike | null;
    if (!episode) throw new Error("member_conversation_not_found");
    const channel = (await ctx.db.get(episode.channelId)) as MemberAgentChannelLike | null;
    if (!channel || channel.ownerId !== args.ownerId) throw new Error("member_conversation_not_found");
    const thread = (await ctx.db.get(episode.threadId)) as ThreadLike | null;
    if (!thread || !isMemberConversationThreadForChannel({ channel, thread, ownerId: args.ownerId })) {
      throw new Error("member_conversation_not_found");
    }
    const headRows = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) => q.eq("threadId", thread._id))
      .order("asc")
      .take(64)) as CloudMessageLike[];
    const tailWindow = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(161)) as CloudMessageLike[];
    const hasMessagesOutsideTailWindow = tailWindow.length > 160;
    const tailRows = tailWindow.slice(0, 160);
    const transcript = buildMemberConversationRecallTranscript({
      headRows,
      tailRows,
    });
    const runs = (await ctx.db
      .query("runtimeRuns")
      .withIndex("by_thread_startedAt", (q) => q.eq("threadId", thread._id))
      .collect()) as RuntimeRunLike[];
    const runsById = new Map(runs.map((run) => [run.runId, run]));
    const firstUserMessage = headRows.find((row) => row.role === "user");
    const visibleWindowMessageCount = new Set(
      [...headRows, ...tailRows]
        .filter((row) => row.role === "user" || row.role === "assistant")
        .map((row) => row.messageKey),
    ).size;
    return {
      episode_id: String(episode._id),
      ordinal: episode.ordinal,
      status:
        channel.scopeKey === MEMBER_AGENT_GLOBAL_SCOPE_KEY ? episode.status : "historical",
      storage_scope:
        channel.scopeKey === MEMBER_AGENT_GLOBAL_SCOPE_KEY ? "global" : "legacy_community",
      title: deriveMemberConversationTitle({
        storedTitle: thread.title,
        communityName: channel.communityNameSnapshot,
        firstUserContentJson: firstUserMessage?.contentJson,
        ordinal: episode.ordinal,
      }),
      started_at: episode.startedAt,
      closed_at: episode.closedAt ?? null,
      lens_history: await buildMemberConversationLensHistory({ ctx, thread, channel }),
      messages: transcript.messages.map((message, index, messages) => {
        const nextConversationalMessage =
          message.role === "user"
            ? messages.slice(index + 1).find(
                (candidate) => candidate.role === "assistant" || candidate.role === "user",
              )
            : null;
        const followingAssistant =
          nextConversationalMessage?.role === "assistant" ? nextConversationalMessage : null;
        const runId = message.runId ?? followingAssistant?.runId;
        const run = runId ? runsById.get(runId) : null;
        const communityId = String(run?.communityId ?? "").trim() || null;
        return {
          seq: message.seq,
          role: message.role,
          content: message.content,
          community_id: communityId,
          community_context_version:
            communityId && typeof run?.communityContextVersion === "number"
              ? run.communityContextVersion
              : null,
        };
      }),
      returned_message_count: transcript.messages.length,
      character_count: transcript.characterCount,
      history_truncated:
        hasMessagesOutsideTailWindow || visibleWindowMessageCount > transcript.messages.length,
    };
  },
});

export const generateCloudThreadAttachmentUploadUrl = mutation({
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
    await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
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
      typeof args.seq === "number" && Number.isFinite(args.seq) && args.seq > 0
        ? Math.floor(args.seq)
        : null;
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

    if (args.role === "user") {
      await requireActiveMemberAgentEpisodeForUserMessage({ ctx, ownerId, thread });
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
      ...deriveAutoThreadTitlePatch({
        thread,
        role: args.role,
        contentJson: args.contentJson,
      }),
    };
    await ctx.db.patch(thread._id, patch);

    const created = (await ctx.db.get(id)) as CloudMessageLike | null;
    if (!created) throw new Error("message_create_failed");
    return created;
  },
});

export const upsertCloudThreadMessageByMessageKey = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    messageKey: v.string(),
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
    const messageKey = String(args.messageKey ?? "").trim();
    if (!messageKey) throw new Error("message_key_required");

    if (args.role === "user") {
      await requireActiveMemberAgentEpisodeForUserMessage({ ctx, ownerId, thread });
    }

    const existing = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_owner_messageKey", (q) =>
        q.eq("ownerId", ownerId).eq("messageKey", messageKey),
      )
      .first()) as CloudMessageLike | null;

    if (existing) {
      if (existing.threadId !== thread._id) {
        throw new Error("message_key_conflict");
      }
      await ctx.db.patch(existing._id, {
        role: args.role,
        contentJson: args.contentJson,
        engineId: String(args.engineId ?? "").trim() || undefined,
        modelId: String(args.modelId ?? "").trim() || undefined,
        runId: String(args.runId ?? "").trim() || undefined,
      });
      await ctx.db.patch(thread._id, {
        updatedAt: nowMs,
        lastSeq: Math.max(0, Math.floor(Math.max(thread.lastSeq ?? 0, existing.seq ?? 0))),
        ...deriveAutoThreadTitlePatch({
          thread,
          role: args.role,
          contentJson: args.contentJson,
        }),
      });
      const updated = (await ctx.db.get(existing._id)) as CloudMessageLike | null;
      if (!updated) throw new Error("message_update_failed");
      return updated;
    }

    const seq = Math.max(0, Math.floor((thread.lastSeq ?? 0) + 1));
    const createdAt =
      typeof args.createdAt === "number" && Number.isFinite(args.createdAt)
        ? Math.floor(args.createdAt)
        : nowMs;
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
    await ctx.db.patch(thread._id, {
      updatedAt: nowMs,
      lastSeq: Math.max(0, Math.floor(Math.max(thread.lastSeq ?? 0, seq))),
      ...deriveAutoThreadTitlePatch({
        thread,
        role: args.role,
        contentJson: args.contentJson,
      }),
    });
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
      if (found && found.ownerId === ownerId && found.threadId === thread._id) {
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

export const listCloudRuntimeRunsByOwner = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(safeLimit)) as RuntimeRunLike[];
    return rows;
  },
});

export const getCloudRuntimeHarnessScorecard = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
    includeInternalHidden: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const safeLimit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
    const includeInternalHidden = args.includeInternalHidden === true;
    const runs = await listRecentRuntimeRunsForScorecard({
      ctx,
      ownerId,
      limit: safeLimit,
      includeInternalHidden,
    });

    return buildRuntimeHarnessScorecard({
      runs: runs.map((run) => ({
        run: {
          runId: run.runId,
          status: run.status,
          visibility: run.visibility,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
        },
        telemetrySummary: run.runtimeHarnessTelemetrySummary,
      })),
      nowMs: Date.now(),
    });
  },
});

export const backfillCloudRuntimeHarnessTelemetrySummaries = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
    includeInternalHidden: v.optional(v.boolean()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const safeLimit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const includeInternalHidden = args.includeInternalHidden === true;
    const force = args.force === true;
    const runs = await listRecentRuntimeRunsForScorecard({
      ctx,
      ownerId,
      limit: safeLimit,
      includeInternalHidden,
    });

    let updatedRunCount = 0;
    let skippedRunCount = 0;

    for (const run of runs) {
      const hasExistingSummary =
        run.runtimeHarnessTelemetrySummary &&
        typeof run.runtimeHarnessTelemetrySummary === "object" &&
        !Array.isArray(run.runtimeHarnessTelemetrySummary);
      if (hasExistingSummary && !force) {
        skippedRunCount += 1;
        continue;
      }
      const events = (await ctx.db
        .query("runtimeRunEvents")
        .withIndex("by_owner_run_seq", (q: any) =>
          q.eq("ownerId", ownerId).eq("runId", run.runId),
        )
        .collect()) as RuntimeRunEventLike[];
      const telemetrySummary = buildRuntimeHarnessTelemetrySummaryFromEvents(
        events.map((event) => ({
          eventType: event.eventType,
          payload: event.payload,
        })),
      );
      await ctx.db.patch(run._id, {
        runtimeHarnessTelemetrySummary: telemetrySummary,
      });
      updatedRunCount += 1;
    }

    return {
      scannedRunCount: runs.length,
      updatedRunCount,
      skippedRunCount,
    };
  },
});

export const getRuntimeRunByOwnerRunIdInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const runId = normalizeRunId(args.runId);
    return await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
      runId,
    });
  },
});

export const getDaytonaWorkspacePreviewReadyEventInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    port: v.number(),
  },
  handler: async (ctx, args) => {
    const runId = normalizeRunId(args.runId);
    const port = normalizeWorkspacePreviewPort(args.port);
    if (port === null) return null;
    const rows = (await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_seq", (q: any) => q.eq("ownerId", args.ownerId).eq("runId", runId))
      .collect()) as RuntimeRunEventLike[];
    for (const row of [...rows].reverse()) {
      if (row.eventType !== "workspace_preview_ready") continue;
      const payload = asRecord(row.payload);
      if (!payload) continue;
      if (String(payload.provider ?? "").trim() !== "daytona") continue;
      const eventPort = normalizeWorkspacePreviewPort(payload.port);
      if (eventPort !== port) continue;
      return row;
    }
    return null;
  },
});

export const listStaleRunningRuntimeRunsInternal = internalQuery({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const safeLimit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const staleBeforeMs = Math.max(0, nowMs - RUNTIME_RUN_STALE_AFTER_MS);
    const rows = (await ctx.db
      .query("runtimeRuns")
      .withIndex("by_status_updatedAt", (q: any) =>
        q.eq("status", "running").lt("updatedAt", staleBeforeMs),
      )
      .take(safeLimit)) as RuntimeRunLike[];
    return rows.filter((run) => isRuntimeRunStale({ run, nowMs }));
  },
});

export const getUserByAuthSubjectInternal = internalQuery({
  args: {
    authSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const authSubject = String(args.authSubject ?? "").trim();
    if (!authSubject) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
      .first();
  },
});

export const listRuntimeRunEventsByOwnerRunIdInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const runId = normalizeRunId(args.runId);
    const rows = (await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_seq", (q: any) => q.eq("ownerId", args.ownerId).eq("runId", runId))
      .collect()) as RuntimeRunEventLike[];
    return rows.sort((a, b) => a.seq - b.seq);
  },
});

export const listRecentRuntimeToolFinishedEventsByOwnerThreadIdInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    currentRunId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const safeLimit = Math.max(1, Math.min(80, Math.floor(args.limit ?? 40)));
    const currentRunId = String(args.currentRunId ?? "").trim();
    const runs = (await ctx.db
      .query("runtimeRuns")
      .withIndex("by_thread_startedAt", (q: any) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(6)) as RuntimeRunLike[];
    const candidateRunIds = [
      currentRunId,
      ...runs
        .filter((run) => run.ownerId === args.ownerId)
        .map((run) => run.runId),
    ].filter((runId): runId is string => Boolean(runId));
    const uniqueRunIds = Array.from(new Set(candidateRunIds)).slice(0, 6);
    const events: RuntimeRunEventLike[] = [];
    for (const runId of uniqueRunIds) {
      const rows = (await ctx.db
        .query("runtimeRunEvents")
        .withIndex("by_owner_run_seq", (q: any) =>
          q.eq("ownerId", args.ownerId).eq("runId", runId),
        )
        .collect()) as RuntimeRunEventLike[];
      for (const row of rows) {
        if (row.threadId !== args.threadId) continue;
        if (row.eventType !== "tool_call_finished") continue;
        events.push(row);
      }
    }
    return events
      .sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq)
      .slice(0, safeLimit)
      .map((row) => ({
        eventType: row.eventType,
        payload: row.payload,
        createdAt: row.createdAt,
      }));
  },
});

export const ensureCloudRuntimeRunStarted = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    runId: v.string(),
    lane: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("user_visible"), v.literal("internal_hidden"))),
    internalFollowupKind: v.optional(v.string()),
    projectId: v.optional(v.id("cloudProjects")),
    communityId: v.optional(v.id("communities")),
    communityContextVersion: v.optional(v.number()),
    modelId: v.optional(v.string()),
    engineId: v.optional(v.string()),
    runtimeEngineRequested: v.optional(v.string()),
    runtimeEngineResolved: v.optional(v.string()),
    runtimeEngineSource: v.optional(v.string()),
    executionMode: v.optional(v.string()),
    sandboxMode: v.optional(v.string()),
    contractName: v.optional(v.string()),
    contractVersion: v.optional(v.string()),
    harnessProfile: v.optional(v.string()),
    harnessProfileSource: v.optional(v.string()),
    capabilityFamilies: v.optional(v.array(v.string())),
    accountPlan: v.optional(v.union(v.literal("free"), v.literal("premium"))),
    latestUserText: v.optional(v.string()),
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
      assertRuntimeRunMatchesRequestedCommunityLens({
        run: existing,
        requestedCommunityId: args.communityId,
        requestedContextVersion: args.communityContextVersion,
      });
      return existing;
    }

    const runtimeCommunityLens = await resolveRuntimeRunCanonicalCommunityLens({
      ctx,
      thread,
      ownerId,
      requestedCommunityId: args.communityId,
      requestedContextVersion: args.communityContextVersion,
    });

    let runningRun = await getRunningRuntimeRunByThread({
      ctx,
      threadId: thread._id,
    });
    if (runningRun && runningRun.runId !== runId && isRuntimeRunStale({ run: runningRun, nowMs })) {
      await finalizeRuntimeRunRecord({
        ctx,
        ownerId,
        thread,
        run: runningRun,
        status: "error",
        reason: "stale_run_reconciled",
        errorCode: "stale_run_reconciled",
        errorMessage: "Previous run lost liveness and was reconciled before starting a new turn.",
        nowMs,
        finishedAt: nowMs,
      });
      runningRun = await getRunningRuntimeRunByThread({
        ctx,
        threadId: thread._id,
      });
    }
    if (runningRun) {
      if (runningRun.runId === runId) return runningRun;
      throw new Error("thread_run_in_progress");
    }

    const startedAt =
      typeof args.startedAt === "number" && Number.isFinite(args.startedAt) ? Math.floor(args.startedAt) : nowMs;
    const lane = normalizeRunLane(args.lane);
    const visibility = args.visibility === "internal_hidden" ? "internal_hidden" : "user_visible";
    const internalFollowupKind = String(args.internalFollowupKind ?? "").trim() || undefined;
    const executionMode = String(args.executionMode ?? "").trim() || "chat";
    const contractName = String(args.contractName ?? "").trim() || "canonical_cloud_run_v1";
    const contractVersion = String(args.contractVersion ?? "").trim() || "v1";
    const modelId = String(args.modelId ?? "").trim() || undefined;
    const engineId = String(args.engineId ?? "").trim() || undefined;
    const runtimeEngineRequested =
      String(args.runtimeEngineRequested ?? "").trim() || undefined;
    const runtimeEngineResolved =
      String(args.runtimeEngineResolved ?? "").trim() || undefined;
    const runtimeEngineSource =
      String(args.runtimeEngineSource ?? "").trim() || undefined;
    const projectId = args.projectId;
    const communityId = runtimeCommunityLens.communityId;
    const communityContextVersion = runtimeCommunityLens.communityContextVersion;
    const sandboxMode = String(args.sandboxMode ?? "").trim() || undefined;
    const harnessProfile = String(args.harnessProfile ?? "").trim() || undefined;
    const harnessProfileSource = String(args.harnessProfileSource ?? "").trim() || undefined;
    const accountPlan = args.accountPlan === "premium" ? "premium" : "free";
    const capabilityFamilies = Array.isArray(args.capabilityFamilies)
      ? args.capabilityFamilies
          .map((value) => String(value ?? "").trim())
          .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index)
      : undefined;
    const startedWorkingState =
      visibility === "internal_hidden"
        ? null
        : buildRunStartedWorkingState({
            previous: thread.workingState,
            latestUserText: args.latestUserText,
            nowMs,
          });

    const id = await ctx.db.insert("runtimeRuns", {
      ownerId,
      threadId: thread._id,
      runId,
      lane,
      visibility,
      internalFollowupKind,
      projectId,
      communityId,
      communityContextVersion,
      modelId,
      engineId,
      executionMode,
      sandboxMode,
      contractName,
      contractVersion,
      harnessProfile,
      harnessProfileSource,
      capabilityFamilies,
      accountPlan,
      workspaceSessionState: "none",
      runtimeHarnessTelemetrySummary: createEmptyRuntimeHarnessTelemetrySummary(),
      workspaceSessionUpdatedAt: startedAt,
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
        visibility,
        internal_followup_kind: internalFollowupKind ?? null,
        project_id: projectId ?? null,
        community_id: communityId ?? null,
        community_context_version: communityContextVersion ?? null,
        model_id: modelId ?? null,
        engine_id: engineId ?? null,
        runtime_engine_requested: runtimeEngineRequested ?? null,
        runtime_engine_resolved: runtimeEngineResolved ?? null,
        runtime_engine_source: runtimeEngineSource ?? null,
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
    if (startedWorkingState) {
      await ctx.db.patch(thread._id, {
        workingState: startedWorkingState,
        updatedAt: nowMs,
      });
    }

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
    const runtimeHarnessTelemetrySummary = applyRuntimeHarnessTelemetryEvent({
      summary: run.runtimeHarnessTelemetrySummary,
      eventType,
      payload: args.payload,
    });
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
      runtimeHarnessTelemetrySummary,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id)) as RuntimeRunEventLike | null;
    if (!created) throw new Error("runtime_event_create_failed");
    return created;
  },
});

export const appendCloudRuntimeRunEventInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    eventType: v.string(),
    eventKey: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
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
        .withIndex("by_owner_run_eventKey", (q: any) =>
          q.eq("ownerId", args.ownerId).eq("runId", runId).eq("eventKey", eventKey),
        )
        .first()) as RuntimeRunEventLike | null;
      if (existing) return existing;
    }

    const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;
    const createdAt =
      typeof args.createdAt === "number" && Number.isFinite(args.createdAt)
        ? Math.floor(args.createdAt)
        : nowMs;
    const runtimeHarnessTelemetrySummary = applyRuntimeHarnessTelemetryEvent({
      summary: run.runtimeHarnessTelemetrySummary,
      eventType,
      payload: args.payload,
    });
    const id = await ctx.db.insert("runtimeRunEvents", {
      ownerId: args.ownerId,
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
      runtimeHarnessTelemetrySummary,
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

    return await finalizeRuntimeRunRecord({
      ctx,
      ownerId,
      thread,
      run,
      status,
      reason: args.reason,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      nowMs,
      finishedAt: args.finishedAt,
    });
  },
});

export const setCloudRuntimeRunContextSnapshotInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    phase: v.union(v.literal("started"), v.literal("active"), v.literal("finished")),
    snapshot: v.any(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
      runId,
    });
    if (!run) return null;
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");
    const patch =
      args.phase === "started"
        ? {
            startedContextSnapshot: args.snapshot,
            activeContextSnapshot: args.snapshot,
            activeContextSnapshotUpdatedAt: nowMs,
            updatedAt: nowMs,
          }
        : args.phase === "finished"
          ? {
              finishedContextSnapshot: args.snapshot,
              activeContextSnapshot: args.snapshot,
              activeContextSnapshotUpdatedAt: nowMs,
              updatedAt: nowMs,
            }
          : {
              activeContextSnapshot: args.snapshot,
              activeContextSnapshotUpdatedAt: nowMs,
              updatedAt: nowMs,
            };
    await ctx.db.patch(run._id, patch);
    return (await ctx.db.get(run._id)) as RuntimeRunLike | null;
  },
});

export const appendCloudRuntimeRunPendingSteeringInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    text: v.string(),
    messageKey: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const text = String(args.text ?? "").trim();
    if (!text) return null;
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
      runId,
    });
    if (!run) return null;
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");
    if (run.status !== "running") return run;
    const existing = Array.isArray(run.pendingUserSteering)
      ? run.pendingUserSteering
      : [];
    const pendingUserSteering = [
      ...existing,
      {
        text,
        receivedAt: nowMs,
        messageKey: String(args.messageKey ?? "").trim() || undefined,
      },
    ].slice(-8);
    await ctx.db.patch(run._id, {
      pendingUserSteering,
      updatedAt: nowMs,
    });
    return (await ctx.db.get(run._id)) as RuntimeRunLike | null;
  },
});

export const getActiveRuntimeTurnStateInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    const run = await getRunningRuntimeRunByThread({
      ctx,
      threadId: thread._id,
    });
    if (!run || run.ownerId !== args.ownerId) return null;
    return {
      runId: run.runId,
      threadId: String(run.threadId),
      projectId: run.projectId ? String(run.projectId) : null,
      status: run.status,
      reason: run.reason ?? null,
      errorCode: run.errorCode ?? null,
      errorMessage: run.errorMessage ?? null,
      pendingUserSteering: Array.isArray(run.pendingUserSteering)
        ? run.pendingUserSteering.slice(-8)
        : [],
      stopRequestedAt: run.stopRequestedAt ?? null,
      stopReason: run.stopReason ?? null,
      activeContextSnapshot: run.activeContextSnapshot ?? null,
      activeContextSnapshotUpdatedAt: run.activeContextSnapshotUpdatedAt ?? null,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
    };
  },
});

export const reconcileOrphanedCloudRuntimeRunInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    providerSandboxId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
      runId,
    });
    if (!run) return null;
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");
    if (run.status !== "running") return run;

    const eventKey = `sandbox_orphan_reconciled:${String(args.providerSandboxId ?? "").trim()}`;
    const existingEvent = (await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_eventKey", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", runId).eq("eventKey", eventKey),
      )
      .first()) as RuntimeRunEventLike | null;
    if (!existingEvent) {
      const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;
      await ctx.db.insert("runtimeRunEvents", {
        ownerId: args.ownerId,
        threadId: thread._id,
        runId,
        seq,
        eventType: "sandbox_orphan_reconciled",
        eventKey,
        payload: {
          run_id: runId,
          sandbox_id: String(args.providerSandboxId ?? "").trim() || null,
          reason: "sandbox_orphan_reconciled",
        },
        createdAt: nowMs,
      });
      await ctx.db.patch(run._id, {
        lastEventSeq: seq,
        updatedAt: nowMs,
      });
      const refreshedRun = (await ctx.db.get(run._id)) as RuntimeRunLike | null;
      if (refreshedRun) {
        return await finalizeRuntimeRunRecord({
          ctx,
          ownerId: args.ownerId,
          thread,
          run: refreshedRun,
          status: "error",
          reason: "sandbox_orphan_reconciled",
          errorCode: "sandbox_orphan_reconciled",
          errorMessage: "Workspace sandbox was reconciled after runtime cleanup was missed.",
          nowMs,
          finishedAt: nowMs,
        });
      }
    }

    return await finalizeRuntimeRunRecord({
      ctx,
      ownerId: args.ownerId,
      thread,
      run,
      status: "error",
      reason: "sandbox_orphan_reconciled",
      errorCode: "sandbox_orphan_reconciled",
      errorMessage: "Workspace sandbox was reconciled after runtime cleanup was missed.",
      nowMs,
      finishedAt: nowMs,
    });
  },
});

export const finalizeStaleCloudRuntimeRunInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
      runId,
    });
    if (!run) {
      return {
        finalized: false,
        status: "missing",
        stale: false,
      };
    }
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");
    if (run.status !== "running") {
      return {
        finalized: false,
        status: run.status,
        stale: false,
      };
    }
    if (!isRuntimeRunStale({ run, nowMs })) {
      return {
        finalized: false,
        status: "running",
        stale: false,
      };
    }
    const updated = await finalizeRuntimeRunRecord({
      ctx,
      ownerId: args.ownerId,
      thread,
      run,
      status: "error",
      reason: "stale_runtime_workspace_run_reconciled",
      errorCode: "stale_runtime_workspace_run_reconciled",
      errorMessage: "Runtime workspace run stopped heartbeating and was reconciled by the stale-run cleanup wall.",
      nowMs,
      finishedAt: nowMs,
    });
    return {
      finalized: true,
      status: updated.status,
      stale: true,
    };
  },
});

export const touchCloudRuntimeRunHeartbeatInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
      runId,
    });
    if (!run) return null;
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");
    if (run.status !== "running") return run;
    await ctx.db.patch(run._id, {
      updatedAt: nowMs,
    });
    return await ctx.db.get(run._id);
  },
});

export const setCloudRuntimeRunWorkspaceSessionInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    state: v.union(
      v.literal("active"),
      v.literal("released"),
      v.literal("failed"),
    ),
    providerSandboxId: v.optional(v.string()),
    toolboxProxyUrl: v.optional(v.string()),
    region: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const runId = normalizeRunId(args.runId);
    const run = await getRuntimeRunByOwnerRunId({
      ctx,
      ownerId: args.ownerId,
      runId,
    });
    if (!run) return null;
    await ctx.db.patch(run._id, {
      workspaceSessionState: args.state,
      workspaceProviderSandboxId:
        String(args.providerSandboxId ?? "").trim() || undefined,
      workspaceToolboxProxyUrl:
        String(args.toolboxProxyUrl ?? "").trim() || undefined,
      workspaceSessionRegion: String(args.region ?? "").trim() || undefined,
      workspaceSessionUpdatedAt: nowMs,
      updatedAt: nowMs,
    });
    return (await ctx.db.get(run._id)) as RuntimeRunLike | null;
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
    if (isRuntimeRunStale({ run, nowMs: Date.now() })) return null;
    if (run.visibility === "internal_hidden") return null;
    return run;
  },
});

export const markCloudThreadAgentAttentionSeen = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
    nowMs: v.optional(v.number()),
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
    const latestRunId = String(thread.latestUserVisibleCompletedRunId ?? "").trim();
    if (!latestRunId) return thread;
    if (String(thread.lastSeenUserVisibleCompletedRunId ?? "").trim() === latestRunId) {
      return thread;
    }
    await ctx.db.patch(thread._id, {
      lastSeenUserVisibleCompletedRunId: latestRunId,
    });
    return (await ctx.db.get(thread._id)) as ThreadLike | null;
  },
});

export const cancelCloudRuntimeRunByThreadKey = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
    runId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const threadKey = String(args.threadKey ?? "").trim();
    if (!threadKey) throw new Error("thread_key_required");
    const thread = await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey,
    });
    if (!thread) return null;

    const explicitRunId = String(args.runId ?? "").trim();
    const run = explicitRunId
      ? await getRuntimeRunByOwnerRunId({
          ctx,
          ownerId,
          runId: normalizeRunId(explicitRunId),
        })
      : await getRunningRuntimeRunByThread({
          ctx,
          threadId: thread._id,
        });
    if (!run) return null;
    if (run.threadId !== thread._id) throw new Error("run_thread_conflict");
    if (run.status !== "running") return run;

    return await finalizeRuntimeRunRecord({
      ctx,
      ownerId,
      thread,
      run,
      status: "cancelled",
      reason: "user_cancelled",
      errorCode: "user_cancelled",
      errorMessage: "Run cancelled by user.",
      nowMs,
      finishedAt: nowMs,
    });
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
    const filtered = !args.threadId
      ? out
      : out.filter((row: RuntimeRunEventLike) => row.threadId === args.threadId);
    return await Promise.all(
      filtered.map(async (row: RuntimeRunEventLike) => ({
        ...row,
        payload: await hydrateRuntimeEventPayload(ctx, row.payload),
      })),
    );
  },
});

export const getCloudRuntimeRunComputerUseLiveSession = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const ownerId = await resolveOwnerIdForAuthenticatedRequest({
        ctx,
        ownerId: args.ownerId,
        authSubject: args.authSubject ?? null,
      });
      const runId = normalizeRunId(args.runId);

      const baseDebug: Record<string, unknown> = {
        owner_id_present: Boolean(ownerId),
        requested_run_id: runId,
      };
      const run = (await ctx.runQuery(internal.threads.getRuntimeRunByOwnerRunIdInternal as any, {
        ownerId,
        runId,
      })) as RuntimeRunLike | null;
      if (!run) {
        return {
          ok: false,
          status: 404,
          code: "runtime_run_not_found",
          message: "Runtime run not found.",
          debug: {
            ...baseDebug,
            stage: "run_lookup",
            run_found: false,
          },
        };
      }
      return {
        ok: false,
        status: 501,
        code: "computer_use_not_supported",
        message: "Live desktop is not available on the Blaxel workspace provider yet.",
        retryable: false,
        debug: {
          ...baseDebug,
          stage: "provider_unsupported",
          run_found: true,
          run_status: run.status,
          run_thread_id: run.threadId ?? null,
          workspace_session_state: run.workspaceSessionState ?? null,
          workspace_provider_sandbox_id: run.workspaceProviderSandboxId ?? null,
          workspace_toolbox_proxy_url_present: Boolean(run.workspaceToolboxProxyUrl),
          provider_id: "blaxel",
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
      return {
        ok: false,
        status: 500,
        code: "live_lookup_failed",
        message: "Live desktop lookup failed before a session could be resolved.",
        retryable: true,
        debug: {
          stage: "action_exception",
          message,
        },
      };
    }
  },
});

export const captureCloudRuntimeRunComputerUseScreenshot = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    runId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const ownerId = await resolveOwnerIdForAuthenticatedRequest({
        ctx,
        ownerId: args.ownerId,
        authSubject: args.authSubject ?? null,
      });
      const runId = normalizeRunId(args.runId);
      const baseDebug: Record<string, unknown> = {
        owner_id_present: Boolean(ownerId),
        requested_run_id: runId,
      };
      const run = (await ctx.runQuery(internal.threads.getRuntimeRunByOwnerRunIdInternal as any, {
        ownerId,
        runId,
      })) as RuntimeRunLike | null;
      if (!run) {
        return {
          ok: false,
          status: 404,
          code: "runtime_run_not_found",
          message: "Runtime run not found.",
          retryable: false,
          debug: {
            ...baseDebug,
            stage: "run_lookup",
            run_found: false,
          },
        };
      }
      const captured = (await ctx.runAction(
        (internal as any).daytonaCodexRuntimeTargetActions
          .captureDaytonaComputerUseScreenshotInternal as any,
        {
          ownerId,
          runId,
          reason:
            String(args.reason ?? "").trim() ||
            "authenticated_cloud_runtime_computer_use_screenshot",
        },
      )) as Record<string, unknown>;
      if (captured?.ok !== true) {
        return {
          ok: false,
          status: 409,
          code:
            String(captured?.code ?? "").trim() ||
            "daytona_computer_use_screenshot_unavailable",
          message:
            String(captured?.message ?? "").trim() ||
            "Daytona Computer Use screenshot is unavailable for this run.",
          retryable:
            String(captured?.code ?? "") !== "daytona_runtime_target_not_found" &&
            String(captured?.code ?? "") !== "daytona_sandbox_not_available",
          debug: {
            ...baseDebug,
            stage: "daytona_capture",
            run_found: true,
            run_status: run.status,
            run_thread_id: run.threadId ?? null,
            provider_id: "daytona",
          },
        };
      }
      return {
        ok: true,
        frame_url: captured.frame_url ?? null,
        frame_mime_type: captured.frame_mime_type ?? null,
        frame_size_bytes: captured.frame_size_bytes ?? null,
        screenshot_method: captured.screenshot_method ?? null,
        screenshot_width: captured.screenshot_width ?? null,
        screenshot_height: captured.screenshot_height ?? null,
        debug: {
          ...baseDebug,
          stage: "daytona_capture",
          run_found: true,
          run_status: run.status,
          run_thread_id: run.threadId ?? null,
          provider_id: "daytona",
          status_keys: captured.status_keys ?? [],
          result_keys: captured.result_keys ?? [],
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
      return {
        ok: false,
        status: 500,
        code: "computer_use_screenshot_failed",
        message: "Computer-use screenshot failed before a frame could be captured.",
        retryable: true,
        debug: {
          stage: "action_exception",
          message,
        },
      };
    }
  },
});

export const getCloudRuntimeRunDaytonaPreviewSession = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    runId: v.string(),
    port: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const ownerId = await resolveOwnerIdForAuthenticatedRequest({
        ctx,
        ownerId: args.ownerId,
        authSubject: args.authSubject ?? null,
      });
      const runId = normalizeRunId(args.runId);
      const port = normalizeWorkspacePreviewPort(args.port);
      if (port === null) {
        return {
          ok: false,
          status: 400,
          code: "invalid_preview_port",
          message: "Preview port is invalid.",
          retryable: false,
        };
      }

      const run = (await ctx.runQuery(internal.threads.getRuntimeRunByOwnerRunIdInternal as any, {
        ownerId,
        runId,
      })) as RuntimeRunLike | null;
      if (!run) {
        return {
          ok: false,
          status: 404,
          code: "runtime_run_not_found",
          message: "Runtime run not found.",
          retryable: false,
        };
      }
      const previewReadyEvent = (await ctx.runQuery(
        internal.threads.getDaytonaWorkspacePreviewReadyEventInternal as any,
        {
          ownerId,
          runId,
          port,
        },
      )) as RuntimeRunEventLike | null;
      if (!previewReadyEvent) {
        return {
          ok: false,
          status: 403,
          code: "daytona_preview_not_authorized",
          message: "No Daytona app preview was started for this run and port.",
          retryable: false,
        };
      }

      const preview = (await ctx.runAction(
        (internal as any).daytonaCodexRuntimeTargetActions
          .resolveDaytonaCodexRuntimePreviewInternal as any,
        {
          ownerId,
          runId,
          port,
        },
      )) as Record<string, unknown> | null;
      if (!preview || preview.ok !== true) {
        const code = String(preview?.code ?? "daytona_preview_unavailable").trim() || "daytona_preview_unavailable";
        return {
          ok: false,
          status: code === "daytona_runtime_target_not_found" ? 404 : 503,
          code,
          message: String(preview?.message ?? "Daytona preview is unavailable."),
          retryable:
            code !== "runtime_run_not_found" &&
            code !== "daytona_sandbox_not_available" &&
            code !== "invalid_preview_port",
        };
      }

      return {
        ok: true,
        preview_url:
          typeof preview.preview_url === "string" ? preview.preview_url : null,
        preview_proxy_token: String(preview.preview_proxy_token ?? ""),
        preview_port: port,
        preview_path: typeof preview.preview_path === "string" ? preview.preview_path : null,
        preview_label: typeof preview.preview_label === "string" ? preview.preview_label : null,
        expires_at: Number(preview.expires_at ?? 0),
        expires_in_seconds: Number(preview.expires_in_seconds ?? 0),
        auth_mode: typeof preview.auth_mode === "string" ? preview.auth_mode : null,
        preview_transport:
          typeof preview.preview_transport === "string" ? preview.preview_transport : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
      return {
        ok: false,
        status: 500,
        code: "daytona_preview_lookup_failed",
        message,
        retryable: true,
      };
    }
  },
});

export const stopCloudRuntimeRunDaytonaPreview = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    runId: v.string(),
    port: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const ownerId = await resolveOwnerIdForAuthenticatedRequest({
        ctx,
        ownerId: args.ownerId,
        authSubject: args.authSubject ?? null,
      });
      const runId = normalizeRunId(args.runId);
      const port = normalizeWorkspacePreviewPort(args.port);
      if (port === null) {
        return {
          ok: false,
          status: 400,
          code: "invalid_preview_port",
          message: "Preview port is invalid.",
          retryable: false,
        };
      }

      const run = (await ctx.runQuery(internal.threads.getRuntimeRunByOwnerRunIdInternal as any, {
        ownerId,
        runId,
      })) as RuntimeRunLike | null;
      if (!run) {
        return {
          ok: false,
          status: 404,
          code: "runtime_run_not_found",
          message: "Runtime run not found.",
          retryable: false,
        };
      }
      const previewReadyEvent = (await ctx.runQuery(
        internal.threads.getDaytonaWorkspacePreviewReadyEventInternal as any,
        {
          ownerId,
          runId,
          port,
        },
      )) as RuntimeRunEventLike | null;
      if (!previewReadyEvent) {
        return {
          ok: false,
          status: 403,
          code: "daytona_preview_not_authorized",
          message: "No Daytona app preview was started for this run and port.",
          retryable: false,
        };
      }

      const stopped = (await ctx.runAction(
        (internal as any).daytonaCodexRuntimeTargetActions
          .stopDaytonaAppPreviewInternal as any,
        {
          ownerId,
          runId,
          previewPort: port,
          reason: "polynet_preview_card_stop",
        },
      )) as Record<string, unknown> | null;
      if (!stopped || stopped.ok !== true) {
        const code = String(stopped?.code ?? "daytona_preview_stop_failed").trim() || "daytona_preview_stop_failed";
        return {
          ok: false,
          status: code === "daytona_preview_port_not_active" ? 404 : 500,
          code,
          message: String(stopped?.message ?? "Daytona preview stop failed."),
          retryable:
            code !== "daytona_preview_port_not_active" &&
            code !== "daytona_runtime_target_not_found" &&
            code !== "daytona_sandbox_not_available",
        };
      }

      const stoppedPreviewPorts = Array.isArray(stopped.stopped_preview_ports)
        ? stopped.stopped_preview_ports
            .map((value) => normalizeWorkspacePreviewPort(value))
            .filter((value): value is number => value !== null)
        : [];
      if (stoppedPreviewPorts.length > 0) {
        await ctx.runMutation(internal.threads.appendCloudRuntimeRunEventInternal as any, {
          ownerId,
          threadId: run.threadId,
          runId,
          eventType: "workspace_preview_stopped",
          eventKey: `${runId}:workspace_preview_stopped:preview_card:${stoppedPreviewPorts.join("-")}`,
          payload: {
            run_id: runId,
            provider: "daytona",
            transport: "daytona_direct",
            target_run_id:
              String(stopped.target_run_id ?? "").trim() || runId,
            target_id:
              String(stopped.target_id ?? "").trim() || null,
            sandbox_id:
              String(stopped.sandbox_id ?? "").trim() || null,
            preview_ports: stoppedPreviewPorts,
            stopped_preview_ports: stoppedPreviewPorts,
            reason: "polynet_preview_card_stop",
            source: "preview_card_stop",
            teardown_state:
              String(stopped.teardown_state ?? "").trim() || null,
          },
        });
      }

      return {
        ok: true,
        target_run_id: String(stopped.target_run_id ?? "").trim() || runId,
        target_id: String(stopped.target_id ?? "").trim() || null,
        sandbox_id: String(stopped.sandbox_id ?? "").trim() || null,
        stopped_preview_ports: stoppedPreviewPorts,
        stopped_process_ids: Array.isArray(stopped.stopped_process_ids)
          ? stopped.stopped_process_ids
          : [],
        teardown_state: String(stopped.teardown_state ?? "").trim() || null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
      return {
        ok: false,
        status: 500,
        code: "daytona_preview_stop_failed",
        message,
        retryable: true,
      };
    }
  },
});
