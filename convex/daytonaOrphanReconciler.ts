import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  deleteDaytonaSandbox,
  listDaytonaSandboxes,
  loadDaytonaConfig,
  stopDaytonaSandbox,
  waitForDaytonaSandboxStopped,
  type DaytonaSandboxApiDto,
} from "./daytonaSandboxClient";
import {
  estimateDaytonaWorkspaceComputeUsd,
  priceDaytonaWorkspaceUsageCredits,
} from "../shared/workspaceCredits";

const DAYTONA_ORPHAN_GRACE_MS = 60 * 60 * 1000;

function readSandboxLabel(sandbox: DaytonaSandboxApiDto, key: string): string | null {
  const labels =
    sandbox.labels && typeof sandbox.labels === "object" && !Array.isArray(sandbox.labels)
      ? (sandbox.labels as Record<string, unknown>)
      : null;
  const value = String(labels?.[key] ?? "").trim();
  return value || null;
}

function readDaytonaTimestampMs(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw > 1_000_000_000_000 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber > 1_000_000_000_000 ? Math.floor(asNumber) : Math.floor(asNumber * 1000);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function readSandboxStartedAt(sandbox: DaytonaSandboxApiDto): number | null {
  return readDaytonaTimestampMs(sandbox.createdAt) ?? readDaytonaTimestampMs(sandbox.created_at);
}

function readPositiveNumber(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function readBackgroundCreditReservation(project: any): {
  creditReservationKey: string | null;
  creditBudgetCredits: number;
  creditBudgetExpiresAt: number;
  startedAt: number | null;
} {
  return {
    creditReservationKey: normalizeOptionalString(project?.providerSandboxCreditReservationKey),
    creditBudgetCredits: readPositiveNumber(project?.providerSandboxCreditBudgetCredits, 0),
    creditBudgetExpiresAt: readPositiveNumber(project?.providerSandboxCreditBudgetExpiresAt, 0),
    startedAt: readPositiveNumber(project?.providerSandboxStartedAt, 0) || null,
  };
}

function readSandboxCreditReservation(sandbox: DaytonaSandboxApiDto): {
  creditReservationKey: string | null;
  creditBudgetCredits: number;
  creditBudgetExpiresAt: number;
} {
  return {
    creditReservationKey: readSandboxLabel(sandbox, "arx_credit_reservation_key"),
    creditBudgetCredits: readPositiveNumber(
      readSandboxLabel(sandbox, "arx_credit_budget_credits"),
      0,
    ),
    creditBudgetExpiresAt: readPositiveNumber(
      readSandboxLabel(sandbox, "arx_credit_budget_expires_at"),
      0,
    ),
  };
}

function priceCreditsWithinBudget(params: {
  computeCostUsd: number;
  creditReservationKey?: string | null;
  creditBudgetCredits?: number | null;
}): number {
  const pricedCredits = priceDaytonaWorkspaceUsageCredits({
    computeCostUsd: params.computeCostUsd,
  });
  const creditReservationKey = normalizeOptionalString(params.creditReservationKey);
  const creditBudgetCredits = readPositiveNumber(params.creditBudgetCredits, 0);
  return creditReservationKey && creditBudgetCredits > 0
    ? Math.min(creditBudgetCredits, pricedCredits)
    : pricedCredits;
}

async function settleReservedCreditsBestEffort(params: {
  ctx: any;
  creditKey?: string | null;
  status: "succeeded" | "refunded";
  creditsSettled?: number;
  failureReason?: string | null;
  nowMs: number;
}): Promise<void> {
  const creditKey = normalizeOptionalString(params.creditKey);
  if (!creditKey) return;
  try {
    await params.ctx.runMutation(internal.workspaceCredits.settleCreditsInternal as any, {
      creditKey,
      status: params.status,
      creditsSettled: params.creditsSettled,
      failureReason: params.failureReason ?? undefined,
      nowMs: params.nowMs,
    });
  } catch {
    // Expired-reservation reconciliation is the durable fallback.
  }
}

function isActiveTerminalStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "starting" || normalized === "running";
}

function isRuntimeRunStale(run: { status?: string; updatedAt?: number; startedAt?: number }, nowMs: number): boolean {
  if (String(run.status ?? "").trim().toLowerCase() !== "running") return true;
  const lastProgressAt =
    typeof run.updatedAt === "number" && Number.isFinite(run.updatedAt)
      ? Math.floor(run.updatedAt)
      : typeof run.startedAt === "number" && Number.isFinite(run.startedAt)
        ? Math.floor(run.startedAt)
        : 0;
  if (lastProgressAt <= 0) return true;
  return Math.max(0, nowMs - lastProgressAt) >= DAYTONA_ORPHAN_GRACE_MS;
}

export const reconcileDaytonaOrphanedSandboxesInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const loaded = loadDaytonaConfig();
    if (!loaded.ok) {
      return {
        ok: false,
        code: loaded.code,
        message: loaded.message,
      };
    }

    const listed = await listDaytonaSandboxes({
      config: loaded.config,
    });
    if (!listed.ok) {
      return {
        ok: false,
        code: listed.code,
        message: listed.message,
      };
    }

    let scanned = 0;
    let skipped = 0;
    let reconciled = 0;
    let failed = 0;
    let charged = 0;
    let finishedRuns = 0;

    for (const sandbox of listed.sandboxes) {
      const providerSandboxId = String(sandbox.id ?? "").trim();
      if (!providerSandboxId) {
        skipped += 1;
        continue;
      }
      const sandboxSource = readSandboxLabel(sandbox, "arx_source");
      if (sandboxSource !== "convex_runtime_turn" && sandboxSource !== "convex_background_terminal") {
        skipped += 1;
        continue;
      }
      scanned += 1;

      const ownerId = readSandboxLabel(sandbox, "arx_user_id");
      const runId = readSandboxLabel(sandbox, "arx_run_id");
      const projectId = readSandboxLabel(sandbox, "arx_project_id");
      const sandboxCredit = readSandboxCreditReservation(sandbox);

      let backgroundProject: any = null;
      let backgroundCredit = {
        creditReservationKey: sandboxCredit.creditReservationKey,
        creditBudgetCredits: sandboxCredit.creditBudgetCredits,
        creditBudgetExpiresAt: sandboxCredit.creditBudgetExpiresAt,
        startedAt: null as number | null,
      };
      let budgetExpired = false;

      if (sandboxSource === "convex_background_terminal") {
        if (projectId) {
          try {
            backgroundProject = await ctx.runQuery(
              internal.projects.getCloudProjectByIdInternal as any,
              {
                projectId,
              },
            );
            const projectCredit = readBackgroundCreditReservation(backgroundProject);
            backgroundCredit = {
              creditReservationKey:
                projectCredit.creditReservationKey ?? sandboxCredit.creditReservationKey,
              creditBudgetCredits:
                projectCredit.creditBudgetCredits || sandboxCredit.creditBudgetCredits,
              creditBudgetExpiresAt:
                projectCredit.creditBudgetExpiresAt || sandboxCredit.creditBudgetExpiresAt,
              startedAt: projectCredit.startedAt,
            };
            budgetExpired =
              backgroundCredit.creditBudgetExpiresAt > 0 &&
              nowMs >= backgroundCredit.creditBudgetExpiresAt;
          } catch {
            backgroundProject = null;
          }
        }
        if (ownerId && projectId) {
          try {
            await ctx.runAction(
              internal.workspaceTerminals.reconcileProjectWorkspaceTerminalsInternal as any,
              {
                ownerId,
                projectId,
              },
            );
          } catch {
            // best-effort terminal truth repair before leak cleanup
          }
        }

        let terminalRows: any[] = [];
        try {
          terminalRows = (await ctx.runQuery(
            internal.workspaceTerminals.listWorkspaceTerminalSessionsBySandboxInternal as any,
            {
              providerSandboxId,
            },
          )) as any[];
        } catch {
          terminalRows = [];
        }

        if (
          terminalRows.some((row) => isActiveTerminalStatus(row.status)) &&
          !budgetExpired
        ) {
          skipped += 1;
          continue;
        }

        const startedAt =
          backgroundCredit.startedAt ??
          terminalRows
            .map((row) => Number(row.startedAt ?? 0))
            .filter((value) => Number.isFinite(value) && value > 0)
            .sort((a, b) => a - b)[0] ?? readSandboxStartedAt(sandbox);
        if (
          !budgetExpired &&
          startedAt &&
          Math.max(0, nowMs - startedAt) < DAYTONA_ORPHAN_GRACE_MS
        ) {
          skipped += 1;
          continue;
        }
      }

      let run: any = null;
      if (ownerId && runId) {
        try {
          run = await ctx.runQuery(internal.threads.getRuntimeRunByOwnerRunIdInternal as any, {
            ownerId,
            runId,
          });
        } catch {
          run = null;
        }
      }

      if (run && !isRuntimeRunStale(run, nowMs)) {
        skipped += 1;
        continue;
      }

      const stopped = await stopDaytonaSandbox({
        config: loaded.config,
        sandboxId: providerSandboxId,
      });

      let stopSettled:
        | { ok: true; sandbox: DaytonaSandboxApiDto | null }
        | {
            ok: false;
            status: number;
            code: string;
            message: string;
            details?: Record<string, unknown>;
          };

      let deleted:
        | { ok: true }
        | {
            ok: false;
            status: number;
            code: string;
            message: string;
            details?: Record<string, unknown>;
          };

      if (stopped.ok) {
        stopSettled = await waitForDaytonaSandboxStopped({
          config: loaded.config,
          sandboxId: providerSandboxId,
        });
        deleted = stopSettled.ok
          ? stopSettled.sandbox === null
            ? { ok: true as const }
            : await deleteDaytonaSandbox({
                config: loaded.config,
                sandboxId: providerSandboxId,
              })
          : await deleteDaytonaSandbox({
              config: loaded.config,
              sandboxId: providerSandboxId,
            });
      } else {
        stopSettled = {
          ok: false as const,
          status: stopped.status,
          code: stopped.code,
          message: stopped.message,
          details: stopped.details,
        };
        deleted = await deleteDaytonaSandbox({
          config: loaded.config,
          sandboxId: providerSandboxId,
        });
      }

      const computeTerminated = stopSettled.ok || deleted.ok;
      if (!computeTerminated) {
        failed += 1;
        continue;
      }

      reconciled += 1;

      const startedAt =
        backgroundCredit.startedAt ??
        (typeof run?.startedAt === "number" && Number.isFinite(run.startedAt)
          ? Math.floor(run.startedAt)
          : null) ?? readSandboxStartedAt(sandbox);
      const effectiveProjectId =
        String(run?.projectId ?? "").trim() || String(projectId ?? "").trim() || null;
      const sandboxCpu = readPositiveNumber(sandbox.cpu, loaded.config.sandboxCpu);
      const sandboxMemoryGiB = readPositiveNumber(sandbox.memory, loaded.config.sandboxMemoryGiB);
      const sandboxDiskGiB = readPositiveNumber(sandbox.disk, loaded.config.sandboxDiskGiB);

      if (ownerId && effectiveProjectId && startedAt && startedAt < nowMs) {
        try {
          const durationSeconds = Math.max(0, (nowMs - startedAt) / 1000);
          const computeCostUsd = estimateDaytonaWorkspaceComputeUsd({
            durationSeconds,
            sandboxCpu,
            sandboxMemoryGiB,
          });
          const creditsDebited = priceCreditsWithinBudget({
            computeCostUsd,
            creditReservationKey: backgroundCredit.creditReservationKey,
            creditBudgetCredits: backgroundCredit.creditBudgetCredits,
          });
          await settleReservedCreditsBestEffort({
            ctx,
            creditKey: backgroundCredit.creditReservationKey,
            status: "succeeded",
            creditsSettled: creditsDebited,
            nowMs,
          });
          const charge = await ctx.runMutation(
            internal.workspaceCredits.recordWorkspaceComputeChargeInternal as any,
            {
              chargeKey: providerSandboxId,
              userId: ownerId,
              projectId: effectiveProjectId,
              runId: runId || `background_terminal:${effectiveProjectId}:${providerSandboxId}`,
              providerSandboxId,
              startedAt,
              endedAt: nowMs,
              durationSeconds,
              sandboxCpu,
              sandboxMemoryGiB,
              sandboxDiskGiB,
              computeCostUsd,
              creditsDebited,
              creditReservationKey: backgroundCredit.creditReservationKey,
              nowMs,
            },
          );
          if (charge) charged += 1;
        } catch {
          // Keep reconciliation focused on stopping leaked compute.
        }
      }

      if (run && ownerId && runId && run.threadId) {
        try {
          const finalized = await ctx.runMutation(
            internal.threads.reconcileOrphanedCloudRuntimeRunInternal as any,
            {
              ownerId,
              threadId: run.threadId,
              runId,
              providerSandboxId,
              nowMs,
            },
          );
          if (finalized && String(finalized.status ?? "").trim().toLowerCase() !== "running") {
            finishedRuns += 1;
          }
        } catch {
          // Runtime truth repair is best-effort after compute shutdown.
        }
      }

      if (sandboxSource === "convex_background_terminal" && effectiveProjectId) {
        try {
          await ctx.runMutation(internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any, {
            projectId: effectiveProjectId,
          });
        } catch {
          // project sandbox pointer cleanup is best-effort
        }
      }
    }

    return {
      ok: true,
      scanned,
      skipped,
      reconciled,
      failed,
      charged,
      finishedRuns,
    };
  },
});
