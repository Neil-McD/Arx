# Community App Convex Contract v1

Status: current implementation contract

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

Community-scoped exposure of a validated app.

Fields:
- `communityId`
- `developerAppId`
- `toolSnapshotId`
- `mountedByUserId`
- `enabled`
- `enabledTools?`
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
- failed connect should leave no orphaned app state
- community config blobs are not canonical app truth
- runtime prompt context must not claim more app capability than the harness actually executes
