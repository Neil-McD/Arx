// Anything
// a person can create or change in Polynet, their agent can too, through the
// Polynet MCP and CLI. This holds the web app to that: every public mutation or
// action the app calls is an agent operation (convex/polynetBuilderSettings.ts
// for owners, convex/polynetMemberSelfSettings.ts for a member's own choices),
// or is listed with the reason it isn't one. A new save with no agent path
// fails here until it gets one, and so does an operation that leaves out a
// field the app can set.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vitest";
import { BUILDER_SETTING_OPERATIONS, SETTINGS_UI_WRITES_WITHOUT_AGENT_PATH } from "../convex/polynetBuilderSettings";
import { MEMBER_SELF_OPERATIONS } from "../convex/polynetMemberSelfSettings";
import { POLYNET_BUILDER_DOCUMENT_PATHS, POLYNET_CALL_OPERATIONS } from "../convex/polynetCanonicalExecutor";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const OPERATIONS = [...BUILDER_SETTING_OPERATIONS, ...MEMBER_SELF_OPERATIONS];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "contracts" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// "module:function" for every Convex function the app names, by api.* or by string.
function appFunctionReferences() {
  const found = new Map<string, string>();
  for (const file of [...sourceFiles("shared"), ...sourceFiles("apps/web/src")]) {
    const text = read(file);
    for (const match of text.matchAll(/\bapi(?: as any\))?\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g)) found.set(`${match[1]}:${match[2]}`, file);
    for (const match of text.matchAll(/"([A-Za-z][A-Za-z0-9_]*):([A-Za-z][A-Za-z0-9_]*)"/g)) found.set(`${match[1]}:${match[2]}`, file);
  }
  return found;
}

const convexModules = new Set(readdirSync(join(root, "convex")).filter(name => /^[A-Za-z0-9_]+\.ts$/.test(name) && !name.endsWith(".test.ts"))
  .map(name => name.slice(0, -3)));
type ConvexFunction = { isPublic?: boolean; isMutation?: boolean; isAction?: boolean; exportArgs?: () => string };
// The registered function itself, so `export const x: any = action(` and
// shared argument objects are read the way Convex reads them.
async function convexFunction(reference: string): Promise<ConvexFunction | null> {
  const [module, name] = reference.split(":");
  if (!convexModules.has(module)) return null;
  const loaded = await import(`../convex/${module}.ts`);
  return (loaded as Record<string, ConvexFunction>)[name] ?? null;
}
const isPublicWrite = (fn: ConvexFunction | null) => Boolean(fn?.isPublic && (fn.isMutation || fn.isAction));
const argumentNames = (fn: ConvexFunction) => Object.keys(JSON.parse(fn.exportArgs!()).value as Record<string, unknown>);

const operationCalls = new Set(OPERATIONS.map(spec => spec.calls));
const exempt = (reference: string) =>
  SETTINGS_UI_WRITES_WITHOUT_AGENT_PATH[reference] ?? SETTINGS_UI_WRITES_WITHOUT_AGENT_PATH[`${reference.split(":")[0]}:*`];
const camel = (field: string) => field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
// Filled in by Polynet from the sign-in and the mounted community, never by the agent.
const IDENTITY = ["userId", "authSubject", "communityId", "nowMs", "via"];

test("every write the web app makes has an agent operation or a stated reason", async () => {
  const writes: Array<[string, string]> = [];
  for (const [reference, file] of appFunctionReferences())
    if (isPublicWrite(await convexFunction(reference))) writes.push([reference, file]);
  expect(writes.length).toBeGreaterThan(100);
  const missing = writes.filter(([reference]) => !operationCalls.has(reference) && !exempt(reference))
    .map(([reference, file]) => `${reference} (called from ${basename(file)})`);
  expect(missing, "Give these an operation in convex/polynetBuilderSettings.ts, or a reason in SETTINGS_UI_WRITES_WITHOUT_AGENT_PATH").toEqual([]);
}, 30_000); // imports every Convex module the app calls

test("the reasons list has no stale entries and uses the agreed reasons", () => {
  const called = new Set(appFunctionReferences().keys());
  for (const [key, reason] of Object.entries(SETTINGS_UI_WRITES_WITHOUT_AGENT_PATH)) {
    expect(reason, key).toMatch(/^(agent path|human only|member's own|plumbing): /);
    if (key.endsWith(":*")) continue;
    expect(called.has(key), `${key} is no longer called by the app`).toBe(true);
    expect(operationCalls.has(key), `${key} has an operation already`).toBe(false);
  }
});

test("every agent path names operations and builder documents that exist", () => {
  const operations = new Set(POLYNET_CALL_OPERATIONS);
  const paths = new Set(POLYNET_BUILDER_DOCUMENT_PATHS);
  for (const [key, reason] of Object.entries(SETTINGS_UI_WRITES_WITHOUT_AGENT_PATH)) {
    if (!reason.startsWith("agent path: ")) continue;
    const named = [...reason.matchAll(/\b((?:community|member)\.[a-z_]+(?:\.[a-z_]+)+)/g)].map(match => match[1]);
    const documents = [...reason.matchAll(/(\/builder\/[a-z_./-]*[a-z/])/g)].map(match => match[1]);
    expect(named.length + documents.length + (reason.includes("polynet_write") ? 1 : 0), `${key} names no agent path`).toBeGreaterThan(0);
    for (const operation of named) expect(operations.has(operation), `${key}: ${operation} is not a polynet_call operation`).toBe(true);
    for (const document of documents) expect(paths.has(document), `${key}: ${document} is not a builder document`).toBe(true);
  }
});

test("each operation runs a real public function and covers every field it takes", async () => {
  const names = new Set<string>();
  for (const spec of OPERATIONS) {
    expect(names.has(spec.operation), spec.operation).toBe(false);
    names.add(spec.operation);
    expect(POLYNET_CALL_OPERATIONS, `${spec.operation} is not offered by polynet_call`).toContain(spec.operation);
    const fn = await convexFunction(spec.calls);
    expect(isPublicWrite(fn), `${spec.calls} is not a public mutation or action`).toBe(true);
    expect(fn!.isAction ? "action" : "mutation", `${spec.operation} kind`).toBe(spec.kind);
    const args = new Set(argumentNames(fn!));
    for (const field of Object.keys(spec.fields))
      expect(args.has(camel(field)), `${spec.operation}.${field} -> ${camel(field)} is not an argument of ${spec.calls}`).toBe(true);
    const covered = new Set([...Object.keys(spec.fields).map(camel), ...Object.keys(spec.extra ?? {}), ...Object.keys(spec.omits ?? {}), ...IDENTITY]);
    const skipped = [...args].filter(arg => !covered.has(arg));
    expect(skipped, `${spec.operation} leaves out what the app can set; add a field, or an omits reason`).toEqual([]);
    for (const omitted of Object.keys(spec.omits ?? {})) expect(args.has(omitted), `${spec.operation} omits unknown ${omitted}`).toBe(true);
    for (const field of spec.required) expect(field in spec.fields, `${spec.operation} requires unknown ${field}`).toBe(true);
    for (const field of ["user_id", "auth_subject", "community_id", "now_ms", "via"])
      expect(field in spec.fields, `${spec.operation} must not take ${field} from input`).toBe(false);
  }
}, 30_000);

test("a member's own choices have no owner path and never name another member", () => {
  for (const spec of MEMBER_SELF_OPERATIONS) {
    expect(spec.area, spec.operation).toBe("self");
    expect(spec.operation.startsWith("member."), spec.operation).toBe(true);
    expect(spec.identity ?? "auth", `${spec.operation} signs in as the caller`).toBe("auth");
    expect(spec.review, spec.operation).toBeUndefined();
    for (const field of Object.keys(spec.fields)) expect(field, `${spec.operation} must not pick whose choice it changes`).not.toMatch(/user|member|membership/);
    expect(BUILDER_SETTING_OPERATIONS.some(owner => owner.calls === spec.calls), `${spec.calls} must not have an owner operation`).toBe(false);
  }
});
