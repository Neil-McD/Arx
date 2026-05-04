# Community App Convex Contract v1

Status: superseded by `docs/mcp-app-architecture-contract.md`

This file is retained as historical implementation context only. The active contract is:

- Communities grant access.
- Users own app state.
- Runtime executes only user harness tools.

Do not use this file to justify adding community MCP runtime execution back into Daytona.

## Canonical tables

### `developerApps`

Builder/owner-created app definition.

Fields:
- `ownerUserId`
- `name`
- `slug`
- `description?`
- `endpointUrl`
- `authType`
- `status`
- `activeSnapshotId?`
- `lastValidatedAt?`
- `lastValidationError?`
- `createdAt`
- `updatedAt`

### `appConnections`

Secret and connection state for a developer app.

Fields:
- `developerAppId`
- `connectionStatus`
- encrypted secret fields
- `lastValidatedAt?`
- `lastError?`
- `createdAt`
- `updatedAt`

### `appToolSnapshots`

Frozen discovered tool surface for a validated app.

Fields:
- `developerAppId`
- `snapshotVersion`
- `endpointUrl`
- `validationStatus`
- `validationError?`
- `toolsJson`
- `fetchedAt`
- `createdAt`

### `communityAppMounts`

Community-scoped grant/recommendation for an app. The table name is historical;
it must not be treated as a community runtime MCP layer.

Fields:
- `communityId`
- `developerAppId`
- `toolSnapshotId?`
- `mountedByUserId`
- `enabled`
- `enabledTools?`
- `createdAt`
- `updatedAt`

### `userPlatformAppMountSources`

Durable ownership/provenance for a user's canonical harness app. The active
MCP architecture treats community app grants as distribution, so seeded
community installs are user-owned harness apps.

Fields:
- `userId`
- `userPlatformAppMountId`
- `sourceType`: `personal` or `community`
- `sourceKey`
- `communityId?`
- `communityAppMountId?`
- `createdAt`
- `updatedAt`

## Canonical modules

- `/Users/neilmcdevitt/code/arx/convex/developerApps.ts`
- `/Users/neilmcdevitt/code/arx/convex/appConnections.ts`
- `/Users/neilmcdevitt/code/arx/convex/appValidation.ts`
- `/Users/neilmcdevitt/code/arx/convex/communityAppMounts.ts`

## Public community API

Exposed through `/Users/neilmcdevitt/code/arx/convex/community.ts`:

- `listCommunityAppMounts`
- `connectCommunityApp`
- `updateCommunityAppMount`
- `unmountCommunityApp`

This is intentionally the only product-facing app path for the current alpha slice.

## Internal rules

- remote HTTPS MCP only
- validation discovers tools before mount
- failed personal connect may leave setup-needed user app state when that is the
  clearest next action
- community config blobs are not canonical app truth
- community grants never store member secrets
- community grants seed/reuse user harness app state by stable app identity
- community grant removal stops future distribution; it does not uninstall
  already-seeded user harness apps
- runtime prompt context must not claim more app capability than the user harness actually executes
