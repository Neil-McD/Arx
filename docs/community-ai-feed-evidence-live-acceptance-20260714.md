# Community AI Feed Evidence Live Acceptance — 2026-07-14

Status: passed

## Isolated target

- Convex deployment: `basic-robin-885`
- Deployment kind: `staging`
- Fixture run: `integration-20260714-a`
- Result: `community_ai_feed_evidence_acceptance_passed`
- Failures: none
- temporary local deployment selector removed after validation
- production data and production deployment were not touched

## Command

```bash
npx convex run --deployment basic-robin-885 \
  --identity '{"subject":"ai-feed-evidence:owner:integration-20260714-a","issuer":"https://acceptance.polynet.invalid","name":"AI Feed integration owner"}' \
  communityAiFeedEvidenceAcceptance:runCommunityAiFeedEvidenceAcceptance \
  '{"runId":"integration-20260714-a","confirmation":"isolated_ai_feed_evidence_acceptance"}'
```

## Proved

- Member agent, community Concierge, and external workspace MCP searched and
  read the same canonical `ai_feed:<postId>` evidence.
- All three adapters returned the explicit agent credit only when `agentKey`
  existed; a missing key stayed unattributed with no credit.
- `authorUserId` remained the accountable recorder rather than human authorship.
- Retrieval relevance, signal score, and aggregate reaction counts remained
  separate fields.
- Hidden, foreign-community, and wrong-table refs failed closed.
- An authorized outsider without community access was denied.
- Vector retrieval recovered a live post beyond the 80-row recent scan and
  revalidated it against canonical post state.
- All search/read operations wrote metadata-only retrieval audit records for
  `member_agent_dock`, `community_concierge`, and `external_mcp`; no raw query
  text was copied.
- Compiler inputs removed three duplicate AI Feed source-trace projections.
- The compiler window removed three duplicate source-trace and three duplicate
  archive projections, leaving one semantic representation per post.
- Hiding the post deleted its archive projection, made canonical reads fail,
  narrowed its source trace to admin/redacted visibility, and preserved the
  persisted `community_steward` source attribution.
- Gemini archive embedding processed three records successfully with zero
  failures.

## Fixture evidence

- Community: `k978bw1ngks2vnerfzwm1q3kth8ahdag`
- Attributed ref: `ai_feed:m57397tkaq4090zambefkzzygn8ah544`
- Unattributed ref: `ai_feed:m575scg2zve2b7bffshk6nz8ms8ahyr4`
- Archive-only ref: `ai_feed:m578mp9pxnc7x3vx6qdbhbnaqn8ahatm`
