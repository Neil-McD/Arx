import type { OperatorToolDefinition } from "./operatorTypes";

export const OPERATOR_DASHBOARD_SECTIONS = [
  "overview",
  "builders",
  "monetization",
  "risk",
  "events",
] as const;

export const OPERATOR_TOOL_DIRECTORY: OperatorToolDefinition[] = [
  {
    id: "overview.snapshot",
    label: "Platform Snapshot",
    section: "overview",
    question: "What is the current platform-wide operator snapshot?",
    inputs: ["range"],
    sources: ["users", "communities", "communityMemberships", "communitySubscriptions", "checkoutSessions", "criticalAuditEvents"],
    permissions: "operator_only",
    outputShape: "OperatorOverviewSnapshot",
  },
  {
    id: "builders.search",
    label: "Builder Directory",
    section: "builders",
    question: "Which builders match this operator query or filter?",
    inputs: ["query", "limit"],
    sources: ["users", "userEntitlements", "userStripeConnectAccounts", "communities", "communityMemberships", "communityPricePoints", "communitySubscriptions", "checkoutSessions", "criticalAuditEvents"],
    permissions: "operator_only",
    outputShape: "OperatorBuilderRecord[]",
  },
  {
    id: "builders.snapshot",
    label: "Builder Snapshot",
    section: "builders",
    question: "What is the full operator snapshot for one builder/community business unit?",
    inputs: ["builderUserId", "communityId"],
    sources: ["users", "userEntitlements", "userStripeConnectAccounts", "communities", "communityMemberships", "communityPricePoints", "communitySubscriptions", "checkoutSessions", "criticalAuditEvents"],
    permissions: "operator_only",
    outputShape: "OperatorBuilderRecord",
  },
  {
    id: "monetization.snapshot",
    label: "Polynet Monetization",
    section: "monetization",
    question: "How is Polynet monetizing across builder plans and community subscriptions?",
    inputs: ["range"],
    sources: ["checkoutSessions", "communitySubscriptions", "communityPricePoints", "criticalAuditEvents"],
    permissions: "operator_only",
    outputShape: "OperatorMonetizationSnapshot",
  },
  {
    id: "risk.queue",
    label: "Risk Queue",
    section: "risk",
    question: "Which platform money, access, payout, or webhook issues need operator attention?",
    inputs: ["severity", "limit"],
    sources: ["criticalAuditEvents", "checkoutSessions", "purchaseClaims", "communitySubscriptions", "userStripeConnectAccounts"],
    permissions: "operator_only",
    outputShape: "OperatorRiskItem[]",
  },
  {
    id: "events.search",
    label: "Critical Events",
    section: "events",
    question: "What critical platform events match this operator filter?",
    inputs: ["eventType", "severity", "limit"],
    sources: ["criticalAuditEvents"],
    permissions: "operator_only",
    outputShape: "OperatorEventRecord[]",
  },
];

export function searchOperatorTools(query: string): OperatorToolDefinition[] {
  const terms = String(query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return OPERATOR_TOOL_DIRECTORY;
  return OPERATOR_TOOL_DIRECTORY.filter((tool) => {
    const haystack = [
      tool.id,
      tool.label,
      tool.section,
      tool.question,
      ...tool.inputs,
      ...tool.sources,
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
