import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_LIMIT = 1_000;

type ConvexRow = Record<string, unknown>;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function readLimit(): number {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith("--limit="))?.slice(8);
  const parsed = Number(raw ?? DEFAULT_LIMIT);
  return Number.isSafeInteger(parsed) && parsed >= 10 && parsed <= 10_000
    ? parsed
    : DEFAULT_LIMIT;
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function loadProductionTable(table: string, limit: number): ConvexRow[] {
  const result = spawnSync(
    "npx",
    ["convex", "data", table, "--prod", "--limit", String(limit), "--format", "json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "convex_data_failed").trim();
    throw new Error(`${table}: ${detail}`);
  }
  const parsed = JSON.parse(String(result.stdout || "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${table}: expected_json_array`);
  return parsed as ConvexRow[];
}

function sourceCompatibility() {
  const schema = read("convex/schema.ts");
  const shim = read("convex/onboardingLifecycle.ts");
  const migration = read("convex/legacyOnboardingMigration.ts");
  return {
    cachedClientKickoffShim:
      shim.includes("requestOnboardingGuideKickoff") &&
      shim.includes("ensureMemberAgentGlobalChannel") &&
      shim.includes('compatibility_route: "member_agent_global_channel"'),
    legacyCommunityFieldValidator:
      schema.includes("Deprecated release-compatibility field") &&
      schema.includes("memberOnboarding: v.optional"),
    legacyActivationTableValidator:
      schema.includes("Deprecated release-compatibility table") &&
      schema.includes("agentLifecycleActivations: defineTable"),
    boundedCleanup:
      migration.includes("MAX_BATCH_SIZE = 100") &&
      migration.includes("clearCommunityMemberOnboardingPageInternal") &&
      migration.includes("deleteAgentLifecycleActivationsPageInternal"),
  };
}

function main(): void {
  if (!hasFlag("--prod")) {
    throw new Error("Refusing to run without explicit --prod; this preflight is read-only.");
  }
  const limit = readLimit();
  const communities = loadProductionTable("communities", limit);
  const activations = loadProductionTable("agentLifecycleActivations", limit);
  const threads = loadProductionTable("threads", limit);
  const truncatedTables = [
    ["communities", communities.length],
    ["agentLifecycleActivations", activations.length],
    ["threads", threads.length],
  ].filter(([, count]) => count >= limit).map(([name]) => name);
  const compatibility = sourceCompatibility();
  const legacy = {
    communityMemberOnboardingRows: communities.filter(
      (row) => row.memberOnboarding !== undefined,
    ).length,
    activationRows: activations.length,
    dedicatedOnboardingThreads: threads.filter((row) =>
      String(row.threadKey ?? "").startsWith("community-onboarding:"),
    ).length,
  };
  const compatibilityReady = Object.values(compatibility).every(Boolean);
  const historicalThreadReviewRequired = legacy.dedicatedOnboardingThreads > 0;
  const ok =
    truncatedTables.length === 0 &&
    compatibilityReady &&
    !historicalThreadReviewRequired;
  console.log(JSON.stringify({
    ok,
    readOnly: true,
    target: "production",
    sourceCompatibility: compatibility,
    legacyData: legacy,
    historicalThreadReviewRequired,
    scan: {
      limit,
      truncatedTables,
      counts: {
        communities: communities.length,
        agentLifecycleActivations: activations.length,
        threads: threads.length,
      },
    },
    nextAction: ok
      ? "deploy_compatibility_backend_before_web_then_run_bounded_cleanup_after_cached_client_window"
      : historicalThreadReviewRequired
        ? "stop_release_and_review_dedicated_onboarding_thread_history_before_cleanup"
        : "stop_release_and_restore_complete_compatibility_or_increase_scan_limit",
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main();
