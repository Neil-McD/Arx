# MCP App Architecture Contract

Status: active contract

This contract is the source of truth for MCP apps in Polynet. It resolves the drift between the older community mount language and the current product model.

## First principle

Communities grant access. Users own app state. Runtime executes only user harness tools.

## Canonical objects

### App Definition

An app definition is the stable identity and connection shape for an MCP app.

Current code:
- `developerApps`
- catalog app entries that seed or identify first-party apps

Rules:
- Every app must resolve through one stable identity when possible.
- `catalogAppId` is the preferred identity for first-party/catalog apps.
- Endpoint and auth type are fallback matching inputs only when no catalog identity exists.
- Logo, name, endpoint, auth type, and setup link belong to the app definition, not to a community duplicate.

### Community App Grant

A community app grant says a community recommends or grants access to an app.

Current code:
- `communityAppMounts`

Important: `communityAppMounts` is a legacy table name. Product behavior should treat it as a grant/recommendation record, not as an executable community runtime MCP layer.

Rules:
- A community grant can cause a member to get a matching user app state.
- A community grant can be shown in Community Settings and Discover.
- A community grant must not create a second runtime copy of the app.
- A community grant must not imply that members inherit another user's secret.
- Shared/community-owned credentials are a separate future policy and must be explicit before use.

### User App State

User app state is the canonical state for whether an MCP app is usable by a user.

Current code:
- `userPlatformAppMounts`
- `appConnections`
- `appToolSnapshots`

Rules:
- User app state is the only source for live/setup-needed/not-live status shown to that user.
- Personal credentials live in user connection state.
- If a user already has Linear live personally and a community grants Linear, every surface must resolve to that same effective Linear state for that user.
- If a user lacks required credentials, the app can be present but must show setup needed.
- If auth is not required and validation succeeds, the app can become live after seeding.

### Runtime Harness

The runtime harness is the executable set of MCP tools available to the model.

Current code:
- `composeResolvedRuntimeHarness`
- Daytona HTTP runtime in `httpDaytona.ts`
- `runtimeMcpManager`

Rules:
- Runtime MCP tools come only from user app state.
- Community lens can add prompts, skills, resources, and behavioral context.
- Community lens must not add a second MCP tool runtime path.
- Duplicate app identity is collapsed before presentation. The user should see one effective app state, with source labels such as personal, community, or personal + community only as metadata.

## Lifecycle

### Discover add or like

Adding or liking an app creates or reuses user app state by stable app identity.

- If a matching user app state exists, reuse it.
- If none exists, create it.
- If credentials are missing, show setup needed.
- If credentials and validation are valid, show live.

### Community join

Joining a community grants access to that community's app bundle.

- Seed missing granted apps into user app state.
- Reuse existing user app state when the same app identity already exists.
- Never create duplicate runtime tools for the same app identity.
- Show the same effective app state in global Settings, Community Settings, and Discover.

### Community leave

Leaving a community revokes that community grant.

- Do not blindly delete user-owned app state.
- If future grant-only rows are introduced, record source ownership before deletion semantics are implemented.
- A user who manually added or liked an app keeps that user app state after leaving.

## Forbidden patterns

- Do not add "community Linear runtime" beside "personal Linear runtime".
- Do not expose `communityAppMounts` directly as Daytona runtime tools.
- Do not show community status as setup needed when the user's effective app state is live for the same app identity.
- Do not infer that a community grant provides a member's bearer token, OAuth token, or secret.
- Do not treat endpoint string equality alone as canonical when a catalog identity is available.

## Current migration stance

Keep the existing table names for now. The behavior contract is more important than a broad rename.

Next cleanup should reduce drift by:
- renaming or wrapping community mount APIs as app grants,
- deleting unused community runtime execution APIs after proof,
- replacing direct community add/setup language with grant/recommend/like language,
- keeping all user-facing status projection backed by the same effective user app resolver.
