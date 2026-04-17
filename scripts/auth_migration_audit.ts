import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type AuditResult = {
  generatedAt: number;
  summary: {
    totalUsers: number;
    skippedAnonymousUserCount: number;
    safeAutoRelinkCount: number;
    manualUserCount: number;
    manualDuplicateEmailCount: number;
    manualMissingEmailCount: number;
    manualOtherCount: number;
    criticalUserCount: number;
    criticalSafeAutoRelinkCount: number;
    criticalManualUserCount: number;
    importantUserCount: number;
    lowUserCount: number;
    duplicateAuthenticatedEmailGroupCount: number;
  };
  criticalManualUsers: AuditUserRow[];
  riskyUsers: AuditUserRow[];
  duplicateEmailGroups: Array<{
    normalizedEmail: string;
    userCount: number;
    criticalUserCount: number;
  }>;
};

type AuditUserRow = {
  userId: string;
  authSubject: string | null;
  email: string | null;
  bucket: string;
  priority: string;
  reasons: string[];
  activePaidTier: string | null;
  activeCommunitySubscriptionCount: number;
  workspaceCreditsTotal: number;
  communityOwnershipCount: number;
  providerConnectionCount: number;
  projectCount: number;
  threadCount: number;
  membershipCount: number;
  developerAppCount: number;
  skillPackageCount: number;
};

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function stripWrappingQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function normalizeLoadedEnvValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (quoted) return stripWrappingQuotes(trimmed);
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    if (!key || process.env[key]) continue;
    const rawValue = trimmed.slice(equalsAt + 1).trim();
    process.env[key] = normalizeLoadedEnvValue(rawValue);
  }
}

function loadDefaultEnvFiles(): void {
  loadEnvFile("/Users/neilmcdevitt/code/arx/.env.local");
  loadEnvFile("/Users/neilmcdevitt/code/arx/.env");
}

function hasExplicitDeploymentTarget(argv: string[]): boolean {
  return argv.some((arg, index) => {
    if (arg === "--prod") return true;
    if (arg === "--preview-name") return true;
    if (arg === "--deployment-name") return true;
    if (arg === "--env-file") return true;
    if (arg.startsWith("--preview-name=")) return true;
    if (arg.startsWith("--deployment-name=")) return true;
    if (arg.startsWith("--env-file=")) return true;
    return false;
  });
}

function clearDeploymentEnvOverrides(): void {
  delete process.env.CONVEX_DEPLOYMENT;
  delete process.env.CONVEX_SELF_HOSTED_URL;
}

function ensureEmptyEnvFile(argv: string[]): { argv: string[]; cleanup: (() => void) | null } {
  if (!hasExplicitDeploymentTarget(argv)) return { argv, cleanup: null };
  if (
    argv.includes("--env-file") ||
    argv.some((arg) => arg.startsWith("--env-file="))
  ) {
    return { argv, cleanup: null };
  }
  const tempDir = mkdtempSync(join(tmpdir(), "arx-auth-migration-audit-"));
  const tempFile = join(tempDir, "empty.env");
  writeFileSync(tempFile, "", "utf8");
  return {
    argv: ["--env-file", tempFile, ...argv],
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function readAuditSecret(): string {
  return readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET");
}

function printUsage(): void {
  console.log(
    [
      "Usage:",
      "  node --experimental-strip-types --experimental-specifier-resolution=node scripts/auth_migration_audit.ts [--json] [convex-run-options]",
      "",
      "Examples:",
      "  node --experimental-strip-types --experimental-specifier-resolution=node scripts/auth_migration_audit.ts --prod",
      "  node --experimental-strip-types --experimental-specifier-resolution=node scripts/auth_migration_audit.ts --env-file .env.prod",
      "",
      "Required env:",
      "  ARX_AUTH_MIGRATION_AUDIT_SECRET",
    ].join("\n"),
  );
}

function parseAuditResult(raw: string): AuditResult {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty_audit_response");
  return JSON.parse(trimmed) as AuditResult;
}

function printUserRow(row: AuditUserRow): void {
  console.log(
    [
      `- userId: ${row.userId}`,
      `  email: ${row.email ?? "<missing>"}`,
      `  bucket: ${row.bucket}`,
      `  priority: ${row.priority}`,
      `  paidTier: ${row.activePaidTier ?? "none"}`,
      `  subs: ${row.activeCommunitySubscriptionCount}`,
      `  credits: ${row.workspaceCreditsTotal}`,
      `  ownsCommunities: ${row.communityOwnershipCount}`,
      `  providerConnections: ${row.providerConnectionCount}`,
      `  projects: ${row.projectCount}`,
      `  threads: ${row.threadCount}`,
      `  memberships: ${row.membershipCount}`,
      `  developerApps: ${row.developerAppCount}`,
      `  skillPackages: ${row.skillPackageCount}`,
      `  reasons: ${row.reasons.join(", ") || "none"}`,
    ].join("\n"),
  );
}

function main(): void {
  const originalArgv = process.argv.slice(2);
  loadDefaultEnvFiles();
  if (hasExplicitDeploymentTarget(originalArgv)) {
    clearDeploymentEnvOverrides();
  }
  const { argv, cleanup } = ensureEmptyEnvFile(originalArgv);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }
  const printJson = argv.includes("--json");
  const convexArgs = argv.filter((arg) => arg !== "--json");

  const secret = readAuditSecret();
  if (!secret) {
    throw new Error("Missing audit secret. Set ARX_AUTH_MIGRATION_AUDIT_SECRET.");
  }

  const command = [
    "convex",
    "run",
    "authMigrationAudit:runAuthMigrationPreflightAudit",
    JSON.stringify({ secret }),
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...convexArgs,
  ];

  const raw = (() => {
    try {
      return execFileSync("npx", command, {
        cwd: "/Users/neilmcdevitt/code/arx",
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "inherit"],
      });
    } finally {
      cleanup?.();
    }
  })();

  const result = parseAuditResult(raw);

  console.log("Auth migration preflight audit");
  console.log(`Generated: ${new Date(result.generatedAt).toISOString()}`);
  console.log("");
  console.log(`Total users: ${result.summary.totalUsers}`);
  console.log(`Skipped anonymous users: ${result.summary.skippedAnonymousUserCount}`);
  console.log(`Safe auto relink: ${result.summary.safeAutoRelinkCount}`);
  console.log(`Manual handling required: ${result.summary.manualUserCount}`);
  console.log(`Critical users: ${result.summary.criticalUserCount}`);
  console.log(`Critical safe auto relink: ${result.summary.criticalSafeAutoRelinkCount}`);
  console.log(`Critical manual users: ${result.summary.criticalManualUserCount}`);
  console.log(`Duplicate authenticated-email groups: ${result.summary.duplicateAuthenticatedEmailGroupCount}`);
  console.log("");
  console.log("Manual buckets");
  console.log(`- duplicate email: ${result.summary.manualDuplicateEmailCount}`);
  console.log(`- missing email: ${result.summary.manualMissingEmailCount}`);
  console.log(`- other: ${result.summary.manualOtherCount}`);

  if (result.criticalManualUsers.length > 0) {
    console.log("");
    console.log("Critical users requiring manual handling");
    for (const row of result.criticalManualUsers) {
      printUserRow(row);
    }
  }

  if (result.duplicateEmailGroups.length > 0) {
    console.log("");
    console.log("Duplicate authenticated-email groups");
    for (const group of result.duplicateEmailGroups) {
      console.log(
        `- ${group.normalizedEmail}: ${group.userCount} users (${group.criticalUserCount} critical)`,
      );
    }
  }

  if (printJson) {
    console.log("");
    console.log("Raw JSON");
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
