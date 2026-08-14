import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeRecordedWorkspaceResourceProviderId,
  resolveRecordedWorkspaceResourceProviderId,
} from "../shared/workspaceComputerProvider";

const providerIdValidator = v.literal("blaxel");

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

// Migration-only pointer ownership. This module does not allocate, wake, or
// execute provider resources; it only records and clears existing Blaxel
// pointers while the remaining historical resources are reconciled.
export const setProjectProviderSandboxInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
    providerSandboxProviderId: providerIdValidator,
    providerSandboxState: v.optional(v.string()),
    providerSandboxLastSeenAt: v.optional(v.number()),
    providerSandboxStartedAt: v.optional(v.number()),
    providerSandboxCreditReservationKey: v.optional(v.string()),
    providerSandboxCreditBudgetCredits: v.optional(v.number()),
    providerSandboxCreditBudgetExpiresAt: v.optional(v.number()),
    clearSandboxAccounting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const previousSandboxCreditReservationKey = normalizeOptionalString(
      project?.providerSandboxCreditReservationKey,
    );
    const previousSandboxCreditBudgetExpiresAt =
      typeof project?.providerSandboxCreditBudgetExpiresAt === "number"
        ? project.providerSandboxCreditBudgetExpiresAt
        : null;
    const previousProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project?.providerSandboxProviderId,
      resourceId: project?.providerSandboxId,
    });
    const previousSandboxId = normalizeOptionalString(project?.providerSandboxId);
    const sandboxOwnershipChanged =
      previousProviderId !== null &&
      (previousProviderId !== args.providerSandboxProviderId ||
        previousSandboxId !== normalizeOptionalString(args.providerSandboxId));
    const clearSandboxAccounting =
      args.clearSandboxAccounting === true || sandboxOwnershipChanged;

    await ctx.db.patch(args.projectId, {
      providerSandboxId: args.providerSandboxId,
      providerSandboxProviderId: args.providerSandboxProviderId,
      providerSandboxState: args.providerSandboxState,
      providerSandboxLastSeenAt: args.providerSandboxLastSeenAt,
      providerSandboxStartedAt:
        args.providerSandboxStartedAt ??
        (clearSandboxAccounting ? undefined : project?.providerSandboxStartedAt),
      providerSandboxCreditReservationKey:
        args.providerSandboxCreditReservationKey ??
        (clearSandboxAccounting
          ? undefined
          : project?.providerSandboxCreditReservationKey),
      providerSandboxCreditBudgetCredits:
        args.providerSandboxCreditBudgetCredits ??
        (clearSandboxAccounting
          ? undefined
          : project?.providerSandboxCreditBudgetCredits),
      providerSandboxCreditBudgetExpiresAt:
        args.providerSandboxCreditBudgetExpiresAt ??
        (clearSandboxAccounting
          ? undefined
          : project?.providerSandboxCreditBudgetExpiresAt),
      updatedAt: Date.now(),
    });
    return {
      project: await ctx.db.get(args.projectId),
      previousSandboxCreditReservationKey,
      previousSandboxCreditBudgetExpiresAt,
    };
  },
});

export const clearProjectProviderSandboxInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.optional(v.string()),
    providerSandboxProviderId: v.optional(providerIdValidator),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const expectedSandboxId = normalizeOptionalString(args.providerSandboxId);
    const expectedProviderId = normalizeRecordedWorkspaceResourceProviderId(
      args.providerSandboxProviderId,
    );
    if (
      expectedSandboxId &&
      normalizeOptionalString(project?.providerSandboxId) !== expectedSandboxId
    ) {
      return project;
    }
    if (
      expectedProviderId &&
      resolveRecordedWorkspaceResourceProviderId({
        providerId: project?.providerSandboxProviderId,
        resourceId: project?.providerSandboxId,
      }) !== expectedProviderId
    ) {
      return project;
    }
    await ctx.db.patch(args.projectId, {
      providerSandboxId: undefined,
      providerSandboxProviderId: undefined,
      providerSandboxState: undefined,
      providerSandboxLastSeenAt: undefined,
      providerSandboxStartedAt: undefined,
      providerSandboxCreditReservationKey: undefined,
      providerSandboxCreditBudgetCredits: undefined,
      providerSandboxCreditBudgetExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.projectId);
  },
});
