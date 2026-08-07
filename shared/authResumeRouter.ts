import type { PendingAuthIntent } from "./authResumeState";

type PendingAuthIntentHandlers = {
  select_model: (payload: Extract<PendingAuthIntent, { reason: "select_model" }>["payload"]) => boolean | Promise<boolean>;
  open_workspace_draft: (
    payload: Extract<PendingAuthIntent, { reason: "open_workspace_draft" }>["payload"],
  ) => boolean | Promise<boolean>;
  connect_provider: (payload: Extract<PendingAuthIntent, { reason: "connect_provider" }>["payload"]) => boolean | Promise<boolean>;
  create_community: (payload: Extract<PendingAuthIntent, { reason: "create_community" }>["payload"]) => boolean | Promise<boolean>;
  redeem_purchase_claim: (
    payload: Extract<PendingAuthIntent, { reason: "redeem_purchase_claim" }>["payload"],
  ) => boolean | Promise<boolean>;
  join_public_community: (
    payload: Extract<PendingAuthIntent, { reason: "join_public_community" }>["payload"],
  ) => boolean | Promise<boolean>;
  redeem_pending_purchases: (
    payload: Extract<PendingAuthIntent, { reason: "redeem_pending_purchases" }>["payload"],
  ) => boolean | Promise<boolean>;
  resume_builder_checkout: (
    payload: Extract<PendingAuthIntent, { reason: "resume_builder_checkout" }>["payload"],
  ) => boolean | Promise<boolean>;
  try_polynet_free: (
    payload: Extract<PendingAuthIntent, { reason: "try_polynet_free" }>["payload"],
  ) => boolean | Promise<boolean>;
};

export function routePendingAuthIntent(
  intent: PendingAuthIntent,
  handlers: PendingAuthIntentHandlers,
): boolean | Promise<boolean> {
  switch (intent.reason) {
    case "select_model":
      return handlers.select_model(intent.payload);
    case "open_workspace_draft":
      return handlers.open_workspace_draft(intent.payload);
    case "connect_provider":
      return handlers.connect_provider(intent.payload);
    case "create_community":
      return handlers.create_community(intent.payload);
    case "redeem_purchase_claim":
      return handlers.redeem_purchase_claim(intent.payload);
    case "join_public_community":
      return handlers.join_public_community(intent.payload);
    case "redeem_pending_purchases":
      return handlers.redeem_pending_purchases(intent.payload);
    case "resume_builder_checkout":
      return handlers.resume_builder_checkout(intent.payload);
    case "try_polynet_free":
      return handlers.try_polynet_free(intent.payload);
  }
}
