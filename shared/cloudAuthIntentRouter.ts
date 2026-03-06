import type { PendingAuthIntent } from "./cloudAuthIntent";

type PendingAuthIntentHandlers = {
  select_model: (payload: Extract<PendingAuthIntent, { reason: "select_model" }>["payload"]) => void;
  create_community: (payload: Extract<PendingAuthIntent, { reason: "create_community" }>["payload"]) => void;
  redeem_purchase_claim: (
    payload: Extract<PendingAuthIntent, { reason: "redeem_purchase_claim" }>["payload"],
  ) => void;
  join_public_community: (
    payload: Extract<PendingAuthIntent, { reason: "join_public_community" }>["payload"],
  ) => void;
  request_community_access: (
    payload: Extract<PendingAuthIntent, { reason: "request_community_access" }>["payload"],
  ) => void;
  start_builder_checkout: (
    payload: Extract<PendingAuthIntent, { reason: "start_builder_checkout" }>["payload"],
  ) => void;
  open_builder_billing_portal: (
    payload: Extract<PendingAuthIntent, { reason: "open_builder_billing_portal" }>["payload"],
  ) => void;
  start_payouts_onboarding: (
    payload: Extract<PendingAuthIntent, { reason: "start_payouts_onboarding" }>["payload"],
  ) => void;
  redeem_pending_purchases: (
    payload: Extract<PendingAuthIntent, { reason: "redeem_pending_purchases" }>["payload"],
  ) => void;
  save_profile: (payload: Extract<PendingAuthIntent, { reason: "save_profile" }>["payload"]) => void;
  create_memory: (payload: Extract<PendingAuthIntent, { reason: "create_memory" }>["payload"]) => void;
  toggle_memory_pinned: (
    payload: Extract<PendingAuthIntent, { reason: "toggle_memory_pinned" }>["payload"],
  ) => void;
  delete_memory: (payload: Extract<PendingAuthIntent, { reason: "delete_memory" }>["payload"]) => void;
};

export function routePendingAuthIntent(intent: PendingAuthIntent, handlers: PendingAuthIntentHandlers): void {
  switch (intent.reason) {
    case "select_model":
      handlers.select_model(intent.payload);
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
    case "request_community_access":
      handlers.request_community_access(intent.payload);
      return;
    case "start_builder_checkout":
      handlers.start_builder_checkout(intent.payload);
      return;
    case "open_builder_billing_portal":
      handlers.open_builder_billing_portal(intent.payload);
      return;
    case "start_payouts_onboarding":
      handlers.start_payouts_onboarding(intent.payload);
      return;
    case "redeem_pending_purchases":
      handlers.redeem_pending_purchases(intent.payload);
      return;
    case "save_profile":
      handlers.save_profile(intent.payload);
      return;
    case "create_memory":
      handlers.create_memory(intent.payload);
      return;
    case "toggle_memory_pinned":
      handlers.toggle_memory_pinned(intent.payload);
      return;
    case "delete_memory":
      handlers.delete_memory(intent.payload);
      return;
  }
}
