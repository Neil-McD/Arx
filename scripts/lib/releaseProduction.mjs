// Local production release for Polynet: one command ships the exact,
// gate-verified origin/main commit, Convex first and the web app second,
// then proves the live result. Production authority is pinned here and never
// read from local .env or .vercel link files.

export const PRODUCTION_AUTHORITY = Object.freeze({
  convexDeployment: "prod:wry-hawk-715",
  convexUrl: "https://wry-hawk-715.convex.cloud",
  vercelOrgId: "team_TJvbi4UGtg62xteusiC1Cvxy",
  vercelProjectId: "prj_raxvbRAmEKdvqhAO8V6SnE9PrVir",
  vercelProjectName: "polynet",
  productionOrigin: "https://www.polynet.ai",
});

export const VERCEL_CLI = Object.freeze(["--yes", "vercel@60.1.3"]);

// Presence only: Vercel returns these encrypted. The live bundle check proves
// VITE_CONVEX_URL after deploy.
export const REQUIRED_PRODUCTION_ENV = Object.freeze([
  "VITE_CONVEX_URL",
  "VITE_PUBLIC_APP_URL",
  "ARX_AUTH_BRIDGE_SECRET",
]);

const LIVE_POLL_INTERVAL_MS = 15_000;
const LIVE_POLL_ATTEMPTS_BEFORE_PROMOTE = 12;
const LIVE_POLL_ATTEMPTS_AFTER_PROMOTE = 12;
const MAX_BUNDLE_CHUNKS_SCANNED = 40;

export class ReleaseError extends Error {
  constructor(code, detail = null) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ReleaseError";
    this.code = code;
  }
}

export function assertAutodeployDisabled(vercelConfig) {
  if (vercelConfig?.git?.deploymentEnabled?.main !== false) {
    throw new ReleaseError("production_release_requires_git_autodeploy_disabled");
  }
}

export function assertCleanWorktree(porcelain) {
  if (String(porcelain ?? "").trim()) {
    throw new ReleaseError("production_release_requires_clean_worktree", String(porcelain).trim());
  }
}

export function assertExactOriginMain(headSha, originMainSha) {
  if (!headSha || headSha !== originMainSha) {
    throw new ReleaseError(
      "production_release_requires_exact_origin_main",
      JSON.stringify({ headSha, originMainSha }),
    );
  }
}

export function assertRequiredProductionEnv(payload, required = REQUIRED_PRODUCTION_ENV) {
  if (!payload || !Array.isArray(payload.envs)) {
    throw new ReleaseError("production_release_environment_unreadable");
  }
  const missing = required.filter((key) => {
    const rows = payload.envs.filter(
      (row) => row?.key === key && Array.isArray(row.target) && row.target.includes("production"),
    );
    return rows.length !== 1;
  });
  if (missing.length) {
    throw new ReleaseError("production_release_environment_missing_or_ambiguous", missing.join(","));
  }
}

export function parseLiveBuildId(versionJsonText) {
  try {
    const buildId = String(JSON.parse(versionJsonText)?.buildId ?? "").trim();
    return /^[0-9a-f]{40}$/.test(buildId) ? buildId : null;
  } catch {
    return null;
  }
}

export function lastDeploymentUrl(stdout) {
  const urls = String(stdout ?? "").match(/https:\/\/[^\s]+\.vercel\.app/g);
  return urls?.at(-1) ?? null;
}

async function fetchLiveBuildId(deps) {
  const text = await deps.fetchText(`${PRODUCTION_AUTHORITY.productionOrigin}/version.json`);
  return parseLiveBuildId(text);
}

// The live bundle must embed the pinned Convex URL: this is the only way to
// prove the web build is paired with the production backend.
async function liveBundleUsesProductionBackend(deps) {
  const origin = PRODUCTION_AUTHORITY.productionOrigin;
  const host = new URL(PRODUCTION_AUTHORITY.convexUrl).host;
  const html = await deps.fetchText(`${origin}/`);
  const entry = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!entry) return false;
  const entryText = await deps.fetchText(`${origin}${entry}`);
  if (entryText.includes(host)) return true;
  const chunks = [...new Set(entryText.match(/assets\/[A-Za-z0-9_-]+\.js/g) ?? [])]
    .slice(0, MAX_BUNDLE_CHUNKS_SCANNED);
  for (const chunk of chunks) {
    if ((await deps.fetchText(`${origin}/${chunk}`)).includes(host)) return true;
  }
  return false;
}

function vercelEnv(env) {
  return {
    ...env,
    VERCEL_ORG_ID: PRODUCTION_AUTHORITY.vercelOrgId,
    VERCEL_PROJECT_ID: PRODUCTION_AUTHORITY.vercelProjectId,
  };
}

function vercelArgs(...args) {
  return [...VERCEL_CLI, ...args, "--scope", PRODUCTION_AUTHORITY.vercelOrgId];
}

async function inspectProductionDeployment(deps, target) {
  const text = deps.capture(
    "npx",
    vercelArgs("inspect", target, "--format", "json"),
    vercelEnv(deps.env),
  );
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ReleaseError("production_release_deployment_unreadable", target);
  }
  return {
    id: String(parsed?.id ?? ""),
    url: parsed?.url ? `https://${parsed.url}` : null,
    name: String(parsed?.name ?? ""),
    target: String(parsed?.target ?? ""),
    readyState: String(parsed?.readyState ?? ""),
  };
}

// Guards, gate, and preflight. Shared by release and verify; never deploys.
async function verifyCandidate(deps, options) {
  const evidence = { authority: PRODUCTION_AUTHORITY, stages: [] };
  const stage = (id, detail = {}) => {
    evidence.stages.push({ id, at: new Date(deps.now()).toISOString(), ...detail });
    deps.log({ stage: id, ...detail });
  };

  assertAutodeployDisabled(deps.readJson("vercel.json"));
  assertCleanWorktree(deps.git(["status", "--porcelain=v1", "--untracked-files=all"]));
  deps.git(["fetch", "origin", "refs/heads/main:refs/remotes/origin/main"]);
  const headSha = deps.git(["rev-parse", "HEAD"]);
  assertExactOriginMain(headSha, deps.git(["rev-parse", "refs/remotes/origin/main"]));
  evidence.headSha = headSha;
  stage("guards", { headSha });

  const liveSha = await fetchLiveBuildId(deps);
  if (!liveSha) throw new ReleaseError("production_release_live_build_unreadable");
  if (!deps.gitOk(["cat-file", "-e", `${liveSha}^{commit}`])) {
    throw new ReleaseError("production_release_live_build_unknown", liveSha);
  }
  if (liveSha === headSha && !options.allowSameBuild) {
    throw new ReleaseError("production_release_already_live", headSha);
  }
  if (!deps.gitOk(["merge-base", "--is-ancestor", liveSha, headSha])) {
    throw new ReleaseError("production_release_would_regress", JSON.stringify({ liveSha, headSha }));
  }
  evidence.previousLiveSha = liveSha;
  stage("no_regress", { liveSha });

  deps.run("npm", [
    "run", "release:gate", "--",
    "--mode=ci", `--sha=${headSha}`, "--evidence=artifacts/release-gate.json",
  ], deps.env);
  stage("release_gate", { evidence: "artifacts/release-gate.json" });

  const releaseEnv = { ...deps.env, CONVEX_DEPLOYMENT: PRODUCTION_AUTHORITY.convexDeployment };
  deps.run("npx", vercelArgs("project", "inspect", PRODUCTION_AUTHORITY.vercelProjectId, "--non-interactive"), vercelEnv(deps.env));
  let envPayload;
  try {
    envPayload = JSON.parse(deps.capture("npx", vercelArgs(
      "env", "ls", "production",
      "--project", PRODUCTION_AUTHORITY.vercelProjectId,
      "--format", "json", "--non-interactive",
    ), vercelEnv(deps.env)));
  } catch {
    throw new ReleaseError("production_release_environment_unreadable");
  }
  assertRequiredProductionEnv(envPayload);
  deps.run("npm", ["run", "smoke:workspace-credit-accounting-prod-data"], releaseEnv);
  const previous = await inspectProductionDeployment(deps, PRODUCTION_AUTHORITY.productionOrigin);
  if (previous.name !== PRODUCTION_AUTHORITY.vercelProjectName || !previous.id.startsWith("dpl_")) {
    throw new ReleaseError("production_release_current_deployment_unexpected", JSON.stringify(previous));
  }
  evidence.rollbackDeployment = previous;
  stage("preflight", { rollbackDeploymentId: previous.id });
  return { evidence, headSha, releaseEnv };
}

async function waitForLiveBuild(deps, expectedSha, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await fetchLiveBuildId(deps)) === expectedSha) return true;
    await deps.sleep(LIVE_POLL_INTERVAL_MS);
  }
  return false;
}

export async function runProductionRelease(deps, options = {}) {
  const { evidence, headSha, releaseEnv } = await verifyCandidate(deps, options);
  if (options.verifyOnly) {
    return { ...evidence, status: "verified" };
  }
  const stage = (id, detail = {}) => {
    evidence.stages.push({ id, at: new Date(deps.now()).toISOString(), ...detail });
    deps.log({ stage: id, ...detail });
  };

  // Backend first: the new Convex surface must be live before any client that
  // could call it. Backward compatibility with the previous web is the author's
  // obligation (see docs/alpha-release-workflow.md).
  deps.run("npx", ["convex", "deploy", "--yes", "--typecheck", "enable"], releaseEnv);
  stage("convex_deployed", { deployment: PRODUCTION_AUTHORITY.convexDeployment });

  const deployOutput = deps.capture("npx", vercelArgs(
    "deploy", "--prod", "--non-interactive", "--archive=tgz",
    "--build-env", `VITE_POLYNET_BUILD_ID=${headSha}`,
    "--build-env", `SENTRY_RELEASE=${headSha}`,
    "--build-env", `GIT_COMMIT_SHA=${headSha}`,
  ), vercelEnv(releaseEnv));
  const deploymentUrl = lastDeploymentUrl(deployOutput);
  if (!deploymentUrl) throw new ReleaseError("production_release_deployment_url_missing");
  evidence.deploymentUrl = deploymentUrl;
  stage("web_deployed", { deploymentUrl });

  let live = await waitForLiveBuild(deps, headSha, LIVE_POLL_ATTEMPTS_BEFORE_PROMOTE);
  if (!live) {
    // After an instant rollback Vercel stops auto-assigning production domains
    // until a deployment is promoted explicitly.
    deps.run("npx", vercelArgs("promote", deploymentUrl, "--yes"), vercelEnv(releaseEnv));
    stage("web_promoted", { deploymentUrl });
    live = await waitForLiveBuild(deps, headSha, LIVE_POLL_ATTEMPTS_AFTER_PROMOTE);
  }
  if (!live) {
    throw new ReleaseError(
      "production_release_not_live",
      `rollback with: npm run release:rollback -- ${evidence.rollbackDeployment.id}`,
    );
  }
  if (!(await liveBundleUsesProductionBackend(deps))) {
    throw new ReleaseError(
      "production_release_backend_mismatch",
      `live bundle does not reference ${PRODUCTION_AUTHORITY.convexUrl}; rollback with: npm run release:rollback -- ${evidence.rollbackDeployment.id}`,
    );
  }
  stage("live_verified", { buildId: headSha, convexUrl: PRODUCTION_AUTHORITY.convexUrl });
  return { ...evidence, status: "released" };
}

// Web-only rollback to a recorded production deployment of this project.
// Convex is never rolled back automatically; schema changes may not reverse.
export async function runProductionRollback(deps, target) {
  const requested = String(target ?? "").trim();
  if (!/^dpl_[A-Za-z0-9]+$/.test(requested) && !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(requested)) {
    throw new ReleaseError("production_rollback_target_invalid", requested);
  }
  const deployment = await inspectProductionDeployment(deps, requested);
  if (
    deployment.name !== PRODUCTION_AUTHORITY.vercelProjectName ||
    deployment.target !== "production" ||
    deployment.readyState !== "READY"
  ) {
    throw new ReleaseError("production_rollback_target_not_eligible", JSON.stringify(deployment));
  }
  const beforeSha = await fetchLiveBuildId(deps);
  deps.run("npx", vercelArgs("rollback", deployment.id, "--yes", "--timeout", "5m"), vercelEnv(deps.env));
  for (let attempt = 0; attempt < LIVE_POLL_ATTEMPTS_BEFORE_PROMOTE; attempt += 1) {
    const liveSha = await fetchLiveBuildId(deps);
    if (liveSha && liveSha !== beforeSha) {
      return { status: "rolled_back", deployment, beforeSha, liveSha };
    }
    await deps.sleep(LIVE_POLL_INTERVAL_MS);
  }
  throw new ReleaseError("production_rollback_not_live", JSON.stringify({ beforeSha, deployment }));
}

export function renderReleaseReceipt(result) {
  const lines = [
    `# Production release ${result.headSha}`,
    "",
    `- Status: ${result.status}`,
    `- Released origin/main SHA: ${result.headSha}`,
    `- Previous live SHA: ${result.previousLiveSha}`,
    `- Convex: ${PRODUCTION_AUTHORITY.convexDeployment}`,
    `- Vercel project: ${PRODUCTION_AUTHORITY.vercelProjectName} (${PRODUCTION_AUTHORITY.vercelProjectId})`,
    `- Deployment: ${result.deploymentUrl ?? "n/a"}`,
    `- Rollback target: ${result.rollbackDeployment?.id ?? "n/a"} (${result.rollbackDeployment?.url ?? "n/a"})`,
    `  - \`npm run release:rollback -- ${result.rollbackDeployment?.id ?? "<deployment-id>"}\` (web only; Convex is not rolled back)`,
    "",
    "## Stages",
    "",
    ...result.stages.map((stage) => `- ${stage.at} ${stage.id}`),
    "",
    "## Post-release smoke (fill in)",
    "",
    "- [ ] Auth/session bootstrap",
    "- [ ] Changed surface verified",
    "",
  ];
  return lines.join("\n");
}
