import { internal } from "./_generated/api";
import {
  type FounderPaidToolAction,
  type FounderPaidToolName,
} from "../shared/founderPaidTools";

const internalRefs = internal as any;

export type FounderPaidToolFundingSession = {
  receiptKey: string;
  claimToken: string;
};

function requireIdentifier(value: unknown, code: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 240) throw new Error(code);
  return normalized;
}

function boundedCode(value: unknown, fallback: string): string {
  return String(value ?? "").trim().slice(0, 120) || fallback;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authorizeFounderPaidToolFundingSession(args: {
  ctx: any;
  communityId: unknown;
  actorUserId: unknown;
  sourceRunId: string;
  toolCallId: string;
  toolName: FounderPaidToolName;
  action: FounderPaidToolAction;
}): Promise<FounderPaidToolFundingSession> {
  const sourceRunId = requireIdentifier(
    args.sourceRunId,
    "founder_paid_tool_source_run_invalid",
  );
  const toolCallId = requireIdentifier(
    args.toolCallId,
    "founder_paid_tool_call_id_invalid",
  );
  const communityId = requireIdentifier(
    args.communityId,
    "founder_paid_tool_community_required",
  );
  const receiptKey = `paid_tool:${await sha256Hex(`${sourceRunId}:${toolCallId}`)}`;
  const claimToken = crypto.randomUUID();
  const claim = await args.ctx.runMutation(
    internalRefs.founderPaidTools.claimFounderPaidToolReceiptInternal,
    {
      receiptKey,
      sourceRunId,
      toolCallId,
      communityId,
      actorUserId: args.actorUserId,
      toolName: args.toolName,
      action: args.action,
      claimToken,
      nowMs: Date.now(),
    },
  );
  if (!claim?.ok) {
    throw new Error(boundedCode(claim?.errorCode, "founder_paid_tool_receipt_unavailable"));
  }
  return {
    receiptKey,
    claimToken,
  };
}

export async function markFounderPaidToolProviderStarted(args: {
  ctx: any;
  session: FounderPaidToolFundingSession;
}): Promise<void> {
  const providerStart = await args.ctx.runMutation(
    internalRefs.founderPaidTools.markFounderPaidToolProviderStartedInternal,
    {
      receiptKey: args.session.receiptKey,
      claimToken: args.session.claimToken,
      nowMs: Date.now(),
    },
  );
  if (!providerStart?.ok || providerStart.dispatchAuthorized !== true || providerStart.replayed === true) {
    throw new Error(boundedCode(providerStart?.errorCode, "founder_paid_tool_provider_blocked"));
  }
}

export async function settleFounderPaidToolFundingSession(args: {
  ctx: any;
  session: FounderPaidToolFundingSession;
  rawVendorCostUsd: number;
  provider: string;
  evidence: "estimated" | "provider_reported" | "exact";
  metadata?: Record<string, unknown>;
  outcomeCode: string;
}): Promise<{ status: "settled" | "indeterminate"; settledCostMicros: number }> {
  const result = await args.ctx.runMutation(
    internalRefs.founderPaidTools.settleFounderPaidToolReceiptInternal,
    {
      receiptKey: args.session.receiptKey,
      claimToken: args.session.claimToken,
      rawVendorCostUsd: args.rawVendorCostUsd,
      provider: String(args.provider ?? "").trim() || "unknown",
      evidence: args.evidence,
      metadata: args.metadata,
      outcomeCode: boundedCode(args.outcomeCode, "completed"),
      nowMs: Date.now(),
    },
  );
  if (!result?.ok) {
    throw new Error(boundedCode(result?.errorCode, "founder_paid_tool_receipt_not_settled"));
  }
  return {
    status: result.status,
    settledCostMicros: result.settledCostMicros,
  };
}

export async function failFounderPaidToolFundingSession(args: {
  ctx: any;
  session: FounderPaidToolFundingSession;
  failureCode: string;
}): Promise<void> {
  const result = await args.ctx.runMutation(
    internalRefs.founderPaidTools.finalizeFounderPaidToolFailureInternal,
    {
      receiptKey: args.session.receiptKey,
      claimToken: args.session.claimToken,
      failureCode: boundedCode(args.failureCode, "paid_tool_provider_error"),
      nowMs: Date.now(),
    },
  );
  if (!result?.ok) {
    throw new Error(boundedCode(result?.errorCode, "founder_paid_tool_receipt_not_finalized"));
  }
}
