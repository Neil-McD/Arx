import { normalizeCommunityFunnelManagerConfig } from "./communityFunnel";
import type { CommunityCustomFunnelSlot } from "./communityTypes";

export type CommunityFunnelDraftAuthoritySnapshot = {
  draftRevision: number;
  hasDraftContent: boolean;
};

export function readCommunityFunnelDraftAuthoritySnapshot(
  rawConfig: unknown,
  slot: CommunityCustomFunnelSlot,
): CommunityFunnelDraftAuthoritySnapshot {
  const variant = normalizeCommunityFunnelManagerConfig(rawConfig)
    .custom_funnels[slot];
  return {
    draftRevision: variant?.draft_revision ?? 0,
    hasDraftContent: Boolean(variant?.draft_content_v2),
  };
}

export function communityFunnelDraftAdvanced(params: {
  before: CommunityFunnelDraftAuthoritySnapshot;
  after: CommunityFunnelDraftAuthoritySnapshot;
}): boolean {
  return (
    params.after.hasDraftContent &&
    params.after.draftRevision > params.before.draftRevision
  );
}

export function isCommunityFunnelDraftWriteReceiptEvent(event: {
  eventType: string;
  payload: Record<string, unknown>;
}): boolean {
  const args =
    event.payload.args &&
    typeof event.payload.args === "object" &&
    !Array.isArray(event.payload.args)
      ? (event.payload.args as Record<string, unknown>)
      : null;
  return (
    event.eventType === "tool_call_finished" &&
    event.payload.tool_name === "polynet_call" &&
    event.payload.success === true &&
    args?.operation === "community.funnel.update_draft"
  );
}

export function communityFunnelTurnPostconditionPassed(params: {
  before: CommunityFunnelDraftAuthoritySnapshot;
  after: CommunityFunnelDraftAuthoritySnapshot;
  writeReceiptObserved: boolean;
}): boolean {
  return (
    params.writeReceiptObserved &&
    communityFunnelDraftAdvanced({ before: params.before, after: params.after })
  );
}
