import type { PendingAuthIntent } from "./authResumeState";

type PendingAuthIntentHandlers = {
  select_model: (payload: Extract<PendingAuthIntent, { reason: "select_model" }>["payload"]) => void;
  open_workspace_draft: (
    payload: Extract<PendingAuthIntent, { reason: "open_workspace_draft" }>["payload"],
  ) => void;
  connect_provider: (payload: Extract<PendingAuthIntent, { reason: "connect_provider" }>["payload"]) => void;
  create_community: (payload: Extract<PendingAuthIntent, { reason: "create_community" }>["payload"]) => void;
  redeem_purchase_claim: (
    payload: Extract<PendingAuthIntent, { reason: "redeem_purchase_claim" }>["payload"],
  ) => void;
  join_public_community: (
    payload: Extract<PendingAuthIntent, { reason: "join_public_community" }>["payload"],
  ) => void;
  redeem_pending_purchases: (
    payload: Extract<PendingAuthIntent, { reason: "redeem_pending_purchases" }>["payload"],
  ) => void;
  resume_builder_checkout: (
    payload: Extract<PendingAuthIntent, { reason: "resume_builder_checkout" }>["payload"],
  ) => void;
  try_polynet_free: (
    payload: Extract<PendingAuthIntent, { reason: "try_polynet_free" }>["payload"],
  ) => void;
};

export function routePendingAuthIntent(intent: PendingAuthIntent, handlers: PendingAuthIntentHandlers): void {
  switch (intent.reason) {
    case "select_model":
      handlers.select_model(intent.payload);
      return;
    case "open_workspace_draft":
      handlers.open_workspace_draft(intent.payload);
      return;
    case "connect_provider":
      handlers.connect_provider(intent.payload);
      return;
    case "create_community":
      handlers.create_community(intent.payload);
      return;
    case "redeem_purchase_claim":
      handlers.redeem_purchase_claim(intent.payload);
      return;
    case "join_public_community":
      handlers.join_public_community(intent.payload);
      return;
    case "redeem_pending_purchases":
      handlers.redeem_pending_purchases(intent.payload);
      return;
    case "resume_builder_checkout":
      handlers.resume_builder_checkout(intent.payload);
      return;
    case "try_polynet_free":
      handlers.try_polynet_free(intent.payload);
      return;
  }
}
