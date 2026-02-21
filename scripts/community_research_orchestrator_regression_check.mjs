import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCommunityResearchQueryPlan } from "../supabase/functions/_shared/community_research_orchestrator.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    fail(`${message}: expected=${b} actual=${a}`);
  }
}

async function main() {
  const fixturePath = path.join(
    repoRoot,
    "shared/contracts/community_research_query_plan_v1.fixtures.json",
  );
  const raw = await fs.readFile(fixturePath, "utf8");
  const fixtures = JSON.parse(raw);
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    fail("community research query-plan fixtures must be a non-empty array");
  }

  for (const fixture of fixtures) {
    const name = String(fixture?.name ?? "").trim() || "query_plan_fixture";
    const query = typeof fixture?.query === "string" ? fixture.query : "";
    const expected = Array.isArray(fixture?.expected) ? fixture.expected : null;
    if (!expected) {
      fail(`[${name}] fixture missing expected array`);
    }
    const actual = buildCommunityResearchQueryPlan(query);
    assertDeepEqual(actual, expected, `[${name}] query plan mismatch`);
    if (actual.length === 0) {
      fail(`[${name}] query plan must produce at least one query`);
    }
    if (actual.length > 3) {
      fail(`[${name}] query plan must be bounded to at most 3 queries`);
    }
  }

  console.log("PASS: community research orchestrator regression checks passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
});
