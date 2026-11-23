import { describe, expect, it } from "vitest";
import {
  assertNoForbiddenConvexProdEnv,
  requireDeploySecrets,
  runCloudProductionDeploy,
} from "./deploy_production_ci.mjs";
import { PRODUCTION_AUTHORITY } from "./lib/releaseProduction.mjs";

const SHA = "a".repeat(40);

describe("cloud production deploy pipeline", () => {
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

  it("runs preflight, deploys Convex first, deploys Vercel second, and proves live build + backend host", async () => {
    const order: string[] = [];
    const convexHost = new URL(PRODUCTION_AUTHORITY.convexUrl).host;

    const result = await runCloudProductionDeploy({
      env: {
        CONVEX_DEPLOY_KEY: "prod:wry-hawk-715|secret",
        VERCEL_TOKEN: "vercel_secret",
        GITHUB_SHA: SHA,
      },
      sleep: async () => {},
      log: (entry: { stage: string }) => order.push(entry.stage),
      git: () => SHA,
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
          order.push("capture:vercel-deploy");
          return "https://polynet-abc123.vercel.app\n";
        }
        return "";
      },
      fetchText: async (url: string) => {
        if (url.endsWith("/version.json")) return JSON.stringify({ buildId: SHA });
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
});
