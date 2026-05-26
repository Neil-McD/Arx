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

## Blaxel Gate

Blaxel can only become selectable after all of these are true:

- The staging readiness guard passes.
- The Convex runtime diagnostic passes in staging, proving Convex can import the
  Blaxel SDK and see the server-owned Blaxel env without creating a sandbox.
- The Convex sandbox smoke passes in staging, proving Convex can create, use,
  and clean up a Blaxel sandbox through the provider wrapper without volumes.
- The Blaxel workspace lifecycle proof passes with project volumes enabled.
- The server explicitly enables the Blaxel provider.
- The deployment is not production.

Until then, Blaxel provider calls outside explicit staging policy return
`blaxel_provider_not_enabled`.

## Migration Rule

Do not replace Daytona behavior with Blaxel behavior in the same slice that
introduces the seam. First prove the contract, then add the provider
implementation behind staging-only policy, then switch one internal staging path.
