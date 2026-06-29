# MCP Harness Projection Contract v0

Status: active contract

## First Principle

One Polynet capability kernel projects into multiple harness adapters and UI surfaces. Polynet must not create separate capability systems for the native Polynet runtime, the Codex runtime, or external MCP setup.

```text
Polynet capability kernel
  -> identity
  -> authority
  -> user-owned connection state
  -> validated tool snapshots
  -> executable runtime tools
  -> harness adapters
      -> Polynet harness
      -> Codex harness
      -> external MCP provider adapter
  -> UI projections
      -> settings rows
      -> community app rows
      -> setup packet
```

## Irreducible Objects

### Capability Kernel

The canonical Polynet substrate that owns capability truth.

Kernel-owned facts:

- app identity
- actor and authority
- user-owned credentials
- provider policy
- validated tool snapshots
- executable runtime tool contracts
- audit and execution boundary

Harness adapters and UI projections can read kernel facts. They must not create a second source of capability truth.

### App Definition

Stable identity and provider policy for an MCP app.

Current sources:

- `developerApps`
- Discover catalog app entries
- `resolveDiscoverAppIntegrationProfile`
- `appToolSnapshots`

The app definition owns name, logo, endpoint policy, auth mode, adapter kind, result policy, risk floor, provider request headers, and reviewed connectability.

### User App State

The user's durable connection to an MCP app.

Current sources:

- `userPlatformAppMounts`
- `userPlatformAppMountSources`
- `appConnections`
- encrypted connection secrets or OAuth token bundles

Only user app state can make an MCP app runtime-live for that user. Community app attachment can seed or request setup, but it must not become a second runtime credential source.

### Effective MCP App Projection

The deduped view of personal and community app state for one user/context.

Current source:

- `buildEffectiveMcpApps`

Rules:

- Prefer catalog identity when available.
- Collapse personal plus community references into one effective app.
- A live personal connection satisfies a matching community attachment.
- A community attachment without user-owned live credentials is setup-needed, not runtime-live.

### Runtime Tool Projection

The executable tool view for a runtime harness.

Current sources:

- `RuntimeMountedMcpTool`
- user platform mounted app runtime queries
- `runtimeMcpManager`

Rules:

- Runtime tool projection owns executable identity.
- Preserve `runtime_tool_name` exactly as the runtime layer produced it.
- Preserve `input_schema` exactly as the runtime layer produced it.
- Do not synthesize executable tool names from display, catalog, or setup names.
- Do not project community-only attachments as user-owned executable runtime tools.

### Harness Adapter Projection

The combined setup-facing and runtime-facing view derived from the capability kernel for a specific harness or surface.

Current source:

- `buildMcpHarnessProjection`

Inputs:

- `effectiveApps`: setup/status/capability state.
- `runtimeMountedTools`: executable runtime tool state.

Outputs:

- `polynetMountedTools`: server-side selectors for the Polynet harness.
- `codexBridgeTools`: bridge-safe wrappers for the Codex harness.
- `setupPacketHints`: setup-needed UI projection for copy/setup UX.

`buildMcpHarnessProjection` must not derive callable tool identity from `EffectiveMcpApp.personal_mount.tools`. That view is for app/setup state only. Callable Polynet and Codex tool projections must be derived from runtime-mounted tools with canonical `runtime_tool_name` and `input_schema`.

## Runtime Adapter Rules

### Polynet Runtime

The Polynet runtime may hydrate projected tool selectors into executable `runtimeMcpManager` tools server-side.

The Polynet runtime may use endpoint, auth type, mount ids, and app identity because this adapter runs inside the trusted server boundary.

### Codex Runtime

The Codex runtime must not install user third-party MCP servers directly into the Daytona/Codex worker as a separate MCP config path.

Instead:

```text
Codex model
  -> bridge-safe Polynet tool
  -> signed Polynet worker tool endpoint
  -> runtimeMcpManager
  -> third-party MCP server
```

The Codex projection may include tool names, descriptions, risk labels, app identity, and opaque runtime selectors. It must not include bearer tokens, OAuth tokens, client secrets, raw connection bundles, or provider secrets.

Codex bridge tool names must be deterministic and collision-safe. If two runtime tools normalize to the same bridge name, the projection must add a deterministic non-secret suffix instead of shadowing one tool with another.

Codex's native workspace, shell, preview, browser, and computer tools remain native Codex/runtime-adapter capabilities. Third-party MCP app tools stay Polynet-managed unless explicitly promoted through this projection.

### External MCP Provider Adapter

The external setup packet is a UI projection for Polynet's external MCP provider adapter. It configures an outside harness to connect to Polynet's own workspace MCP provider at `/runtime/mcp`.

This must remain separate from Polynet consuming third-party MCP apps:

```text
Polynet consumes MCPs:
  third-party MCP app -> Polynet runtime harness

Polynet exposes MCP:
  external harness -> /runtime/mcp -> Polynet workspace/community memory
```

## Forbidden Patterns

- Do not create a Codex-only credential store for user MCP apps already managed by Polynet.
- Do not ask users to configure the same third-party MCP app once in Polynet and again in Codex.
- Do not pass provider secrets, OAuth tokens, or decrypted bearer tokens into Codex prompts, tool specs, logs, or Daytona workspace files.
- Do not let `communityAppMounts` become runtime authority.
- Do not treat a community app attachment as a shared secret.
- Do not use external setup packet success as proof that native Polynet runtime MCP apps are live.
- Do not use native Polynet runtime MCP state as proof that an external harness has authenticated to `/runtime/mcp`.

## Acceptance

MCP Harness Projection v0 is accepted when:

1. One live personal MCP app plus matching runtime-mounted tools projects to the native Polynet runtime selector set.
2. The same runtime-mounted tools project to Codex bridge-safe wrappers without a second credential path.
3. A matching community attachment does not create a second runtime copy.
4. A community-only attachment produces setup guidance, not executable runtime tools.
5. Runtime `runtime_tool_name` values are preserved exactly.
6. Runtime `input_schema` values are preserved exactly.
7. Codex bridge names are deterministic and collision-safe.
8. Codex bridge tool specs contain no secret-bearing fields.
9. Existing MCP app projection and runtime MCP manager proofs still pass.
