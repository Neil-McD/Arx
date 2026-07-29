import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const MIGRATION_CONFIRM_MARKER = "staging-schema-compat-3e74f431-v1";
const MIGRATION_ENABLE_ENV =
  "ARX_ENABLE_STAGING_SCHEMA_COMPATIBILITY_MIGRATION";
const MAX_SCAN_ROWS = 2_000;
const MAX_BATCH_ROWS = 100;

type AuthSessionCompatibilityRow = {
  _id: any;
  sessionId?: unknown;
  authSubject?: unknown;
  sessionTokenHash?: unknown;
  userId?: unknown;
};

type AiFeedPostCompatibilityRow = {
  _id: any;
  score?: unknown;
  goodCount?: unknown;
  lowSignalCount?: unknown;
};

type EmailOutboxCompatibilityRow = {
  _id: any;
  status?: unknown;
  recipientEmail?: unknown;
  payload?: unknown;
  contentMinimizedAt?: unknown;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function isEnabled(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function classifyRow(
  row: AuthSessionCompatibilityRow,
): "canonical" | "legacy" | "unexpected" {
  const hasSessionId = hasNonEmptyString(row.sessionId);
  const hasAuthSubject = hasNonEmptyString(row.authSubject);
  if (hasSessionId && hasAuthSubject) return "canonical";
  if (
    !hasSessionId &&
    !hasAuthSubject &&
    hasNonEmptyString(row.sessionTokenHash) &&
    row.userId != null
  ) {
    return "legacy";
  }
  return "unexpected";
}

async function inspectRows(ctx: any) {
  const rows = (await ctx.db
    .query("authSessions")
    .take(MAX_SCAN_ROWS + 1)) as AuthSessionCompatibilityRow[];
  const truncated = rows.length > MAX_SCAN_ROWS;
  const sampled = rows.slice(0, MAX_SCAN_ROWS);
  const canonical = sampled.filter((row) => classifyRow(row) === "canonical");
  const legacy = sampled.filter((row) => classifyRow(row) === "legacy");
  const unexpected = sampled.filter((row) => classifyRow(row) === "unexpected");
  return {
    rows: sampled,
    canonical,
    legacy,
    unexpected,
    truncated,
  };
}

function requireStagingDeployment(): void {
  if (readEnv("POLYNET_DEPLOYMENT_KIND") !== "staging") {
    throw new Error(
      "staging_auth_session_retirement_requires_staging_deployment",
    );
  }
}

export const inspectLegacyAuthSessionsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    requireStagingDeployment();
    const inspected = await inspectRows(ctx);
    return {
      sampled_count: inspected.rows.length,
      canonical_count: inspected.canonical.length,
      legacy_count: inspected.legacy.length,
      unexpected_count: inspected.unexpected.length,
      truncated: inspected.truncated,
      confirm_marker: MIGRATION_CONFIRM_MARKER,
    };
  },
});

export const inspectLegacyAiFeedPostsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    requireStagingDeployment();
    const rows = (await ctx.db
      .query("communityAiFeedPosts")
      .take(MAX_SCAN_ROWS + 1)) as AiFeedPostCompatibilityRow[];
    const truncated = rows.length > MAX_SCAN_ROWS;
    const sampled = rows.slice(0, MAX_SCAN_ROWS);
    const legacy = sampled.filter(
      (row) =>
        typeof row.score !== "number" ||
        typeof row.goodCount !== "number" ||
        typeof row.lowSignalCount !== "number",
    );
    return {
      sampled_count: sampled.length,
      legacy_count: legacy.length,
      truncated,
      confirm_marker: MIGRATION_CONFIRM_MARKER,
    };
  },
});

function classifyEmailOutboxRow(
  row: EmailOutboxCompatibilityRow,
): "canonical" | "minimized" | "unexpected" {
  const hasRecipientEmail = hasNonEmptyString(row.recipientEmail);
  const hasPayload = Object.prototype.hasOwnProperty.call(row, "payload");
  const hasMinimizedAt = typeof row.contentMinimizedAt === "number";
  if (hasRecipientEmail && hasPayload && !hasMinimizedAt) return "canonical";
  if (
    !hasRecipientEmail &&
    !hasPayload &&
    hasMinimizedAt &&
    (row.status === "failed" || row.status === "suppressed")
  ) {
    return "minimized";
  }
  return "unexpected";
}

export const inspectMinimizedEmailOutboxInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    requireStagingDeployment();
    const rows = (await ctx.db
      .query("emailOutbox")
      .take(MAX_SCAN_ROWS + 1)) as EmailOutboxCompatibilityRow[];
    const truncated = rows.length > MAX_SCAN_ROWS;
    const sampled = rows.slice(0, MAX_SCAN_ROWS);
    return {
      sampled_count: sampled.length,
      canonical_count: sampled.filter(
        (row) => classifyEmailOutboxRow(row) === "canonical",
      ).length,
      minimized_count: sampled.filter(
        (row) => classifyEmailOutboxRow(row) === "minimized",
      ).length,
      unexpected_count: sampled.filter(
        (row) => classifyEmailOutboxRow(row) === "unexpected",
      ).length,
      truncated,
      confirm_marker: MIGRATION_CONFIRM_MARKER,
    };
  },
});

export const retireLegacyAuthSessionsBatchInternal = internalMutation({
  args: {
    confirmMarker: v.string(),
    batchLimit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireStagingDeployment();
    if (args.confirmMarker !== MIGRATION_CONFIRM_MARKER) {
      throw new Error("staging_auth_session_retirement_confirmation_required");
    }
    const dryRun = args.dryRun !== false;
    if (!dryRun && !isEnabled(readEnv(MIGRATION_ENABLE_ENV))) {
      throw new Error("staging_auth_session_retirement_not_enabled");
    }
    const batchLimit = Math.max(
      1,
      Math.min(MAX_BATCH_ROWS, Math.floor(args.batchLimit ?? MAX_BATCH_ROWS)),
    );
    const inspected = await inspectRows(ctx);
    if (inspected.truncated) {
      throw new Error("staging_auth_session_retirement_scan_truncated");
    }
    if (inspected.unexpected.length > 0) {
      throw new Error("staging_auth_session_retirement_unexpected_shape");
    }
    const candidates = inspected.legacy.slice(0, batchLimit);
    if (!dryRun) {
      for (const row of candidates) {
        await ctx.db.delete(row._id);
      }
    }
    return {
      dry_run: dryRun,
      deleted: dryRun ? 0 : candidates.length,
      would_delete: dryRun ? candidates.length : 0,
      legacy_before: inspected.legacy.length,
      canonical_before: inspected.canonical.length,
      unexpected_before: inspected.unexpected.length,
      has_more: inspected.legacy.length > candidates.length,
      confirm_marker: MIGRATION_CONFIRM_MARKER,
    };
  },
});

export const migrateLegacyAiFeedPostsBatchInternal = internalMutation({
  args: {
    confirmMarker: v.string(),
    batchLimit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireStagingDeployment();
    if (args.confirmMarker !== MIGRATION_CONFIRM_MARKER) {
      throw new Error("staging_ai_feed_migration_confirmation_required");
    }
    const dryRun = args.dryRun !== false;
    if (!dryRun && !isEnabled(readEnv(MIGRATION_ENABLE_ENV))) {
      throw new Error("staging_ai_feed_migration_not_enabled");
    }
    const batchLimit = Math.max(
      1,
      Math.min(MAX_BATCH_ROWS, Math.floor(args.batchLimit ?? MAX_BATCH_ROWS)),
    );
    const rows = (await ctx.db
      .query("communityAiFeedPosts")
      .take(MAX_SCAN_ROWS + 1)) as AiFeedPostCompatibilityRow[];
    if (rows.length > MAX_SCAN_ROWS) {
      throw new Error("staging_ai_feed_migration_scan_truncated");
    }
    const legacy = rows.filter(
      (row) =>
        typeof row.score !== "number" ||
        typeof row.goodCount !== "number" ||
        typeof row.lowSignalCount !== "number",
    );
    const candidates = legacy.slice(0, batchLimit);
    if (!dryRun) {
      for (const row of candidates) {
        await ctx.db.patch(row._id, {
          ...(typeof row.score === "number" ? null : { score: 0 }),
          ...(typeof row.goodCount === "number" ? null : { goodCount: 0 }),
          ...(typeof row.lowSignalCount === "number"
            ? null
            : { lowSignalCount: 0 }),
        });
      }
    }
    return {
      dry_run: dryRun,
      migrated: dryRun ? 0 : candidates.length,
      would_migrate: dryRun ? candidates.length : 0,
      legacy_before: legacy.length,
      has_more: legacy.length > candidates.length,
      confirm_marker: MIGRATION_CONFIRM_MARKER,
    };
  },
});

export const normalizeMinimizedEmailOutboxBatchInternal = internalMutation({
  args: {
    confirmMarker: v.string(),
    batchLimit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireStagingDeployment();
    if (args.confirmMarker !== MIGRATION_CONFIRM_MARKER) {
      throw new Error("staging_email_outbox_migration_confirmation_required");
    }
    const dryRun = args.dryRun !== false;
    if (!dryRun && !isEnabled(readEnv(MIGRATION_ENABLE_ENV))) {
      throw new Error("staging_email_outbox_migration_not_enabled");
    }
    const batchLimit = Math.max(
      1,
      Math.min(MAX_BATCH_ROWS, Math.floor(args.batchLimit ?? MAX_BATCH_ROWS)),
    );
    const rows = (await ctx.db
      .query("emailOutbox")
      .take(MAX_SCAN_ROWS + 1)) as EmailOutboxCompatibilityRow[];
    if (rows.length > MAX_SCAN_ROWS) {
      throw new Error("staging_email_outbox_migration_scan_truncated");
    }
    const unexpected = rows.filter(
      (row) => classifyEmailOutboxRow(row) === "unexpected",
    );
    if (unexpected.length > 0) {
      throw new Error("staging_email_outbox_migration_unexpected_shape");
    }
    const minimized = rows.filter(
      (row) => classifyEmailOutboxRow(row) === "minimized",
    );
    const candidates = minimized.slice(0, batchLimit);
    if (!dryRun) {
      for (const row of candidates) {
        await ctx.db.patch(row._id, {
          recipientEmail: "minimized@invalid.local",
          payload: {
            minimized: true,
            content_minimized_at: row.contentMinimizedAt,
          },
          contentMinimizedAt: undefined,
        });
      }
    }
    return {
      dry_run: dryRun,
      normalized: dryRun ? 0 : candidates.length,
      would_normalize: dryRun ? candidates.length : 0,
      minimized_before: minimized.length,
      unexpected_before: unexpected.length,
      has_more: minimized.length > candidates.length,
      confirm_marker: MIGRATION_CONFIRM_MARKER,
    };
  },
});
