import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

// Deliberately no deployment, prompt, run-id, or repeat flags.
const path = "artifacts/workflow-assessment-smoke-20260907-v1.json";
if (existsSync(path)) throw new Error(`Existing report at ${path}; do not rerun paid tests automatically.`);
const env = { ...process.env, CONVEX_DEPLOYMENT: "dev:quick-porcupine-949" };
delete env.CONVEX_DEPLOY_KEY;
delete env.CONVEX_SELF_HOSTED_URL;
delete env.CONVEX_SELF_HOSTED_ADMIN_KEY;
const result = spawnSync("npx", ["convex", "run", "workflowAssessmentSmoke:runInternal", "{}"], { env, encoding: "utf8", timeout: 180_000, maxBuffer: 2_000_000 });
mkdirSync("artifacts", { recursive: true });
const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
let report;
try { report = JSON.parse(result.stdout); } catch { report = { passed: false, output: result.stdout, error: result.stderr || String(result.error ?? "No JSON report") }; }
writeFileSync(path, JSON.stringify({ sha, recordedAt: new Date().toISOString(), ...report }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ report: path, passed: report.passed, cases: report.cases?.map(c => ({ key: c.key, expected: c.expected, actual: c.assessment.verdict, costMicros: c.costMicros })), error: report.error }, null, 2));
if (result.status !== 0 || !report.passed) process.exitCode = 1;
