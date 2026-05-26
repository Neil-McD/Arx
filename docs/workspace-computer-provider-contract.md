# Workspace Computer Provider Contract

PolyNet's product authority is still the project record. A workspace computer is
the provider-backed machine attached to that project while tools, terminals,
previews, and file inspection need execution.

## Current Live Provider

Daytona remains the default and only live provider in this slice.

- `ensureProjectBackgroundSandbox`
- `resolveProjectBackgroundSandboxIfReady`
- `releaseProjectBackgroundSandboxIfIdle`

Those functions still own the active workspace behavior and still use the
Daytona client directly. The Blaxel provider is implemented only behind
server-owned staging policy. It is not routed into the live workspace path until
the lifecycle proof passes against a real project volume.

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

The id alone is not enough. Daytona sandbox and volume APIs must never receive a
Blaxel sandbox or volume id, and Blaxel APIs must never infer ownership from a
Daytona-shaped project field. Legacy rows with an id and no provider owner are
treated as Daytona-owned unless the id uses the Blaxel project prefix
`pn-p-*`, which is inferred as Blaxel during the staging migration.

Internal project state writers are the authority boundary:

- Daytona volume creation writes `providerVolumeProviderId: "daytona"`.
- Blaxel file inspection writes `providerVolumeProviderId: "blaxel"`.
- Daytona background sandbox registration writes
  `providerSandboxProviderId: "daytona"`.
- Blaxel file inspection writes `providerSandboxProviderId: "blaxel"` and
  clears stale Daytona sandbox accounting fields.
- Clearing by id should clear only when both the provider and id match.

Provider-specific cleanup must dispatch by owner. A Daytona cleanup path may
clean up only Daytona-owned project resources. A Blaxel cleanup path may clean
up only Blaxel-owned project resources.

Provider-specific inspection must not silently migrate ownership. If a project
currently records Daytona-owned sandbox or volume ids, the Blaxel Files path must
return a provider-transition failure instead of replacing the project pointer.
Explicit migration/cleanup is a separate lifecycle operation.

## Stale Sandbox Reconciliation

The project record remains PolyNet's source of truth for the current workspace
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

Project deletion dispatches cleanup by recorded provider owner. Daytona-owned
resources use Daytona cleanup. Blaxel-owned resources delete the Blaxel sandbox
first, then delete the Blaxel volume; missing provider resources count as already
cleaned up.

For Blaxel, `releaseWorkspaceComputerIfIdle` does not delete the sandbox.
Release is a PolyNet-side acknowledgement that the provider can move the sandbox
through standby/expiration according to its lifecycle policy. Later inspection
or user intent reconciles stale project pointers.

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
- `agent_run`: active agent/Codex work. Blaxel defaults to `ttl-idle: 30m` and
  intentionally omits an unconditional provider `ttl-max-age`; an active run
  should be allowed to finish before cleanup policy cools the workspace down.

The Files panel uses `file_inspection`. The UI should not expose a primary
manual on/off switch for Blaxel workspaces; user intent wakes the workspace and
provider lifecycle policy cools it down.

Blaxel lifecycle overrides, if needed for staging tests, must be intent-specific:

- `BLAXEL_WORKSPACE_FILE_INSPECTION_IDLE_DELETE_AFTER`
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

This keeps the model to one project volume and one current project sandbox while
preventing active agent work from inheriting a file-inspection max-age policy.
It also preserves processes and warm state when Blaxel accepts lifecycle updates.

## Blaxel Gate

Blaxel can only become selectable after all of these are true:

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
- The server explicitly enables the Blaxel provider.
- The deployment is not production.

Until then, Blaxel provider calls outside explicit staging policy return
`blaxel_provider_not_enabled`.

## Migration Rule

Do not replace Daytona behavior with Blaxel behavior in the same slice that
introduces the seam. First prove the contract, then add the provider
implementation behind staging-only policy, then switch one internal staging path.
