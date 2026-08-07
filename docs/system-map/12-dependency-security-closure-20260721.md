# Production Dependency Security Closure — 2026-07-27

Status: prepared on the production-derived PR branch. Production is unchanged.

## Irreducible requirement

The release candidate must pass an executable dependency audit without deleting
the load-bearing Daytona execution substrate, forcing a breaking provider
upgrade, or widening the release-recovery slice into Blaxel retirement.

Daytona remains required by the current coding and agentic execution paths.
Blaxel is not required by the intended MVP product surfaces, but its installed
SDK remains reachable from dormant project-Workspace backend actions and cannot
be removed safely until provider resources, project pointers, and billing
reservations have been inventoried and reconciled.

## Change boundary

This slice:

1. keeps `@daytona/sdk@0.192.0` and `@blaxel/core@0.2.94` unchanged;
2. resolves their vulnerable descendants to exact compatible releases already
   accepted on the isolated staging lane;
3. resolves the independent web dependency graph to patched releases;
4. runs every package audit at the low threshold so any known advisory fails CI;
5. adds an executable import, lock, and archive-behavior interlock.

This slice does not change product behavior, schemas, data, auth, payments,
provider configuration, external resources, production deployments, or the
quarantined Workspace surface.

## Exact resolutions

The root graph pins:

- `@hono/node-server@2.0.11`
- `@modelcontextprotocol/sdk@1.29.0`
- OpenTelemetry `0.221.0` / `2.10.0` peer families
- `axios@1.18.1`
- `body-parser@2.3.0`
- `brace-expansion@5.0.9`
- `fast-uri@4.1.1`
- `js-yaml@5.2.2`
- `protobufjs@8.7.1`
- `shell-quote@1.10.0`
- `tar@7.5.21`

The web graph pins `brace-expansion@5.0.9`. The regenerated locks resolve
`postcss@8.5.23` and `dompurify@3.4.13` while retaining the accepted provider
SDK versions.

## Compatibility interlock

`scripts/dependency_security_interlock_proof.mjs` proves:

- direct provider dependencies and installed SDK versions remain unchanged;
- the patched root and web resolutions are exact;
- the root and web PostCSS locks and web DOMPurify lock are patched;
- Daytona still exports its runtime client;
- Blaxel still exports its sandbox and volume clients;
- Blaxel-compatible `archiver@7.0.1` remains callable;
- the real directory-to-ZIP operation emits a valid archive.

## Required acceptance

Before this branch is eligible for review:

- root, web, and preview-proxy clean installs pass;
- all three low-threshold audits report zero vulnerabilities;
- the compatibility interlock passes;
- Daytona and Blaxel provider contract proofs pass;
- the Convex cut guard, foundation baseline, web typecheck, production build,
  bundle budget, and `git diff --check` pass;
- the draft PR reports green GitHub and Vercel checks.

Merge and production deployment remain separate human-controlled actions.
Blaxel retirement remains a separate follow-on slice.

## Local verification receipt

Verification on the production-derived PR worktree completed with:

- root audit: zero vulnerabilities at the low threshold;
- web audit: zero vulnerabilities at the low threshold;
- unchanged preview-proxy clean install: zero vulnerabilities;
- dependency security interlock: pass;
- Daytona direct-runtime, tool-role, computer-use, and screenshot-bridge proofs:
  pass;
- Blaxel workspace lifecycle/accounting proof: pass;
- Convex cut runtime guard: pass;
- canonical foundation baseline: 22/22 pass;
- web typecheck, production build, and bundle budget: pass;
- lock drift inspection: limited to the exact patched descendants and their
  required transitive graph;
- `git diff --check`: pass.

The screenshot-bridge proof's source matcher was widened to accept formatter
whitespace around `||`; its protected runtime assertion and runtime code are
unchanged.

Remote GitHub and Vercel acceptance is recorded on the pull request for the
exact final head SHA immediately before merge. Keeping that mutable receipt on
the PR prevents this static document from becoming stale after every
documentation-only follow-up commit.
