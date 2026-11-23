// Automated cloud production deploy on merge to main:
//   1. Preflight: verify pinned Vercel env + no forbidden Convex prod env + capture rollback target
//   2. Deploy backend first (Convex prod:wry-hawk-715 via CONVEX_DEPLOY_KEY)
//   3. Deploy web app second (Vercel project polynet via VERCEL_TOKEN)
//   4. Live health check: confirm www.polynet.ai serves this exact SHA + production Convex URL
//
// Runs inside GitHub Actions on push to main (after the PR already passed Release Gate).
import { appendFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_AUTHORITY,
  VERCEL_CLI,
  ReleaseError,
  assertExactOriginMain,
  assertForbiddenProductionEnvAbsent,
  assertRequiredProductionEnv,
  lastDeploymentUrl,
  parseLiveBuildId,
} from "./lib/releaseProduction.mjs";
import { FORBIDDEN_IN_PRODUCTION, settingNames } from "./lib/convexEnvParity.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_POLL_INTERVAL_MS = 10_000;
const LIVE_POLL_ATTEMPTS = 18;
const LIVE_BUNDLE_VERIFY_INTERVAL_MS = 3_000;
const LIVE_BUNDLE_VERIFY_ATTEMPTS = 6;
const MAX_BUNDLE_CHUNKS_SCANNED = 40;

export function requireDeploySecrets(env) {
  const convexDeployKey = String(env.CONVEX_DEPLOY_KEY ?? "").trim();
  const vercelToken = String(env.VERCEL_TOKEN ?? "").trim();
  const missing = [];
  if (!convexDeployKey) missing.push("CONVEX_DEPLOY_KEY");
  if (!vercelToken) missing.push("VERCEL_TOKEN");
  if (missing.length) {
    throw new ReleaseError("production_deploy_secrets_missing", missing.join(", "));
  }
  const deployKeyPrefix = convexDeployKey.includes("|") ? convexDeployKey.split("|")[0] : "";
  if (deployKeyPrefix && deployKeyPrefix !== PRODUCTION_AUTHORITY.convexDeployment) {
    throw new ReleaseError(
      "production_deploy_wrong_convex_target",
      `expected ${PRODUCTION_AUTHORITY.convexDeployment}, got ${deployKeyPrefix}`,
    );
  }
  return { convexDeployKey, vercelToken };
}

export function assertMainRef(env) {
  const ref = String(env.GITHUB_REF ?? "").trim();
  if (ref !== "refs/heads/main") {
    throw new ReleaseError("production_deploy_non_main_ref", ref || "<missing>");
  }
}

export function assertNoForbiddenConvexProdEnv(envListOutput) {
  const names = settingNames(envListOutput);
  const forbidden = FORBIDDEN_IN_PRODUCTION.filter((name) => names.has(name));
  if (forbidden.length) {
    throw new ReleaseError("production_release_settings_forbidden", forbidden.join(","));
  }
}

export async function runCloudProductionDeploy(deps) {
  assertMainRef(deps.env);
  const { convexDeployKey, vercelToken } = requireDeploySecrets(deps.env);

  // Freshness & no-regression guard: reject stale/re-run commits before any mutation.
  deps.git(["fetch", "origin", "refs/heads/main:refs/remotes/origin/main"]);
  const headSha = String(deps.git(["rev-parse", "HEAD"])).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    throw new ReleaseError("production_deploy_invalid_sha", headSha);
  }
  const originMainSha = String(deps.git(["rev-parse", "refs/remotes/origin/main"])).trim().toLowerCase();
  assertExactOriginMain(headSha, originMainSha);

  const liveSha = parseLiveBuildId(await deps.fetchText(`${PRODUCTION_AUTHORITY.productionOrigin}/version.json`));
  if (!liveSha) {
    throw new ReleaseError("production_release_live_build_unreadable");
  }
  if (!deps.gitOk(["cat-file", "-e", `${liveSha}^{commit}`])) {
    throw new ReleaseError("production_release_live_build_unknown", liveSha);
  }
  if (liveSha === headSha) {
    deps.log({ stage: "already_live", headSha });
    return { status: "already_live", headSha, deploymentUrl: null, rollbackDeploymentId: null };
  }
  if (!deps.gitOk(["merge-base", "--is-ancestor", liveSha, headSha])) {
    throw new ReleaseError("production_release_would_regress", JSON.stringify({ liveSha, headSha }));
  }

  const baseEnv = {
    ...deps.env,
    CONVEX_DEPLOY_KEY: convexDeployKey,
    VERCEL_TOKEN: vercelToken,
    VERCEL_ORG_ID: PRODUCTION_AUTHORITY.vercelOrgId,
    VERCEL_PROJECT_ID: PRODUCTION_AUTHORITY.vercelProjectId,
  };
  const vercelArgs = (...args) => [
    ...VERCEL_CLI,
    ...args,
    "--token",
    vercelToken,
    "--scope",
    PRODUCTION_AUTHORITY.vercelOrgId,
  ];

  // 1. Preflight: verify Vercel production env + Convex forbidden settings + rollback target.
  const envPayload = JSON.parse(
    deps.capture(
      "npx",
      vercelArgs("env", "ls", "production", "--project", PRODUCTION_AUTHORITY.vercelProjectId, "--format", "json", "--non-interactive"),
      baseEnv,
    ),
  );
  assertRequiredProductionEnv(envPayload);
  assertForbiddenProductionEnvAbsent(envPayload);

  const convexEnvOut = deps.capture("npx", ["convex", "env", "list"], baseEnv);
  assertNoForbiddenConvexProdEnv(convexEnvOut);

  let rollbackDeploymentId = null;
  try {
    const previous = JSON.parse(
      deps.capture("npx", vercelArgs("inspect", PRODUCTION_AUTHORITY.productionOrigin, "--format", "json"), baseEnv),
    );
    rollbackDeploymentId = String(previous?.id ?? "").trim() || null;
  } catch {
    rollbackDeploymentId = null;
  }
  deps.log({ stage: "preflight", headSha, rollbackDeploymentId });

  // 2. Deploy backend first (Convex).
  deps.run("npx", ["convex", "deploy", "--yes", "--typecheck", "enable"], baseEnv);
  deps.log({ stage: "convex_deployed", deployment: PRODUCTION_AUTHORITY.convexDeployment });

  // 3. Deploy web app second (Vercel).
  const deployOut = deps.capture(
    "npx",
    vercelArgs(
      "deploy",
      "--prod",
      "--non-interactive",
      "--archive=tgz",
      "--build-env",
      `VITE_POLYNET_BUILD_ID=${headSha}`,
      "--build-env",
      `SENTRY_RELEASE=${headSha}`,
      "--build-env",
      `GIT_COMMIT_SHA=${headSha}`,
    ),
    baseEnv,
  );
  const deploymentUrl = lastDeploymentUrl(deployOut);
  if (!deploymentUrl) throw new ReleaseError("production_release_deployment_url_missing");
  deps.log({ stage: "web_deployed", deploymentUrl });

  // 4. Live verification: poll /version.json and confirm production Convex URL is embedded.
  const pollLive = async () => {
    for (let attempt = 0; attempt < LIVE_POLL_ATTEMPTS; attempt += 1) {
      try {
        const versionText = await deps.fetchText(`${PRODUCTION_AUTHORITY.productionOrigin}/version.json`);
        if (parseLiveBuildId(versionText) === headSha) return true;
      } catch {
        // Retry until propagation settles.
      }
      await deps.sleep(LIVE_POLL_INTERVAL_MS);
    }
    return false;
  };

  let live = await pollLive();
  if (!live) {
    deps.run("npx", vercelArgs("promote", deploymentUrl, "--yes"), baseEnv);
    deps.log({ stage: "web_promoted", deploymentUrl });
    live = await pollLive();
  }
  if (!live) {
    throw new ReleaseError(
      "production_release_not_live",
      rollbackDeploymentId ? `rollback target: ${rollbackDeploymentId}` : headSha,
    );
  }

  const origin = PRODUCTION_AUTHORITY.productionOrigin;
  const expectedConvexHost = new URL(PRODUCTION_AUTHORITY.convexUrl).host;
  let backendMatched = false;
  let lastVerifyError = null;
  for (let attempt = 0; attempt < LIVE_BUNDLE_VERIFY_ATTEMPTS; attempt += 1) {
    lastVerifyError = null;
    try {
      const html = await deps.fetchText(`${origin}/`);
      const entry = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
      if (entry) {
        const entryText = await deps.fetchText(`${origin}${entry}`);
        if (entryText.includes(expectedConvexHost)) {
          backendMatched = true;
          break;
        }
        const chunks = [...new Set(entryText.match(/assets\/[A-Za-z0-9_-]+\.js/g) ?? [])].slice(
          0,
          MAX_BUNDLE_CHUNKS_SCANNED,
        );
        for (const chunk of chunks) {
          if ((await deps.fetchText(`${origin}/${chunk}`)).includes(expectedConvexHost)) {
            backendMatched = true;
            break;
          }
        }
        if (backendMatched) break;
      }
    } catch (error) {
      lastVerifyError = error;
    }
    if (attempt + 1 < LIVE_BUNDLE_VERIFY_ATTEMPTS) {
      await deps.sleep(LIVE_BUNDLE_VERIFY_INTERVAL_MS);
    }
  }
  if (!backendMatched) {
    if (lastVerifyError) throw lastVerifyError;
    throw new ReleaseError("production_release_backend_mismatch", expectedConvexHost);
  }

  deps.log({ stage: "live_verified", headSha, deploymentUrl, rollbackDeploymentId });
  return { status: "released", headSha, deploymentUrl, rollbackDeploymentId };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const deps = {
    env: process.env,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    log: (entry) => console.log(`[deploy] ${JSON.stringify(entry)}`),
    git: (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
    gitOk: (args) => spawnSync("git", args, { cwd: root, stdio: "ignore" }).status === 0,
    run: (command, args, env) => {
      const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new ReleaseError("production_deploy_step_failed", `${command} ${args[0] ?? ""}`);
    },
    capture: (command, args, env) => {
      const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new ReleaseError("production_deploy_step_failed", `${command} ${args[0] ?? ""}`);
      return result.stdout;
    },
    fetchText: async (url) => {
      const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
      if (!response.ok) throw new ReleaseError("production_deploy_fetch_failed", `${response.status} ${url}`);
      return await response.text();
    },
  };

  runCloudProductionDeploy(deps)
    .then((result) => {
      if (result.status === "already_live") {
        console.log(`\nPASS: production already live at ${result.headSha} (nothing deployed)`);
        return;
      }
      const summary = [
        `### Production Deploy Live`,
        `- **Commit:** \`${result.headSha}\``,
        `- **Site:** ${PRODUCTION_AUTHORITY.productionOrigin}`,
        `- **Deployment:** ${result.deploymentUrl}`,
        `- **Backend:** \`${PRODUCTION_AUTHORITY.convexDeployment}\``,
        result.rollbackDeploymentId ? `- **Instant rollback target:** \`${result.rollbackDeploymentId}\`` : "",
      ]
        .filter(Boolean)
        .join("\n");
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
      }
      console.log(`\nPASS: production live at ${result.headSha}`);
    })
    .catch((error) => {
      console.error(`\nFAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
