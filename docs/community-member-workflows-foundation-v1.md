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

The builder member dossier reads those records into a bounded recent-activity
timeline. Agent status comes from the linked serve request, movement comes from
the linked transition, and the action prompt and milestone name come from the
occurrence-time workflow-run snapshot. The timeline does not infer success from
the current workflow definition.

The old goal evaluator, checks, judgment passes, milestone-pass table, and
evaluation funding surface do not exist in V1.

## Membership context

The member-in-community is the context boundary, not the workflow. The shared
`CommunityMembershipContext` contract contains explicit community, user, and
membership IDs; canonical profile identity; member-approved community facts with
record ID, provenance, and timestamps; optional workflow position; and bounded
recent execution/movement history.

`resolveBuilderCommunityMembershipContext` is the builder-only reader. It
requires current manager authority, an active target membership in that exact
community, and the existing founder/admin fact-consent predicate. Personal and
other-community facts, unapproved facts, and internal behavioral observations
are excluded. Callers resolve the actor from authentication; they cannot select
a more permissive lens.

The existing dossier query is its first adapter. A community with no workflow
returns `workflow: null`, not an error or an automatically created workflow.
Markdown and the dossier modal both support that state. No new navigation is
introduced in this slice.

Workflow lookup, unique member progress, and first-milestone defaulting are
shared read rules used by the board, execution, dossier, and self-profile
projection. Reads never initialize state. Duplicate records and unknown
milestones fail closed; recorded completion and historical names are preserved.
Self-profile corruption now reports the canonical workflow error codes rather
than its former surface-specific aliases.

No new tables, stored directories, Markdown copies, or memory permissions are
introduced. Native and external agent consumption of the full context remains
a separate, explicitly authorized slice; this builder reader must not be
reused as an agent-access shortcut.

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
