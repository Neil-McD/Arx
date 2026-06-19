# Workspace Computer Provider Contract

Polynet's product authority is still the project record. A workspace computer is
the provider-backed machine attached to that project while tools, terminals,
previews, and file inspection need execution.

## Current Live Provider

Blaxel is the default and only live workspace provider.

Workspace file inspection, terminal processes, previews, and runtime workspace
tools all resolve through the Blaxel workspace computer provider. There is no
fallback workspace provider in the active runtime path.

## Provider Operations

The provider seam is intentionally small:

- `ensureWorkspaceComputer`
- `resolveWorkspaceComputerIfReady`
- `releaseWorkspaceComputerIfIdle`
- `destroyWorkspaceComputer`
- `executeWorkspaceCommand`
- `listWorkspaceDirectory`
- `readWorkspaceFile`
- `writeWorkspaceFile`
- `getWorkspacePreviewUrl`

The UI should not choose the provider. Provider selection is server-owned policy.
The user-facing flow stays the same: project files, terminals, previews, and
workspace tools attach to the project computer.

## Provider Ownership

Every persisted provider resource id must carry the provider that owns it:

- `providerVolumeId` is paired with `providerVolumeProviderId`
- `providerSandboxId` is paired with `providerSandboxProviderId`

The id alone is not enough. Blaxel APIs must not infer ownership from an
unknown project field. Rows with a Blaxel project prefix `pn-p-*` can be
normalized to Blaxel during staging migration; unknown ownerless rows must fail
closed instead of being attached to the Blaxel runtime implicitly.

Internal project state writers are the authority boundary:

- Workspace volume creation writes `providerVolumeProviderId: "blaxel"`.
- Workspace sandbox registration writes `providerSandboxProviderId: "blaxel"`.
- Clearing by id should clear only when both the provider and id match.

Provider-specific cleanup must dispatch by owner. The live cleanup path may
clean up only Blaxel-owned project resources.

Provider-specific inspection must not silently migrate ownership. If a project
records unknown sandbox or volume ownership, the Blaxel Files path must return a
provider-transition failure instead of replacing the project pointer. Explicit
migration/cleanup is a separate lifecycle operation.

## Project Resource Truth

The `cloudProjects` row is the Polynet source of truth for resource ownership and
retention policy. Provider state is evidence from Blaxel; retention state is
Polynet policy.

Volume truth:

- `providerVolumeId`
- `providerVolumeProviderId`
- `providerVolumeState`
- `providerVolumeLastSeenAt`
- `workspaceVolumeRetentionState`
- `workspaceVolumeRetainUntil`
- `workspaceVolumeDeleteAfter`
- `workspaceVolumeDeletionWarningSentAt`
- `workspaceVolumeDeletedAt`
- `workspaceVolumeDeletionReason`

Sandbox truth:

- `providerSandboxId`
- `providerSandboxProviderId`
- `providerSandboxState`
- `providerSandboxLastSeenAt`
- `providerSandboxLastActivityAt`
- `providerSandboxStartedAt`
- `providerSandboxIdleExpiresAt`

Allowed volume retention states are `active`, `suspended`, `pending_delete`, and
`deleted`. New projects start as `active`. Any successful Blaxel volume attach
reactivates the volume retention state and clears pending deletion metadata.
Actual deletion remains a separate reconciler responsibility.

## Resource Admission

Resource admission is separate from compute billing.

Project and volume admission uses Polynet-owned truth:

- all accounts: five active project volumes
- first materialization requires purchased/prepaid tool balance or a card
- deleted or archived project rows do not count toward the limit
- rows whose volume retention state is `deleted` do not count toward the limit
- first volume creation for a project is gated; re-attaching the same existing
  volume remains idempotent

The paid-tier signal is card-on-file truth. Purchased workspace tool balance can
fund the first physical volume materialization, but it does not raise the
project-volume limit. Included/free credits can pay for compute usage but must
not create recurring storage liability or raise the project-volume limit by
themselves. The Stripe customer id alone is not a card-on-file truth and must
not be used as the admission authority.

Before any Blaxel provider call can create or wake a project volume, the server
must run the central materialization admission path. For new volumes, that path
claims the deterministic project volume id in Convex as `materializing` before
calling Blaxel, then finalizes it as `active` after provider success. This keeps
quota checks atomic across concurrent Files, import, terminal, and runtime tool
requests.

Provider quota is also admission evidence. If
`BLAXEL_WORKSPACE_VOLUME_LIMIT` is configured, the server reads live Blaxel
volume inventory and enforces that count with
`BLAXEL_WORKSPACE_VOLUME_SAFETY_BUFFER` before claiming a new project volume.
Existing undeleted project volumes skip the provider inventory check because no
new Blaxel volume slot is being consumed.

Agent workspace compute remains gated by workspace credit reservation before a
Blaxel sandbox is created. File inspection and interactive starts can wake the
same project workspace, but volume creation must pass resource admission first.

## Stale Sandbox Reconciliation

The project record remains Polynet's source of truth for the current workspace
computer pointer, but the provider owns whether that sandbox still exists. Blaxel
can delete an idle sandbox through lifecycle policy while the durable project
volume remains valid.

Before a Blaxel path reuses a project sandbox id, it must inspect provider truth:

- existing sandbox: record the latest sandbox state and keep the volume id
- definitely missing sandbox: clear only the matching `providerSandboxId`
- provider request failure: do not clear project state
- follow-up user intent: recreate from the same project volume through `ensure`

This keeps the data model simple: one durable project volume, one disposable
current project sandbox, and no manual UI on/off switch for normal file
inspection.

Stale sandbox pointer reconciliation is allowed to clear only Blaxel-owned
project sandbox fields after provider sandbox inventory proves the sandbox is
missing. It must default to dry-run, preserve volume fields, and perform no
provider deletion.

Inactive legacy pointer reconciliation is allowed to clear only inactive
`archived` or `deleted` project rows whose recorded provider pointers are not
Blaxel-owned. It must default to dry-run, perform no provider deletion, and must
never clear active project rows or matched Blaxel volume pointers. Cleared legacy
volume pointers are marked with `workspaceVolumeRetentionState: deleted` because
the row is no longer a valid active project-volume authority.

Project deletion dispatches cleanup by recorded provider owner. Blaxel-owned
resources delete the Blaxel sandbox first, then delete the Blaxel volume;
missing provider resources count as already cleaned up.

For Blaxel, `releaseWorkspaceComputerIfIdle` does not delete the sandbox.
Release is a Polynet-side acknowledgement that the provider can move the sandbox
through automatic standby/expiration according to its lifecycle policy. Because
Blaxel standby is automatic rather than a confirmed manual stop, accounting must
include the explicit auto-standby grace window before clearing the active project
lease.

## Workspace Boundary

Provider filesystem operations must fail closed before touching the provider
file API. Lexical path normalization is not enough because a safe-looking path
inside `/workspace` can be a symlink to another sandbox path.

For Blaxel, `listWorkspaceDirectory`, `readWorkspaceFile`, `writeWorkspaceFile`,
and command `cwd` resolution run a sandbox-side path guard first:

- resolve the workspace root inside the sandbox
- reject `..`, absolute paths outside the workspace root, and NUL bytes
- reject any symlink path component
- verify the resolved target stays inside the workspace root
- require directories for list/cwd and regular files for read/write targets

This keeps file inspection and file mutation workspace-bounded even though the
provider filesystem API would otherwise follow symlinks.

## Lifecycle Intents

Workspace computer creation must carry an explicit lifecycle intent:

- `file_inspection`: wake a workspace only to list/read files. Blaxel defaults
  to `ttl-idle: 5m` and `ttl-max-age: 1h`.
- `interactive`: terminal, preview, or non-agent workspace usage. Blaxel
  defaults to `ttl-idle: 30m` and `ttl-max-age: 1h`.
- `agent_run`: active agent/Codex work. Blaxel defaults to `ttl-idle: 10m` and
  intentionally omits an unconditional provider `ttl-max-age`; an active run
  should be allowed to finish before cleanup policy cools the workspace down.

The Files panel uses `file_inspection`. The UI should not expose a primary
manual on/off switch for Blaxel workspaces; user intent wakes the workspace and
provider lifecycle policy cools it down.

Blaxel lifecycle overrides, if needed for staging tests, must be intent-specific:

- `BLAXEL_WORKSPACE_FILE_INSPECTION_IDLE_DELETE_AFTER`
- `BLAXEL_WORKSPACE_AGENT_RUN_IDLE_DELETE_AFTER`
- `BLAXEL_WORKSPACE_INTERACTIVE_IDLE_DELETE_AFTER`
- `BLAXEL_WORKSPACE_NON_AGENT_MAX_AGE_DELETE_AFTER`

Provider lifecycle is applied when the sandbox is created and can be upgraded
in place when the current project computer already exists. Before routing
`agent_run` through an existing Blaxel project computer, the ensure path must
compare the existing sandbox lifecycle label and provider lifecycle policy
against the requested intent:

- equal or stronger existing intent: reuse the sandbox
- weaker existing intent: update lifecycle in place, then repair metadata
- weaker requested intent: never downgrade a live sandbox
- provider update failure: delete and recreate from the same volume as fallback

If provider lifecycle policy and metadata labels disagree, the strongest
observed lifecycle wins. Labels are useful metadata, not the sole source of
truth; a stale `file_inspection` label must not downgrade a sandbox whose
provider policy already matches `agent_run`.

This keeps the model to one current project sandbox per active project volume
while preventing active agent work from inheriting a file-inspection max-age policy.
It also preserves processes and warm state when Blaxel accepts lifecycle updates.

## Blaxel Validation Gate

Blaxel is the only live workspace provider. Before expanding usage beyond the
staging workspace path, these checks must stay true:

- The staging readiness guard passes.
- The Convex runtime diagnostic passes in staging, proving Convex can import the
  Blaxel SDK and see the server-owned Blaxel env without creating a sandbox.
- The Convex sandbox smoke passes in staging, proving Convex can create, use,
  and clean up a Blaxel sandbox through the provider wrapper without volumes.
- The Convex volume smoke passes in staging, or reports only the known Blaxel
  volume quota blocker while confirming no sandbox was left running.
- The Blaxel workspace lifecycle proof passes with project volumes enabled.
- The Blaxel runtime tools smoke passes against a real staging project through
  `executeRuntimeWorkspaceTool`, proving `list_dir`, `write`, `read`, `bash`,
  `glob`, `grep`, `sha256`, and `edit` all use the same provider-neutral path
  chat uses.
- The Blaxel resource inventory diagnostic can list provider volumes/sandboxes
  and classify them against Polynet `cloudProjects` rows without creating,
  mutating, or deleting provider resources. The public diagnostic action is
  production-allowed but operator-gated because provider resource names and
  labels are operational infrastructure data. The unauthenticated internal
  action remains staging-only for admin CLI inventory checks when the staging
  operator-role table has not been bootstrapped. It must include
  `attached_mismatch` and `quota_risk` classifications so provider attachment
  drift and Blaxel workspace quota headroom are visible before cleanup
  automation runs.
- Provider policy resolves to Blaxel only.
- The deployment target is the staging path until this branch is promoted.
