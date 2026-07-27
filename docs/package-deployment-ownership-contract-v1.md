# Package and Deployment Ownership Contract v1

Status: `ACTIVE`

## Purpose

Polynet keeps one dependency graph per independently installed artifact. This
contract owns the repository package topology; it does not authorize a
deployment or replace the canonical release workflow.

## Current ownership

| Graph | Manifest and lock | Artifact owner | Install/deployment boundary |
| --- | --- | --- | --- |
| repository root | `package.json`, `package-lock.json` | Convex/backend code, Vercel API functions, shared runtime, scripts, tests, and release orchestration | root `npm ci`; explicit Convex commands; root Vercel project |
| browser web | `apps/web/package.json`, `apps/web/package-lock.json` | Vite browser bundle | independent `npm --prefix apps/web ci`; root Vercel build delegates to `apps/web` |
| preview proxy | `apps/preview-proxy/package.json`, `apps/preview-proxy/package-lock.json` | access-gated generic runtime preview proxy | independent Node 22 Docker artifact described by `apps/preview-proxy/fly.toml` |

The nested `apps/web/vercel.json` contains route fallback configuration. It is
not a fourth dependency graph and does not override the root Vercel
install/build ownership contract.

## Invariants

1. The repository has exactly the three manifest/lock pairs listed above.
2. Every manifest and lock root declares Node `22.x`; CI and the preview-proxy
   base image use Node 22.
3. Every graph is installed with `npm ci` from its own lockfile.
4. Root Vercel installation installs root and web independently. The root build
   delegates to the web graph and emits `apps/web/dist`.
5. The preview proxy builds from its own manifest and lock without depending on
   a repository workspace install.
6. Root and web may declare the same package because shared source is exercised
   under both backend/proof and browser build contexts. Any shared declared
   package must use the same version range in both manifests.
7. CI performs a low-threshold audit for all three graphs.
8. No manifest declares npm workspaces or a `workspace:` dependency.
9. A fourth package graph requires a distinct installed artifact and an update
   to this contract and its proof.
10. Converting these graphs to npm workspaces requires a deployment redesign
    that proves Vercel API, browser build, Convex, and proxy Docker isolation.

## Dependency change procedure

1. Identify the artifact that imports or executes the dependency.
2. Change only that artifact's manifest unless another graph independently uses
   the dependency.
3. If root and web share the declaration, keep their ranges equal.
4. Regenerate only the lockfile owned by each changed manifest.
5. Run the package-boundary proof and the graph's local typecheck/build/check.
6. Let canonical CI perform clean installs and low-threshold audits for all
   three graphs.

Script-only changes to root `package.json` do not require lockfile regeneration
because npm lock roots do not store package scripts.

## Release boundary

- Normal web/API releases land through GitHub and the canonical Vercel project.
- Convex deployment remains explicit from a validated source state.
- The preview proxy is a separate Fly/Docker artifact.
- This contract does not authorize direct local Vercel release commands,
  production changes, environment mutation, or a proxy deployment.

The repository currently proves the proxy artifact boundary through its
manifest, lock, Dockerfile, Fly configuration, security proof, and CI audit. A
canonical operator runbook for releasing that proxy was not found and remains
a separate operational documentation gap; this contract does not invent one.

## Executable proof

`npm run check:package-deployment-boundary-contract` validates the topology,
Node/lock policy, manifest-to-lock consistency, Vercel delegation, proxy
container boundary, shared range parity, and CI ownership without network
access.
