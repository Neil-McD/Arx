# R41NB0W Operator Retirement v1

## Decision

R41NB0W is a single, explicitly authorized operator retirement. It does not
re-enable public community deletion and it is not a reusable account-deletion
surface.

The operation deletes only:

- the canonical R41NB0W community and community-owned product state;
- its community-owned stored media;
- the owner's `approved`, never-activated existing-founder grant; and
- the owner's stored OpenAI API-key connection selected by the exact row ID.

The operation must preserve the owner user identity, authentication history,
entitlements, memberships in other communities, direct-message history,
developer apps, Stripe Connect account, price points, checkout sessions,
purchase claims, provider-cost/credit records, runtime history, business visit
history, and critical audit records. Pending checkout artifacts remain as
historical evidence; no completed checkout, redeemed claim, subscription,
community membership, join request, inference policy, inference receipt, or
canonical operation receipt may exist when the retirement runs.

Member-agent channels are retained as history but detached from the deleted
community. Derived community cognition is drained by the existing bounded
post-deletion cleanup worker.

## Safety contract

The temporary operator function is internal-only and requires all four exact
production IDs plus the exact confirmation phrase. A dry run and the committed
operation execute the same precondition inspection. Any identity mismatch,
unexpected owner community, activated founder grant, access row, successful
billing row, shared storage object, or per-table bound overflow fails closed.

The production database backup taken before the founder-inference migration is
the recovery source if historical restoration is ever required. Its operator
path and checksum are recorded in `docs/alpha-release-workflow.md`.

## Operator sequence

After the exact code commit is on `main` and deployed to Convex production:

```bash
npx convex run r41nb0wRetirement:retireR41nb0wInternal \
  '{"ownerUserId":"nx723pf5z892gxwzt0r37zpf3h86qzev","communityId":"jh70hzn8g3rm1zpmr0732hs56d86wvst","founderGrantId":"m97s3ywjsawsjf3fm70m4r6q358bnn70","openAiConnectionId":"nn7cy5x1n48px68hvqkj0myqhh86xb63","confirmation":"retire-r41nb0w-preserve-user-financial-history-v1","dryRun":true}' \
  --prod
```

Stop unless the result is `state: "ready"` with no violations. Then run the
same command with `"dryRun":false` exactly once. Poll the read-only inspection
until it reports `state: "retired"` and cognition is empty:

```bash
npx convex run r41nb0wRetirement:inspectR41nb0wRetirementInternal \
  '{"ownerUserId":"nx723pf5z892gxwzt0r37zpf3h86qzev","communityId":"jh70hzn8g3rm1zpmr0732hs56d86wvst","founderGrantId":"m97s3ywjsawsjf3fm70m4r6q358bnn70","openAiConnectionId":"nn7cy5x1n48px68hvqkj0myqhh86xb63"}' \
  --prod
```

After the retained-state proof is captured, remove the temporary R41NB0W
operator module in a cleanup release. Keep this decision record and the durable
critical audit event.
