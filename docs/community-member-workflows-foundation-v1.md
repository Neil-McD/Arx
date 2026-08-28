# Community Member Workflows V1

## Product contract

Workflows is a builder-configured client-success pipeline. It supplies rails,
not a prescribed coaching method.

The V1 grammar is intentionally small:

```text
Workflow = ordered Milestones[]
Milestone = name + Automations[]
Automation = one Trigger + one Action
Trigger = member_contributed
Action = prompt_agent(prompt) | move_member(next_or_complete)
```

A new milestone has no hidden behavior. Merely occupying a milestone never
causes work. A member contribution is the only V1 trigger.

## Semantics

- `prompt_agent` admits one durable community-agent serve request using the
  builder prompt captured on the workflow run. It replies in the contribution's
  thread. It never advances the member.
- `move_member` deterministically advances to the next ordered milestone, or
  marks the workflow complete at the final milestone. It never invokes a model.
- Each automation produces one idempotent run keyed by workflow, membership,
  contribution receipt, and automation key.
- A milestone may have any number of prompt actions and at most one move action.
- Prompt actions are admitted first. The single move action is terminal and runs
  after prompt admission regardless of its visual order in the editor. Prompt
  success is not a condition for movement; V1 has no action chaining or goals.
- Rules are revalidated against the member's current milestone and workflow
  revision before authoritative writes.

## Canonical records

- `communityMemberWorkflows`: ordered builder definition and revision.
- `communityMemberWorkflowMemberMilestones`: current member projection.
- `communityMemberWorkflowRuns`: immutable trigger/action snapshot and result.
- `communityMemberWorkflowTransitions`: exactly-once movement receipts with
  immutable source and destination milestone-name snapshots.
- `communityAgentServeRequests`: durable admission for `prompt_agent` work.

The old goal evaluator, checks, judgment passes, milestone-pass table, and
evaluation funding surface do not exist in V1.

## Authority and safety

- Builder mutations require current manager authority and an expected revision.
- Contributions must be live, human-authored, channel-addressable, and owned by
  an active community member.
- Agent action intake re-reads the workflow run and exact prompt snapshot,
  rechecks source identity/access, and uses the canonical community-agent
  funding and worker path.
- Prompt instructions are community policy beneath platform policy; they do not
  grant builder authority or weaken tool boundaries.
- A durable serve admission completes the workflow action. Provider execution
  continues under the existing leased community-agent worker.

## Explicitly deferred

Time and external triggers, arbitrary event filters, goals, LLM judges,
multi-step loops, action graphs, action chaining, agent selection, and manual
member movement are not V1 primitives. Add one only after a real use case cannot
be expressed by the grammar above.
