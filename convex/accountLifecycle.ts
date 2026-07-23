import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedActor } from "./authActor";
import {
  ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS,
  ACCOUNT_LIFECYCLE_POLICY_VERSION,
  ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES,
  type AccountLifecycleBlockerCode,
} from "./accountLifecyclePolicy";

const ACCOUNT_LIFECYCLE_PHASE = "preflight_blockers" as const;

type AccountLifecycleRequestRow = {
  _id: any;
  userId: any;
  policyVersion: string;
  status: "requested" | "blocked";
  phase: typeof ACCOUNT_LIFECYCLE_PHASE;
  checkpointRevision: number;
  blockerCodes: string[];
  preflightEvaluatedAt?: number;
};

type AccountLifecycleReceiptRow = {
  _id: any;
  requestId: any;
  sequence: number;
  kind: "request_recorded" | "preflight_evaluated";
  policyVersion: string;
  status: "requested" | "blocked";
  phase: typeof ACCOUNT_LIFECYCLE_PHASE;
  checkpointRevision: number;
  blockerCodes: string[];
};

function normalizeIdValue(value: unknown): string {
  return String(value ?? "").trim();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mapRequest(row: AccountLifecycleRequestRow) {
  return {
    requestId: row._id,
    policyVersion: row.policyVersion,
    status: row.status,
    phase: row.phase,
    checkpointRevision: row.checkpointRevision,
    blockerCodes: row.blockerCodes,
  };
}

function assertCurrentRequest(row: AccountLifecycleRequestRow): void {
  const blockerCodesAreCanonical = sameStrings(row.blockerCodes, [...row.blockerCodes].sort());
  const blockerCodesAreUnique = new Set(row.blockerCodes).size === row.blockerCodes.length;
  const stateIsValid = row.status === "requested"
    ? row.checkpointRevision === 0 && row.blockerCodes.length === 0 && row.preflightEvaluatedAt === undefined
    : row.checkpointRevision >= 1 && row.blockerCodes.length > 0 && typeof row.preflightEvaluatedAt === "number";
  if (
    row.policyVersion !== ACCOUNT_LIFECYCLE_POLICY_VERSION ||
    row.phase !== ACCOUNT_LIFECYCLE_PHASE ||
    !Number.isSafeInteger(row.checkpointRevision) ||
    row.checkpointRevision < 0 ||
    !blockerCodesAreCanonical ||
    !blockerCodesAreUnique ||
    !stateIsValid
  ) {
    throw new Error("account_lifecycle_request_corrupt");
  }
}

async function requireReceipt(args: {
  ctx: any;
  request: AccountLifecycleRequestRow;
  sequence: number;
  kind: AccountLifecycleReceiptRow["kind"];
  status: AccountLifecycleReceiptRow["status"];
  blockerCodes: readonly string[];
}): Promise<AccountLifecycleReceiptRow> {
  const receipt = (await args.ctx.db
    .query("accountLifecycleReceipts")
    .withIndex("by_request_sequence", (q: any) =>
      q.eq("requestId", args.request._id).eq("sequence", args.sequence),
    )
    .unique()) as AccountLifecycleReceiptRow | null;
  if (
    !receipt ||
    receipt.kind !== args.kind ||
    receipt.policyVersion !== args.request.policyVersion ||
    receipt.phase !== args.request.phase ||
    receipt.checkpointRevision !== args.sequence ||
    receipt.status !== args.status ||
    !sameStrings(receipt.blockerCodes, args.blockerCodes)
  ) {
    throw new Error("account_lifecycle_receipt_corrupt");
  }
  return receipt;
}

async function buildPreflightBlockers(ctx: any, userId: any): Promise<AccountLifecycleBlockerCode[]> {
  const blockers = new Set<AccountLifecycleBlockerCode>(
    ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS.map((blocker) => blocker.code),
  );

  const ownedCommunity = await ctx.db
    .query("communities")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
    .first();
  if (ownedCommunity) blockers.add(ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES.ownedCommunity);

  const ownedDeveloperApp = await ctx.db
    .query("developerApps")
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId))
    .first();
  if (ownedDeveloperApp) blockers.add(ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES.ownedDeveloperApp);

  const ownedSkillPackage = await ctx.db
    .query("skillPackages")
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId))
    .first();
  if (ownedSkillPackage) blockers.add(ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES.ownedSkillPackage);

  return [...blockers].sort();
}

export const recordOwnAccountDeletionRequestInternal = internalMutation({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const existing = (await ctx.db
      .query("accountLifecycleRequests")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
      .unique()) as AccountLifecycleRequestRow | null;

    if (existing) {
      assertCurrentRequest(existing);
      await requireReceipt({
        ctx,
        request: existing,
        sequence: 0,
        kind: "request_recorded",
        status: "requested",
        blockerCodes: [],
      });
      if (existing.status === "blocked") {
        await requireReceipt({
          ctx,
          request: existing,
          sequence: existing.checkpointRevision,
          kind: "preflight_evaluated",
          status: "blocked",
          blockerCodes: existing.blockerCodes,
        });
      }
      return mapRequest(existing);
    }

    const nowMs = Date.now();
    const requestId = await ctx.db.insert("accountLifecycleRequests", {
      userId: actor.dbUserId,
      policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION,
      status: "requested",
      phase: ACCOUNT_LIFECYCLE_PHASE,
      checkpointRevision: 0,
      blockerCodes: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("accountLifecycleReceipts", {
      requestId,
      sequence: 0,
      kind: "request_recorded",
      policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION,
      status: "requested",
      phase: ACCOUNT_LIFECYCLE_PHASE,
      checkpointRevision: 0,
      blockerCodes: [],
      createdAt: nowMs,
    });

    const request = (await ctx.db.get(requestId)) as AccountLifecycleRequestRow | null;
    if (!request) throw new Error("account_lifecycle_request_create_failed");
    return mapRequest(request);
  },
});

export const evaluateOwnAccountDeletionPreflightInternal = internalMutation({
  args: {
    requestId: v.id("accountLifecycleRequests"),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const request = (await ctx.db.get(args.requestId)) as AccountLifecycleRequestRow | null;
    if (!request) throw new Error("account_lifecycle_request_not_found");
    assertCurrentRequest(request);
    if (normalizeIdValue(request.userId) !== normalizeIdValue(actor.dbUserId)) {
      throw new Error("account_lifecycle_request_actor_mismatch");
    }

    const blockerCodes = await buildPreflightBlockers(ctx, actor.dbUserId);
    if (blockerCodes.length === 0) {
      throw new Error("account_lifecycle_preflight_must_fail_closed");
    }

    if (request.status === "blocked" && sameStrings(request.blockerCodes, blockerCodes)) {
      await requireReceipt({
        ctx,
        request,
        sequence: request.checkpointRevision,
        kind: "preflight_evaluated",
        status: "blocked",
        blockerCodes,
      });
      return mapRequest(request);
    }

    const nowMs = Date.now();
    const checkpointRevision = request.checkpointRevision + 1;
    await ctx.db.patch(request._id, {
      status: "blocked",
      checkpointRevision,
      blockerCodes,
      preflightEvaluatedAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("accountLifecycleReceipts", {
      requestId: request._id,
      sequence: checkpointRevision,
      kind: "preflight_evaluated",
      policyVersion: request.policyVersion,
      status: "blocked",
      phase: request.phase,
      checkpointRevision,
      blockerCodes,
      createdAt: nowMs,
    });

    const updated = (await ctx.db.get(request._id)) as AccountLifecycleRequestRow | null;
    if (!updated) throw new Error("account_lifecycle_request_checkpoint_failed");
    return mapRequest(updated);
  },
});
