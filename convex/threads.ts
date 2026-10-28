import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, type ObjectType } from "convex/values";
import { buildCommunityConversationThreadKey, parseCommunityConversationIdentity, COMMUNITY_CONVERSATION_PREFIX } from "../shared/communityConversationIdentity";
import { resolveAuthenticatedSubject } from "./authIdentity";
import {
  applyRuntimeHarnessTelemetryEvent,
  createEmptyRuntimeHarnessTelemetrySummary,
  type RuntimeHarnessTelemetrySummary,
} from "../shared/runtimeHarnessScorecard";
import {
  mergeRuntimeWorkingStateTaskLedger,
  summarizeRuntimeWorkingStateFromEvents,
} from "../shared/runtimeWorkingStateLedger";
import {
  requireCommunityChatAccess,
} from "./communityCore";
import { recordTrustedCommunitySourceTraceCore } from "./communityIntelligenceDirectory";
import { DEFAULT_ACTIVE_MODEL_ID } from "../shared/modelCatalog";
import {
  MEMBER_AGENT_GLOBAL_SCOPE_KEY,
  isGlobalMemberAgentEpisodeThreadKey,
  isMemberAgentThreadKeyForCommunity,
  isReadOnlyLegacyMemberAgentThreadKey,
} from "../shared/runtimeInvocationSurface";
import { MEMBER_AGENT_CONTEXT_PAGE_SIZE } from "../shared/memberAgentConversationContext";
import {
  MEMBER_CONVERSATION_LIST_DEFAULT_LIMIT,
  MEMBER_CONVERSATION_LIST_MAX_LIMIT,
  buildMemberConversationRecallTranscript,
  deriveMemberConversationTitle,
} from "../shared/memberAgentEpisodeRecall";
import {
  MEMBER_AGENT_MAX_IMAGE_ATTACHMENTS,
  MEMBER_AGENT_MAX_IMAGE_BYTES,
  MEMBER_AGENT_MAX_IMAGE_TOTAL_BYTES,
  isAllowedMemberAgentImageMime,
  normalizeMemberAgentImageMime,
  normalizeMemberAgentImageName,
} from "../shared/memberAgentAttachments";
import { projectRuntimeCommunityContextEventPayload } from "../shared/runtimeCommunityContextReceipt";
import {
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
  canonicalRuntimeProviderContextJson,
  parseRuntimeProviderContextAttestation,
} from "../shared/runtimeProviderContextAttestation";

type ThreadLike = {
  _id: any;
  ownerId: any;
  title?: string;
  titleSource: "auto" | "manual";
  communityId?: string;
  modelId?: string;
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
  scopeKey?: "global" | "community";
  communityId?: any;
  activeEpisodeId?: any;
  communityNameSnapshot?: string;
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

type CloudThreadAttachmentClaimLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  storageId: any;
  messageKey: string;
  status: "pending" | "attached";
  attachedMessageId?: any;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
};

type CloudThreadAttachmentUploadTicketLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  ticketKey: string;
  messageKey: string;
  claimedStorageId?: any;
  createdAt: number;
  expiresAt: number;
  claimedAt?: number;
};

const MEMBER_AGENT_ATTACHMENT_UPLOAD_RATE_WINDOW_MS = 60_000;
const MEMBER_AGENT_ATTACHMENT_UPLOAD_RATE_LIMIT = 16;
const MEMBER_AGENT_ATTACHMENT_UPLOAD_TICKET_TTL_MS = 10 * 60_000;
const MEMBER_AGENT_ATTACHMENT_PENDING_TTL_MS = 60 * 60_000;
const MEMBER_AGENT_ATTACHMENT_MAX_PENDING_COUNT = 8;
const MEMBER_AGENT_ATTACHMENT_MAX_PENDING_BYTES = 50 * 1024 * 1024;

type RuntimeRunLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  runId: string;
  lane: string;
  visibility?: "user_visible" | "internal_hidden";
  internalFollowupKind?: string;
  communityId?: any;
  communityContextVersion?: number;
  modelId?: string;
  engineId?: string;
  executionMode?: string;
  contractName?: string;
  contractVersion?: string;
  harnessProfile?: string;
  harnessProfileSource?: string;
  capabilityFamilies?: string[];
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

async function deleteCloudStorageObjectIfPresent(ctx: any, storageId: unknown): Promise<void> {
  const resolvedStorageId = String(storageId ?? "").trim();
  if (!resolvedStorageId) return;
  const metadata = await ctx.db.system.get("_storage", resolvedStorageId as any);
  if (metadata) await ctx.storage.delete(resolvedStorageId as any);
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

async function normalizeMemberAgentMessageContent(args: {
  ctx: any;
  ownerId: any;
  thread: ThreadLike;
  messageKey: string;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
}): Promise<unknown> {
  const threadKey = String(args.thread.threadKey ?? "").trim();
  if (args.role !== "user" || !isClaimedImageAttachmentThread(args.thread)) {
    return args.contentJson;
  }
  const record =
    args.contentJson && typeof args.contentJson === "object" && !Array.isArray(args.contentJson)
      ? (args.contentJson as Record<string, unknown>)
      : {};
  const text = String(record.text ?? "").trim();
  const rawAttachments = Array.isArray(record.attachments) ? record.attachments : [];
  if (rawAttachments.length > MEMBER_AGENT_MAX_IMAGE_ATTACHMENTS) {
    throw new Error("member_agent_attachment_limit_exceeded");
  }
  const attachments: StoredCloudMessageAttachment[] = [];
  const storageIds = new Set<string>();
  let totalBytes = 0;
  for (const raw of rawAttachments) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("member_agent_attachment_invalid");
    }
    const attachment = raw as Record<string, unknown>;
    const storageId = String(attachment.storage_id ?? attachment.storageId ?? "").trim();
    if (!storageId || storageIds.has(storageId)) {
      throw new Error("member_agent_attachment_invalid");
    }
    storageIds.add(storageId);
    const claim = (await args.ctx.db
      .query("cloudThreadAttachments")
      .withIndex("by_owner_thread_storage", (q: any) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("threadId", args.thread._id)
          .eq("storageId", storageId as any),
      )
      .unique()) as CloudThreadAttachmentClaimLike | null;
    if (!claim) throw new Error("member_agent_attachment_claim_required");
    if (claim.messageKey !== args.messageKey) {
      throw new Error("member_agent_attachment_message_mismatch");
    }
    if (claim.status !== "pending" && claim.status !== "attached") {
      throw new Error("member_agent_attachment_claim_invalid");
    }
    if (!isAllowedMemberAgentImageMime(claim.mime)) {
      throw new Error("member_agent_attachment_type_not_supported");
    }
    if (claim.size <= 0 || claim.size > MEMBER_AGENT_MAX_IMAGE_BYTES) {
      throw new Error("member_agent_attachment_too_large");
    }
    totalBytes += claim.size;
    if (totalBytes > MEMBER_AGENT_MAX_IMAGE_TOTAL_BYTES) {
      throw new Error("member_agent_attachment_total_too_large");
    }
    attachments.push({
      id: String(attachment.id ?? "").trim() || createAttachmentId(),
      name: claim.name,
      type: "image",
      mime: claim.mime,
      size: claim.size,
      storageId: String(claim.storageId),
    });
  }
  if (!text && attachments.length === 0) {
    throw new Error("member_agent_message_empty");
  }
  return {
    text,
    ...(attachments.length > 0 ? { attachments } : null),
  };
}

function listStoredCloudMessageStorageIds(contentJson: unknown): string[] {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return [];
  const record = contentJson as Record<string, unknown>;
  return normalizeStoredCloudMessageAttachments(record.attachments)
    .map((attachment) => String(attachment.storageId ?? "").trim())
    .filter(Boolean);
}

async function attachMemberAgentClaimsToMessage(args: {
  ctx: any;
  ownerId: any;
  threadId: any;
  messageId: any;
  messageKey: string;
  contentJson: unknown;
}): Promise<void> {
  for (const storageId of listStoredCloudMessageStorageIds(args.contentJson)) {
    const claim = (await args.ctx.db
      .query("cloudThreadAttachments")
      .withIndex("by_owner_thread_storage", (q: any) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("threadId", args.threadId)
          .eq("storageId", storageId as any),
      )
      .unique()) as CloudThreadAttachmentClaimLike | null;
    if (!claim || claim.messageKey !== args.messageKey) {
      throw new Error("member_agent_attachment_claim_required");
    }
    if (
      claim.status === "attached" &&
      claim.attachedMessageId &&
      String(claim.attachedMessageId) !== String(args.messageId)
    ) {
      throw new Error("member_agent_attachment_reuse_rejected");
    }
    await args.ctx.db.patch(claim._id, {
      status: "attached",
      attachedMessageId: args.messageId,
    });
  }
}

async function deleteMemberAgentClaimsForMessage(args: {
  ctx: any;
  ownerId: any;
  threadId: any;
  messageKey: string;
  exceptStorageIds?: ReadonlySet<string>;
}): Promise<void> {
  const claims = (await args.ctx.db
    .query("cloudThreadAttachments")
    .withIndex("by_owner_messageKey", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("messageKey", args.messageKey),
    )
    .collect()) as CloudThreadAttachmentClaimLike[];
  for (const claim of claims) {
    if (String(claim.threadId) !== String(args.threadId)) continue;
    if (args.exceptStorageIds?.has(String(claim.storageId))) continue;
    await deleteCloudStorageObjectIfPresent(args.ctx, claim.storageId);
    await args.ctx.db.delete(claim._id);
  }
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
  if (communityConversationScope(args.thread)) {
    await requireWritableMemberAgentThread({ ctx: args.ctx, ownerId: args.ownerId, thread: args.thread, role: "user" });
  }
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

function communityConversationScope(thread: ThreadLike): string | null {
  return parseCommunityConversationIdentity(thread)?.communityId ?? null;
}

async function requireCommunityConversationAccess(ctx: any, thread: ThreadLike) {
  const communityId = communityConversationScope(thread);
  if (!communityId) return;
  await requireCommunityChatAccess({ ctx, communityId, userId: thread.ownerId });
  const episode = await ctx.db.query("memberAgentEpisodes").withIndex("by_thread", (q: any) => q.eq("threadId", thread._id)).unique();
  const channel = episode ? await ctx.db.get(episode.channelId) : null;
  if (!episode || !channel || channel.scopeKey !== "community" || channel.ownerId !== thread.ownerId || channel.communityId !== communityId || episode.ordinal !== parseCommunityConversationIdentity(thread)!.ordinal) {
    throw new Error("community_conversation_relationship_invalid");
  }
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
  await requireCommunityConversationAccess(args.ctx, row);
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
  await requireCommunityConversationAccess(args.ctx, row);
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

const getCloudThreadByThreadKeyArgs = {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
};

async function getCloudThreadByThreadKeyHandler(ctx: QueryCtx, args: ObjectType<typeof getCloudThreadByThreadKeyArgs>, ownerId: Id<"users">) {
    return await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey: normalizeThreadKey(args.threadKey),
    });
}

export const getCloudThreadByThreadKey = query({
  args: getCloudThreadByThreadKeyArgs,
  handler: async (ctx, args) =>
    await getCloudThreadByThreadKeyHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a turn from a community front end: the owner was authenticated by the
// front end's session, which has no Convex identity.
export const getCloudThreadByThreadKeyForTrustedOwnerInternal = internalQuery({
  args: { ...getCloudThreadByThreadKeyArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await getCloudThreadByThreadKeyHandler(ctx, args, trustedOwnerId),
});

export const ensureCloudThread = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadKey: v.string(),
    title: v.optional(v.string()),
    titleSource: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
    modelId: v.optional(v.string()),
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
    if (threadKey.startsWith(COMMUNITY_CONVERSATION_PREFIX)) {
      const scoped = await getCloudThreadByThreadKeyInternal({ ctx, ownerId, threadKey });
      if (!scoped) throw new Error("community_conversation_use_scoped_endpoint");
      if (args.communityId && args.communityId !== scoped.communityId) throw new Error("community_conversation_scope_immutable");
      return scoped;
    }
    const existing = await getCloudThreadByThreadKeyInternal({
      ctx,
      ownerId,
      threadKey,
    });
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: nowMs };
      if (typeof args.modelId === "string" && args.modelId.trim() && existing.modelId !== args.modelId.trim()) {
        patch.modelId = args.modelId.trim();
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
      communityId: initialCommunityId,
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

async function requireWritableMemberAgentThread(args: {
  ctx: any;
  ownerId: any;
  thread: ThreadLike;
  role: "user" | "assistant" | "system";
}): Promise<void> {
  const threadKey = String(args.thread.threadKey ?? "").trim();
  if (communityConversationScope(args.thread)) {
    await requireCommunityConversationAccess(args.ctx, args.thread);
    const episode = await args.ctx.db.query("memberAgentEpisodes").withIndex("by_thread", (q: any) => q.eq("threadId", args.thread._id)).unique();
    const channel = await args.ctx.db.get(episode.channelId);
    if (episode.status !== "active" || channel.activeEpisodeId !== episode._id || typeof args.thread.archivedAt === "number") throw new Error("member_agent_episode_not_active");
    return;
  }
  if (isReadOnlyLegacyMemberAgentThreadKey(threadKey)) {
    throw new Error("member_agent_legacy_episode_read_only");
  }
  if (!isGlobalMemberAgentEpisodeThreadKey(threadKey)) return;
  if (args.role !== "user") return;
  const channel = await getGlobalMemberAgentChannel({
    ctx: args.ctx,
    ownerId: args.ownerId,
  });
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

function isClaimedImageAttachmentThread(thread: ThreadLike): boolean {
  const threadKey = String(thread.threadKey ?? "").trim();
  return isGlobalMemberAgentEpisodeThreadKey(threadKey) || Boolean(communityConversationScope(thread));
}

async function requireWritableClaimedImageAttachmentThread(args: {
  ctx: any;
  ownerId: any;
  thread: ThreadLike;
}): Promise<void> {
  const threadKey = String(args.thread.threadKey ?? "").trim();
  if (isGlobalMemberAgentEpisodeThreadKey(threadKey) || communityConversationScope(args.thread)) {
    await requireWritableMemberAgentThread({
      ctx: args.ctx,
      ownerId: args.ownerId,
      thread: args.thread,
      role: "user",
    });
    return;
  }
  throw new Error("member_agent_attachment_thread_required");
}

function buildMemberAgentChannelResponse(args: {
  channel: MemberAgentChannelLike;
  episode: MemberAgentEpisodeLike;
  thread: ThreadLike;
  communityId: string | null;
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
    context_version: normalizeContextVersion(args.thread.contextVersion),
  };
}

// Foundation endpoint: not yet selected by the web UI. Never adopts global history.
const ensureCommunityAgentConversationArgs = { communityId: v.id("communities") };

async function ensureCommunityAgentConversationHandler(ctx: MutationCtx, args: ObjectType<typeof ensureCommunityAgentConversationArgs>, ownerId: Id<"users">) {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: ownerId });
    const existing = await ctx.db.query("memberAgentChannels")
      .withIndex("by_owner_scope_community", q => q.eq("ownerId", ownerId).eq("scopeKey", "community").eq("communityId", args.communityId))
      .unique();
    if (existing) {
      const episode = existing.activeEpisodeId ? await ctx.db.get(existing.activeEpisodeId) : null;
      if (!episode || episode.channelId !== existing._id || episode.status !== "active") throw new Error("member_agent_active_episode_invalid");
      const thread = await requireOwnedCloudThread({ ctx, ownerId, threadId: episode.threadId });
      if (communityConversationScope(thread) !== args.communityId || typeof thread.archivedAt === "number") throw new Error("community_conversation_scope_mismatch");
      return buildMemberAgentChannelResponse({ channel: existing, episode, thread, communityId: args.communityId });
    }
    const now = Date.now();
    const threadKey = buildCommunityConversationThreadKey(args.communityId, 1);
    const collision = await ctx.db.query("threads").withIndex("by_owner_threadKey", q => q.eq("ownerId", ownerId).eq("threadKey", threadKey)).first();
    if (collision) throw new Error("member_agent_episode_thread_collision");
    const threadId = await ctx.db.insert("threads", { ownerId, communityId: args.communityId, threadKey, titleSource: "auto", modelId: DEFAULT_ACTIVE_MODEL_ID, contextVersion: 0, lastSeq: 0, createdAt: now, updatedAt: now });
    const channelId = await ctx.db.insert("memberAgentChannels", { ownerId, communityId: args.communityId, scopeKey: "community", nextOrdinal: 2, createdAt: now, updatedAt: now });
    const episodeId = await ctx.db.insert("memberAgentEpisodes", { channelId, threadId, ordinal: 1, status: "active", startedAt: now, createdAt: now, updatedAt: now });
    await ctx.db.patch(channelId, { activeEpisodeId: episodeId });
    return buildMemberAgentChannelResponse({ channel: (await ctx.db.get(channelId))!, episode: (await ctx.db.get(episodeId))!, thread: (await ctx.db.get(threadId))!, communityId: args.communityId });
}

export const ensureCommunityAgentConversation = mutation({
  args: ensureCommunityAgentConversationArgs,
  handler: async (ctx, args) => await ensureCommunityAgentConversationHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({ ctx })),
});

// For a turn from a community front end: the member was authenticated by the
// front end's session, which has no Convex identity.
export const ensureCommunityAgentConversationForTrustedUserInternal = internalMutation({
  args: { ...ensureCommunityAgentConversationArgs, trustedUserId: v.id("users") },
  handler: async (ctx, { trustedUserId, ...args }) => await ensureCommunityAgentConversationHandler(ctx, args, trustedUserId),
});

export const startNewCommunityAgentConversation = mutation({
  args: { communityId: v.id("communities"), expectedActiveEpisodeId: v.id("memberAgentEpisodes") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({ ctx });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: ownerId });
    const channel = await ctx.db.query("memberAgentChannels")
      .withIndex("by_owner_scope_community", q => q.eq("ownerId", ownerId).eq("scopeKey", "community").eq("communityId", args.communityId)).unique();
    if (!channel || channel.activeEpisodeId !== args.expectedActiveEpisodeId) throw new Error("member_agent_active_episode_changed");
    const previous = await ctx.db.get(args.expectedActiveEpisodeId);
    if (!previous || previous.channelId !== channel._id || previous.status !== "active") throw new Error("member_agent_active_episode_invalid");
    await requireOwnedCloudThread({ ctx, ownerId, threadId: previous.threadId });
    if (await getRunningRuntimeRunByThread({ ctx, threadId: previous.threadId })) throw new Error("community_conversation_turn_running");
    const ordinal = channel.nextOrdinal;
    if (ordinal !== previous.ordinal + 1) throw new Error("community_conversation_identity_invalid");
    const threadKey = buildCommunityConversationThreadKey(args.communityId, ordinal);
    if (await ctx.db.query("threads").withIndex("by_owner_threadKey", q => q.eq("ownerId", ownerId).eq("threadKey", threadKey)).first()) throw new Error("member_agent_episode_thread_collision");
    const now = Date.now();
    const threadId = await ctx.db.insert("threads", { ownerId, communityId: args.communityId, threadKey, titleSource: "auto", modelId: DEFAULT_ACTIVE_MODEL_ID, contextVersion: 0, lastSeq: 0, createdAt: now, updatedAt: now });
    const episodeId = await ctx.db.insert("memberAgentEpisodes", { channelId: channel._id, threadId, ordinal, status: "active", startedAt: now, createdAt: now, updatedAt: now });
    await ctx.db.patch(previous._id, { status: "closed", closedAt: now, updatedAt: now });
    await ctx.db.patch(channel._id, { activeEpisodeId: episodeId, nextOrdinal: ordinal + 1, updatedAt: now });
    return buildMemberAgentChannelResponse({ channel: (await ctx.db.get(channel._id))!, episode: (await ctx.db.get(episodeId))!, thread: (await ctx.db.get(threadId))!, communityId: args.communityId });
  },
});

const listNewestCloudThreadMessagesArgs = {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    limit: v.optional(v.number()),
};

async function listNewestCloudThreadMessagesHandler(ctx: QueryCtx, args: ObjectType<typeof listNewestCloudThreadMessagesArgs>, ownerId: Id<"users">) {
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
}

export const listNewestCloudThreadMessages = query({
  args: listNewestCloudThreadMessagesArgs,
  handler: async (ctx, args) =>
    await listNewestCloudThreadMessagesHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a community front end showing its member's agent conversation.
export const listNewestCloudThreadMessagesForTrustedOwnerInternal = internalQuery({
  args: { ...listNewestCloudThreadMessagesArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await listNewestCloudThreadMessagesHandler(ctx, args, trustedOwnerId),
});

export const listMemberAgentRuntimeMessagesInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    expectedUserMessageKey: v.string(),
    beforeSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const thread = (await ctx.db.get(args.threadId)) as ThreadLike | null;
    if (!thread || thread.ownerId !== args.ownerId || typeof thread.archivedAt === "number") {
      throw new Error("member_agent_thread_not_found");
    }
    if (communityConversationScope(thread)) await requireWritableMemberAgentThread({ ctx, ownerId: args.ownerId, thread, role: "user" });
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

    const beforeSeq = Number.isFinite(args.beforeSeq)
      ? Math.min(expected.seq, Math.floor(Number(args.beforeSeq)))
      : null;
    const pageWithLookahead = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q) => {
        const threadRange = q.eq("threadId", thread._id);
        return beforeSeq === null
          ? threadRange.lte("seq", expected.seq)
          : threadRange.lt("seq", beforeSeq);
      })
      .order("desc")
      .take(MEMBER_AGENT_CONTEXT_PAGE_SIZE + 1)) as CloudMessageLike[];
    const newestFirst = pageWithLookahead.slice(
      0,
      MEMBER_AGENT_CONTEXT_PAGE_SIZE,
    );
    const rows = await Promise.all(
      newestFirst.map(async (row) => ({
        messageKey: row.messageKey,
        seq: row.seq,
        role: row.role,
        contentJson:
          row.messageKey === expectedUserMessageKey
            ? await mapCloudMessageContentJsonForRead(ctx, row.contentJson)
            : row.contentJson,
      })),
    );
    return {
      expectedUserSeq: expected.seq,
      rows,
      hasMore: pageWithLookahead.length > MEMBER_AGENT_CONTEXT_PAGE_SIZE,
      nextBeforeSeq:
        rows.length > 0 ? Math.min(...rows.map((row) => row.seq)) : null,
    };
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

export const prepareCloudMemberAgentAttachmentUploadInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    messageKey: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    await requireWritableClaimedImageAttachmentThread({
      ctx,
      ownerId: args.ownerId,
      thread,
    });
    const messageKey = String(args.messageKey ?? "").trim();
    if (!messageKey) throw new Error("member_agent_attachment_message_key_required");
    const nowMs = Date.now();
    const ownerTickets = (await ctx.db
      .query("cloudThreadAttachmentUploadTickets")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", args.ownerId))
      .collect()) as CloudThreadAttachmentUploadTicketLike[];
    for (const ticket of ownerTickets) {
      if (ticket.expiresAt < nowMs) {
        await ctx.db.delete(ticket._id);
      }
    }
    const recentTickets = (await ctx.db
      .query("cloudThreadAttachmentUploadTickets")
      .withIndex("by_owner_createdAt", (q) =>
        q
          .eq("ownerId", args.ownerId)
          .gte("createdAt", nowMs - MEMBER_AGENT_ATTACHMENT_UPLOAD_RATE_WINDOW_MS),
      )
      .collect()) as CloudThreadAttachmentUploadTicketLike[];
    if (recentTickets.length >= MEMBER_AGENT_ATTACHMENT_UPLOAD_RATE_LIMIT) {
      throw new Error("member_agent_attachment_upload_rate_limited");
    }
    const ticketKey = crypto.randomUUID();
    const ticketId = await ctx.db.insert("cloudThreadAttachmentUploadTickets", {
      ownerId: args.ownerId,
      threadId: thread._id,
      ticketKey,
      messageKey,
      createdAt: nowMs,
      expiresAt: nowMs + MEMBER_AGENT_ATTACHMENT_UPLOAD_TICKET_TTL_MS,
    });
    await ctx.scheduler.runAfter(
      MEMBER_AGENT_ATTACHMENT_UPLOAD_TICKET_TTL_MS,
      (internal as any).threads.cleanupCloudMemberAgentAttachmentUploadTicket,
      { ticketId },
    );
    return {
      ticketKey,
    };
  },
});

export const claimStoredCloudMemberAgentAttachmentInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    storageId: v.id("_storage"),
    ticketKey: v.string(),
    messageKey: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId: args.ownerId,
      threadId: args.threadId,
    });
    await requireWritableClaimedImageAttachmentThread({
      ctx,
      ownerId: args.ownerId,
      thread,
    });
    const ticketKey = String(args.ticketKey ?? "").trim();
    const messageKey = String(args.messageKey ?? "").trim();
    const ticket = (await ctx.db
      .query("cloudThreadAttachmentUploadTickets")
      .withIndex("by_owner_ticketKey", (q) =>
        q.eq("ownerId", args.ownerId).eq("ticketKey", ticketKey),
      )
      .unique()) as CloudThreadAttachmentUploadTicketLike | null;
    const nowMs = Date.now();
    if (
      !ticket ||
      ticket.threadId !== thread._id ||
      ticket.messageKey !== messageKey ||
      ticket.expiresAt < nowMs
    ) {
      throw new Error("member_agent_attachment_upload_ticket_invalid");
    }
    const existingStorageClaim = (await ctx.db
      .query("cloudThreadAttachments")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first()) as CloudThreadAttachmentClaimLike | null;
    if (existingStorageClaim) {
      throw new Error("member_agent_attachment_reuse_rejected");
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error("member_agent_attachment_upload_missing");
    }
    const mime = normalizeMemberAgentImageMime(metadata.contentType);
    const size = Number(metadata.size);
    if (!isAllowedMemberAgentImageMime(mime)) {
      throw new Error("member_agent_attachment_type_not_supported");
    }
    if (!Number.isFinite(size) || size <= 0 || size > MEMBER_AGENT_MAX_IMAGE_BYTES) {
      throw new Error("member_agent_attachment_too_large");
    }
    const recentClaims = (await ctx.db
      .query("cloudThreadAttachments")
      .withIndex("by_owner_createdAt", (q) =>
        q
          .eq("ownerId", args.ownerId)
          .gte("createdAt", nowMs - MEMBER_AGENT_ATTACHMENT_PENDING_TTL_MS),
      )
      .collect()) as CloudThreadAttachmentClaimLike[];
    const pendingClaims = recentClaims.filter((claim) => claim.status === "pending");
    const pendingBytes = pendingClaims.reduce(
      (total, claim) => total + Math.max(0, Number(claim.size) || 0),
      0,
    );
    if (
      pendingClaims.length >= MEMBER_AGENT_ATTACHMENT_MAX_PENDING_COUNT ||
      pendingBytes + size > MEMBER_AGENT_ATTACHMENT_MAX_PENDING_BYTES
    ) {
      throw new Error("member_agent_attachment_pending_limit_exceeded");
    }
    const existing = (await ctx.db
      .query("cloudThreadAttachments")
      .withIndex("by_owner_thread_storage", (q) =>
        q.eq("ownerId", args.ownerId).eq("threadId", thread._id).eq("storageId", args.storageId),
      )
      .unique()) as CloudThreadAttachmentClaimLike | null;
    if (existing) throw new Error("member_agent_attachment_reuse_rejected");
    const id = await ctx.db.insert("cloudThreadAttachments", {
      ownerId: args.ownerId,
      threadId: thread._id,
      storageId: args.storageId,
      messageKey,
      status: "pending",
      name: normalizeMemberAgentImageName(args.name),
      mime,
      size: Math.floor(size),
      createdAt: nowMs,
    });
    await ctx.db.patch(ticket._id, {
      claimedStorageId: args.storageId,
      claimedAt: nowMs,
    });
    await ctx.scheduler.runAfter(
      MEMBER_AGENT_ATTACHMENT_PENDING_TTL_MS,
      (internal as any).threads.cleanupPendingCloudThreadAttachment,
      { attachmentId: id },
    );
    const claimed = (await ctx.db.get(id)) as CloudThreadAttachmentClaimLike | null;
    if (!claimed) throw new Error("member_agent_attachment_claim_failed");
    return claimed;
  },
});

export const cancelCloudMemberAgentAttachmentUploadInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    ticketKey: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = (await ctx.db
      .query("cloudThreadAttachmentUploadTickets")
      .withIndex("by_owner_ticketKey", (q) =>
        q.eq("ownerId", args.ownerId).eq("ticketKey", String(args.ticketKey ?? "").trim()),
      )
      .unique()) as CloudThreadAttachmentUploadTicketLike | null;
    if (!ticket || ticket.claimedAt) return { deleted: false };
    await ctx.db.delete(ticket._id);
    return { deleted: true };
  },
});

export const cleanupCloudMemberAgentAttachmentUploadTicket = internalMutation({
  args: {
    ticketId: v.id("cloudThreadAttachmentUploadTickets"),
  },
  handler: async (ctx, args) => {
    const ticket = (await ctx.db.get(args.ticketId)) as CloudThreadAttachmentUploadTicketLike | null;
    if (!ticket || ticket.expiresAt > Date.now()) return { deleted: false };
    await ctx.db.delete(ticket._id);
    return { deleted: true };
  },
});

export const cleanupPendingCloudThreadAttachment = internalMutation({
  args: {
    attachmentId: v.id("cloudThreadAttachments"),
  },
  handler: async (ctx, args) => {
    const attachment = (await ctx.db.get(args.attachmentId)) as CloudThreadAttachmentClaimLike | null;
    if (!attachment || attachment.status !== "pending") return { deleted: false };
    if (attachment.createdAt > Date.now() - MEMBER_AGENT_ATTACHMENT_PENDING_TTL_MS) {
      return { deleted: false };
    }
    await deleteCloudStorageObjectIfPresent(ctx, attachment.storageId);
    await ctx.db.delete(attachment._id);
    return { deleted: true };
  },
});

const getCloudThreadMessageByOwnerMessageKeyArgs = {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageKey: v.string(),
    threadId: v.optional(v.id("threads")),
};

async function getCloudThreadMessageByOwnerMessageKeyHandler(ctx: QueryCtx, args: ObjectType<typeof getCloudThreadMessageByOwnerMessageKeyArgs>, ownerId: Id<"users">) {
    const messageKey = String(args.messageKey ?? "").trim();
    if (!messageKey) return null;
    const row = (await ctx.db
      .query("cloudMessages")
      .withIndex("by_owner_messageKey", (q) => q.eq("ownerId", ownerId).eq("messageKey", messageKey))
      .first()) as CloudMessageLike | null;
    if (!row) return null;
    if (args.threadId && row.threadId !== args.threadId) return null;
    await requireOwnedCloudThread({ ctx, ownerId, threadId: row.threadId });
    return row;
}

export const getCloudThreadMessageByOwnerMessageKey = query({
  args: getCloudThreadMessageByOwnerMessageKeyArgs,
  handler: async (ctx, args) =>
    await getCloudThreadMessageByOwnerMessageKeyHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a turn from a community front end: the owner was authenticated by the
// front end's session, which has no Convex identity.
export const getCloudThreadMessageByOwnerMessageKeyForTrustedOwnerInternal = internalQuery({
  args: { ...getCloudThreadMessageByOwnerMessageKeyArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await getCloudThreadMessageByOwnerMessageKeyHandler(ctx, args, trustedOwnerId),
});

const addCloudThreadMessageArgs = {
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
};

async function addCloudThreadMessageHandler(ctx: MutationCtx, args: ObjectType<typeof addCloudThreadMessageArgs>, ownerId: Id<"users">) {
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

    await requireWritableMemberAgentThread({
      ctx,
      ownerId,
      thread,
      role: args.role,
    });
    const normalizedContentJson = await normalizeMemberAgentMessageContent({
      ctx,
      ownerId,
      thread,
      messageKey,
      role: args.role,
      contentJson: args.contentJson,
    });

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
      contentJson: normalizedContentJson,
      engineId: String(args.engineId ?? "").trim() || undefined,
      modelId: String(args.modelId ?? "").trim() || undefined,
      runId: String(args.runId ?? "").trim() || undefined,
      createdAt,
    });
    await attachMemberAgentClaimsToMessage({
      ctx,
      ownerId,
      threadId: thread._id,
      messageId: id,
      messageKey,
      contentJson: normalizedContentJson,
    });

    const nextLastSeq = Math.max(0, Math.floor(Math.max(thread.lastSeq ?? 0, seq)));
    const patch: Record<string, unknown> = {
      updatedAt: nowMs,
      lastSeq: nextLastSeq,
      ...deriveAutoThreadTitlePatch({
        thread,
        role: args.role,
        contentJson: normalizedContentJson,
      }),
    };
    await ctx.db.patch(thread._id, patch);

    const created = (await ctx.db.get(id)) as CloudMessageLike | null;
    if (!created) throw new Error("message_create_failed");
    return created;
}

export const addCloudThreadMessage = mutation({
  args: addCloudThreadMessageArgs,
  handler: async (ctx, args) =>
    await addCloudThreadMessageHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a turn from a community front end: the owner was authenticated by the
// front end's session, which has no Convex identity.
export const addCloudThreadMessageForTrustedOwnerInternal = internalMutation({
  args: { ...addCloudThreadMessageArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await addCloudThreadMessageHandler(ctx, args, trustedOwnerId),
});

const upsertCloudThreadMessageByMessageKeyArgs = {
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
};

async function upsertCloudThreadMessageByMessageKeyHandler(ctx: MutationCtx, args: ObjectType<typeof upsertCloudThreadMessageByMessageKeyArgs>, ownerId: Id<"users">) {
    const nowMs = args.nowMs ?? Date.now();
    const thread = await requireOwnedCloudThread({
      ctx,
      ownerId,
      threadId: args.threadId,
    });
    const messageKey = String(args.messageKey ?? "").trim();
    if (!messageKey) throw new Error("message_key_required");

    await requireWritableMemberAgentThread({
      ctx,
      ownerId,
      thread,
      role: args.role,
    });
    const normalizedContentJson = await normalizeMemberAgentMessageContent({
      ctx,
      ownerId,
      thread,
      messageKey,
      role: args.role,
      contentJson: args.contentJson,
    });

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
        contentJson: normalizedContentJson,
        engineId: String(args.engineId ?? "").trim() || undefined,
        modelId: String(args.modelId ?? "").trim() || undefined,
        runId: String(args.runId ?? "").trim() || undefined,
      });
      await deleteMemberAgentClaimsForMessage({
        ctx,
        ownerId,
        threadId: thread._id,
        messageKey,
        exceptStorageIds: new Set(listStoredCloudMessageStorageIds(normalizedContentJson)),
      });
      await attachMemberAgentClaimsToMessage({
        ctx,
        ownerId,
        threadId: thread._id,
        messageId: existing._id,
        messageKey,
        contentJson: normalizedContentJson,
      });
      await ctx.db.patch(thread._id, {
        updatedAt: nowMs,
        lastSeq: Math.max(0, Math.floor(Math.max(thread.lastSeq ?? 0, existing.seq ?? 0))),
        ...deriveAutoThreadTitlePatch({
          thread,
          role: args.role,
          contentJson: normalizedContentJson,
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
      contentJson: normalizedContentJson,
      engineId: String(args.engineId ?? "").trim() || undefined,
      modelId: String(args.modelId ?? "").trim() || undefined,
      runId: String(args.runId ?? "").trim() || undefined,
      createdAt,
    });
    await attachMemberAgentClaimsToMessage({
      ctx,
      ownerId,
      threadId: thread._id,
      messageId: id,
      messageKey,
      contentJson: normalizedContentJson,
    });
    await ctx.db.patch(thread._id, {
      updatedAt: nowMs,
      lastSeq: Math.max(0, Math.floor(Math.max(thread.lastSeq ?? 0, seq))),
      ...deriveAutoThreadTitlePatch({
        thread,
        role: args.role,
        contentJson: normalizedContentJson,
      }),
    });
    const created = (await ctx.db.get(id)) as CloudMessageLike | null;
    if (!created) throw new Error("message_create_failed");
    return created;
}

export const upsertCloudThreadMessageByMessageKey = mutation({
  args: upsertCloudThreadMessageByMessageKeyArgs,
  handler: async (ctx, args) =>
    await upsertCloudThreadMessageByMessageKeyHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a turn from a community front end: the owner was authenticated by the
// front end's session, which has no Convex identity.
export const upsertCloudThreadMessageByMessageKeyForTrustedOwnerInternal = internalMutation({
  args: { ...upsertCloudThreadMessageByMessageKeyArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await upsertCloudThreadMessageByMessageKeyHandler(ctx, args, trustedOwnerId),
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

    await deleteMemberAgentClaimsForMessage({
      ctx,
      ownerId,
      threadId: thread._id,
      messageKey: message.messageKey,
    });
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

const ensureCloudRuntimeRunStartedArgs = {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    runId: v.string(),
    lane: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("user_visible"), v.literal("internal_hidden"))),
    internalFollowupKind: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
    communityContextVersion: v.optional(v.number()),
    modelId: v.optional(v.string()),
    engineId: v.optional(v.string()),
    runtimeEngineRequested: v.optional(v.string()),
    runtimeEngineResolved: v.optional(v.string()),
    runtimeEngineSource: v.optional(v.string()),
    executionMode: v.optional(v.string()),
    contractName: v.optional(v.string()),
    contractVersion: v.optional(v.string()),
    harnessProfile: v.optional(v.string()),
    harnessProfileSource: v.optional(v.string()),
    capabilityFamilies: v.optional(v.array(v.string())),
    latestUserText: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
};

async function ensureCloudRuntimeRunStartedHandler(ctx: MutationCtx, args: ObjectType<typeof ensureCloudRuntimeRunStartedArgs>, ownerId: Id<"users">) {
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
    const requestedExecutionMode = String(args.executionMode ?? "").trim();
    if (requestedExecutionMode && requestedExecutionMode !== "agentic") {
      throw new Error("unsupported_execution_mode");
    }
    const executionMode = "agentic";
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
    const communityId = runtimeCommunityLens.communityId;
    const communityContextVersion = runtimeCommunityLens.communityContextVersion;
    const harnessProfile = String(args.harnessProfile ?? "").trim() || undefined;
    const harnessProfileSource = String(args.harnessProfileSource ?? "").trim() || undefined;
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
      communityId,
      communityContextVersion,
      modelId,
      engineId,
      executionMode,
      contractName,
      contractVersion,
      harnessProfile,
      harnessProfileSource,
      capabilityFamilies,
      runtimeHarnessTelemetrySummary: createEmptyRuntimeHarnessTelemetrySummary(),
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
        community_id: communityId ?? null,
        community_context_version: communityContextVersion ?? null,
        model_id: modelId ?? null,
        engine_id: engineId ?? null,
        runtime_engine_requested: runtimeEngineRequested ?? null,
        runtime_engine_resolved: runtimeEngineResolved ?? null,
        runtime_engine_source: runtimeEngineSource ?? null,
        execution_mode: executionMode,
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
}

export const ensureCloudRuntimeRunStarted = mutation({
  args: ensureCloudRuntimeRunStartedArgs,
  handler: async (ctx, args) =>
    await ensureCloudRuntimeRunStartedHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a turn from a community front end: the owner was authenticated by the
// front end's session, which has no Convex identity.
export const ensureCloudRuntimeRunStartedForTrustedOwnerInternal = internalMutation({
  args: { ...ensureCloudRuntimeRunStartedArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await ensureCloudRuntimeRunStartedHandler(ctx, args, trustedOwnerId),
});

const appendCloudRuntimeRunEventArgs = {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    runId: v.string(),
    eventType: v.string(),
    eventKey: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
};

async function appendCloudRuntimeRunEventHandler(ctx: MutationCtx, args: ObjectType<typeof appendCloudRuntimeRunEventArgs>, ownerId: Id<"users">) {
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
    if (run.status !== "running") throw new Error("runtime_run_not_active");

    const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;
    const createdAt =
      typeof args.createdAt === "number" && Number.isFinite(args.createdAt) ? Math.floor(args.createdAt) : nowMs;
    const persistedPayload = projectRuntimeCommunityContextEventPayload({
      eventType,
      payload: args.payload,
      communityScopeId: run.communityId,
    });
    const runtimeHarnessTelemetrySummary = applyRuntimeHarnessTelemetryEvent({
      summary: run.runtimeHarnessTelemetrySummary,
      eventType,
      payload: persistedPayload,
    });
    const id = await ctx.db.insert("runtimeRunEvents", {
      ownerId,
      threadId: thread._id,
      runId,
      seq,
      eventType,
      eventKey,
      payload: persistedPayload,
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
}

export const appendCloudRuntimeRunEvent = mutation({
  args: appendCloudRuntimeRunEventArgs,
  handler: async (ctx, args) =>
    await appendCloudRuntimeRunEventHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a turn from a community front end: the owner was authenticated by the
// front end's session, which has no Convex identity.
export const appendCloudRuntimeRunEventForTrustedOwnerInternal = internalMutation({
  args: { ...appendCloudRuntimeRunEventArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await appendCloudRuntimeRunEventHandler(ctx, args, trustedOwnerId),
});

export const recordRuntimeProviderContextAttestationInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    attestation: v.any(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const fail = (errorCode: string) => ({ ok: false as const, errorCode });
    const attestation = parseRuntimeProviderContextAttestation(args.attestation);
    if (!attestation) {
      return fail("runtime_provider_context_attestation_invalid");
    }
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
    if (!run || run.threadId !== thread._id || run.status !== "running") {
      return fail("runtime_provider_context_attestation_run_invalid");
    }
    const ownerId = String(args.ownerId);
    const threadId = String(thread._id);
    const communityId = String(run.communityId ?? "").trim();
    const threadCommunityId = String(thread.communityId ?? "").trim();
    const modelId = String(run.modelId ?? "").trim();
    if (
      attestation.run_id !== runId ||
      attestation.scope.user_id !== ownerId ||
      attestation.scope.thread_id !== threadId ||
      !communityId ||
      threadCommunityId !== communityId ||
      attestation.scope.community_id !== communityId ||
      attestation.scope.community_context_version !==
        Math.max(0, Math.floor(Number(run.communityContextVersion ?? 0))) ||
      !modelId ||
      attestation.model.requested_model_id !== modelId
    ) {
      return fail("runtime_provider_context_attestation_scope_conflict");
    }

    const contextEventKey = `${runId}:runtime_context_resolved:1`;
    const contextEvent = (await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_eventKey", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", runId).eq("eventKey", contextEventKey),
      )
      .first()) as RuntimeRunEventLike | null;
    const contextPayload = asRecord(contextEvent?.payload);
    if (
      !contextPayload ||
      String(contextPayload.invocation_surface ?? "").trim() !==
        attestation.surface ||
      String(contextPayload.community_id ?? "").trim() !== communityId ||
      Math.max(
        0,
        Math.floor(Number(contextPayload.community_context_version ?? 0)),
      ) !== attestation.scope.community_context_version
    ) {
      return fail("runtime_provider_context_attestation_surface_conflict");
    }

    const threadKey = String(thread.threadKey ?? "").trim();
    if (attestation.surface === "member_agent_dock") {
      if (
        !isGlobalMemberAgentEpisodeThreadKey(threadKey) &&
        !communityConversationScope(thread) &&
        !isMemberAgentThreadKeyForCommunity(threadKey, communityId)
      ) {
        return fail("runtime_provider_context_attestation_surface_conflict");
      }
    } else {
      return fail("runtime_provider_context_attestation_surface_conflict");
    }

    const eventKey = `${runId}:${RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE}:initial:1`;
    const existing = (await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_eventKey", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", runId).eq("eventKey", eventKey),
      )
      .first()) as RuntimeRunEventLike | null;
    if (existing) {
      try {
        if (
          canonicalRuntimeProviderContextJson(existing.payload) ===
          canonicalRuntimeProviderContextJson(attestation)
        ) {
          return { ok: true as const, duplicate: true, eventId: existing._id };
        }
      } catch {
        // Existing malformed evidence is a conflict, never a dedupe match.
      }
      return fail("runtime_provider_context_attestation_conflict");
    }

    const nowMs = args.nowMs ?? Date.now();
    const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;
    const eventId = await ctx.db.insert("runtimeRunEvents", {
      ownerId: args.ownerId,
      threadId: thread._id,
      runId,
      seq,
      eventType: RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
      eventKey,
      payload: attestation,
      createdAt: nowMs,
    });
    await ctx.db.patch(run._id, {
      lastEventSeq: seq,
      updatedAt: nowMs,
    });
    return { ok: true as const, duplicate: false, eventId };
  },
});

const finishCloudRuntimeRunArgs = {
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
};

async function finishCloudRuntimeRunHandler(ctx: MutationCtx, args: ObjectType<typeof finishCloudRuntimeRunArgs>, ownerId: Id<"users">) {
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
}

export const finishCloudRuntimeRun = mutation({
  args: finishCloudRuntimeRunArgs,
  handler: async (ctx, args) =>
    await finishCloudRuntimeRunHandler(ctx, args, await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    })),
});

// For a turn from a community front end: the owner was authenticated by the
// front end's session, which has no Convex identity.
export const finishCloudRuntimeRunForTrustedOwnerInternal = internalMutation({
  args: { ...finishCloudRuntimeRunArgs, trustedOwnerId: v.id("users") },
  handler: async (ctx, { trustedOwnerId, ...args }) => await finishCloudRuntimeRunHandler(ctx, args, trustedOwnerId),
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
    if (run.status !== "running") return run;
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

async function cancelRuntimeRunByThreadKeyForOwner(args: {
  ctx: any;
  ownerId: any;
  threadKey: string;
  runId?: string;
  nowMs?: number;
}) {
  const { ctx, ownerId } = args;
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
}

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
    return await cancelRuntimeRunByThreadKeyForOwner({
      ctx,
      ownerId,
      threadKey: args.threadKey,
      runId: args.runId,
      nowMs: args.nowMs,
    });
  },
});

export const cancelCloudRuntimeRunByThreadKeyInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadKey: v.string(),
    runId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await cancelRuntimeRunByThreadKeyForOwner({
      ctx,
      ownerId: args.ownerId,
      threadKey: args.threadKey,
      runId: args.runId,
      nowMs: args.nowMs,
    });
  },
});

