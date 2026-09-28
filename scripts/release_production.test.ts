import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  PRODUCTION_AUTHORITY,
  assertAutodeployDisabled,
  assertCleanWorktree,
  assertExactOriginMain,
  assertRequiredProductionEnv,
  lastDeploymentUrl,
  parseLiveBuildId,
  runProductionRelease,
  runProductionRollback,
} from "./lib/releaseProduction.mjs";

const HEAD = "a".repeat(40);
const LIVE = "b".repeat(40);
const OTHER = "c".repeat(40);
const origin = PRODUCTION_AUTHORITY.productionOrigin;
const convexHost = new URL(PRODUCTION_AUTHORITY.convexUrl).host;

type Call = { kind: string; command: string; args: string[]; env?: Record<string, string> };

function fakeDeps(overrides: {
  porcelain?: string;
  originMain?: string;
  liveBuilds?: string[];
  ancestor?: boolean;
  knownLive?: boolean;
  bundleHasBackend?: boolean;
  failOn?: string;
  vercelJson?: unknown;
  deployment?: Record<string, string>;
} = {}) {
  const calls: Call[] = [];
  const liveBuilds = [...(overrides.liveBuilds ?? [LIVE, HEAD])];
  let lastLive = liveBuilds[0];
  const deps = {
    env: { PATH: "/usr/bin" },
    now: () => 0,
    sleep: async () => undefined,
    log: () => undefined,
    readJson: () => overrides.vercelJson ?? { git: { deploymentEnabled: { main: false } } },
    git: (args: string[]) => {
      calls.push({ kind: "git", command: "git", args });
      if (args[0] === "status") return overrides.porcelain ?? "";
      if (args[0] === "rev-parse" && args[1] === "HEAD") return HEAD;
      if (args[0] === "rev-parse") return overrides.originMain ?? HEAD;
      return "";
    },
    gitOk: (args: string[]) => {
      if (args[0] === "cat-file") return overrides.knownLive ?? true;
      if (args[0] === "merge-base") return overrides.ancestor ?? true;
      return true;
    },
    run: (command: string, args: string[], env: Record<string, string>) => {
      calls.push({ kind: "run", command, args, env });
      const joined = `${command} ${args.join(" ")}`;
      if (overrides.failOn && joined.includes(overrides.failOn)) throw new Error(`failed: ${joined}`);
    },
    capture: (command: string, args: string[], env: Record<string, string>) => {
      calls.push({ kind: "capture", command, args, env });
      if (args.includes("env")) {
        return JSON.stringify({
          envs: ["VITE_CONVEX_URL", "VITE_PUBLIC_APP_URL", "ARX_AUTH_BRIDGE_SECRET"].map((key) => ({
            key, target: ["production"], type: "encrypted",
          })),
        });
      }
      if (args.includes("inspect")) {
        return JSON.stringify(overrides.deployment ?? {
          id: "dpl_previous", url: "polynet-prev.vercel.app", name: "polynet",
          target: "production", readyState: "READY",
        });
      }
      if (args.includes("deploy")) return "Inspect: x\nhttps://polynet-new-neil-mcds-projects.vercel.app\n";
      return "";
    },
    fetchText: async (url: string) => {
      if (url.endsWith("/version.json")) {
        if (liveBuilds.length) lastLive = liveBuilds.shift()!;
        return JSON.stringify({ buildId: lastLive });
      }
      if (url === `${origin}/`) return '<script src="/assets/index-Abc123.js"></script>';
      if (url.endsWith("index-Abc123.js")) {
        return overrides.bundleHasBackend === false ? "no backend here" : `x="https://${convexHost}"`;
      }
      return "";
    },
  };
  return { deps, calls };
}

function commandOrder(calls: Call[]): string[] {
  return calls
    .filter((call) => call.kind !== "git")
    .map((call) => {
      const text = `${call.command} ${call.args.join(" ")}`;
      if (text.includes("release:gate")) return "gate";
      if (text.includes("smoke:workspace-credit")) return "accounting_smoke";
      if (text.includes("convex deploy")) return "convex_deploy";
      if (text.includes(" deploy --prod")) return "vercel_deploy";
      if (text.includes(" promote ")) return "vercel_promote";
      if (text.includes(" rollback ")) return "vercel_rollback";
      if (text.includes(" env ls")) return "vercel_env";
      if (text.includes("project inspect")) return "vercel_project";
      if (text.includes(" inspect ")) return "vercel_inspect";
      return text;
    });
}

describe("production release guards", () => {
  test("git autodeploy from main must be disabled", () => {
    expect(() => assertAutodeployDisabled({})).toThrow("production_release_requires_git_autodeploy_disabled");
    expect(() => assertAutodeployDisabled({ git: { deploymentEnabled: { main: true } } })).toThrow();
    expect(() => assertAutodeployDisabled({ git: { deploymentEnabled: { main: false } } })).not.toThrow();
  });

  test("the repository's own vercel.json keeps git autodeploy from main disabled", () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, "../vercel.json"), "utf8"));
    expect(() => assertAutodeployDisabled(config)).not.toThrow();
  });

  test("worktree must be clean and HEAD must be exactly origin/main", () => {
    expect(() => assertCleanWorktree(" M convex/schema.ts")).toThrow("production_release_requires_clean_worktree");
    expect(() => assertCleanWorktree("")).not.toThrow();
    expect(() => assertExactOriginMain(HEAD, OTHER)).toThrow("production_release_requires_exact_origin_main");
    expect(() => assertExactOriginMain(HEAD, HEAD)).not.toThrow();
  });

  test("required production env must exist exactly once for production", () => {
    const row = (key: string) => ({ key, target: ["production"] });
    expect(() => assertRequiredProductionEnv(null)).toThrow("production_release_environment_unreadable");
    expect(() => assertRequiredProductionEnv({ envs: [row("VITE_CONVEX_URL")] }))
      .toThrow("production_release_environment_missing_or_ambiguous");
    expect(() => assertRequiredProductionEnv({
      envs: [row("VITE_CONVEX_URL"), row("VITE_CONVEX_URL"), row("VITE_PUBLIC_APP_URL"), row("ARX_AUTH_BRIDGE_SECRET")],
    })).toThrow("VITE_CONVEX_URL");
  });

  test("build ids and deployment urls are parsed strictly", () => {
    expect(parseLiveBuildId(JSON.stringify({ buildId: HEAD }))).toBe(HEAD);
    expect(parseLiveBuildId(JSON.stringify({ buildId: "production-abc" }))).toBeNull();
    expect(parseLiveBuildId("<html>")).toBeNull();
    expect(lastDeploymentUrl("a\nhttps://x-1.vercel.app\nhttps://polynet-2.vercel.app\n"))
      .toBe("https://polynet-2.vercel.app");
  });
});

describe("production release flow", () => {
  test("verify runs guards, gate, and preflight but never deploys", async () => {
    const { deps, calls } = fakeDeps();
    const result = await runProductionRelease(deps, { verifyOnly: true });
    expect(result.status).toBe("verified");
    expect(commandOrder(calls)).toEqual([
      "gate", "vercel_project", "vercel_env", "accounting_smoke", "vercel_inspect",
    ]);
    expect(result.rollbackDeployment.id).toBe("dpl_previous");
  });

  test("release deploys Convex before the web app, with pinned authority, then proves the live result", async () => {
    const { deps, calls } = fakeDeps();
    const result = await runProductionRelease(deps, {});
    expect(result.status).toBe("released");
    expect(commandOrder(calls)).toEqual([
      "gate", "vercel_project", "vercel_env", "accounting_smoke", "vercel_inspect",
      "convex_deploy", "vercel_deploy",
    ]);
    const convex = calls.find((call) => call.args.includes("convex"))!;
    expect(convex.env?.CONVEX_DEPLOYMENT).toBe(PRODUCTION_AUTHORITY.convexDeployment);
    const web = calls.find((call) => call.args.includes("--prod"))!;
    expect(web.env?.VERCEL_PROJECT_ID).toBe(PRODUCTION_AUTHORITY.vercelProjectId);
    expect(web.env?.VERCEL_ORG_ID).toBe(PRODUCTION_AUTHORITY.vercelOrgId);
    expect(web.args).toContain(`VITE_POLYNET_BUILD_ID=${HEAD}`);
    expect(result.deploymentUrl).toBe("https://polynet-new-neil-mcds-projects.vercel.app");
    expect(result.stages.map((stage: { id: string }) => stage.id)).toEqual([
      "guards", "no_regress", "release_gate", "preflight", "convex_deployed", "web_deployed", "live_verified",
    ]);
  });

  test.each([
    ["dirty worktree", { porcelain: "?? scratch.txt" }, "production_release_requires_clean_worktree"],
    ["HEAD behind origin/main", { originMain: OTHER }, "production_release_requires_exact_origin_main"],
    ["autodeploy enabled", { vercelJson: {} }, "production_release_requires_git_autodeploy_disabled"],
    ["live build not an ancestor", { ancestor: false }, "production_release_would_regress"],
    ["live build unknown locally", { knownLive: false }, "production_release_live_build_unknown"],
    ["candidate already live", { liveBuilds: [HEAD] }, "production_release_already_live"],
  ])("%s stops the release before any deploy", async (_label, overrides, code) => {
    const { deps, calls } = fakeDeps(overrides);
    await expect(runProductionRelease(deps, {})).rejects.toThrow(code);
    expect(commandOrder(calls)).not.toContain("convex_deploy");
    expect(commandOrder(calls)).not.toContain("vercel_deploy");
  });

  test("a failing release gate stops before any deploy", async () => {
    const { deps, calls } = fakeDeps({ failOn: "release:gate" });
    await expect(runProductionRelease(deps, {})).rejects.toThrow();
    expect(commandOrder(calls)).toEqual(["gate"]);
  });

  test("a failing Convex deploy never reaches the web deploy", async () => {
    const { deps, calls } = fakeDeps({ failOn: "convex deploy" });
    await expect(runProductionRelease(deps, {})).rejects.toThrow();
    expect(commandOrder(calls)).not.toContain("vercel_deploy");
  });

  test("an unassigned production domain is promoted once, then must converge", async () => {
    const { deps, calls } = fakeDeps({ liveBuilds: [LIVE, ...Array(12).fill(LIVE), HEAD] });
    const result = await runProductionRelease(deps, {});
    expect(result.status).toBe("released");
    expect(commandOrder(calls).filter((step) => step === "vercel_promote")).toHaveLength(1);
  });

  test("a live bundle that is not paired with the production backend fails with a rollback hint", async () => {
    const { deps } = fakeDeps({ bundleHasBackend: false });
    await expect(runProductionRelease(deps, {})).rejects.toThrow(
      /production_release_backend_mismatch.*release:rollback -- dpl_previous/,
    );
  });
});

describe("production rollback", () => {
  test("rolls the web back to a recorded production deployment of this project", async () => {
    const { deps, calls } = fakeDeps({ liveBuilds: [HEAD, LIVE] });
    const result = await runProductionRollback(deps, "dpl_previous");
    expect(result).toMatchObject({ status: "rolled_back", beforeSha: HEAD, liveSha: LIVE });
    expect(commandOrder(calls)).toEqual(["vercel_inspect", "vercel_rollback"]);
    expect(commandOrder(calls)).not.toContain("convex_deploy");
  });

  test.each([
    ["malformed target", "polynet-prev", undefined, "production_rollback_target_invalid"],
    ["another project", "dpl_x", { id: "dpl_x", name: "other", target: "production", readyState: "READY" }, "production_rollback_target_not_eligible"],
    ["a preview deployment", "dpl_x", { id: "dpl_x", name: "polynet", target: "preview", readyState: "READY" }, "production_rollback_target_not_eligible"],
  ])("refuses %s", async (_label, target, deployment, code) => {
    const { deps, calls } = fakeDeps({ deployment });
    await expect(runProductionRollback(deps, target)).rejects.toThrow(code);
    expect(commandOrder(calls)).not.toContain("vercel_rollback");
  });
});
