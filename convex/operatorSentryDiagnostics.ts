import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

const DEFAULT_SENTRY_BASE_URL = "https://sentry.io";
const DEFAULT_SENTRY_ENVIRONMENT = "production";
const SENTRY_ISSUE_LIMIT = 10;
const SENTRY_REQUEST_TIMEOUT_MS = 6000;

const operatorRange = v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all")));

type SentryIssueLike = {
  id?: unknown;
  shortId?: unknown;
  title?: unknown;
  culprit?: unknown;
  permalink?: unknown;
  level?: unknown;
  status?: unknown;
  count?: unknown;
  userCount?: unknown;
  firstSeen?: unknown;
  lastSeen?: unknown;
  firstRelease?: { version?: unknown } | null;
  lastRelease?: { version?: unknown } | null;
};

function cleanOptionalString(value: unknown, maxLength = 180): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function cleanRequiredString(value: unknown, fallback: string, maxLength = 180): string {
  return cleanOptionalString(value, maxLength) ?? fallback;
}

function cleanInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function cleanNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function cleanIssueLevel(value: unknown): "fatal" | "error" | "warning" | "info" | "unknown" {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "fatal":
      return "fatal";
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "unknown";
  }
}

function statsPeriodForRange(range: string | undefined, endpointMode: "organization_issues" | "project_issues"): string {
  if (endpointMode === "project_issues") {
    return "14d";
  }
  switch (range) {
    case "7d":
      return "7d";
    case "90d":
      return "90d";
    case "all":
      return "90d";
    case "30d":
    default:
      return "30d";
  }
}

function buildUnavailableSnapshot(args: {
  range: string | undefined;
  endpointMode: "organization_issues" | "project_issues";
  org: string | null;
  project: string | null;
  projectId: string | null;
  environment: string | null;
  query: string;
  statsPeriod: string;
  currentBuildId: string | null;
  sentryRelease: string | null;
  configured: boolean;
  reason: string;
}): unknown {
  return {
    computedAt: Date.now(),
    range: args.range ?? "30d",
    health: "unknown",
    release: {
      currentBuildId: args.currentBuildId,
      sentryRelease: args.sentryRelease,
      matchesCurrentBuild:
        args.currentBuildId && args.sentryRelease ? args.currentBuildId === args.sentryRelease : null,
    },
    totals: {
      issues: 0,
      events: 0,
      affectedUsers: null,
      unresolvedIssues: 0,
    },
    topIssues: [],
    evidence: {
      source: "sentry",
      endpointMode: args.endpointMode,
      org: args.org,
      project: args.project,
      projectId: args.projectId,
      environment: args.environment,
      query: args.query,
      statsPeriod: args.statsPeriod,
      configured: args.configured,
      unavailableReason: args.reason,
      sampled: true,
      isTruncated: false,
    },
  };
}

async function fetchJsonWithTimeout(url: URL, token: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SENTRY_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`sentry_http_${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeSentryIssues(rows: SentryIssueLike[]): {
  health: "healthy" | "degraded" | "incident" | "unknown";
  totals: { issues: number; events: number; affectedUsers: number | null; unresolvedIssues: number };
  topIssues: Array<{
    id: string;
    shortId: string | null;
    title: string;
    culprit: string | null;
    permalink: string | null;
    level: "fatal" | "error" | "warning" | "info" | "unknown";
    status: string;
    count: number;
    userCount: number | null;
    firstSeen: string | null;
    lastSeen: string | null;
    release: string | null;
  }>;
} {
  const topIssues = rows.map((issue, index) => {
    const userCount = cleanNullableInteger(issue.userCount);
    const release =
      cleanOptionalString(issue.lastRelease?.version, 120) ?? cleanOptionalString(issue.firstRelease?.version, 120);
    return {
      id: cleanRequiredString(issue.id, `sentry-issue-${index}`, 80),
      shortId: cleanOptionalString(issue.shortId, 80),
      title: cleanRequiredString(issue.title, "Untitled Sentry issue", 180),
      culprit: cleanOptionalString(issue.culprit, 180),
      permalink: cleanOptionalString(issue.permalink, 240),
      level: cleanIssueLevel(issue.level),
      status: cleanRequiredString(issue.status, "unknown", 60),
      count: cleanInteger(issue.count),
      userCount,
      firstSeen: cleanOptionalString(issue.firstSeen, 80),
      lastSeen: cleanOptionalString(issue.lastSeen, 80),
      release,
    };
  });
  const events = topIssues.reduce((sum, issue) => sum + issue.count, 0);
  const affectedUserCounts = topIssues
    .map((issue) => issue.userCount)
    .filter((count): count is number => typeof count === "number");
  const affectedUsers = affectedUserCounts.length ? affectedUserCounts.reduce((sum, count) => sum + count, 0) : null;
  const hasFatal = topIssues.some((issue) => issue.level === "fatal");
  const hasError = topIssues.some((issue) => issue.level === "error");
  return {
    health: hasFatal ? "incident" : hasError || topIssues.length > 0 ? "degraded" : "healthy",
    totals: {
      issues: topIssues.length,
      events,
      affectedUsers,
      unresolvedIssues: topIssues.filter((issue) => issue.status !== "resolved").length,
    },
    topIssues,
  };
}

export const getOperatorFrontendErrorDiagnostics = action({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
    currentBuildId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    await ctx.runQuery((api as any).operatorDashboard.getOperatorAccess, {
      authSubject: args.authSubject,
    });

    const token = String(process.env.SENTRY_AUTH_TOKEN ?? "").trim();
    const org = cleanOptionalString(process.env.SENTRY_ORG, 120);
    const project = cleanOptionalString(process.env.SENTRY_PROJECT, 120);
    const projectId = cleanOptionalString(process.env.SENTRY_PROJECT_ID, 80);
    const sentryRelease =
      cleanOptionalString(process.env.SENTRY_RELEASE, 120) ??
      cleanOptionalString(process.env.VERCEL_GIT_COMMIT_SHA, 120) ??
      cleanOptionalString(process.env.GIT_COMMIT_SHA, 120);
    const currentBuildId = cleanOptionalString(args.currentBuildId, 120);
    const environment = cleanOptionalString(process.env.SENTRY_ENVIRONMENT, 80) ?? DEFAULT_SENTRY_ENVIRONMENT;
    const endpointMode = projectId ? "organization_issues" : "project_issues";
    const query = "is:unresolved";
    const statsPeriod = statsPeriodForRange(args.range, endpointMode);

    if (!token || !org || (!project && !projectId)) {
      return buildUnavailableSnapshot({
        range: args.range,
        endpointMode,
        org,
        project,
        projectId,
        environment,
        query,
        statsPeriod,
        currentBuildId,
        sentryRelease,
        configured: false,
        reason: "sentry_not_configured",
      });
    }

    try {
      const baseUrl = cleanOptionalString(process.env.SENTRY_BASE_URL, 200) ?? DEFAULT_SENTRY_BASE_URL;
      const url =
        endpointMode === "organization_issues"
          ? new URL(`/api/0/organizations/${encodeURIComponent(org)}/issues/`, baseUrl)
          : new URL(`/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project ?? "")}/issues/`, baseUrl);
      url.searchParams.set("query", query);
      url.searchParams.set("statsPeriod", statsPeriod);
      url.searchParams.set("limit", String(SENTRY_ISSUE_LIMIT));
      if (environment) {
        url.searchParams.append("environment", environment);
      }
      if (endpointMode === "organization_issues") {
        url.searchParams.append("project", projectId ?? "-1");
        url.searchParams.set("sort", "freq");
        url.searchParams.set("collapse", "base");
      }
      const payload = await fetchJsonWithTimeout(url, token);
      const rows = Array.isArray(payload) ? (payload as SentryIssueLike[]) : [];
      const summary = summarizeSentryIssues(rows);
      return {
        computedAt: Date.now(),
        range: args.range ?? "30d",
        health: summary.health,
        release: {
          currentBuildId,
          sentryRelease,
          matchesCurrentBuild:
            currentBuildId && sentryRelease ? currentBuildId === sentryRelease : null,
        },
        totals: summary.totals,
        topIssues: summary.topIssues,
        evidence: {
          source: "sentry",
          endpointMode,
          org,
          project,
          projectId,
          environment,
          query,
          statsPeriod,
          configured: true,
          unavailableReason: null,
          sampled: true,
          isTruncated: rows.length >= SENTRY_ISSUE_LIMIT,
        },
      };
    } catch (error) {
      return buildUnavailableSnapshot({
        range: args.range,
        endpointMode,
        org,
        project,
        projectId,
        environment,
        query,
        statsPeriod,
        currentBuildId,
        sentryRelease,
        configured: true,
        reason: error instanceof Error ? error.message : "sentry_unavailable",
      });
    }
  },
});
