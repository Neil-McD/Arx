# Community App Plan v1

Status: active alpha plan

## Product truth

The community app system only needs one honest loop:

1. owner/admin opens `AI Agent -> Apps`
2. recommends a remote MCP app for the community
3. Polynet validates the app definition when possible and records the community grant
4. Polynet seeds/reuses canonical user harness app state for the builder and active members
5. the runtime can later use the app only through each user's own harness state

If a requirement does not directly support that loop, it is a deletion candidate.

## Current v1 boundaries

### Keep

- one simple community `Apps` surface
- remote HTTPS MCP only
- auth types: `none`, `api_key`, `bearer`
- explicit tool discovery
- explicit per-community grant records
- canonical user harness app state and source provenance
- owner/admin-only management
- member-readable community app grants

### Delete

- app truth in `communityAgentConfigs`
- CLI onboarding from the community UI
- multiple transport choices
- OAuth onboarding in this slice
- mount-wide editable approval controls
- direct community MCP runtime execution
- shared member secrets on community app grants

## Canonical objects

- `DeveloperApp`
- `AppConnection`
- `AppToolSnapshot`
- `CommunityAppMount`
- `UserPlatformAppMount`
- `UserPlatformAppMountSource`

These remain separate internally even though the user sees one simple flow.

## Immediate next work

1. keep runtime MCP execution personal-harness only
2. seed community grants into user harness state on community add/join
3. show one effective status for the same app across Discover, personal Settings, and Community Settings
4. keep skills as separate package attachments, not prompt blobs
