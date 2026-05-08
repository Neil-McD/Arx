import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

type UserReferenceField = {
  table: string;
  field: string;
};

type TableLoadResult = {
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
  error: string | null;
};

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SCHEMA_PATH = resolve(ROOT, "convex/schema.ts");

function readArgValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function parseLimit(): number {
  const raw = readArgValue("--limit") ?? "10000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid_limit:${raw}`);
  }
  return Math.floor(parsed);
}

function deploymentArgs(): string[] {
  if (hasArg("--dev")) return [];
  if (hasArg("--prod") || !hasArg("--dev")) return ["--prod"];
  return [];
}

function exportZipPath(): string | null {
  return readArgValue("--export-zip");
}

function extractUserReferenceFields(schemaText: string): UserReferenceField[] {
  const tableHeader = /^\s{2}([A-Za-z0-9_]+): defineTable\(\{/gm;
  const headers = Array.from(schemaText.matchAll(tableHeader)).map((match) => ({
    table: match[1],
    index: match.index ?? 0,
  }));
  const fields: UserReferenceField[] = [];
  for (let index = 0; index < headers.length; index += 1) {
    const current = headers[index];
    const next = headers[index + 1];
    if (!current) continue;
    const block = schemaText.slice(current.index, next?.index ?? schemaText.length);
    const fieldMatches = block.matchAll(
      /^\s{4}([A-Za-z0-9_]+):\s+(?:v\.optional\()?v\.id\("users"\)/gm,
    );
    for (const fieldMatch of fieldMatches) {
      const field = fieldMatch[1];
      if (!field) continue;
      fields.push({ table: current.table, field });
    }
  }
  return fields;
}

function loadTable(table: string, limit: number): TableLoadResult {
  const zipPath = exportZipPath();
  if (zipPath) {
    try {
      const output = execFileSync("unzip", ["-p", zipPath, `${table}/documents.jsonl`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return parseJsonLinesTable(table, output, false);
    } catch (error) {
      return {
        rows: [],
        truncated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const tempDir = mkdtempSync(resolve(tmpdir(), "polynet-anon-cleanup-"));
  const tempPath = resolve(tempDir, `${table}.jsonl`);
  const outputFd = openSync(tempPath, "w");
  try {
    execFileSync(
      "npx",
      ["convex", "data", table, ...deploymentArgs(), "--limit", String(limit), "--format", "jsonLines"],
      {
        cwd: ROOT,
        maxBuffer: 128 * 1024 * 1024,
        stdio: ["ignore", outputFd, "pipe"],
      },
    );
    closeSync(outputFd);
    const output = readFileSync(tempPath, "utf8");
    return parseJsonLinesTable(table, output, output.split(/\n/).filter((line) => line.trim().startsWith("{")).length >= limit);
  } catch (error) {
    try {
      closeSync(outputFd);
    } catch {
      // ignore
    }
    return {
      rows: [],
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function parseJsonLinesTable(table: string, output: string, truncated: boolean): TableLoadResult {
  const rows: Array<Record<string, unknown>> = [];
  const lines = output
    .split(/\n/)
    .filter((line) => line.trim().startsWith("{"));
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    try {
      rows.push(JSON.parse(line) as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `json_parse_failed:${table}:line=${index + 1}:length=${line.length}:${message}`,
      );
    }
  }
  return {
    rows,
    truncated,
    error: null,
  };
}

function incrementMap(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function main(): void {
  const limit = parseLimit();
  const schemaText = readFileSync(SCHEMA_PATH, "utf8");
  const userReferenceFields = extractUserReferenceFields(schemaText);
  const userReferenceFieldsByTable = new Map<string, UserReferenceField[]>();
  for (const field of userReferenceFields) {
    const existing = userReferenceFieldsByTable.get(field.table) ?? [];
    existing.push(field);
    userReferenceFieldsByTable.set(field.table, existing);
  }

  const usersResult = loadTable("users", limit);
  if (usersResult.error) {
    throw new Error(`failed_to_load_users:${usersResult.error}`);
  }
  const anonymousUserIds = new Set<string>();
  const accountUserIds = new Set<string>();
  for (const user of usersResult.rows) {
    const id = String(user._id ?? "").trim();
    const authSubject = String(user.authSubject ?? "").trim();
    if (!id) continue;
    if (authSubject.startsWith("anon:")) {
      anonymousUserIds.add(id);
    } else {
      accountUserIds.add(id);
    }
  }

  const referencedAnonymousUserIds = new Set<string>();
  const referenceCounts = new Map<string, number>();
  const referenceUserCounts = new Map<string, Set<string>>();
  const tableLoads: Array<{ table: string; rows: number; truncated: boolean; error: string | null }> = [];

  for (const [table, fields] of userReferenceFieldsByTable.entries()) {
    if (table === "users") continue;
    const result = loadTable(table, limit);
    tableLoads.push({
      table,
      rows: result.rows.length,
      truncated: result.truncated,
      error: result.error,
    });
    if (result.error) continue;
    for (const row of result.rows) {
      for (const field of fields) {
        const value = String(row[field.field] ?? "").trim();
        if (!value || !anonymousUserIds.has(value)) continue;
        const key = `${table}.${field.field}`;
        incrementMap(referenceCounts, key);
        const users = referenceUserCounts.get(key) ?? new Set<string>();
        users.add(value);
        referenceUserCounts.set(key, users);
        referencedAnonymousUserIds.add(value);
      }
    }
  }

  const safeDeleteCandidateIds = Array.from(anonymousUserIds).filter(
    (id) => !referencedAnonymousUserIds.has(id),
  );
  const referenceSummary = Array.from(referenceCounts.entries())
    .map(([key, rows]) => ({
      reference: key,
      rows,
      anonymousUsers: referenceUserCounts.get(key)?.size ?? 0,
    }))
    .sort((a, b) => b.rows - a.rows || a.reference.localeCompare(b.reference));
  const failedTables = tableLoads.filter((entry) => entry.error);
  const truncatedTables = tableLoads.filter((entry) => entry.truncated);
  const scanComplete = failedTables.length === 0 && truncatedTables.length === 0;
  const allAnonymousUsersUnreferenced = referencedAnonymousUserIds.size === 0;

  console.log(JSON.stringify(
    {
      deployment: hasArg("--dev") ? "dev" : "prod",
      source: exportZipPath() ? "snapshot_export" : "convex_data_cli",
      dryRun: true,
      limitPerTable: limit,
      scannedReferenceFields: userReferenceFields.length,
      totals: {
        rawUserRows: usersResult.rows.length,
        accountUsers: accountUserIds.size,
        anonymousUsers: anonymousUserIds.size,
        referencedAnonymousUsers: referencedAnonymousUserIds.size,
        safeDeleteCandidates: safeDeleteCandidateIds.length,
      },
      referenceSummary,
      scannedTables: tableLoads.length,
      truncatedTables,
      failedTables,
      sampleSafeDeleteCandidateIds: safeDeleteCandidateIds.slice(0, 10),
      scanComplete,
      allAnonymousUsersUnreferenced,
      deletionReady: scanComplete && allAnonymousUsersUnreferenced,
    },
    null,
    2,
  ));
}

main();
