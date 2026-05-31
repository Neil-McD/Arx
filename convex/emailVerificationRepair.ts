import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  isWorkosApiKeyConfigured,
  normalizeEmailForVerification,
  resolveTrustedWorkosEmailVerification,
} from "./workosEmailVerification";

const DEFAULT_BACKFILL_LIMIT = 50;
const MAX_BACKFILL_LIMIT = 100;
const MAX_BACKFILL_SCAN_LIMIT = 500;

function normalizeLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function increment(map: Record<string, number>, rawKey: unknown): void {
  const key = String(rawKey ?? "").trim() || "<missing>";
  map[key] = (map[key] ?? 0) + 1;
}

export const listEmailVerificationBackfillCandidatesInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
    scanLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit, DEFAULT_BACKFILL_LIMIT, MAX_BACKFILL_LIMIT);
    const scanLimit = normalizeLimit(
      args.scanLimit,
      Math.min(MAX_BACKFILL_SCAN_LIMIT, limit * 5),
      MAX_BACKFILL_SCAN_LIMIT,
    );
    const users = await ctx.db.query("users").order("desc").take(scanLimit);
    const candidates = [];
    for (const user of users) {
      if (candidates.length >= limit) break;
      if (typeof user.emailVerifiedAt === "number") continue;
      const authSubject = String(user.authSubject ?? "").trim();
      const email = normalizeEmailForVerification(user.email);
      if (!authSubject || !email) continue;
      candidates.push({
        userId: user._id,
        authSubject,
        email,
      });
    }
    return {
      candidates,
      limits: {
        limit,
        scanLimit,
      },
      scanned: users.length,
      truncated: users.length >= scanLimit && candidates.length >= limit,
    };
  },
});

export const patchEmailVerifiedAtFromWorkosInternal = internalMutation({
  args: {
    userId: v.id("users"),
    authSubject: v.string(),
    email: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { patched: false, reason: "user_missing" };
    if (String(user.authSubject ?? "").trim() !== args.authSubject) {
      return { patched: false, reason: "auth_subject_mismatch" };
    }
    if (normalizeEmailForVerification(user.email) !== normalizeEmailForVerification(args.email)) {
      return { patched: false, reason: "email_mismatch" };
    }
    if (typeof user.emailVerifiedAt === "number") {
      return { patched: false, reason: "already_verified" };
    }

    await ctx.db.patch(args.userId, {
      emailVerifiedAt: args.nowMs,
      emailVerificationSource: "oauth_provider",
      updatedAt: args.nowMs,
    });
    return { patched: true, reason: null };
  },
});

export const backfillEmailVerifiedAtFromWorkos = action({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
    scanLimit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const operator = await ctx.runQuery((internal as any).operatorAccess.getOperatorWriteAccessInternal, {
      authSubject: args.authSubject,
    });

    const dryRun = args.dryRun !== false;
    const startedAt = Date.now();
    const summary: Record<string, number> = {
      candidates: 0,
      trustedVerified: 0,
      patched: 0,
      skipped: 0,
      errors: 0,
    };
    const reasons: Record<string, number> = {};

    if (!isWorkosApiKeyConfigured()) {
      return {
        ok: false,
        dryRun,
        reason: "workos_api_key_missing",
        summary,
        reasons,
        startedAt,
        finishedAt: Date.now(),
      };
    }

    const candidateResult = (await ctx.runQuery(
      (internal as any).emailVerificationRepair.listEmailVerificationBackfillCandidatesInternal,
      {
        limit: args.limit,
        scanLimit: args.scanLimit,
      },
    )) as {
      candidates: Array<{ userId: any; authSubject: string; email: string }>;
      limits: { limit: number; scanLimit: number };
      scanned: number;
      truncated: boolean;
    };

    summary.candidates = candidateResult.candidates.length;
    for (const candidate of candidateResult.candidates) {
      const verification = await resolveTrustedWorkosEmailVerification({
        authSubject: candidate.authSubject,
        email: candidate.email,
      });
      if (!verification.emailVerified) {
        const reason = verification.reason ?? verification.workosLookup?.reason ?? "email_not_verified";
        increment(reasons, reason);
        if (verification.workosLookup?.status === "error") summary.errors += 1;
        else summary.skipped += 1;
        continue;
      }

      summary.trustedVerified += 1;
      if (dryRun) {
        increment(reasons, "dry_run");
        continue;
      }

      const patchResult = await ctx.runMutation(
        (internal as any).emailVerificationRepair.patchEmailVerifiedAtFromWorkosInternal,
        {
          userId: candidate.userId,
          authSubject: candidate.authSubject,
          email: candidate.email,
          nowMs: Date.now(),
        },
      );
      if (patchResult?.patched) {
        summary.patched += 1;
      } else {
        summary.skipped += 1;
        increment(reasons, patchResult?.reason ?? "patch_skipped");
      }
    }

    return {
      ok: true,
      dryRun,
      limits: candidateResult.limits,
      scanned: candidateResult.scanned,
      truncated: candidateResult.truncated,
      summary,
      reasons,
      evidence: {
        operatorRole: operator.role,
        redacted: true,
        fetchesWorkosUsers: true,
        mutatesUsers: !dryRun,
        mutatesEmailOutbox: false,
        sendsEmail: false,
      },
      startedAt,
      finishedAt: Date.now(),
    };
  },
});
