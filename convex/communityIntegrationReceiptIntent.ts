import { v, type Infer } from "convex/values";
import { HUBSPOT_PILOT_VERSION } from "./hubspotPilotContract";

// Canonical request identity shared by read and admission. Persisted only in
// explicitly admitted verification receipts; contact reads remain funding-denied.
export const integrationReceiptIntentValidator = v.object({
  bindingId: v.id("communityIntegrationConnections"),
  connectedAccountId: v.string(), providerUserId: v.string(), authConfigId: v.string(),
  generation: v.number(), version: v.string(),
  tool: v.union(v.literal("HUBSPOT_READ_CONTACT"), v.literal("HUBSPOT_LIST_GRANTED_SCOPES")),
  contactId: v.optional(v.string()),
});
export type IntegrationReceiptIntent = Infer<typeof integrationReceiptIntentValidator>;
export type IntegrationReceiptAction = "read_contact" | "verify_scopes";

export function validIntegrationReceiptIntent(intent: IntegrationReceiptIntent | undefined,
  action: string, sourceRunId: string, toolCallId: string): intent is IntegrationReceiptIntent {
  if (!intent || intent.version !== HUBSPOT_PILOT_VERSION ||
    !Number.isSafeInteger(intent.generation) || intent.generation < 1 ||
    ![intent.connectedAccountId, intent.providerUserId, intent.authConfigId]
      .every(id => id.length > 0 && id.length <= 240 && id.trim() === id)) return false;
  if (action === "read_contact") return intent.tool === "HUBSPOT_READ_CONTACT" &&
    typeof intent.contactId === "string" && /^[0-9]{1,32}$/.test(intent.contactId);
  // Scope verification is a connection-attempt operation, not a fabricated agent run.
  return action === "verify_scopes" && intent.tool === "HUBSPOT_LIST_GRANTED_SCOPES" &&
    intent.contactId === undefined &&
    sourceRunId === `integration_connection:${intent.bindingId}:${intent.generation}` && toolCallId === "verify_scopes";
}
