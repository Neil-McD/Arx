import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const SUBSYSTEM_VALIDATOR = v.union(
  v.literal("auth"),
  v.literal("access"),
  v.literal("security"),
  v.literal("billing"),
  v.literal("runtime"),
  v.literal("mcp"),
  v.literal("tool"),
  v.literal("community"),
  v.literal("funnel"),
  v.literal("deploy"),
  v.literal("diagnostics"),
);

const SEVERITY_VALIDATOR = v.union(v.literal("info"), v.literal("warning"), v.literal("error"));
const STATUS_VALIDATOR = v.union(
  v.literal("started"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("blocked"),
  v.literal("ignored"),
);

type PlatformDiagnosticSubsystem =
  | "auth"
  | "access"
  | "security"
  | "billing"
  | "runtime"
  | "mcp"
  | "tool"
  | "community"
  | "funnel"
  | "deploy"
  | "diagnostics";

type PlatformDiagnosticEventInput = {
  eventKey: string;
  eventType: string;
  subsystem: PlatformDiagnosticSubsystem;
  severity?: "info" | "warning" | "error";
  status: "started" | "succeeded" | "failed" | "blocked" | "ignored";
  surface?: string | null;
  userId?: unknown;
  communityId?: unknown;
  projectId?: unknown;
  threadId?: unknown;
  runId?: string | null;
  requestId?: string | null;
  release?: string | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  metadata?: unknown;
  createdAt?: number;
};

type PlatformDiagnosticMetadataValue = string | number | boolean;

const DIAGNOSTIC_METADATA_STRING_MAX_LENGTH = 200;

const DIAGNOSTIC_METADATA_BLOCKED_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "cookie",
  "authorization",
  "bearer",
  "session",
  "api_key",
  "apikey",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "encrypted",
];

const DIAGNOSTIC_METADATA_SAFE_KEY_EXCEPTIONS = [
  "recoveredWithStoredToken",
  "rotatedSessionFollowed",
];

const DIAGNOSTIC_METADATA_ALLOWLIST: Record<string, readonly string[]> = {
  "auth.session_established": ["bootstrapPath", "rotatedSessionFollowed"],
  "auth.bootstrap_failed": ["recoveredWithStoredToken"],
  "auth.session_refreshed": [],
  "auth.session_refresh_failed": ["recoveredWithStoredToken"],
  "auth.session_logged_out": ["providerLogoutOutcome"],
  "auth.session_logout_failed": [],
  "access.operator_access_granted": ["role", "source"],
  "access.operator_access_denied": [],
  "billing.stripe_connect_onboarding_failed": [
    "context",
    "communitySlug",
    "country",
    "stage",
    "stripeAccountId",
    "stripeErrorType",
    "stripeErrorCode",
    "stripeRequestId",
    "stripeStatusCode",
    "errorMessage",
  ],
};

function cleanString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function normalizeMetadataKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function metadataKeyLooksSensitive(key: string): boolean {
  const normalizedKey = normalizeMetadataKey(key);
  if (
    DIAGNOSTIC_METADATA_SAFE_KEY_EXCEPTIONS.some(
      (exception) => normalizeMetadataKey(exception) === normalizedKey,
    )
  ) {
    return false;
  }
  return DIAGNOSTIC_METADATA_BLOCKED_KEY_PARTS.some((part) =>
    normalizedKey.includes(normalizeMetadataKey(part)),
  );
}

function sanitizeMetadataValue(value: unknown): PlatformDiagnosticMetadataValue | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? normalized.slice(0, DIAGNOSTIC_METADATA_STRING_MAX_LENGTH)
      : undefined;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

export function sanitizePlatformDiagnosticMetadata(
  eventType: string,
  metadata: unknown,
): Record<string, PlatformDiagnosticMetadataValue> | undefined {
  const allowedKeys = DIAGNOSTIC_METADATA_ALLOWLIST[eventType] ?? [];
  if (
    allowedKeys.length === 0 ||
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }

  const input = metadata as Record<string, unknown>;
  const sanitized: Record<string, PlatformDiagnosticMetadataValue> = {};
  for (const key of allowedKeys) {
    if (metadataKeyLooksSensitive(key)) continue;
    const safeValue = sanitizeMetadataValue(input[key]);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export async function recordPlatformDiagnosticEvent(ctx: any, input: PlatformDiagnosticEventInput) {
  const eventKey = cleanString(input.eventKey);
  const eventType = cleanString(input.eventType);
  if (!eventKey || !eventType) return null;

  const existing = await ctx.db
    .query("platformDiagnosticEvents")
    .withIndex("by_eventKey", (q: any) => q.eq("eventKey", eventKey))
    .first();
  if (existing) return existing._id;

  return await ctx.db.insert("platformDiagnosticEvents", {
    eventKey,
    eventType,
    subsystem: input.subsystem,
    severity: input.severity ?? "info",
    status: input.status,
    surface: cleanString(input.surface),
    userId: input.userId || undefined,
    communityId: input.communityId || undefined,
    projectId: input.projectId || undefined,
    threadId: input.threadId || undefined,
    runId: cleanString(input.runId),
    requestId: cleanString(input.requestId),
    release: cleanString(input.release),
    latencyMs: cleanNumber(input.latencyMs),
    errorCode: cleanString(input.errorCode),
    metadata: sanitizePlatformDiagnosticMetadata(eventType, input.metadata),
    createdAt:
      typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
        ? input.createdAt
        : Date.now(),
  });
}

export async function recordPlatformDiagnosticEventBestEffort(
  ctx: any,
  input: PlatformDiagnosticEventInput,
): Promise<void> {
  try {
    await recordPlatformDiagnosticEvent(ctx, input);
  } catch (error) {
    console.error("platform_diagnostic_event_record_failed", {
      eventType: input.eventType,
      eventKey: input.eventKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const recordPlatformDiagnosticEventInternal = internalMutation({
  args: {
    eventKey: v.string(),
    eventType: v.string(),
    subsystem: SUBSYSTEM_VALIDATOR,
    severity: v.optional(SEVERITY_VALIDATOR),
    status: STATUS_VALIDATOR,
    surface: v.optional(v.union(v.string(), v.null())),
    userId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    projectId: v.optional(v.id("cloudProjects")),
    threadId: v.optional(v.id("threads")),
    runId: v.optional(v.union(v.string(), v.null())),
    requestId: v.optional(v.union(v.string(), v.null())),
    release: v.optional(v.union(v.string(), v.null())),
    latencyMs: v.optional(v.union(v.number(), v.null())),
    errorCode: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => recordPlatformDiagnosticEvent(ctx, args),
});

export const listPlatformDiagnosticEventsInternal = internalQuery({
  args: {
    subsystem: v.optional(SUBSYSTEM_VALIDATOR),
    eventType: v.optional(v.string()),
    severity: v.optional(SEVERITY_VALIDATOR),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(200, Math.max(1, Math.floor(args.limit ?? 50)));
    if (args.eventType) {
      return await ctx.db
        .query("platformDiagnosticEvents")
        .withIndex("by_type_createdAt", (q: any) => q.eq("eventType", args.eventType as string))
        .order("desc")
        .take(limit);
    }
    if (args.subsystem) {
      return await ctx.db
        .query("platformDiagnosticEvents")
        .withIndex("by_subsystem_createdAt", (q: any) => q.eq("subsystem", args.subsystem as any))
        .order("desc")
        .take(limit);
    }
    if (args.severity) {
      return await ctx.db
        .query("platformDiagnosticEvents")
        .withIndex("by_severity_createdAt", (q: any) => q.eq("severity", args.severity as any))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("platformDiagnosticEvents").order("desc").take(limit);
  },
});
