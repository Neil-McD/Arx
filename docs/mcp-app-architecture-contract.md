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
- Discover integration profiles that declare adapter, readiness, validation, identity, context, execution, result, and risk metadata

Rules:
- Every app must resolve through one stable identity when possible.
- `catalogAppId` is the preferred identity for first-party/catalog apps.
- Endpoint and auth type are fallback matching inputs only when no catalog identity exists.
- Logo, name, endpoint, auth type, and setup link belong to the app definition, not to a community duplicate.

### Integration Profile

An integration profile says how a catalog app can become real executable harness capability.

Current code:
- `resolveDiscoverAppIntegrationProfile`
- `DISCOVER_APP_INTEGRATION_PROFILE_OVERRIDES`
- `DISCOVER_APP_PLANNED_PROFILE_KINDS`

Rules:
- Every Discover app must resolve to one profile.
- Ready apps must have an explicit profile override.
- A ready app profile must declare adapter kind, readiness, auth mode, validation kind, identity, context strategy, result policy, declared intents, and risk metadata.
- Planned apps must remain disabled at the profile layer until their adapter contract exists.
- Adapter categories are MCP, connector backplane, direct API, sandboxed CLI, or catalog-only.
- Context strategy must say whether the harness should use manifest-only context, search-then-fetch, structured snapshots, or artifact references.
- Execution surface is derived from adapter kind: remote MCP and direct API use server HTTP, backplane uses connector backplane, sandboxed CLI uses sandboxed commands, and catalog-only has no executable surface.
- Result policy declares active tool-count and result-byte bounds; validation caps discovered tool snapshots and runtime truncates oversized tool output to the app profile budget.
- Catalog app connection policy is server-authoritative; the frontend cannot choose a catalog app endpoint, auth mode, or display name as authority.
- Catalog singleton apps reuse by `catalogAppId`; endpoint-instance apps, such as Shopify Storefront MCP, reuse by endpoint/auth identity.
- Shopify's ready profile accepts only the standard Storefront MCP `/api/mcp` endpoint; UCP catalog endpoints such as `/api/ucp/mcp` require a separate reviewed profile before they are connectable.
- Uncataloged remote MCP endpoints are blocked from public server-fetch paths until they have a reviewed catalog policy or a network-layer egress guard.
- Operator audit must identify uncataloged or catalog-policy-blocked developer app rows before broad release.
- Integration profile default risk is applied as a floor during MCP tool snapshot classification.
- OAuth remote MCP apps use server-side PKCE state, provider-aware MCP `resource` handling, a passive callback that records the provider result, an authenticated user finalization action that exchanges the code, encrypted token bundles, token refresh, and the same MCP validation/runtime path as token-based remote MCP apps.
- Dedicated human approval is not implemented yet; integration profiles do not carry approval-policy metadata.
- Operator MCP servers configured in Codex are not user-facing Discover integration profiles.

### Community App Add

A community app add says a community includes an app in its app bundle.

Current code:
- `communityAppMounts`

Important: `communityAppMounts` is a legacy table name. Product behavior should treat it as a community app bundle record, not as an executable community runtime MCP layer.

Rules:
- A community app add can cause a member to get a matching user-owned app state.
- A community app add can be shown in Community Settings and Discover.
- A community app add must not create a second runtime copy of the app.
- A community app add must not imply that members inherit another user's secret.
- A community app add is a distribution path, not continuing ownership of the member's user app state.
- Shared/community-owned credentials are a separate future policy and must be explicit before use.

### User App State

User app state is the canonical state for whether an MCP app is usable by a user.

Current code:
- `userPlatformAppMounts`
- `userPlatformAppMountSources`
- `appConnections`
- `appToolSnapshots`

Rules:
- User app state is the only source for live/setup-needed/not-live status shown to that user.
- Source rows explain why a user app exists: direct personal add or community seed.
- Operator audit/backfill may add missing community source rows for existing community/member pairs, but must not delete or rewrite personal source rows.
- Operator source-provenance repair must find existing user harness apps by stable app identity, not by exact `developerAppId`.
- Operator source-provenance repair must not match app identities through empty or invalid normalized endpoints.
- Operator source-provenance repair defaults to dry-run, requires explicit repair intent for writes, scans bounded app and recipient batches, and records a critical audit event for every attempted run.
- Personal credentials live in user connection state.
- OAuth tokens live in encrypted user connection state and must not be stored in community app bundle records; callback results must not attach provider tokens to a Polynet user until an authenticated finalization action verifies the state owner.
- If a user already has Linear live personally and a community adds Linear, every surface must resolve to that same effective Linear state for that user.
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
- Record a personal source for the user app state.
- If credentials are missing, show setup needed.
- If credentials and validation are valid, show live.

### Community add

Adding an app to a community creates or reuses the community app record and seeds user app state for the builder and current active members.

- Reuse an existing community app record by `catalogAppId` first, then endpoint/auth fallback.
- Do not ask for or store a shared member secret.
- Reuse matching user app state by stable identity.
- Record community provenance for seeded installs while keeping runtime execution on user app state.
- Surface any setup-needed state from the user's effective app state, not from a separate community runtime.
- Removing the app from the community stops future distribution, removes or promotes the community source row, and does not uninstall existing user harness apps.

### Community join

Joining a community grants access to that community's app bundle.

- Seed missing community apps into user app state.
- Reuse existing user app state when the same app identity already exists.
- Never create duplicate runtime tools for the same app identity.
- Show the same effective app state in global Settings, Community Settings, and Discover.

### Community leave

Leaving a community revokes community access, not previously installed user-owned MCP apps.

- Do not delete user-owned app state when community access ends.
- Remove or promote community source provenance instead of deleting the user harness app.
- Existing user harness apps remain available until the user removes them.
- Future community-managed app access is a separate primitive with explicit shared/community authentication, metering, billing, and revocation semantics.

## Forbidden patterns

- Do not add "community Linear runtime" beside "personal Linear runtime".
- Do not expose `communityAppMounts` directly as Daytona runtime tools.
- Do not show community status as setup needed when the user's effective app state is live for the same app identity.
- Do not infer that a community app record provides a member's bearer token, OAuth token, or secret.
- Do not treat endpoint string equality alone as canonical when a catalog identity is available.
- Do not remove an existing user harness app just because a builder removes it from the community app bundle.

## Current migration stance

Keep the existing table names for now. The behavior contract is more important than a broad rename.

Next cleanup should reduce drift by:
- deleting obsolete grant/recommend frontend aliases and copy,
- deleting unused community runtime execution APIs after proof,
- keeping product language direct: add apps to communities, connect apps to personal harnesses,
- keeping all user-facing status projection backed by the same effective user app resolver.
