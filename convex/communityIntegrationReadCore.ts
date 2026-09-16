// Pilot adapter is server-injected. No SDK, credentials, or network implementation.
import { HUBSPOT_PILOT_VERSION, hubSpotPilotScopesAllowed, parseHubSpotContact } from "./hubspotPilotContract";
import { type IntegrationReceiptIntent } from "./communityIntegrationReceiptIntent";
export const HUBSPOT_READ_VERSION = HUBSPOT_PILOT_VERSION;
export type IntegrationBinding = {
  _id: IntegrationReceiptIntent["bindingId"];
  communityId: string;
  ownerUserId: string;
  provider: "composio";
  toolkit: "hubspot";
  providerUserId: string;
  authConfigId: string;
  connectedAccountId: string;
  generation: number;
  status: "pending" | "active" | "disconnected" | "error";
  scopes: string[];
  expiresAt?: number;
};
export type IntegrationReadSnapshot = {
  enabled: boolean;
  memberAuthorized: boolean;
  binding: IntegrationBinding | null;
  approvedContactId: string;
};
export type IntegrationReadRequest = {
  communityId: string;
  userId: string;
  runId: string;
  toolCallId: string;
  contactId: string;
};
export type IntegrationReadIntent = IntegrationReadRequest & IntegrationReceiptIntent;
export type IntegrationReadClaim = { receiptKey: string; claimToken: string };
export type IntegrationReadDependencies = {
  load: (request: IntegrationReadRequest) => Promise<IntegrationReadSnapshot>;
  // Atomically bind the full intent to run/tool-call identity. Duplicate/conflicting
  // intents return null; durable claim and expiry belong to the existing receipt adapter.
  claim: (intent: IntegrationReadIntent) => Promise<IntegrationReadClaim | null>;
  // True only for a fresh provider-start transition, never for a replay.
  start: (claim: IntegrationReadClaim) => Promise<boolean>;
  execute: (request: {
    tool: "HUBSPOT_READ_CONTACT";
    version: string;
    userId: string;
    connectedAccountId: string;
    arguments: { contactId: string; properties: string[]; archived: false };
  }) => Promise<unknown>;
  // Must be idempotent and consult durable providerStartedAt/claim ownership.
  // start_uncertain must never release funds based only on this caller's view.
  // Finalization failure leaves the durable lease for existing expiry recovery.
  finalize: (claim: IntegrationReadClaim, result: {
    outcome: string;
    phase: "not_started" | "start_uncertain" | "provider_started";
    costEvidence: "unknown";
  }) => Promise<void>;
};
const failure = (code: string) => ({
  ok: false as const,
  code,
  message: "Integration read unavailable.",
});

export function canActivateIntegrationBinding(
  binding: IntegrationBinding,
  verified: {
    generation: number;
    connectedAccountId: string;
    providerUserId: string;
    authConfigId: string;
    toolkit: string;
    active: boolean;
    scopes: string[];
  },
  now: number,
): boolean {
  return (
    binding.status === "pending" &&
    Number.isFinite(binding.expiresAt) &&
    binding.expiresAt! > now &&
    binding.generation === verified.generation &&
    binding.connectedAccountId === verified.connectedAccountId &&
    binding.providerUserId === verified.providerUserId &&
    binding.authConfigId === verified.authConfigId &&
    binding.toolkit === verified.toolkit &&
    verified.active &&
    hubSpotPilotScopesAllowed(verified.scopes)
  );
}

function allowed(
  snapshot: IntegrationReadSnapshot,
  request: IntegrationReadRequest,
) {
  const b = snapshot.binding;
  return (
    snapshot.enabled &&
    snapshot.memberAuthorized &&
    b?.status === "active" &&
    b.communityId === request.communityId &&
    b.ownerUserId === request.userId &&
    b.provider === "composio" &&
    b.toolkit === "hubspot" &&
    Boolean(b._id && b.providerUserId && b.connectedAccountId && b.authConfigId) &&
    hubSpotPilotScopesAllowed(b.scopes) &&
    snapshot.approvedContactId === request.contactId
  );
}

export async function executeCommunityIntegrationRead(
  request: IntegrationReadRequest,
  deps: IntegrationReadDependencies,
) {
  if (!request.runId?.trim() || !request.toolCallId?.trim() || !/^[0-9]{1,32}$/.test(request.contactId))
    return failure("integration_invalid_request");
  let snapshot: IntegrationReadSnapshot;
  try {
    snapshot = await deps.load(request);
  } catch {
    return failure("integration_access_denied");
  }
  if (!allowed(snapshot, request)) return failure("integration_access_denied");
  const b = snapshot.binding!;
  let claim: IntegrationReadClaim | null;
  try {
    claim = await deps.claim({...request, bindingId:b._id, connectedAccountId:b.connectedAccountId,
      providerUserId:b.providerUserId, authConfigId:b.authConfigId,
      generation:b.generation, tool:"HUBSPOT_READ_CONTACT", version:HUBSPOT_READ_VERSION});
    if (!claim?.receiptKey || !claim.claimToken) return failure("integration_budget_denied");
  } catch { return failure("integration_budget_denied"); }
  let phase: "not_started" | "start_uncertain" | "provider_started" = "not_started";
  let outcome = "integration_pre_execution_failed";
  let value: Record<string, unknown> | undefined;
  try {
    // Recheck after admission; replacement/disconnect cannot select a new account.
    const current = await deps.load(request);
    if (
      !allowed(current, request) ||
      current.binding!._id !== b._id ||
      current.binding!.generation !== b.generation ||
      current.binding!.connectedAccountId !== b.connectedAccountId ||
      current.binding!.providerUserId !== b.providerUserId ||
      current.binding!.authConfigId !== b.authConfigId
    ) {
      outcome = "integration_connection_changed";
    } else {
      phase = "start_uncertain";
      outcome = "integration_start_uncertain";
      const started = await deps.start(claim);
      if (!started) {
        // A denied/replayed transition does not authorize releasing an existing claim.
        outcome = "integration_start_denied";
        throw new Error("integration_start_denied");
      }
      phase = "provider_started";
      outcome = "integration_provider_failed";
      const atDispatch = await deps.load(request);
      if (!allowed(atDispatch, request) ||
        atDispatch.binding!._id !== b._id ||
        atDispatch.binding!.generation !== b.generation ||
        atDispatch.binding!.connectedAccountId !== b.connectedAccountId ||
        atDispatch.binding!.providerUserId !== b.providerUserId ||
        atDispatch.binding!.authConfigId !== b.authConfigId) {
        outcome = "integration_connection_changed";
        throw new Error("integration_connection_changed");
      }
      const raw = await deps.execute({
        tool: "HUBSPOT_READ_CONTACT",
        version: HUBSPOT_READ_VERSION,
        userId: b.providerUserId,
        connectedAccountId: b.connectedAccountId,
        arguments: {
          contactId: request.contactId,
          properties: ["firstname", "lastname"],
          archived: false,
        },
      });
      const serialized = JSON.stringify(raw);
      if (!serialized || serialized.length > 16_384) {
        outcome = "integration_result_too_large";
      } else {
        const result = parseHubSpotContact(raw, request.contactId);
        if (!result) {
          outcome = "integration_invalid_result";
        } else {
          const latest = await deps.load(request);
          if (
            !allowed(latest, request) ||
            latest.binding!._id !== b._id ||
            latest.binding!.generation !== b.generation ||
            latest.binding!.connectedAccountId !== b.connectedAccountId ||
            latest.binding!.providerUserId !== b.providerUserId ||
            latest.binding!.authConfigId !== b.authConfigId
          )
            outcome = "integration_connection_changed";
          else {
            outcome = "ok";
            value = result;
          }
        }
      }
    }
  } catch {
    /* Never forward vendor exceptions, which may contain credentials. */
  }
  try {
    await deps.finalize(claim, { outcome, phase, costEvidence: "unknown" });
  } catch {
    return failure("integration_receipt_failed");
  }
  return outcome === "ok"
    ? { ok: true as const, value: value! }
    : failure(outcome);
}
