# Owner member context and retrieval retirement staging acceptance

Validated application commit: `1fc266e1ddaf3880491e7a7d3fdfa1bb32dfcfa4`.
The local release gate and GitHub Release Gate run `36060141710` passed.

## Deployment

Deployed this clean candidate with `convex dev --once --typecheck enable` using
the existing staging environment targeting `quick-porcupine-949`. Code generation
completed without tracked changes. Then fast-forwarded `origin/staging` from
`535811945` to the candidate; GitHub-triggered Vercel deployment
`dpl_7r1dUU33ZkVs4eRVKkHjbCw839SA` served that exact build at
`https://polynet-staging.vercel.app/version.json`.

The earlier PR staging status was a skipped preview, not a deployed staging
candidate. Deployed function metadata now contains the owner dossier query and
contains neither `communityRecentContext` nor `communityArchiveDocuments`.
Production was not deployed or mutated by this acceptance. Its web build remained
`4c19363be430dc1711d7a920e0bca0020191755f` at readback.

## Existing fixture

Used `workflow-retry-final-sep24` (`jx77ez2px7xmnzcbe3dj9p7grh8f07z9`) and its
existing ordinary member `@test1`, membership `ks7b4ykm21qzbrcsx7adyqx7098f0qqs`.
Chrome retained the owner session; the in-app browser retained the separate member
session. Canonical records showed General as the only active channel, no approved
community facts, no resources, and the existing submitted READY form. Previous
goal-review evidence had completed the workflow.

## Live results

- Owner run `member_agent_dock:f281a278-4593-4d10-9065-7a4767b6546c`
  completed successfully. The natural-language member question led to directory
  discovery and dossier/forms reads. The rendered answer correctly reported the
  visible profile, General access, unassigned service channel, completed workflow,
  no approved community facts, and the READY submission. It qualified community
  relationships as profile-visible and did not claim exhaustive private membership.
- Member run `member_agent_dock:81685bef-7a8a-44e2-bad2-384bba5e5bec`
  attempted the exact builder dossier with `polynet_read`. Its tool receipt recorded
  `semantic_not_found`, empty output, and no member dossier disclosure. The rendered
  answer reported that the exact document was unavailable and did not substitute
  another source.
- Community-owned agent run
  `community-agent-serve:kx7wb3evtj8yx1zjv52awdmmvx8f16yf:attempt:1`
  answered an owner-authored access test in the synthetic General welcome thread:
  “That exact path is not accessible to me.” It made no tool call. This proves the
  observed refusal, while automated canonical-executor tests establish the server
  boundary when a community agent actually attempts the builder read.
- Owner retrieval run `member_agent_dock:9f5a823c-dc3f-4146-9387-a4c37f43bae4`
  used `polynet_search` and `polynet_list`, both successfully. The rendered answer
  found the canonical General welcome message and correctly reported an empty
  published-resource directory, matching the database.

All four GPT-6 Luna inference receipts settled: `q97t439mwxdt9aspsjjekq147h8f120z`,
`q97rh4sjv491qac321h9efsseh8f1f9a`, `q97kxsamec3nwxeq2t4mgtpnv18f1rh9`, and
`q97npr0f82t65k1kvefwyamcgd8f1tj4`; total recorded model cost was 4,240 microdollars.

## Scope and remaining evidence

The acceptance created three private agent turns plus one synthetic channel test
reply and its community-agent answer. Existing member roles, grants, workflow
definitions, forms, resources, and completion state were not changed. No private
form content was posted into the shared channel.

This fixture proves a positive interaction search and empty resource listing, not
a positive published-resource search result or private-channel access. Those
branches retain automated coverage. The community-agent denial was a refusal
before tool execution, not a live backend rejection. Production release and its
post-release owner/member check remain separate.
