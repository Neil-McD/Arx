export type IntegrationAction = "connect" | "resume" | "disconnect" | "retry_cleanup";
export type IntegrationView = {
  status: "pending" | "active" | "error" | "disconnected";
  enabled: boolean;
  canManage: boolean;
  cleanupPending: boolean;
  reconciliationRequired: boolean;
  actions: IntegrationAction[];
};
type BindingState = {
  status: IntegrationView["status"];
  connectedAccountId: string;
  expiresAt?: number;
  authorizationUrl?: string;
  initiationState?: "awaiting" | "ready" | "unknown";
  callbackClaimed?: boolean;
  revokePending?: boolean;
};
// A projection of persisted facts, not a second stored state machine.
export function integrationStatus(binding: BindingState | null, enabled: boolean, canManage: boolean, now: number): IntegrationView {
  const expired = binding?.status === "pending" && (!Number.isFinite(binding.expiresAt) || binding.expiresAt! <= now);
  const reconciliationRequired = !!binding && !binding.connectedAccountId &&
    (binding.initiationState === "unknown" || (binding.initiationState === "awaiting" && (!!expired || binding.status === "disconnected")));
  const status = expired ? "error" : binding?.status ?? "disconnected";
  const actions: IntegrationAction[] = [];
  if (binding?.revokePending) {
    if (binding.connectedAccountId) actions.push("retry_cleanup");
  } else if (binding && binding.status !== "disconnected" &&
    (binding.connectedAccountId || binding.initiationState === "awaiting" || binding.initiationState === "unknown")) {
    if (enabled && !reconciliationRequired && binding.connectedAccountId && binding.initiationState === "ready" && status === "pending" && !binding.callbackClaimed && binding.authorizationUrl) actions.push("resume");
    actions.push("disconnect");
  } else if (enabled && !reconciliationRequired) actions.push("connect");
  return {status, enabled, canManage, cleanupPending: !!binding?.revokePending, reconciliationRequired, actions};
}
