import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const PROJECT_RESIDUE_RETIREMENT_VERSION =
  "project_residue_retirement_v1" as const;

export const PROJECT_RESIDUE_TARGETS = [
  "workspaceFilePreviewSnapshots",
  "workspaceDirectorySnapshots",
  "workspaceTerminalSessions",
  "polynetCodexWorkerCapacityLeases",
  "daytonaCodexRuntimeTargets",
  "platformDiagnosticEvents",
  "threads",
  "runtimeRuns",
  "cloudProjects",
] as const;

export type ProjectResidueTarget = (typeof PROJECT_RESIDUE_TARGETS)[number];

const LEGACY_TABLE_TARGETS = new Set<ProjectResidueTarget>([
  "workspaceFilePreviewSnapshots",
  "workspaceDirectorySnapshots",
  "workspaceTerminalSessions",
  "polynetCodexWorkerCapacityLeases",
  "daytonaCodexRuntimeTargets",
  "cloudProjects",
]);

const projectResidueTargetValidator = v.union(
  ...PROJECT_RESIDUE_TARGETS.map((target) => v.literal(target)),
);

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function normalizePageSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("project_residue_page_size_invalid");
  }
  return Math.min(MAX_PAGE_SIZE, Math.floor(value));
}

function hasOwn(row: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, field);
}

export function rowHasProjectResidue(
  target: ProjectResidueTarget,
  row: Record<string, unknown>,
): boolean {
  if (LEGACY_TABLE_TARGETS.has(target)) return true;
  if (target === "platformDiagnosticEvents") return hasOwn(row, "projectId");
  if (target === "threads") {
    return hasOwn(row, "projectId") || row.runtimeEngine === "codex";
  }
  return [
    "projectId",
    "runtimeEngine",
    "sandboxMode",
    "workspaceSessionState",
    "workspaceProviderSandboxId",
    "workspaceToolboxProxyUrl",
    "workspaceSessionRegion",
    "workspaceSessionUpdatedAt",
  ].some((field) => hasOwn(row, field));
}

export function buildProjectResiduePatch(
  target: ProjectResidueTarget,
  row: Record<string, unknown>,
): Record<string, undefined> {
  if (target === "platformDiagnosticEvents") return { projectId: undefined };
  if (target === "threads") {
    return {
      ...(hasOwn(row, "projectId") ? { projectId: undefined } : {}),
      ...(row.runtimeEngine === "codex" ? { runtimeEngine: undefined } : {}),
    };
  }
  if (target === "runtimeRuns") {
    return {
      projectId: undefined,
      runtimeEngine: undefined,
      sandboxMode: undefined,
      workspaceSessionState: undefined,
      workspaceProviderSandboxId: undefined,
      workspaceToolboxProxyUrl: undefined,
      workspaceSessionRegion: undefined,
      workspaceSessionUpdatedAt: undefined,
    };
  }
  return {};
}

function queryTarget(db: any, target: ProjectResidueTarget): any {
  switch (target) {
    case "workspaceFilePreviewSnapshots":
      return db.query("workspaceFilePreviewSnapshots");
    case "workspaceDirectorySnapshots":
      return db.query("workspaceDirectorySnapshots");
    case "workspaceTerminalSessions":
      return db.query("workspaceTerminalSessions");
    case "polynetCodexWorkerCapacityLeases":
      return db.query("polynetCodexWorkerCapacityLeases");
    case "daytonaCodexRuntimeTargets":
      return db.query("daytonaCodexRuntimeTargets");
    case "platformDiagnosticEvents":
      return db.query("platformDiagnosticEvents");
    case "threads":
      return db.query("threads");
    case "runtimeRuns":
      return db.query("runtimeRuns");
    case "cloudProjects":
      return db.query("cloudProjects");
  }
}

function queryResidueTarget(db: any, target: ProjectResidueTarget): any {
  const query = queryTarget(db, target);
  if (LEGACY_TABLE_TARGETS.has(target)) return query;
  if (target === "platformDiagnosticEvents") {
    return query.withIndex("by_projectId", (q: any) =>
      q.gt("projectId", undefined),
    );
  }
  if (target === "threads") {
    return query.filter((q: any) =>
      q.or(
        q.neq(q.field("projectId"), undefined),
        q.eq(q.field("runtimeEngine"), "codex"),
      ),
    );
  }
  return query.filter((q: any) =>
    q.or(
      q.neq(q.field("projectId"), undefined),
      q.neq(q.field("runtimeEngine"), undefined),
      q.neq(q.field("sandboxMode"), undefined),
      q.neq(q.field("workspaceSessionState"), undefined),
      q.neq(q.field("workspaceProviderSandboxId"), undefined),
      q.neq(q.field("workspaceToolboxProxyUrl"), undefined),
      q.neq(q.field("workspaceSessionRegion"), undefined),
      q.neq(q.field("workspaceSessionUpdatedAt"), undefined),
    ),
  );
}

function documentIds(rows: Array<Record<string, unknown>>): string[] {
  return rows.map((row) => String(row._id));
}

function assertExpectedDocumentIds(
  expected: string[] | undefined,
  actual: string[],
): void {
  if (!expected || expected.length !== actual.length) {
    throw new Error("project_residue_expected_documents_required");
  }
  if (expected.some((id, index) => id !== actual[index])) {
    throw new Error("project_residue_batch_changed");
  }
}

async function assertCloudProjectDependenciesCleared(db: any): Promise<void> {
  for (const target of PROJECT_RESIDUE_TARGETS) {
    if (target === "cloudProjects") continue;
    const firstResidue = await queryResidueTarget(db, target).first();
    if (firstResidue) {
      throw new Error("project_residue_dependency_blocked");
    }
  }
}

export const inspectProjectResiduePageInternal = internalQuery({
  args: {
    target: projectResidueTargetValidator,
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = normalizePageSize(args.pageSize);
    const page = await queryResidueTarget(ctx.db, args.target).paginate({
      cursor: args.cursor ?? null,
      numItems: pageSize,
    });
    const candidates = page.page.filter((row: Record<string, unknown>) =>
      rowHasProjectResidue(args.target, row),
    );
    return {
      version: PROJECT_RESIDUE_RETIREMENT_VERSION,
      target: args.target,
      scanned: page.page.length,
      residueCount: candidates.length,
      candidateDocumentIds: documentIds(candidates),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const cleanProjectResidueBatchInternal = internalMutation({
  args: {
    target: projectResidueTargetValidator,
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    expectedDocumentIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const pageSize = normalizePageSize(args.pageSize);
    const dryRun = args.dryRun !== false;
    const legacyTable = LEGACY_TABLE_TARGETS.has(args.target);
    const page = {
      page: await queryResidueTarget(ctx.db, args.target).take(pageSize),
      continueCursor: null,
      isDone: false,
    };
    const candidates = page.page.filter((row: Record<string, unknown>) =>
      rowHasProjectResidue(args.target, row),
    );
    const candidateDocumentIds = documentIds(candidates);

    if (!dryRun) {
      assertExpectedDocumentIds(
        args.expectedDocumentIds,
        candidateDocumentIds,
      );
      if (args.target === "cloudProjects") {
        await assertCloudProjectDependenciesCleared(ctx.db);
      }
      for (const row of candidates) {
        if (legacyTable) {
          await ctx.db.delete(row._id as any);
        } else {
          await ctx.db.patch(
            row._id as any,
            buildProjectResiduePatch(args.target, row),
          );
        }
      }
    }

    return {
      version: PROJECT_RESIDUE_RETIREMENT_VERSION,
      target: args.target,
      dryRun,
      scanned: page.page.length,
      wouldDelete: legacyTable ? candidates.length : 0,
      deleted: !dryRun && legacyTable ? candidates.length : 0,
      wouldPatch: legacyTable ? 0 : candidates.length,
      patched: !dryRun && !legacyTable ? candidates.length : 0,
      candidateDocumentIds,
      isDone: candidates.length === 0,
    };
  },
});
