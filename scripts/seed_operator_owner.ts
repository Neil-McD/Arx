import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type JsonRecord = Record<string, any>;

function readFlag(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function fail(message: string): never {
  console.error(`seed_operator_owner: ${message}`);
  process.exit(1);
}

function createSnapshotExport(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "polynet-operator-seed-export-"));
  const zipPath = path.join(dir, "export.zip");
  execFileSync("npx", ["convex", "export", "--prod", "--path", zipPath], { stdio: "inherit" });
  if (!existsSync(zipPath)) fail("Convex export did not create a zip file");
  return zipPath;
}

function readExportTable(zipPath: string, table: string): JsonRecord[] {
  const output = execFileSync("unzip", ["-p", zipPath, `${table}/documents.jsonl`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function runConvexImport(table: string, rows: JsonRecord[]): void {
  const dir = mkdtempSync(path.join(tmpdir(), "polynet-operator-seed-"));
  const filePath = path.join(dir, `${table}.json`);
  writeFileSync(filePath, JSON.stringify(rows, null, 2));
  execFileSync(
    "npx",
    ["convex", "import", "--prod", "--table", table, "--append", "--format", "jsonArray", filePath],
    { stdio: "inherit" },
  );
}

if (!hasFlag("--prod")) {
  fail("refusing to run without explicit --prod");
}

const email = normalizeEmail(readFlag("--email"));
const userId = String(readFlag("--user-id") ?? "").trim();
const dryRun = hasFlag("--dry-run");

if (!email && !userId) {
  fail("provide --email or --user-id");
}
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail(`malformed email: ${email}`);
}

const exportPath = createSnapshotExport();
const users = readExportTable(exportPath, "users");
const candidates = users.filter((user) => {
  if (userId && String(user._id) !== userId) return false;
  if (!email) return true;
  return normalizeEmail(user.normalizedEmail ?? user.email) === email;
});

if (candidates.length === 0) {
  fail("no matching user found");
}
if (candidates.length > 1) {
  fail(`multiple matching users found: ${candidates.map((user) => String(user._id)).join(", ")}`);
}

const user = candidates[0];
const targetUserId = String(user._id);
const targetEmail = normalizeEmail(user.normalizedEmail ?? user.email ?? email);
if (!targetUserId) fail("matching user is missing _id");
if (!targetEmail) fail("matching user is missing normalized email");

const roles = readExportTable(exportPath, "operatorRoles");
const existingForUser = roles.find((role) => String(role.userId) === targetUserId);
if (existingForUser) {
  if (existingForUser.active && existingForUser.role === "owner") {
    console.log(
      JSON.stringify({
        ok: true,
        dryRun,
        action: "already_owner",
        userId: targetUserId,
        email: targetEmail,
        roleId: existingForUser._id,
      }),
    );
    process.exit(0);
  }
  fail(
    `operator role already exists for ${targetUserId} but is not an active owner; use the owner-gated mutation to repair it`,
  );
}

const nowMs = Date.now();
const operatorRole = {
  userId: targetUserId,
  email: targetEmail,
  normalizedEmail: targetEmail,
  role: "owner",
  active: true,
  createdBy: targetUserId,
  createdAt: nowMs,
  updatedAt: nowMs,
};
const auditEvent = {
  eventKey: `operator_role_seeded:${targetUserId}:${nowMs}`,
  eventType: "operator_role_upserted",
  severity: "info",
  status: "succeeded",
  actorUserId: targetUserId,
  subjectUserId: targetUserId,
  provider: "convex",
  providerObjectId: targetUserId,
  metadata: {
    source: "scripts/seed_operator_owner.ts",
    email: targetEmail,
    dryRun: false,
  },
  createdAt: nowMs,
};

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        action: "would_insert_owner",
        operatorRole,
        auditEvent,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

runConvexImport("operatorRoles", [operatorRole]);
runConvexImport("criticalAuditEvents", [auditEvent]);

console.log(
  JSON.stringify(
    {
      ok: true,
      action: "inserted_owner",
      userId: targetUserId,
      email: targetEmail,
    },
    null,
    2,
  ),
);
