import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUDGET_LIMITS, budgetTakesFor, requestFingerprint, CALL_OPERATIONS, CALL_OPERATION_NAMES, CALL_OPERATION_VARIANTS, callOperation, guideAskFor, handedBackToPerson, operationFor, TOOL_OPERATIONS, WORKER_OPERATIONS } from "../shared/operationCatalog";

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
    // What every member is told. Opening the community is join_mode.set's variant.
    expect(of("broadcast")).toEqual(["community.handbook.approve"]);
    expect(CALL_OPERATION_VARIANTS["community.join_mode.set:open"]).toMatchObject({ effect: "broadcast", ask: "person_only" });
  });

  it("says, for every action, how the person is asked before an AI does it", () => {
    const asks = (list: Record<string, { ask: string }>) => Object.fromEntries(Object.entries(list).filter(([, entry]) => entry.ask !== "none").map(([name, entry]) => [name, entry.ask]));
    // Everything not named here is done when the person says so.
    expect(asks({ ...TOOL_OPERATIONS, ...CALL_OPERATIONS, ...CALL_OPERATION_VARIANTS })).toEqual({
      "polynet_write:channels": "words",
      "polynet_write:channels:delete": "every_time",
      "polynet_write:messages": "words",
      "community.interaction.remove": "every_time",
      "community.handbook.approve": "every_time",
      "community.members.set_role": "every_time",
      "community.members.remove": "person_only",
      "community.members.ban": "person_only",
      "community.join_mode.set:open": "person_only",
    });
    // The worker is nobody's AI: it drafts, and a person decides on Home.
    expect(Object.values(WORKER_OPERATIONS).every((entry) => entry.ask === "none")).toBe(true);
  });

  it("turns that into the guide's question, and into what is handed back to the person", () => {
    const call = (operation: string, input?: Record<string, unknown>) => ({ toolName: "polynet_call", operation, input });
    const write = (mode: string) => ({ toolName: "polynet_write", mode, localPath: "/channels/general/" });
    expect(guideAskFor(write("create"))).toBe("post");
    expect(guideAskFor(write("delete"))).toBe("remove");
    expect(guideAskFor(call("community.interaction.remove"))).toBe("remove");
    expect(guideAskFor(call("community.members.set_role"))).toBe("change");
    expect(guideAskFor(call("community.handbook.approve"))).toBe("change");
    for (const operation of ["community.interaction.react", "community.admission.approve", "community.settings.update", "community.channel.create", "community.members.ban"]) {
      expect(guideAskFor(call(operation)), operation).toBeNull();
    }
    expect(guideAskFor(call("community.join_mode.set", { mode: "open" }))).toBeNull();
    const guide = (yes: boolean) => ({ guide: true, personSaidYes: yes });
    const ownAi = { guide: false, personSaidYes: false };
    const back = (operation: string, door: { guide: boolean; personSaidYes: boolean }, input?: Record<string, unknown>) => handedBackToPerson(operationFor(call(operation, input)), door);
    // Only a person: every door, even after a yes.
    for (const door of [guide(false), guide(true), ownAi]) {
      expect(back("community.members.ban", door)).toBe(true);
      expect(back("community.join_mode.set", door, { mode: "open" })).toBe(true);
      expect(back("community.join_mode.set", door, { mode: "approval" })).toBe(false);
      expect(back("community.settings.update", door)).toBe(false);
    }
    // Asked every time: the guide runs it only after the yes.
    expect(back("community.interaction.remove", guide(false))).toBe(true);
    expect(back("community.interaction.remove", guide(true))).toBe(false);
    expect(back("community.members.set_role", guide(false))).toBe(true);
    expect(back("community.members.set_role", guide(true))).toBe(false);
    // A person's own AI can't be asked yet: what can't be taken back is theirs to do; the rest it does.
    expect(back("community.interaction.remove", ownAi)).toBe(true);
    expect(back("community.members.set_role", ownAi)).toBe(false);
    expect(back("community.handbook.approve", ownAi)).toBe(false);
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
    expect(own({ localPath: "/channels/general/", mode: "append" })).toEqual([{ budget: "post", scope: "" }]);
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

  it("a retry is the same key with the same request, to the letter", () => {
    const input = { operation: "community.interaction.react", input: { ref: "interaction:root:a", emoji: "x", on: true } };
    const first = requestFingerprint("k1", "polynet_call", input);
    expect(requestFingerprint("k1", "polynet_call", { ...input })).toBe(first);
    expect(requestFingerprint("k1", "polynet_call", { ...input, input: { ...input.input, ref: "interaction:root:b" } })).not.toBe(first);
    expect(requestFingerprint("k2", "polynet_call", input)).not.toBe(first);
    expect(requestFingerprint("k1", "polynet_write", input)).not.toBe(first);
  });

  it("the paid plan raises a builder's budget, and a day is never smaller than a minute", () => {
    expect(BUDGET_LIMITS.builder_change_paid.perMinute).toBeGreaterThan(BUDGET_LIMITS.builder_change_free.perMinute);
    for (const limit of Object.values(BUDGET_LIMITS)) expect(limit.perDay === null || limit.perDay >= limit.perMinute).toBe(true);
  });
});
