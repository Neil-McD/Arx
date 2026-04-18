import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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
  return argv.some((arg) => {
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

function printUsage(): void {
  console.log(
    [
      "Usage:",
      "  node --experimental-strip-types --experimental-specifier-resolution=node scripts/auth_continuity_probe.ts [--email user@example.com] [--auth-subject subject] [--community-slug slug] [--json] [convex-run-options]",
      "",
      "Examples:",
      "  node --experimental-strip-types --experimental-specifier-resolution=node scripts/auth_continuity_probe.ts --email neil@example.com --prod",
      "  node --experimental-strip-types --experimental-specifier-resolution=node scripts/auth_continuity_probe.ts --auth-subject user_123 --community-slug polynet --prod",
      "",
      "Required env:",
      "  ARX_AUTH_MIGRATION_AUDIT_SECRET",
    ].join("\n"),
  );
}

function parseFlagValue(argv: string[], flag: string): string | null {
  const direct = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1).trim() || null;
  const at = argv.indexOf(flag);
  if (at >= 0) {
    const next = argv[at + 1];
    if (!next || next.startsWith("--")) return null;
    return next.trim() || null;
  }
  return null;
}

function omitFlag(argv: string[], flag: string): string[] {
  const next: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === flag) {
      index += 1;
      continue;
    }
    if (value.startsWith(`${flag}=`)) continue;
    next.push(value);
  }
  return next;
}

function main(): void {
  const originalArgv = process.argv.slice(2);
  loadDefaultEnvFiles();
  if (hasExplicitDeploymentTarget(originalArgv)) {
    clearDeploymentEnvOverrides();
  }
  const argv = originalArgv;
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const printJson = argv.includes("--json");
  const email = parseFlagValue(argv, "--email");
  const authSubject = parseFlagValue(argv, "--auth-subject");
  const communitySlug = parseFlagValue(argv, "--community-slug");
  const convexArgs = omitFlag(omitFlag(omitFlag(argv, "--email"), "--auth-subject"), "--community-slug").filter(
    (arg) => arg !== "--json",
  );

  const secret = readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET");
  if (!secret) {
    throw new Error("Missing continuity probe secret. Set ARX_AUTH_MIGRATION_AUDIT_SECRET.");
  }

  const command = [
    "convex",
    "run",
    "authContinuityProbe:inspectAuthContinuity",
    JSON.stringify({
      secret,
      ...(email ? { email } : null),
      ...(authSubject ? { authSubject } : null),
      ...(communitySlug ? { communitySlug } : null),
    }),
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...convexArgs,
  ];

  const raw = execFileSync("npx", command, {
    cwd: "/Users/neilmcdevitt/code/arx",
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });

  const result = JSON.parse(raw.trim()) as {
    input: {
      authSubject: string | null;
      email: string | null;
      normalizedEmail: string | null;
      communitySlug: string | null;
    };
    preview: {
      resolutionPath: string;
      blockers: string[];
      resolvedUserId: string | null;
      wouldCreateNewUser: boolean;
    } | null;
    matchedUsers: Array<{
      userId: string;
      authSubject: string | null;
      email: string | null;
    }>;
    resolvedSnapshot: {
      canonicalTier: string;
      threadCount: number;
      projectCount: number;
      providerConnectionCount: number;
      communityOwnershipCount: number;
      membershipCount: number;
      workspaceCreditsTotal: number;
    } | null;
    targetCommunity: {
      slug: string;
      name: string;
      owner: boolean;
      membership: {
        role: string;
        active: boolean;
      } | null;
    } | null;
  };

  console.log("Auth continuity probe");
  console.log(`authSubject: ${result.input.authSubject ?? "<none>"}`);
  console.log(`email: ${result.input.email ?? "<none>"}`);
  console.log(`normalizedEmail: ${result.input.normalizedEmail ?? "<none>"}`);
  if (result.preview) {
    console.log(`resolutionPath: ${result.preview.resolutionPath}`);
    console.log(`resolvedUserId: ${result.preview.resolvedUserId ?? "<none>"}`);
    console.log(`wouldCreateNewUser: ${result.preview.wouldCreateNewUser ? "yes" : "no"}`);
    console.log(`blockers: ${result.preview.blockers.join(", ") || "none"}`);
  } else {
    console.log("resolutionPath: <preview unavailable>");
  }
  console.log(`matchedUsers: ${result.matchedUsers.length}`);
  for (const user of result.matchedUsers) {
    console.log(`- ${user.userId} ${user.email ?? "<missing>"} ${user.authSubject ?? "<no-subject>"}`);
  }
  if (result.resolvedSnapshot) {
    console.log("resolvedSnapshot");
    console.log(`- tier: ${result.resolvedSnapshot.canonicalTier}`);
    console.log(`- threads: ${result.resolvedSnapshot.threadCount}`);
    console.log(`- projects: ${result.resolvedSnapshot.projectCount}`);
    console.log(`- providers: ${result.resolvedSnapshot.providerConnectionCount}`);
    console.log(`- ownsCommunities: ${result.resolvedSnapshot.communityOwnershipCount}`);
    console.log(`- memberships: ${result.resolvedSnapshot.membershipCount}`);
    console.log(`- workspaceCredits: ${result.resolvedSnapshot.workspaceCreditsTotal}`);
  }
  if (result.targetCommunity) {
    console.log("targetCommunity");
    console.log(`- ${result.targetCommunity.slug} (${result.targetCommunity.name})`);
    console.log(`- owner: ${result.targetCommunity.owner ? "yes" : "no"}`);
    console.log(
      `- membership: ${
        result.targetCommunity.membership
          ? `${result.targetCommunity.membership.role} (${result.targetCommunity.membership.active ? "active" : "inactive"})`
          : "none"
      }`,
    );
  }

  if (printJson) {
    console.log("");
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
