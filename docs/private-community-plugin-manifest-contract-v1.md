# Private Community Plugin Manifest Contract v1

Status: active contract

This contract defines the first PolyNet private plugin import primitive. It is intentionally smaller than Codex, Claude Code, or OpenCLAW plugin systems.

## First Principle

A private community plugin manifest is a package description. It is not runtime authority.

The manifest can describe skills to attach and reviewed MCP apps to stage. It cannot execute tools, fetch endpoints, publish to Discover, or grant shared credentials.

## Schema

The only accepted schema for this slice is `polynet.plugin.v0`.

Minimal manifest:

```json
{
  "schema": "polynet.plugin.v0",
  "name": "Example Plugin",
  "description": "Private community helper",
  "skills": [],
  "mcpServers": []
}
```

Allowed top-level fields:

- `schema`: must be `polynet.plugin.v0`.
- `name`: human-readable private plugin name.
- `description`: optional short description.
- `version`: optional source package version.
- `skills`: optional list of skill attachment candidates.
- `mcpServers`: optional list of MCP app setup candidates.

All imports are private-community scoped by default. Public, marketplace, Discover, install, or publication metadata is rejected recursively in this slice.

## Skill Entries

Skill entries are declarative attachment candidates. They do not grant tools.

Allowed skill fields:

- `name`: required display name.
- `slug`: optional stable slug.
- `description`: optional short description.
- `mentionToken`: optional mention token.

Compiler output for skills is a dry-run `skillsToAttach` plan. A later write path may create or attach skill packages, but this compiler never writes.

## MCP Entries

MCP entries are setup candidates only. Runtime execution still comes from user-owned harness app state.

Allowed MCP fields:

- `name`: optional source label. Compiled setup plans use the canonical reviewed registry name, not this value.
- `mcpRegistryId`: optional reviewed PolyNet registry id.
- `endpointUrl`: optional HTTPS endpoint.
- `authType`: optional `none`, `api_key`, `bearer`, or `oauth`.
- `transport`: optional transport label.
- `enabledTools`: optional non-authoritative tool allowlist.

An MCP entry compiles only when it resolves to the reviewed community workflow import MCP registry and passes that registry connect policy. Registry identity is canonical; manifests cannot rename a reviewed MCP app in the compiled plan.

## Hard Rejections

The compiler must reject:

- unknown hosted MCP endpoints,
- local or private network endpoints,
- `stdio`, shell, command, or local runtime MCP definitions,
- secret-bearing manifests, including tokens, API keys, credentials, shared credentials, passwords, environment variables, authorization headers, or client secrets,
- shared community credentials,
- public, install, marketplace, Discover, or publishing metadata at any nesting depth,
- runtime execution instructions.

Runtime-only registry entries may be recognized, but they must compile as rejections with a managed-runtime reason, not as stageable MCP apps.

## Output

The compiler returns a deterministic dry-run plan:

```ts
{
  normalizedPlugin: {},
  skillsToAttach: [],
  mcpAppsToStage: [],
  rejections: [],
  warnings: []
}
```

`mcpAppsToStage` is a setup plan, not a live runtime mount.

## Apply Bridge

`applyPrivateCommunityPluginManifest` is the manager-only bridge from a compiled
private manifest into existing community app bundle state.

This raw manifest bridge is an internal/operator import primitive. Normal
builder-facing product code should not ask builders to paste or edit manifests.

Rules:

- The action must compile first and return all compiler rejections before any
  community app write.
- The action applies MCP entries only in this slice. Skill entries may compile,
  but skill attachment writes remain separate.
- Applying the same manifest twice must reuse an existing community app bundle
  entry by stable identity instead of creating duplicates.
- Reusing an existing community app bundle entry must re-enable and reseed it
  through the canonical community app mount path, not merely report it as
  present.
- Hosted no-auth MCP entries may connect through the existing imported MCP
  validation path.
- Auth or config-required MCP entries stage as setup-needed community app bundle
  entries.
- Runtime execution still comes only from user-owned harness app state.
- The action must not publish to Discover, import arbitrary endpoints, import
  local runtime definitions, or store shared community credentials.

## Product Backend API

`listPrivateCommunityMcpOptions` is the manager-only options projection for the
future button UI. It returns reviewed hosted-remote MCP registry entries only,
with product setup status such as `ready`, `needs_auth`, `needs_config`, or
`not_available`. Runtime-only, unsupported, unknown, local, and managed-runtime
entries must not become addable product options.

`addPrivateCommunityMcpApp` is the manager-only product add primitive. Its public
input is intentionally small:

- `communityId`
- `mcpRegistryId`

Rules:

- The action must not accept endpoint URLs, auth modes, secrets, command config,
  stdio config, public publishing metadata, or raw manifest JSON from product UI.
- The server constructs the internal private manifest from the reviewed registry
  id and applies it through the same compiler and apply helper as the raw
  manifest bridge.
- Hosted no-auth MCPs may connect immediately through the imported MCP
  validation path.
- Auth-required or config-required MCPs stage as setup-needed community app
  bundle entries.
- Runtime-only MCPs remain unavailable until a managed runtime product path
  exists.
- The add path must reuse and reseed existing community app bundle entries
  through the canonical community app mount helper.
- The add path must return product-safe fields only: `ok`, `status`,
  `mcp_registry_id`, `name`, `community_app_mount_id`, `setup_required`,
  `setup_reason`, and `error_message`.
- The add path must not return operator/import fields such as endpoint URLs,
  auth types, raw plugin manifests, raw `staged`/`connected`/`reused`/`failures`
  arrays, apply counters, warnings, or rejections.

## Non-Goals

This slice does not add:

- Community Settings UI,
- runtime MCP execution changes,
- arbitrary endpoint support,
- stdio/local MCP support,
- Discover publication,
- persistent plugin install records,
- Codex, Claude Code, or OpenCLAW import compatibility.

## Acceptance

The proof must show:

- valid skill-only manifests compile,
- reviewed registry MCP manifests compile into setup plans,
- reviewed registry MCP setup plans use canonical registry identity,
- unknown hosted MCP endpoints are rejected,
- local and private endpoints are rejected,
- `stdio` and runtime-only MCPs are rejected,
- secret-bearing manifests are recursively rejected,
- public, install, marketplace, Discover, and publishing metadata is recursively rejected,
- compiler output is deterministic and side-effect free,
- the apply bridge rejects unsafe manifests before writes,
- the apply bridge reuses existing community app bundle entries,
- the apply bridge stages or connects reviewed MCP entries through existing
  community app paths only.
