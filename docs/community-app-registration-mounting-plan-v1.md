# Community App Plan v1

Status: active alpha plan

## Product truth

The community app system only needs one honest loop:

1. owner/admin opens `AI Agent -> Apps`
2. connects a remote MCP app
3. Polynet validates the endpoint and discovers tools
4. Polynet mounts the app to the current community
5. the runtime can later use those mounted tools under policy

If a requirement does not directly support that loop, it is a deletion candidate.

## Current v1 boundaries

### Keep

- one simple community `Apps` surface
- remote HTTPS MCP only
- auth types: `none`, `api_key`, `bearer`
- explicit tool discovery
- explicit per-community mounted tool allow-list
- owner/admin-only management

### Delete

- app truth in `communityAgentConfigs`
- CLI onboarding from the community UI
- multiple transport choices
- OAuth onboarding in this slice
- mount-wide editable approval controls

## Canonical objects

- `DeveloperApp`
- `AppConnection`
- `AppToolSnapshot`
- `CommunityAppMount`

These remain separate internally even though the user sees one simple flow.

## Immediate next work

1. keep the community app flow as the only product entrypoint
2. make mounted apps executable in the harness for real
3. enforce call-time policy
4. add tool-call audit
5. keep skills as separate package attachments, not prompt blobs
