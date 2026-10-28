# Docs index

Read in this order:

1. [../AGENTS.md](../AGENTS.md): what Polynet is and how to work here.
2. [core-contract.md](core-contract.md): core objects, invariants, product rules,
   retirement candidates.
3. [system-map.md](system-map.md): every area, its code, entry points, tables
   and contract.

Implementation status is owned by current code, executable proofs, Git refs,
deployment markers and live evidence. Docs describe rules and design; they do
not track status. Update the system map instead of adding status ledgers.

## Contracts by area

- **Identity and sign-in:** [auth-runtime-setup-workos-authkit.md](auth-runtime-setup-workos-authkit.md),
  [auth-session-target-architecture-v1.md](auth-session-target-architecture-v1.md),
  [auth-money-access-matrix.md](auth-money-access-matrix.md)
- **Communities and joining:** [community-join-request-canonicalization.md](community-join-request-canonicalization.md),
  [community-member-arrival-v1.md](community-member-arrival-v1.md),
  [destructive-lifecycle-quarantine-contract-v1.md](destructive-lifecycle-quarantine-contract-v1.md),
  [url-routing-contract-v1.md](url-routing-contract-v1.md)
- **Chat:** [community-interaction-substrate-contract-v1.md](community-interaction-substrate-contract-v1.md),
  [community-interaction-migration-residue-map.md](community-interaction-migration-residue-map.md),
  [community-private-channels-v1.md](community-private-channels-v1.md)
- **Memory and cognition:** [community-agent-cognition-contract-v1.md](community-agent-cognition-contract-v1.md),
  [community-lineage-ontology-contract-v0.md](community-lineage-ontology-contract-v0.md),
  [community-evidence-integrity-contract-v1.md](community-evidence-integrity-contract-v1.md),
  [member-ontology-contract-v1.md](member-ontology-contract-v1.md)
- **Community agent:** [native-agent-runtime-context-contract-v1.md](native-agent-runtime-context-contract-v1.md),
  [community-agent-conversations.md](community-agent-conversations.md),
  [community-agent-conversation-end-state-v1.md](community-agent-conversation-end-state-v1.md),
  [specs/proactive-community-agent-v0.md](specs/proactive-community-agent-v0.md)
- **MCP and operations:** [polynet-workspace-mcp-contract-v0.md](polynet-workspace-mcp-contract-v0.md),
  [canonical-platform-operation-contract-v1.md](canonical-platform-operation-contract-v1.md)
- **Community sites:** [../infra/community-edge/README.md](../infra/community-edge/README.md),
  [specs/community-site-rails-v0.md](specs/community-site-rails-v0.md),
  [research/community-frontend-hosting-20261016.md](research/community-frontend-hosting-20261016.md)
- **Money and cost:** [platform-cost-safety-contract-v1.md](platform-cost-safety-contract-v1.md),
  [product/reference/billing-entitlements.md](product/reference/billing-entitlements.md),
  [legal/](legal/)
- **Operations:** [platform-diagnostics-contract-v1.md](platform-diagnostics-contract-v1.md),
  [schema-data-migration-discipline.md](schema-data-migration-discipline.md)
- **Being removed with their code:** [community-forms-v1.md](community-forms-v1.md),
  [community-member-workflows-foundation-v1.md](community-member-workflows-foundation-v1.md)

## Release

- [alpha-release-workflow.md](alpha-release-workflow.md): the runbook.
- [receipts/](receipts/): one receipt per production release.

## Thinking and research

- [agent-native-semantic-platform-thesis.md](agent-native-semantic-platform-thesis.md)
- [research/](research/)

## Product documentation

Served to Studio's docs panel and agents: [product/README.md](product/README.md),
`product/llms.txt`, `product/llms-full.txt`.

## Archive

[archive/](archive/) holds dated acceptance notes, finished plans and superseded
contracts. They are historical evidence only.
