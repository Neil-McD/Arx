# Blaxel Workspace Lifecycle Proof

This branch pivots away from the Codex-in-Daytona staging path and starts from current local `main`.

The first Blaxel slice is deliberately not a product integration. It is a provider proof for the workspace-computer model PolyNet actually needs.

## Target Model

```text
Project = WorkspaceVolume + WorkspaceComputer
```

For Blaxel:

- `WorkspaceVolume` is a durable Blaxel volume mounted at the project workspace path.
- `WorkspaceComputer` is a Blaxel sandbox that can move from active to standby.
- Standby should preserve running process state, writable filesystem state, and volume-mounted files.
- Cold restore should recreate a sandbox from the durable volume after the warm sandbox is deleted.

## Probe

Run:

```bash
npm run probe:blaxel-workspace-lifecycle
```

Required environment for live execution:

```bash
export BL_WORKSPACE=<workspace-name>
export BL_API_KEY=<api-key>
```

For local staging, paste credentials into the ignored repo-root file:

```bash
.env.blaxel.local
```

Use quoted values:

```bash
BL_WORKSPACE="your-staging-workspace"
BL_API_KEY="your-staging-api-key"
```

The npm probe command loads `.env.blaxel.local` automatically through `scripts/run_blaxel_workspace_lifecycle_probe.sh`.

## Staging Safety

This worktree should be linked only to Vercel staging:

```text
projectName: polynet-staging
projectId: prj_plXUH12pm9nZ5lWS5wJOt163maFL
orgId: team_TJvbi4UGtg62xteusiC1Cvxy
```

The local staging target file is ignored by git:

```bash
.env.staging.local
```

It should contain:

```bash
CONVEX_DEPLOYMENT="quick-porcupine-949"
VERCEL_PROJECT_NAME="polynet-staging"
VERCEL_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
VERCEL_ORG_ID="team_TJvbi4UGtg62xteusiC1Cvxy"
```

Before any staging deploy or end-to-end run:

```bash
npm run check:blaxel-staging-readiness
```

By default, the probe exits successfully with a skipped JSON payload when credentials are missing. To fail when credentials are missing:

```bash
npm run probe:blaxel-workspace-lifecycle -- --require-live
```

Optional configuration:

```bash
export BLAXEL_WORKSPACE_PROBE_NAME=polynet-blaxel-workspace-manual
export BLAXEL_WORKSPACE_PROBE_IMAGE=blaxel/base-image:latest
export BLAXEL_WORKSPACE_PROBE_MEMORY_MB=4096
export BLAXEL_WORKSPACE_PROBE_REGION=us-pdx-1
export BLAXEL_WORKSPACE_PROBE_VOLUME_SIZE_MB=8192
export BLAXEL_WORKSPACE_PROBE_MOUNT_PATH=/workspace
export BLAXEL_WORKSPACE_PROBE_SERVER_PORT=32123
export BLAXEL_WORKSPACE_PROBE_IDLE_DELETE=1h
export BLAXEL_WORKSPACE_PROBE_MAX_AGE_DELETE=2h
export BLAXEL_WORKSPACE_PROBE_STANDBY_WAIT_MS=90000
```

`BLAXEL_WORKSPACE_PROBE_VOLUME_SIZE_GB` is still accepted as a legacy
override and is converted to MB before calling Blaxel.

The default behavior deletes both probe sandboxes and the probe volume at the end. To inspect resources after the run:

```bash
npm run probe:blaxel-workspace-lifecycle -- --keep-resources
```

Use `--allow-cli-auth` only when intentionally relying on local `bl login` credentials instead of `BL_WORKSPACE` and `BL_API_KEY`.

## What It Tests

The proof tests the exact migration risk:

1. Create or find a Blaxel volume.
2. Create a Blaxel sandbox with that volume mounted.
3. Write a marker file into the mounted volume.
4. Write a temp marker outside the volume.
5. Start a named long-running dev-server process.
6. Read process logs.
7. Fetch the marker through the sandbox port.
8. Disconnect and wait for the configured standby window.
9. Reconnect and verify volume file, temp file, process, logs, and port behavior.
10. Delete the warm sandbox.
11. Recreate a cold sandbox from the same volume.
12. Verify the volume file survived, while temp/process state did not.

## Pass Criteria

The live proof must return:

- `volumeFileRoundTripOk: true`
- `tempFileRoundTripOk: true`
- `namedProcessStarted: true`
- `processLogsReadable: true`
- `portFetchOk: true`
- `postIdleVolumeFileOk: true`
- `postIdleTempFileOk: true`
- `postIdleProcessStillRunning: true`
- `postIdlePortFetchOk: true`
- `coldRestoreVolumeFileOk: true`
- `coldRestoreTempFileAbsent: true`
- `coldRestoreProcessAbsent: true`
- `cleanupOk: true`

## Decision Rule

Only after this live proof passes should PolyNet add a provider-neutral workspace-computer seam.

The next implementation slice after a passing proof is:

- keep Daytona as the default provider
- add Blaxel as a feature-flagged provider
- keep Convex as project authority
- keep server-side path guards and entitlement gates
- replace Daytona idle stop/delete with Blaxel standby/expiration behavior only for Blaxel projects
