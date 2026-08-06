import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import {
  archiveCommunityLifecycle,
  communityLifecycleGenerationMatches,
  normalizeCommunityLifecycle,
} from "../shared/communityLifecycle";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { recordCriticalAuditEvent } from "./criticalAudit";
import { isPlatformHomeCommunity } from "./platformHomeCommunity";
import {
  cancelStripeSubscriptionIfActive,
  expireStripeCheckoutSessionIfOpen,
} from "./stripeSubscriptionCancellation";

const ARCHIVE_BILLING_BATCH_SIZE = 25;
const ARCHIVE_BILLING_MAX_ATTEMPTS = 12;
const ARCHIVE_BILLING_RECOVERY_LEASE_MS = 5 * 60 * 1000;
const ARCHIVE_BILLING_MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const ARCHIVE_CHECKOUT_SETTLE_GRACE_MS = 5 * 60 * 1000;

export type ArchiveBillingJobRow = {
  _id: Id<"communityArchiveBillingJobs">;
  communityId: Id<"communities">;
  lifecycleGeneration: number;
  status: "pending" | "complete" | "blocked";
  attemptCount: number;
  nextAttemptAt: number;
  lastErrorCode?: string;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type ArchiveCheckoutTarget = {
  rowId: Id<"checkoutSessions">;
  providerCheckoutSessionId: string | null;
  providerSubscriptionId: string | null;
  providerAccountId: string | null;
};

type ArchiveSubscriptionTarget = {
  rowId: Id<"communitySubscriptions"> | Id<"founderSubscriptions">;
  providerSubscriptionId: string | null;
  providerAccountId: string | null;
};

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeArchiveBillingErrorCode(error: unknown): string {
  const candidate = String(
    (error as any)?.code ??
    (error instanceof Error ? error.message : error ?? ""),
  ).trim().toLowerCase();
  return /^[a-z0-9_:-]{1,80}$/.test(candidate)
    ? candidate
    : "community_archive_billing_cleanup_failed";
}

export async function getUniqueArchiveBillingJob(
  ctx: any,
  communityId: any,
  lifecycleGeneration: number,
): Promise<ArchiveBillingJobRow | null> {
  const rows = (await ctx.db
    .query("communityArchiveBillingJobs")
    .withIndex("by_community_generation", (q: any) =>
      q
        .eq("communityId", communityId)
        .eq("lifecycleGeneration", lifecycleGeneration),
    )
    .take(2)) as ArchiveBillingJobRow[];
  if (rows.length > 1) throw new Error("community_archive_billing_job_ambiguous");
  return rows[0] ?? null;
}

export async function requireCompletedCommunityArchiveBillingCleanup(
  ctx: any,
  communityId: any,
  lifecycleGeneration: number,
): Promise<ArchiveBillingJobRow> {
  const job = await getUniqueArchiveBillingJob(
    ctx,
    communityId,
    lifecycleGeneration,
  );
  if (!job || job.status !== "complete") {
    throw new Error("community_restore_billing_cleanup_incomplete");
  }
  return job;
}

async function scheduleArchiveBillingWorker(
  ctx: any,
  jobId: any,
  delayMs: number,
): Promise<void> {
  await ctx.scheduler.runAfter(
    Math.max(0, Math.floor(delayMs)),
    (internal as any).communityColdArchive.processCommunityArchiveBillingJobInternal,
    { jobId },
  );
}

export const archiveCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const community = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(actorUserId)) {
      throw new Error("community_archive_forbidden");
    }
    if (isPlatformHomeCommunity({ communitySlug: community.slug })) {
      throw new Error("community_archive_platform_home_forbidden");
    }

    const transition = archiveCommunityLifecycle(community);
    const nowMs = Date.now();
    let job = await getUniqueArchiveBillingJob(
      ctx,
      args.communityId,
      transition.next.generation,
    );
    let shouldSchedule = false;

    if (transition.changed) {
      await ctx.db.patch(args.communityId, {
        lifecycleStatus: transition.next.status,
        lifecycleGeneration: transition.next.generation,
        updatedAt: nowMs,
      });
      if (job) throw new Error("community_archive_billing_job_generation_conflict");
      const jobId = await ctx.db.insert("communityArchiveBillingJobs", {
        communityId: args.communityId,
        lifecycleGeneration: transition.next.generation,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: nowMs + ARCHIVE_BILLING_RECOVERY_LEASE_MS,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      job = (await ctx.db.get(jobId)) as ArchiveBillingJobRow | null;
      if (!job) throw new Error("community_archive_billing_job_create_failed");
      shouldSchedule = true;
      await recordCriticalAuditEvent(ctx, {
        eventKey: `community_archived:${String(args.communityId)}:${transition.next.generation}`,
        eventType: "community_archived",
        status: "succeeded",
        actorUserId,
        communityId: args.communityId,
        metadata: { lifecycleGeneration: transition.next.generation },
        createdAt: nowMs,
      });
    } else if (!job) {
      const jobId = await ctx.db.insert("communityArchiveBillingJobs", {
        communityId: args.communityId,
        lifecycleGeneration: transition.next.generation,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: nowMs + ARCHIVE_BILLING_RECOVERY_LEASE_MS,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      job = (await ctx.db.get(jobId)) as ArchiveBillingJobRow | null;
      if (!job) throw new Error("community_archive_billing_job_create_failed");
      shouldSchedule = true;
    } else if (job.status === "blocked") {
      await ctx.db.patch(job._id, {
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: nowMs + ARCHIVE_BILLING_RECOVERY_LEASE_MS,
        lastErrorCode: undefined,
        updatedAt: nowMs,
      });
      job = {
        ...job,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: nowMs + ARCHIVE_BILLING_RECOVERY_LEASE_MS,
        lastErrorCode: undefined,
        updatedAt: nowMs,
      };
      shouldSchedule = true;
    }

    if (shouldSchedule && job) {
      await scheduleArchiveBillingWorker(ctx, job._id, 0);
    }

    return {
      ok: true,
      changed: transition.changed,
      community_id: String(args.communityId),
      lifecycle_status: transition.next.status,
      lifecycle_generation: transition.next.generation,
      billing_cleanup_status: job?.status ?? "pending",
    };
  },
});

export const getCommunityArchiveBillingJobWorkInternal = internalQuery({
  args: { jobId: v.id("communityArchiveBillingJobs") },
  handler: async (ctx, args) => {
    const job = (await ctx.db.get(args.jobId)) as ArchiveBillingJobRow | null;
    if (!job || job.status !== "pending") {
      return { kind: "inactive" as const };
    }
    const community = await ctx.db.get(job.communityId);
    if (
      !community ||
      normalizeCommunityLifecycle(community).status !== "archived" ||
      !communityLifecycleGenerationMatches(community, job.lifecycleGeneration)
    ) {
      throw new Error("community_archive_billing_job_lifecycle_mismatch");
    }

    const pendingCheckouts = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", job.communityId).eq("status", "pending"),
      )
      .take(100);
    const staleCheckouts = pendingCheckouts.filter(
        (row) =>
          (row.mode === "community_join" || row.mode === "founder_subscription") &&
          !communityLifecycleGenerationMatches(
            community,
            row.communityLifecycleGeneration,
          ),
      );
    const nowMs = Date.now();
    const settlingCheckout = staleCheckouts.find(
      (row) =>
        !normalizeOptionalString(row.providerCheckoutSessionId) &&
        !normalizeOptionalString(row.providerSubscriptionId) &&
        nowMs < row.createdAt + ARCHIVE_CHECKOUT_SETTLE_GRACE_MS,
    );
    if (settlingCheckout) {
      return {
        kind: "wait" as const,
        delayMs: Math.max(
          1_000,
          settlingCheckout.createdAt + ARCHIVE_CHECKOUT_SETTLE_GRACE_MS - nowMs,
        ),
      };
    }
    const checkoutTargets: ArchiveCheckoutTarget[] = staleCheckouts
      .slice(0, ARCHIVE_BILLING_BATCH_SIZE)
      .map((row) => ({
        rowId: row._id,
        providerCheckoutSessionId: normalizeOptionalString(
          row.providerCheckoutSessionId,
        ),
        providerSubscriptionId: normalizeOptionalString(row.providerSubscriptionId),
        providerAccountId: normalizeOptionalString(row.providerAccountId),
      }));
    if (checkoutTargets.length > 0) {
      return { kind: "checkouts" as const, job, targets: checkoutTargets };
    }

    const memberTargets: ArchiveSubscriptionTarget[] = [];
    for (const status of ["active", "past_due", "cancel_at_period_end"] as const) {
      if (memberTargets.length >= ARCHIVE_BILLING_BATCH_SIZE) break;
      const rows = await ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", job.communityId).eq("status", status),
        )
        .take(ARCHIVE_BILLING_BATCH_SIZE - memberTargets.length);
      for (const row of rows) {
        const providerSubscriptionId = normalizeOptionalString(
          row.providerSubscriptionId,
        );
        const providerAccountId = normalizeOptionalString(row.providerAccountId);
        if (providerSubscriptionId && !providerAccountId) {
          throw new Error("community_subscription_provider_account_missing");
        }
        memberTargets.push({
          rowId: row._id,
          providerSubscriptionId,
          providerAccountId,
        });
      }
    }
    if (memberTargets.length > 0) {
      return { kind: "member_subscriptions" as const, job, targets: memberTargets };
    }

    const founderSubscriptions = await ctx.db
      .query("founderSubscriptions")
      .withIndex("by_community", (q) => q.eq("communityId", job.communityId))
      .collect();
    const founderTargets: ArchiveSubscriptionTarget[] = founderSubscriptions
      .filter((row) =>
        row.status === "active" ||
        row.status === "past_due" ||
        row.status === "cancel_at_period_end",
      )
      .slice(0, ARCHIVE_BILLING_BATCH_SIZE)
      .map((row) => ({
        rowId: row._id,
        providerSubscriptionId: row.providerSubscriptionId,
        providerAccountId: null,
      }));
    if (founderTargets.length > 0) {
      return { kind: "founder_subscriptions" as const, job, targets: founderTargets };
    }

    return { kind: "complete" as const, job };
  },
});

export const applyCommunityArchiveBillingBatchInternal = internalMutation({
  args: {
    jobId: v.id("communityArchiveBillingJobs"),
    checkoutSessionIds: v.array(v.id("checkoutSessions")),
    communitySubscriptionIds: v.array(v.id("communitySubscriptions")),
    founderSubscriptionIds: v.array(v.id("founderSubscriptions")),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = (await ctx.db.get(args.jobId)) as ArchiveBillingJobRow | null;
    if (!job || job.status !== "pending") return { ok: true, ignored: true };
    for (const checkoutSessionId of args.checkoutSessionIds) {
      const row = await ctx.db.get(checkoutSessionId);
      if (!row || String(row.communityId ?? "") !== String(job.communityId)) continue;
      if (row.status === "pending") {
        await ctx.db.patch(checkoutSessionId, {
          status: "expired",
          updatedAt: args.nowMs,
        });
      }
    }
    for (const communitySubscriptionId of args.communitySubscriptionIds) {
      const row = await ctx.db.get(communitySubscriptionId);
      if (!row || String(row.communityId) !== String(job.communityId)) continue;
      await ctx.db.patch(communitySubscriptionId, {
        status: "ended",
        cancelAtPeriodEnd: false,
        endedAt: row.endedAt ?? args.nowMs,
        updatedAt: args.nowMs,
      });
    }
    for (const founderSubscriptionId of args.founderSubscriptionIds) {
      const row = await ctx.db.get(founderSubscriptionId);
      if (!row || String(row.communityId) !== String(job.communityId)) continue;
      await ctx.db.patch(founderSubscriptionId, {
        status: "ended",
        cancelAtPeriodEnd: false,
        endedAt: row.endedAt ?? args.nowMs,
        revokedReason: "community_archived",
        updatedAt: args.nowMs,
      });
    }
    await ctx.db.patch(job._id, {
      nextAttemptAt: args.nowMs + ARCHIVE_BILLING_RECOVERY_LEASE_MS,
      lastErrorCode: undefined,
      updatedAt: args.nowMs,
    });
    await scheduleArchiveBillingWorker(ctx, job._id, 0);
    return { ok: true, ignored: false };
  },
});

export const deferCommunityArchiveBillingJobInternal = internalMutation({
  args: {
    jobId: v.id("communityArchiveBillingJobs"),
    delayMs: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = (await ctx.db.get(args.jobId)) as ArchiveBillingJobRow | null;
    if (!job || job.status !== "pending") return { ok: true, ignored: true };
    const delayMs = Math.max(1_000, Math.floor(args.delayMs));
    await ctx.db.patch(job._id, {
      nextAttemptAt:
        args.nowMs + delayMs + ARCHIVE_BILLING_RECOVERY_LEASE_MS,
      updatedAt: args.nowMs,
    });
    await scheduleArchiveBillingWorker(ctx, job._id, delayMs);
    return { ok: true, ignored: false };
  },
});

export const completeCommunityArchiveBillingJobInternal = internalMutation({
  args: {
    jobId: v.id("communityArchiveBillingJobs"),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = (await ctx.db.get(args.jobId)) as ArchiveBillingJobRow | null;
    if (!job || job.status !== "pending") return { ok: true, ignored: true };
    await ctx.db.patch(job._id, {
      status: "complete",
      completedAt: args.nowMs,
      nextAttemptAt: args.nowMs,
      lastErrorCode: undefined,
      updatedAt: args.nowMs,
    });
    await recordCriticalAuditEvent(ctx, {
      eventKey: `community_archive_billing_cleanup_completed:${String(job.communityId)}:${job.lifecycleGeneration}`,
      eventType: "community_archive_billing_cleanup_completed",
      status: "succeeded",
      communityId: job.communityId,
      metadata: {
        lifecycleGeneration: job.lifecycleGeneration,
        attemptCount: job.attemptCount,
      },
      createdAt: args.nowMs,
    });
    return { ok: true, ignored: false };
  },
});

export const failCommunityArchiveBillingJobInternal = internalMutation({
  args: {
    jobId: v.id("communityArchiveBillingJobs"),
    errorCode: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = (await ctx.db.get(args.jobId)) as ArchiveBillingJobRow | null;
    if (!job || job.status !== "pending") return { ok: true, ignored: true };
    const attemptCount = job.attemptCount + 1;
    const blocked = attemptCount >= ARCHIVE_BILLING_MAX_ATTEMPTS;
    const retryDelayMs = Math.min(
      ARCHIVE_BILLING_MAX_RETRY_DELAY_MS,
      5_000 * 2 ** Math.min(10, Math.max(0, attemptCount - 1)),
    );
    await ctx.db.patch(job._id, {
      status: blocked ? "blocked" : "pending",
      attemptCount,
      nextAttemptAt: args.nowMs + retryDelayMs,
      lastErrorCode: args.errorCode,
      updatedAt: args.nowMs,
    });
    await recordCriticalAuditEvent(ctx, {
      eventKey: `community_archive_billing_cleanup_failed:${String(job.communityId)}:${job.lifecycleGeneration}:${attemptCount}`,
      eventType: "community_archive_billing_cleanup_failed",
      severity: blocked ? "error" : "warning",
      status: blocked ? "blocked" : "failed",
      communityId: job.communityId,
      metadata: {
        lifecycleGeneration: job.lifecycleGeneration,
        attemptCount,
        errorCode: args.errorCode,
      },
      createdAt: args.nowMs,
    });
    if (!blocked) {
      await scheduleArchiveBillingWorker(ctx, job._id, retryDelayMs);
    }
    return { ok: true, ignored: false, blocked, attemptCount };
  },
});

export const processCommunityArchiveBillingJobInternal = internalAction({
  args: { jobId: v.id("communityArchiveBillingJobs") },
  handler: async (ctx, args) => {
    try {
      const work = (await ctx.runQuery(
        (internal as any).communityColdArchive.getCommunityArchiveBillingJobWorkInternal,
        { jobId: args.jobId },
      )) as any;
      if (work.kind === "inactive") return { ok: true, ignored: true };
      if (work.kind === "wait") {
        await ctx.runMutation(
          (internal as any).communityColdArchive.deferCommunityArchiveBillingJobInternal,
          { jobId: args.jobId, delayMs: work.delayMs, nowMs: Date.now() },
        );
        return { ok: true, deferred: true };
      }
      if (work.kind === "complete") {
        await ctx.runMutation(
          (internal as any).communityColdArchive.completeCommunityArchiveBillingJobInternal,
          { jobId: args.jobId, nowMs: Date.now() },
        );
        return { ok: true, complete: true };
      }

      const checkoutSessionIds: any[] = [];
      const communitySubscriptionIds: any[] = [];
      const founderSubscriptionIds: any[] = [];
      if (work.kind === "checkouts") {
        for (const target of work.targets as ArchiveCheckoutTarget[]) {
          const subscriptionIds = new Set<string>();
          if (target.providerCheckoutSessionId) {
            const expired = await expireStripeCheckoutSessionIfOpen({
              providerCheckoutSessionId: target.providerCheckoutSessionId,
              providerAccountId: target.providerAccountId,
            });
            if (expired.providerSubscriptionId) {
              subscriptionIds.add(expired.providerSubscriptionId);
            }
          }
          if (target.providerSubscriptionId) {
            subscriptionIds.add(target.providerSubscriptionId);
          }
          for (const providerSubscriptionId of subscriptionIds) {
            await cancelStripeSubscriptionIfActive({
              providerSubscriptionId,
              providerAccountId: target.providerAccountId,
            });
          }
          checkoutSessionIds.push(target.rowId);
        }
      } else {
        for (const target of work.targets as ArchiveSubscriptionTarget[]) {
          if (target.providerSubscriptionId) {
            await cancelStripeSubscriptionIfActive({
              providerSubscriptionId: target.providerSubscriptionId,
              providerAccountId: target.providerAccountId,
            });
          }
          if (work.kind === "member_subscriptions") {
            communitySubscriptionIds.push(target.rowId);
          } else {
            founderSubscriptionIds.push(target.rowId);
          }
        }
      }

      await ctx.runMutation(
        (internal as any).communityColdArchive.applyCommunityArchiveBillingBatchInternal,
        {
          jobId: args.jobId,
          checkoutSessionIds,
          communitySubscriptionIds,
          founderSubscriptionIds,
          nowMs: Date.now(),
        },
      );
      return { ok: true, complete: false };
    } catch (error) {
      const errorCode = normalizeArchiveBillingErrorCode(error);
      await ctx.runMutation(
        (internal as any).communityColdArchive.failCommunityArchiveBillingJobInternal,
        { jobId: args.jobId, errorCode, nowMs: Date.now() },
      );
      return { ok: false, error: errorCode };
    }
  },
});

export const scheduleDueCommunityArchiveBillingJobsInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const limit = Math.min(10, Math.max(1, Math.floor(args.limit ?? 3)));
    const jobs = (await ctx.db
      .query("communityArchiveBillingJobs")
      .withIndex("by_status_nextAttemptAt", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", nowMs),
      )
      .take(limit)) as ArchiveBillingJobRow[];
    for (const job of jobs) {
      await ctx.db.patch(job._id, {
        nextAttemptAt: nowMs + ARCHIVE_BILLING_RECOVERY_LEASE_MS,
        updatedAt: nowMs,
      });
      await scheduleArchiveBillingWorker(ctx, job._id, 0);
    }
    return { ok: true, scheduled: jobs.length };
  },
});
