import { describe, expect, it } from "vitest";
import {
  assertMainRef,
  assertNoForbiddenConvexProdEnv,
  requireDeploySecrets,
  runCloudProductionDeploy,
} from "./deploy_production_ci.mjs";
import { PRODUCTION_AUTHORITY } from "./lib/releaseProduction.mjs";

const SHA = "a".repeat(40);
const PREV_SHA = "b".repeat(40);
const NEWER_SHA = "c".repeat(40);

describe("cloud production deploy pipeline", () => {
  it("refuses to deploy any ref other than refs/heads/main", () => {
    expect(() => assertMainRef({})).toThrow(/production_deploy_non_main_ref/);
    expect(() => assertMainRef({ GITHUB_REF: "refs/heads/claude/feature" })).toThrow(
      /production_deploy_non_main_ref/,
    );
    expect(() => assertMainRef({ GITHUB_REF: "refs/heads/main" })).not.toThrow();
  });

  it("fails closed when required deploy secrets are missing or target the wrong Convex deployment", () => {
    expect(() => requireDeploySecrets({})).toThrow(/CONVEX_DEPLOY_KEY, VERCEL_TOKEN/);
    expect(() => requireDeploySecrets({ CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|key" })).toThrow(/VERCEL_TOKEN/);
    expect(() =>
      requireDeploySecrets({ CONVEX_DEPLOY_KEY: "prod:quick-porcupine-949|staging-key", VERCEL_TOKEN: "v_tok" }),
    ).toThrow(/production_deploy_wrong_convex_target/);
    expect(requireDeploySecrets({ CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|key", VERCEL_TOKEN: "v_tok" })).toEqual({
      convexDeployKey: "prod:wry-hawk-715|key",
      vercelToken: "v_tok",
    });
  });

  it("blocks forbidden staging-only Convex env vars in production", () => {
    expect(() => assertNoForbiddenConvexProdEnv("OPENAI_API_KEY=redacted\nPOLYNET_ALLOW_SEED=true\n")).toThrow(
      /production_release_settings_forbidden/,
    );
    expect(() => assertNoForbiddenConvexProdEnv("OPENAI_API_KEY=redacted\n")).not.toThrow();
  });

  it("rejects stale main commits (HEAD != origin/main) before any mutation", async () => {
    let mutated = false;
    await expect(
      runCloudProductionDeploy({
        env: {
          GITHUB_REF: "refs/heads/main",
          CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|secret",
          VERCEL_TOKEN: "vercel_secret",
        },
        sleep: async () => {},
        log: () => {},
        git: (args: string[]) => (args[1] === "HEAD" ? SHA : NEWER_SHA),
        gitOk: () => true,
        run: () => {
          mutated = true;
        },
        capture: () => {
          mutated = true;
          return "";
        },
        fetchText: async () => JSON.stringify({ buildId: PREV_SHA }),
      }),
    ).rejects.toThrow(/production_release_requires_exact_origin_main/);
    expect(mutated).toBe(false);
  });

  it("rejects commits that would regress the currently live production build", async () => {
    let mutated = false;
    await expect(
      runCloudProductionDeploy({
        env: {
          GITHUB_REF: "refs/heads/main",
          CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|secret",
          VERCEL_TOKEN: "vercel_secret",
        },
        sleep: async () => {},
        log: () => {},
        git: () => SHA,
        gitOk: (args: string[]) => args[0] === "cat-file",
        run: () => {
          mutated = true;
        },
        capture: () => {
          mutated = true;
          return "";
        },
        fetchText: async () => JSON.stringify({ buildId: PREV_SHA }),
      }),
    ).rejects.toThrow(/production_release_would_regress/);
    expect(mutated).toBe(false);
  });

  it("returns already_live without mutating production when HEAD is already live", async () => {
    let mutated = false;
    const result = await runCloudProductionDeploy({
      env: {
        GITHUB_REF: "refs/heads/main",
        CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|secret",
        VERCEL_TOKEN: "vercel_secret",
      },
      sleep: async () => {},
      log: () => {},
      git: () => SHA,
      gitOk: () => true,
      run: () => {
        mutated = true;
      },
      capture: () => {
        mutated = true;
        return "";
      },
      fetchText: async () => JSON.stringify({ buildId: SHA }),
    });
    expect(result.status).toBe("already_live");
    expect(mutated).toBe(false);
  });

  it("runs preflight, deploys Convex first, deploys Vercel second, and proves live build + backend host", async () => {
    const order: string[] = [];
    const convexHost = new URL(PRODUCTION_AUTHORITY.convexUrl).host;
    let deployed = false;

    const result = await runCloudProductionDeploy({
      env: {
        GITHUB_REF: "refs/heads/main",
        CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|secret",
        VERCEL_TOKEN: "vercel_secret",
        GITHUB_SHA: SHA,
      },
      sleep: async () => {},
      log: (entry: { stage: string }) => order.push(entry.stage),
      git: () => SHA,
      gitOk: () => true,
      run: (_cmd: string, args: string[]) => {
        order.push(`run:${args.slice(0, 2).join(" ")}`);
      },
      capture: (_cmd: string, args: string[]) => {
        if (args.includes("env") && args.includes("ls")) {
          return JSON.stringify({
            envs: [
              { key: "VITE_CONVEX_URL", target: ["production"] },
              { key: "VITE_PUBLIC_APP_URL", target: ["production"] },
              { key: "ARX_AUTH_BRIDGE_SECRET", target: ["production"] },
            ],
          });
        }
        if (args[0] === "convex" && args[1] === "env") {
          return "OPENAI_API_KEY=redacted\n";
        }
        if (args.includes("inspect")) {
          return JSON.stringify({ id: "dpl_prev123" });
        }
        if (args.includes("deploy")) {
          deployed = true;
          order.push("capture:vercel-deploy");
          return "https://polynet-abc123.vercel.app\n";
        }
        return "";
      },
      fetchText: async (url: string) => {
        if (url.endsWith("/version.json")) return JSON.stringify({ buildId: deployed ? SHA : PREV_SHA });
        if (url.endsWith("/")) return `<script src="/assets/index-abc.js"></script>`;
        if (url.includes("/assets/index-abc.js")) return `const u = "https://${convexHost}";`;
        return "";
      },
    });

    expect(result).toEqual({
      status: "released",
      headSha: SHA,
      deploymentUrl: "https://polynet-abc123.vercel.app",
      rollbackDeploymentId: "dpl_prev123",
    });
    expect(order).toEqual([
      "preflight",
      "run:convex deploy",
      "convex_deployed",
      "capture:vercel-deploy",
      "web_deployed",
      "live_verified",
    ]);
  });

  it("retries live bundle verification across transient edge switchover 404s", async () => {
    const convexHost = new URL(PRODUCTION_AUTHORITY.convexUrl).host;
    let deployed = false;
    let htmlFetches = 0;

    const result = await runCloudProductionDeploy({
      env: {
        GITHUB_REF: "refs/heads/main",
        CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|secret",
        VERCEL_TOKEN: "vercel_secret",
      },
      sleep: async () => {},
      log: () => {},
      git: () => SHA,
      gitOk: () => true,
      run: () => {},
      capture: (_cmd: string, args: string[]) => {
        if (args.includes("env") && args.includes("ls")) {
          return JSON.stringify({
            envs: [
              { key: "VITE_CONVEX_URL", target: ["production"] },
              { key: "VITE_PUBLIC_APP_URL", target: ["production"] },
              { key: "ARX_AUTH_BRIDGE_SECRET", target: ["production"] },
            ],
          });
        }
        if (args[0] === "convex" && args[1] === "env") return "OPENAI_API_KEY=redacted\n";
        if (args.includes("inspect")) return JSON.stringify({ id: "dpl_prev123" });
        if (args.includes("deploy")) {
          deployed = true;
          return "https://polynet-abc123.vercel.app\n";
        }
        return "";
      },
      fetchText: async (url: string) => {
        if (url.endsWith("/version.json")) return JSON.stringify({ buildId: deployed ? SHA : PREV_SHA });
        if (url.endsWith("/")) {
          htmlFetches += 1;
          return htmlFetches === 1
            ? `<script src="/assets/index-stale.js"></script>`
            : `<script src="/assets/index-fresh.js"></script>`;
        }
        if (url.includes("/assets/index-stale.js")) {
          throw new Error("production_deploy_fetch_failed: 404");
        }
        if (url.includes("/assets/index-fresh.js")) {
          return `const u = "https://${convexHost}";`;
        }
        return "";
      },
    });

    expect(htmlFetches).toBe(2);
    expect(result.status).toBe("released");
  });
});
