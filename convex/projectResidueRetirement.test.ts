/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import {
  PROJECT_RESIDUE_TARGETS,
  buildProjectResiduePatch,
  rowHasProjectResidue,
  type ProjectResidueTarget,
} from "./projectResidueRetirement";
import schema from "./schema";

const modules = import.meta.glob([
  "./projectResidueRetirement.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

test("residue classification is structural and patches only obsolete fields", () => {
  expect(rowHasProjectResidue("threads", { runtimeEngine: "polynet" })).toBe(false);
  expect(rowHasProjectResidue("threads", { runtimeEngine: "codex" })).toBe(true);
  expect(rowHasProjectResidue("runtimeRuns", { sandboxMode: "workspace" })).toBe(true);
  expect(rowHasProjectResidue("cloudProjects", {})).toBe(true);
  expect(buildProjectResiduePatch("threads", { runtimeEngine: "polynet" })).toEqual({});
  expect(buildProjectResiduePatch("threads", { runtimeEngine: "codex" })).toEqual({
    runtimeEngine: undefined,
  });
  expect(buildProjectResiduePatch("platformDiagnosticEvents", {})).toEqual({
    projectId: undefined,
  });
});

test("the Release-A operator is dry-run-first, bounded, ordered, and preserves accounting", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const now = 1_800_000_000_000;
    const userId = await ctx.db.insert("users", {
      authSubject: "project-residue-retirement-owner",
      createdAt: now,
      updatedAt: now,
    });
    const projectId = await ctx.db.insert("cloudProjects", {
      ownerId: userId,
      providerSandboxId: "retired-sandbox",
      providerVolumeId: "retired-volume",
      createdAt: now,
      updatedAt: now,
    });
    const threadId = await ctx.db.insert("threads", {
      ownerId: userId,
      title: "Historical project thread",
      titleSource: "auto",
      projectId,
      runtimeEngine: "codex",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workspaceFilePreviewSnapshots", { projectId });
    await ctx.db.insert("workspaceDirectorySnapshots", { projectId });
    await ctx.db.insert("workspaceTerminalSessions", { projectId });
    await ctx.db.insert("polynetCodexWorkerCapacityLeases", { projectId });
    await ctx.db.insert("daytonaCodexRuntimeTargets", { projectId });
    const diagnosticId = await ctx.db.insert("platformDiagnosticEvents", {
      eventKey: "project-residue-diagnostic",
      eventType: "legacy_project",
      subsystem: "runtime",
      severity: "info",
      status: "ignored",
      projectId,
      createdAt: now,
    });
    const runDocumentId = await ctx.db.insert("runtimeRuns", {
      ownerId: userId,
      threadId,
      runId: "project-residue-run",
      lane: "legacy",
      projectId,
      runtimeEngine: "codex",
      sandboxMode: "workspace",
      workspaceSessionState: "active",
      workspaceProviderSandboxId: "retired-sandbox",
      workspaceToolboxProxyUrl: "https://retired.invalid",
      workspaceSessionRegion: "legacy-region",
      workspaceSessionUpdatedAt: now,
      status: "error",
      lastEventSeq: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const projectEvidenceId = String(projectId);
    const computeChargeId = await ctx.db.insert("workspaceComputeCharges", {
      chargeKey: "historical-compute-charge",
      userId,
      projectId: projectEvidenceId,
      runId: "project-residue-run",
      providerSandboxId: "retired-sandbox",
      startedAt: now - 1_000,
      endedAt: now,
      durationSeconds: 1,
      sandboxCpu: 1,
      sandboxMemoryGiB: 1,
      sandboxDiskGiB: 1,
      computeCostUsd: 0.01,
      creditsDebited: 1,
      debitSource: "included",
      createdAt: now,
    });
    const providerCostId = await ctx.db.insert("providerCostEntries", {
      costKey: "historical-provider-cost",
      userId,
      projectId: projectEvidenceId,
      runId: "project-residue-run",
      category: "workspace",
      component: "blaxel_active_runtime",
      provider: "blaxel",
      periodStart: now - 1_000,
      periodEnd: now,
      quantityKind: "seconds",
      quantity: 1,
      rawVendorCostUsd: 0.01,
      evidence: "exact",
      billingDisposition: "rolled_into_user_usage",
      createdAt: now,
      updatedAt: now,
    });
    const creditLedgerId = await ctx.db.insert("creditLedgerEntries", {
      creditKey: "historical-credit",
      userId,
      projectId: projectEvidenceId,
      runId: "project-residue-run",
      toolName: "workspace_compute",
      status: "succeeded",
      creditsReserved: 1,
      creditsSettled: 1,
      includedCreditsDebited: 1,
      purchasedCreditsDebited: 0,
      createdAt: now,
      updatedAt: now,
    });
    return {
      computeChargeId,
      creditLedgerId,
      diagnosticId,
      projectId,
      providerCostId,
      runDocumentId,
      threadId,
    };
  });

  const accountingBefore = await t.run(async (ctx) => ({
    compute: await ctx.db.get(fixture.computeChargeId),
    cost: await ctx.db.get(fixture.providerCostId),
    credit: await ctx.db.get(fixture.creditLedgerId),
  }));

  const dryRun = await t.mutation(
    internalRefs.projectResidueRetirement.cleanProjectResidueBatchInternal,
    { target: "runtimeRuns", cursor: null, pageSize: 10, dryRun: true },
  );
  expect(dryRun).toMatchObject({ dryRun: true, patched: 0, wouldPatch: 1 });
  expect(dryRun.candidateDocumentIds).toEqual([String(fixture.runDocumentId)]);
  await expect(
    t.mutation(
      internalRefs.projectResidueRetirement.cleanProjectResidueBatchInternal,
      { target: "runtimeRuns", cursor: null, pageSize: 10, dryRun: false },
    ),
  ).rejects.toThrow("project_residue_expected_documents_required");
  await expect(
    t.mutation(
      internalRefs.projectResidueRetirement.cleanProjectResidueBatchInternal,
      {
        target: "runtimeRuns",
        cursor: null,
        pageSize: 10,
        dryRun: false,
        expectedDocumentIds: ["wrong-document"],
      },
    ),
  ).rejects.toThrow("project_residue_batch_changed");

  const cloudDryRun = await t.mutation(
    internalRefs.projectResidueRetirement.cleanProjectResidueBatchInternal,
    { target: "cloudProjects", pageSize: 10, dryRun: true },
  );
  await expect(
    t.mutation(
      internalRefs.projectResidueRetirement.cleanProjectResidueBatchInternal,
      {
        target: "cloudProjects",
        pageSize: 10,
        dryRun: false,
        expectedDocumentIds: cloudDryRun.candidateDocumentIds,
      },
    ),
  ).rejects.toThrow("project_residue_dependency_blocked");

  const cleanTarget = async (target: ProjectResidueTarget) => {
    let cursor: string | null = null;
    for (let batch = 0; batch < 20; batch += 1) {
      const preview: any = await t.mutation(
        internalRefs.projectResidueRetirement.cleanProjectResidueBatchInternal,
        { target, cursor, pageSize: 2, dryRun: true },
      );
      const written: any = await t.mutation(
        internalRefs.projectResidueRetirement.cleanProjectResidueBatchInternal,
        {
          target,
          cursor,
          pageSize: 2,
          dryRun: false,
          expectedDocumentIds: preview.candidateDocumentIds,
        },
      );
      if (written.isDone) return;
      cursor = written.continueCursor;
    }
    throw new Error(`project_residue_test_did_not_converge:${target}`);
  };

  for (const target of PROJECT_RESIDUE_TARGETS) await cleanTarget(target);
  for (const target of PROJECT_RESIDUE_TARGETS) {
    const inspection = await t.query(
      internalRefs.projectResidueRetirement.inspectProjectResiduePageInternal,
      { target, cursor: null, pageSize: 500 },
    );
    expect(inspection).toMatchObject({ residueCount: 0, isDone: true });
  }

  const after = await t.run(async (ctx) => ({
    accounting: {
      compute: await ctx.db.get(fixture.computeChargeId),
      cost: await ctx.db.get(fixture.providerCostId),
      credit: await ctx.db.get(fixture.creditLedgerId),
    },
    diagnostic: await ctx.db.get(fixture.diagnosticId),
    project: await ctx.db.get(fixture.projectId),
    run: await ctx.db.get(fixture.runDocumentId),
    thread: await ctx.db.get(fixture.threadId),
  }));
  expect(after.accounting).toEqual(accountingBefore);
  expect(after.project).toBeNull();
  expect(after.diagnostic).not.toHaveProperty("projectId");
  expect(after.thread).not.toHaveProperty("projectId");
  expect(after.thread).not.toHaveProperty("runtimeEngine");
  expect(after.run).not.toHaveProperty("projectId");
  expect(after.run).not.toHaveProperty("runtimeEngine");
  expect(after.run).not.toHaveProperty("workspaceSessionState");
});
