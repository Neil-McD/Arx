# Community Member Milestone Workflows v1

Status: staging explicit trigger/action seam

## Outcome

Workflows is the builder-only operating surface for a community's member
success path. The path is one ordered set of milestones. Every active member is
pursuing exactly one milestone until the builder's configured goal evidence is
satisfied and an explicit automation chooses what happens next.

A milestone currently contains:

- an opaque server-owned key
- a builder-authored name
- zero or more all-of goal-completion checks
- zero or more explicitly stored automations

The first automation grammar is intentionally narrow:

```text
member_contributed -> evaluate_goal
goal_completed -> move_member(next_or_complete)
```

New milestones persist both automations explicitly. During the additive staging
migration, an absent `automations` field means no automation; the runtime never
manufactures a hidden default. A contribution therefore does not evaluate a
goal without a stored `evaluate_goal` action, and a complete goal does not move
a member without a stored movement action.

## Irreducible runtime

The runtime has five canonical persistence lanes:

1. `communityMemberWorkflows`: ordered milestone, goal-measurement, automation,
   and revision definitions
2. `communityMemberWorkflowMemberMilestones`: current member-position projection
3. `communityMemberWorkflowMilestoneEvaluations`: deterministic or model goal
   evaluation work and durable results
4. `communityMemberWorkflowRuns`: one idempotent automation execution per
   canonical member-contribution or goal-evaluation trigger receipt and automation
5. `communityMemberWorkflowTransitions`: append-only sole authority receipts
   for member movement or workflow completion

`communityMemberWorkflowMilestonePasses` is legacy staging migration input only.
New execution does not read or write it. There are no separate definition tables
for goals, triggers, actions, conditions, enrollment, or mirrored evidence.

## Goal measurement

The first slice continues to use the proven completion-check substrate as goal
measurement. Checks are either:

- `channel_posted`: eligible human channel root exists after milestone entry
- `channel_replied`: eligible human channel reply exists after milestone entry
- bounded AI judgment: cited canonical evidence establishes the builder's
  plain-language criterion

All configured checks must pass. Automatic and judgment results are now both
persisted as finished evaluation receipts. A milestone with no checks is visible
but cannot emit `goal_completed`.

## Evidence wake and goal completion

Eligible human channel contributions remain the only external wakes in this
slice. The stored trigger/action pair is not exposed in the builder UI yet.
After a contribution commits, Polynet:

1. rejects inactive membership, wrong scope, private/system/agent content,
   pre-milestone activity, completed workflows, and unconfigured milestones
2. resolves the canonical contribution ID as the `member_contributed` receipt
3. admits one idempotent workflow run for the stored automation
4. executes `evaluate_goal` and records its result on that run
5. resolves automatic requirements from canonical evidence
6. stops without provider work if an automatic prerequisite is missing
7. persists a deterministic evaluation when a pure automatic goal completes
8. otherwise admits or coalesces one leased judgment evaluation
9. emits `goal_completed` only from a finished complete evaluation receipt

The evaluator receives no tools. Builder criteria and member evidence are
untrusted contextual data. Output is strict JSON and every complete judgment
must cite supplied canonical evidence.

## Explicit automation execution

Each trigger is identified by its canonical source receipt. The runtime admits
at most one workflow run for the tuple:

```text
workflow + membership + evaluation receipt + automation key
```

The run snapshots workflow revision, milestone identity and entry time,
automation definition/hash, trigger receipt, and actions. `member_contributed`
runs record the evaluation they admitted or coalesced. `goal_completed` runs
execute `move_member(next_or_complete)`.

Only the transition reducer may change member position. In the same transaction
it rechecks:

- active membership in the workflow community
- workflow identity and revision
- current milestone and entry time
- workflow-run and action identity
- absence of an existing transition for that run/action

It then atomically updates the member projection and appends one transition
receipt. Replays return the existing run/transition and cannot advance twice.
The evaluator never selects or mutates member position.

## Builder surface

The visible staging surface intentionally remains unchanged in this slice:

- horizontal milestone columns
- canonical member profile stubs and time in milestone
- compact milestone name and goal-measurement editor
- manager-only member success dossier

Automation editing is deferred until the execution authority is proven. New
milestones still store both explicit automations even though the modal does not
expose them yet. The board subscribes to latest transition and evaluation state.
The dossier renders transition history rather than legacy pass rows.

## Migration

Two dry-run-first internal migrations are provided:

- `backfillGoalCompletedAutomationsInternal` materializes the explicit default
  only where the field is absent; an explicit empty array remains empty
- `backfillMemberContributedAutomationsInternal` prepends the explicit
  `member_contributed -> evaluate_goal` automation only to milestones that
  already have stored goal-completion progression; explicit empty arrays remain empty
- `backfillMilestonePassTransitionsInternal` converts legacy pass history into
  synthetic finished runs and transition receipts without changing member state

Both are idempotent. The legacy pass table remains until staging proves zero new
readers and writers and the migrated dossier/history is verified.

## Authority and privacy

- Only owner/admin/moderator roles may read or edit Workflows.
- Membership remains identity and access authority.
- Builders see only approved facts scoped to their community.
- Personal memory and private agent conversations are not workflow evidence.
- `/self.md` remains a derived projection of canonical member state.
- Definition, revision, state, trigger-receipt, and transition conflicts fail closed.

## Deferred

This slice does not implement:

1. builder automation editing
2. additional in-app trigger types
3. agent actions or autonomous intervention loops
4. time triggers, durable timers, or inactivity wakes
5. external evidence or integration triggers
6. branching, generic predicates, or a Zapier-style DSL
7. explicit member-state initialization on workflow creation or membership activation
8. population-level success analytics

The real-member staging canary and migration retirement remain required before
legacy pass storage is deleted. They were explicitly deferred while this
additive trigger/action seam was built.
