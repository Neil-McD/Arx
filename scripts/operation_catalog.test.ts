import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUDGET_LIMITS, budgetTakesFor, requestFingerprint, CALL_OPERATIONS, CALL_OPERATION_NAMES, CALL_OPERATION_VARIANTS, callOperation, GUIDE_ASK_ALWAYS_ALLOWABLE, guideAskFor, handedBackToPerson, operationFor, TOOL_OPERATIONS, WORKER_OPERATIONS, askAt } from "../shared/operationCatalog";

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
    expect(of("destroy")).toEqual(["community.interaction.remove", "community.course.delete", "community.members.remove", "community.members.ban", "community.journey.remove_stage"]);
    // What every member is told. Opening the community is join_mode.set's variant.
    expect(of("broadcast")).toEqual(["community.agent.instructions.set", "community.handbook.approve", "community.event.cancel", "community.announcement.post", "community.course.publish", "community.guide_draft.send"]);
    expect(CALL_OPERATION_VARIANTS["community.join_mode.set:open"]).toMatchObject({ effect: "broadcast", ask: "every_time" });
  });

  it("says, for every action, how the person is asked before an AI does it", () => {
    const asks = (list: Record<string, { ask: string }>) => Object.fromEntries(Object.entries(list).filter(([, entry]) => entry.ask !== "none").map(([name, entry]) => [name, entry.ask]));
    // Everything not named here is done when the person says so.
    expect(asks({ ...TOOL_OPERATIONS, ...CALL_OPERATIONS, ...CALL_OPERATION_VARIANTS })).toEqual({
      "polynet_write:channels": "words",
      "polynet_write:channels:delete": "every_time",
      "polynet_write:messages": "words",
      "community.interaction.remove": "every_time",
      "community.agent.instructions.set": "every_time",
      "community.handbook.approve": "every_time",
      "community.event.cancel": "every_time",
      "community.announcement.post": "every_time",
      "community.course.publish": "every_time",
      "community.course.delete": "every_time",
      "community.members.set_role": "every_time",
      "community.members.remove": "every_time",
      "community.members.ban": "every_time",
      "community.journey.remove_stage": "every_time",
      "community.guide_draft.send": "every_time",
      "community.join_mode.set:open": "every_time",
    });
    // A person's own AI: deleting its own post is its app's call (posts and messages are "words": its app's too).
    expect(askAt(TOOL_OPERATIONS["polynet_write:channels:delete"], "own_ai")).toBe("none");
    expect(askAt(TOOL_OPERATIONS["polynet_write:channels:delete"], "guide")).toBe("every_time");
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
    expect(guideAskFor(call("community.members.remove"))).toBe("remove");
    expect(guideAskFor(call("community.members.ban"))).toBe("remove");
    expect(guideAskFor({ toolName: "polynet_write", mode: "append", localPath: "/messages/abcd1234/" })).toBe("message");
    for (const operation of ["community.interaction.react", "community.admission.approve", "community.settings.update", "community.channel.create", "community.members.unban"]) {
      expect(guideAskFor(call(operation)), operation).toBeNull();
    }
    // Opening is asked about; asking for approval to join is not.
    expect(guideAskFor(call("community.join_mode.set", { mode: "open" }))).toBe("change");
    expect(guideAskFor(call("community.join_mode.set", { mode: "approval" }))).toBeNull();
    expect(guideAskFor(call("community.agent.instructions.set"))).toBe("change");
    // The guide and a person's own AI: Polynet asks the person. A community's site: nobody can be asked.
    const guide = (yes: boolean) => ({ asks: true, personSaidYes: yes });
    const ownAi = guide;
    const site = { asks: false, personSaidYes: false };
    const back = (operation: string, door: { asks: boolean; personSaidYes: boolean }, input?: Record<string, unknown>) => handedBackToPerson(operationFor(call(operation, input)), door);
    // Opening the community: asked through the guide and a person's own AI (runs after the yes); a site can't ask, so it is the person's.
    expect(back("community.join_mode.set", guide(false), { mode: "open" })).toBe(true);
    expect(back("community.join_mode.set", guide(true), { mode: "open" })).toBe(false);
    expect(back("community.join_mode.set", site, { mode: "open" })).toBe(false);
    for (const door of [guide(false), guide(true), ownAi(false), site]) {
      expect(back("community.join_mode.set", door, { mode: "approval" })).toBe(false);
      expect(back("community.settings.update", door)).toBe(false);
    }
    // Asked every time: the guide runs it only after the yes.
    expect(back("community.interaction.remove", guide(false))).toBe(true);
    expect(back("community.interaction.remove", guide(true))).toBe(false);
    expect(back("community.members.set_role", guide(false))).toBe(true);
    expect(back("community.members.set_role", guide(true))).toBe(false);
    for (const operation of ["community.members.remove", "community.members.ban"]) {
      expect(back(operation, guide(false)), operation).toBe(true);
      expect(back(operation, guide(true)), operation).toBe(false);
      expect(back(operation, site), operation).toBe(true);
    }
    // A person's own AI is asked about in Polynet too: nothing that asks every time runs before the yes.
    for (const operation of ["community.interaction.remove", "community.members.set_role", "community.handbook.approve", "community.members.ban"]) {
      expect(back(operation, ownAi(false)), operation).toBe(true);
      expect(back(operation, ownAi(true)), operation).toBe(false);
    }
    // Where nobody can be asked, what takes away is the person's; the rest runs.
    expect(back("community.interaction.remove", site)).toBe(true);
    expect(back("community.members.set_role", site)).toBe(false);
    // A reply in the person's direct messages is "words", like a post: never handed back. The guide asks
    // (or is always allowed) and refuses to send without either (convex/polynetCanonicalExecutor.ts, the messages branch);
    // a person's own AI app decides for itself.
    const message = operationFor({ toolName: "polynet_write", mode: "append", localPath: "/messages/abcd1234/" });
    expect(handedBackToPerson(message, guide(false))).toBe(false);
  });

  it("no member action or role change can ever be always-allowed: only posts and replies in their messages can", () => {
    expect(Object.entries(GUIDE_ASK_ALWAYS_ALLOWABLE).filter(([, allowable]) => allowable).map(([kind]) => kind)).toEqual(["post", "message"]);
    const members = CALL_OPERATION_NAMES.filter((name) => name.startsWith("community.members."));
    expect(members).toEqual(["community.members.set_role", "community.members.remove", "community.members.ban", "community.members.unban"]);
    for (const operation of members) {
      const kind = guideAskFor({ toolName: "polynet_call", operation });
      // Lifting a ban is done when told; everything else about members asks, and never always.
      if (operation === "community.members.unban") expect(kind).toBeNull();
      else expect(kind && GUIDE_ASK_ALWAYS_ALLOWABLE[kind], operation).toBe(false);
    }
    // A reply in their messages may be always allowed, as a post may.
    const message = guideAskFor({ toolName: "polynet_write", mode: "append", localPath: "/messages/abcd1234/" });
    expect(message && GUIDE_ASK_ALWAYS_ALLOWABLE[message]).toBe(true);
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
