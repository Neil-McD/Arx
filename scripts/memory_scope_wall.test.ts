import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Memory stays in its scope (convex/communityNotesStore.ts). Every memory row
// carries a scope key ("community:<id>" or "pod:<roomId>") and every index
// starts with it, so a read names one scope. Only the store may query or
// insert these tables: any other Convex file reaching into them (search, Home,
// the handbook, the agent's file system, a summary) fails here, so the wall
// between the community and its pods, and between pods, can't be opened by
// accident. (This replaces the pod notes wall: pod notes are pod-scoped notes.)
const CONVEX = join(__dirname, "..", "convex");
const STORE = "communityNotesStore.ts";
const TABLES = ["communityNotes", "communityMemoryIndex", "communityNoteRevisions", "communityNoteRemovals", "agentWork", "agentWorkRuns", "communityPodNotes"];
const reach = new RegExp(`(?:query|insert)\\("(${TABLES.join("|")})"\\)?`);

test("only the memory store queries or inserts memory records", () => {
  const reaching = readdirSync(CONVEX)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.startsWith("_") && name !== STORE && name !== "schema.ts")
    .filter((name) => reach.test(readFileSync(join(CONVEX, name), "utf8")));
  expect(reaching).toEqual([]);
});

test("every memory index starts with the scope key", () => {
  const schema = readFileSync(join(CONVEX, "schema.ts"), "utf8");
  for (const table of ["communityNotes", "communityMemoryIndex", "communityNoteRemovals", "agentWork"]) {
    const start = schema.indexOf(`  ${table}: defineTable(`);
    const end = schema.indexOf(": defineTable(", start + table.length + 20);
    const definition = schema.slice(start, end);
    for (const [, fields] of definition.matchAll(/\.index\("[^"]+", \[([^\]]*)\]\)/g)) {
      if (/"(dueAt|migratedFromNodeId)"/.test(fields)) continue;
      expect(fields.trim().startsWith('"scopeKey"'), `${table}: [${fields}]`).toBe(true);
    }
    expect(definition).not.toMatch(/filterFields: \["communityId"\]/);
  }
});

test("every pod notes function checks the viewer can enter the pod", () => {
  const source = readFileSync(join(CONVEX, "communityPodNotes.ts"), "utf8");
  const handlers = source.split(/export const /).slice(1);
  expect(handlers.length).toBeGreaterThan(0);
  for (const handler of handlers) expect(handler).toMatch(/await podReader\(ctx, args\)/);
});
