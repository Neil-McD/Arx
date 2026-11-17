import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUDGET_LIMITS, budgetTakesFor, CALL_OPERATIONS, CALL_OPERATION_NAMES, callOperation, TOOL_OPERATIONS, WORKER_OPERATIONS } from "../shared/operationCatalog";

const executor = readFileSync("convex/polynetCanonicalExecutor.ts", "utf8");

describe("the operations list", () => {
  it("declares every operation the executor names", () => {
    const named = new Set(Array.from(executor.matchAll(/_OPERATION = "([a-z_.]+)"/g), (match) => match[1]));
    expect(named.size).toBeGreaterThan(10);
    for (const name of named) expect(callOperation(name), `${name} is not in shared/operationCatalog.ts`).not.toBeNull();
  });

  it("is what the capabilities directory is built from", () => {
    expect(executor).toMatch(/\(CALL_OPERATION_NAMES as string\[\]\)\.filter\(operation => capabilityDocument/);
    expect(executor).toMatch(/!callOperation\(operation\) \|\|/);
  });

  it("keeps money out, and only the worker writes memory and briefs", () => {
    const all = { ...TOOL_OPERATIONS, ...CALL_OPERATIONS, ...WORKER_OPERATIONS };
    expect(Object.values(all).some((entry) => entry.effect === "money")).toBe(false);
    expect(Object.values(WORKER_OPERATIONS).every((entry) => entry.lens === "worker" && entry.plan === "paid")).toBe(true);
    expect(CALL_OPERATION_NAMES).not.toContain("memory.apply");
  });

  it("says which operations take something away or reach many people", () => {
    const of = (effect: string) => CALL_OPERATION_NAMES.filter((name) => CALL_OPERATIONS[name].effect === effect);
    expect(of("destroy")).toEqual(["community.interaction.remove", "community.members.remove", "community.members.ban"]);
    expect(of("broadcast")).toEqual(["community.join_mode.set"]);
  });
});

describe("what a call spends", () => {
  const own = (extra: Record<string, unknown>) => budgetTakesFor({ ownAi: true, toolName: "polynet_write", communitySlug: "run-club", ...extra } as never);

  it("counts a person's own AI for reads and searches, a site only for writes", () => {
    expect(budgetTakesFor({ ownAi: true, toolName: "polynet_read" })).toEqual([{ budget: "read", scope: "" }]);
    expect(budgetTakesFor({ ownAi: true, toolName: "polynet_search" })).toEqual([{ budget: "search", scope: "" }]);
    expect(budgetTakesFor({ ownAi: false, toolName: "polynet_list" })).toEqual([]);
    expect(budgetTakesFor({ ownAi: false, toolName: "polynet_write", mode: "create", communitySlug: "run-club", localPath: "/channels/general/" }))
      .toEqual([{ budget: "post", scope: "" }, { budget: "post_channel", scope: "run-club/general" }]);
  });

  it("a new post spends the channel's minute too; a reply and an edit do not", () => {
    expect(own({ localPath: "/channels/general/", mode: "create" })).toEqual([{ budget: "post", scope: "" }, { budget: "post_channel", scope: "run-club/general" }]);
    expect(own({ localPath: "/channels/general/interaction:root:abc/", mode: "append" })).toEqual([{ budget: "post", scope: "" }]);
    // A reply written at the channel, naming the post it answers.
    expect(own({ localPath: "/channels/general/", mode: "append", reply: true })).toEqual([{ budget: "post", scope: "" }]);
    expect(own({ localPath: "/channels/general/", mode: "create", reply: true })).toEqual([{ budget: "post", scope: "" }]);
    expect(own({ localPath: "/channels/general/interaction:root:abc.md", mode: "update" })).toEqual([{ budget: "post", scope: "" }]);
  });

  it("builder changes are counted per community; keeping a session alive is free", () => {
    expect(own({ localPath: "/builder/resources/" })).toEqual([{ budget: "builder_change", scope: "run-club" }]);
    const call = (operation: string) => budgetTakesFor({ ownAi: true, toolName: "polynet_call", operation, communitySlug: "run-club" });
    expect(call("community.members.ban")).toEqual([{ budget: "builder_change", scope: "run-club" }]);
    expect(call("community.interaction.react")).toEqual([{ budget: "light", scope: "" }]);
    expect(call("community.presence.heartbeat")).toEqual([]);
    // Something nobody declared is counted as the strictest kind, never waved through.
    expect(call("community.made_up")).toEqual([{ budget: "builder_change", scope: "run-club" }]);
  });

  it("the paid plan raises a builder's budget, and a day is never smaller than a minute", () => {
    expect(BUDGET_LIMITS.builder_change_paid.perMinute).toBeGreaterThan(BUDGET_LIMITS.builder_change_free.perMinute);
    for (const limit of Object.values(BUDGET_LIMITS)) expect(limit.perDay === null || limit.perDay >= limit.perMinute).toBe(true);
  });
});
