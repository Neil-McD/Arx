import { describe, expect, it } from "vitest";
import { ACTION_TOOLS, ACTION_TOOL_RETRY_WINDOW_MS, NOT_PUBLISHED, actionTool, actionToolDefinition, actionToolEntry, actionToolsFor, guideActionKey, guideToolDefinition, translateActionTool } from "../shared/actionTools";
import { talkToolNames } from "../shared/lens";
import { CALL_OPERATIONS, CALL_OPERATION_VARIANTS, TOOL_OPERATIONS } from "../shared/operationCatalog";

const LISTED = { ...TOOL_OPERATIONS, ...CALL_OPERATIONS, ...CALL_OPERATION_VARIANTS } as Record<string, { ask: string; lens: string }>;

describe("one named tool per action", () => {
  it("every action in the one list has a named tool or a stated reason for having none", () => {
    const published = new Set(ACTION_TOOLS.map((tool) => tool.catalog));
    for (const name of Object.keys(LISTED)) {
      const has = published.has(name);
      const excused = name in NOT_PUBLISHED;
      expect(has || excused, `${name} needs a named tool in shared/actionTools.ts, or a reason in NOT_PUBLISHED`).toBe(true);
      expect(has && excused, `${name} is both published and excused`).toBe(false);
    }
    for (const tool of ACTION_TOOLS) expect(LISTED[tool.catalog], `${tool.name} stands for ${tool.catalog}, which is not in the list`).toBeTruthy();
    for (const name of Object.keys(NOT_PUBLISHED)) expect(LISTED[name], `${name} is excused but not in the list`).toBeTruthy();
  });

  it("what only a person does is never a tool", () => {
    for (const [name, entry] of Object.entries(LISTED)) {
      if (entry.ask === "person_only") expect(ACTION_TOOLS.some((tool) => tool.catalog === name), name).toBe(false);
    }
  });

  it("each tool is well formed: its own name, plain inputs, and every required input described", () => {
    const names = ACTION_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of ACTION_TOOLS) {
      expect(tool.name).toMatch(/^polynet_[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(20);
      for (const key of tool.required) expect(tool.properties[key], `${tool.name} requires ${key}`).toBeTruthy();
      // No bookkeeping: no version, no target path, and the key is optional.
      expect(Object.keys(tool.properties)).not.toContain("version");
      expect(Object.keys(tool.properties)).not.toContain("target");
      expect(tool.required).not.toContain("idempotency_key");
      expect(actionTool(tool.name)).toBe(tool);
    }
  });

  it("a person's own AI is shown the tools they can use somewhere: a member's, plus a moderator's, plus a builder's", () => {
    const names = (role: "member" | "moderator" | "builder") => actionToolsFor(role, "own_ai").map((tool) => tool.name);
    expect(names("member")).toEqual(["polynet_post", "polynet_reply", "polynet_edit_post", "polynet_delete_post", "polynet_react",
      "polynet_mark_lesson_done", "polynet_mark_channel_read", "polynet_reply_message"]);
    expect(names("moderator").filter((name) => !names("member").includes(name))).toEqual(["polynet_approve_join_requests", "polynet_decline_join_requests"]);
    // Every tool but the guide's own two.
    expect(names("builder")).toEqual(ACTION_TOOLS.filter((tool) => tool.door !== "guide").map((tool) => tool.name));
    expect(names("builder")).toHaveLength(ACTION_TOOLS.length - 2);
    expect(names("builder")).toContain("polynet_create_event");
    expect(names("moderator")).not.toContain("polynet_set_member_role");
  });

  it("over the MCP a guide-only tool doesn't exist: no role's own AI is given remembering or removing posts", () => {
    expect(ACTION_TOOLS.filter((tool) => tool.door === "guide").map((tool) => tool.name)).toEqual(["polynet_remember", "polynet_remove_posts"]);
    for (const role of ["member", "moderator", "builder"] as const) {
      const names = actionToolsFor(role, "own_ai").map((tool) => tool.name);
      expect(names, role).not.toContain("polynet_remember");
      expect(names, role).not.toContain("polynet_remove_posts");
    }
  });

  it("both doors, same tools: the guide and a person's own AI differ only by messages, remembering and removing posts", () => {
    const names = (role: "member" | "moderator" | "builder", door: "own_ai" | "guide") => actionToolsFor(role, door).map((tool) => tool.name);
    const shared = (role: "member" | "moderator" | "builder") => names(role, "own_ai").filter((name) => name !== "polynet_reply_message");
    for (const role of ["member", "moderator", "builder"] as const) {
      const ownAi = names(role, "own_ai");
      const guide = names(role, "guide");
      expect(ownAi.filter((name) => !guide.includes(name)), role).toEqual(["polynet_reply_message"]);
      expect(guide.filter((name) => !ownAi.includes(name)), role)
        .toEqual(role === "member" ? ["polynet_remember"] : ["polynet_remember", "polynet_remove_posts"]);
      expect(guide.filter((name) => name !== "polynet_remember" && name !== "polynet_remove_posts"), role).toEqual(shared(role));
    }
    expect(names("member", "guide")).toEqual(["polynet_post", "polynet_reply", "polynet_edit_post", "polynet_delete_post", "polynet_react",
      "polynet_mark_lesson_done", "polynet_mark_channel_read", "polynet_remember"]);
    expect(names("moderator", "guide").filter((name) => !names("member", "guide").includes(name)))
      .toEqual(["polynet_approve_join_requests", "polynet_decline_join_requests", "polynet_remove_posts"]);
    expect(names("builder", "guide")).toEqual(ACTION_TOOLS.filter((tool) => tool.door !== "own_ai").map((tool) => tool.name));
  });

  it("the guide's version of a tool has no community, retry key or revision input (the server fills them), and otherwise the very inputs the MCP version has", () => {
    for (const tool of ACTION_TOOLS) {
      const mcp = actionToolDefinition(tool).inputSchema as { properties: Record<string, unknown>; required: string[] };
      const guide = guideToolDefinition(tool);
      const schema = guide.inputSchema as { type: string; additionalProperties: boolean; properties: Record<string, unknown>; required: string[] };
      expect(guide.name).toBe(tool.name);
      expect(guide.description).toBe(tool.description);
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      for (const filled of ["community", "idempotency_key", "revision"]) {
        expect(Object.keys(schema.properties)).not.toContain(filled);
        expect(schema.required).not.toContain(filled);
      }
      const { community: _community, idempotency_key: _key, revision: _revision, ...rest } = mcp.properties;
      expect(schema.properties, tool.name).toEqual(rest);
      expect(schema.required, tool.name).toEqual(mcp.required.filter((key) => !["community", "revision"].includes(key)));
      // A person's own AI still names its action and gives the revision it read.
      expect(Object.keys(mcp.properties)).toContain("idempotency_key");
    }
    expect(guideToolDefinition(actionTool("polynet_remember")!).inputSchema).toMatchObject({ required: ["operations"] });
    const update = actionTool("polynet_update_community")!;
    expect((actionToolDefinition(update).inputSchema as any).required).toEqual(["community", "revision"]);
    expect((guideToolDefinition(update).inputSchema as any).required).toEqual([]);
    expect(Object.keys((guideToolDefinition(update).inputSchema as any).properties)).not.toContain("revision");
  });

  it("labels come from the list: what asks every time is marked as needing care, so the person's own AI app asks them", () => {
    const careful = (tools: typeof ACTION_TOOLS) => tools.filter((tool) => actionToolDefinition(tool).annotations.destructiveHint).map((tool) => tool.name);
    expect(careful(actionToolsFor("builder", "own_ai"))).toEqual(["polynet_delete_post", "polynet_publish_handbook", "polynet_set_member_role"]);
    // Removing posts asks every time too; only the guide is given it, after the person's yes.
    expect(careful(ACTION_TOOLS)).toEqual(["polynet_delete_post", "polynet_remove_posts", "polynet_publish_handbook", "polynet_set_member_role"]);
    for (const tool of ACTION_TOOLS) {
      expect(actionToolDefinition(tool).annotations.destructiveHint).toBe(actionToolEntry(tool).ask === "every_time");
      expect(actionToolDefinition(tool).annotations.readOnlyHint).toBe(false);
    }
  });
});

describe("a private talk's tools", () => {
  const read = ["polynet_list", "polynet_read", "polynet_search", "web_research"];
  const memberGuide = ["polynet_post", "polynet_reply", "polynet_edit_post", "polynet_delete_post", "polynet_react",
    "polynet_mark_lesson_done", "polynet_mark_channel_read", "polynet_remember"];

  it("reading, the web, then the named tools for that person's role in that community", () => {
    expect(talkToolNames({ lens: "member_private", relation: "member" })).toEqual([...read, ...memberGuide]);
    expect(talkToolNames({ lens: "member_private", relation: "moderator" }))
      .toEqual([...read, ...memberGuide, "polynet_approve_join_requests", "polynet_decline_join_requests", "polynet_remove_posts"]);
    const builder = talkToolNames({ lens: "builder_private", relation: "owner" });
    expect(builder).toEqual([...read, ...ACTION_TOOLS.filter((tool) => tool.door !== "own_ai").map((tool) => tool.name)]);
    expect(talkToolNames({ lens: "builder_private", relation: "admin" })).toEqual(builder);
    // No talk, no actions: reading and the web only.
    expect(talkToolNames(null)).toEqual(read);
    expect(talkToolNames(undefined)).toEqual(read);
  });

  it("no talk is given the general action tools, or a person's own messages", () => {
    for (const talk of [null, { lens: "member_private", relation: "member" }, { lens: "member_private", relation: "moderator" },
      { lens: "builder_private", relation: "owner" }] as const) {
      const names = talkToolNames(talk);
      for (const forbidden of ["polynet_write", "polynet_call", "polynet_reply_message"]) expect(names, JSON.stringify(talk)).not.toContain(forbidden);
    }
  });
});

describe("a named tool is the call the executor already runs", () => {
  const now = 1_800_000_000_000;
  const run = (name: string, args: Record<string, unknown>, at = now) => translateActionTool(actionTool(name)!, args, at);

  it("writes are written out: a post, a reply, an edit, a delete, a message", () => {
    expect(run("polynet_post", { community: "Run-Club", channel: "general", text: "Hi" })).toMatchObject({ toolName: "polynet_write",
      input: { path: "/communities/run-club/channels/general/", mode: "create", content: { text: "Hi" } } });
    expect(run("polynet_reply", { community: "run-club", channel: "general", post: "interaction:root:a1", text: "Yes" })).toMatchObject({
      input: { path: "/communities/run-club/channels/general/interaction:root:a1/", mode: "append", content: { text: "Yes" } } });
    expect(run("polynet_edit_post", { community: "run-club", channel: "general", post: "interaction:reply:b2", text: "Fixed" })).toMatchObject({
      input: { path: "/communities/run-club/channels/general/interaction:reply:b2.md", mode: "update", content: { text: "Fixed" } } });
    expect(run("polynet_delete_post", { community: "run-club", channel: "general", post: "interaction:root:a1" })).toMatchObject({
      input: { path: "/communities/run-club/channels/general/interaction:root:a1.md", mode: "delete", content: {} } });
    expect(run("polynet_reply_message", { conversation: "abcd1234", text: "On my way" })).toMatchObject({ toolName: "polynet_write",
      input: { path: "/messages/abcd1234/", mode: "append", content: { text: "On my way" } } });
  });

  it("actions are written out, with their defaults", () => {
    expect(run("polynet_react", { community: "run-club", post: "interaction:root:a1", emoji: "👍" })).toMatchObject({ toolName: "polynet_call",
      input: { operation: "community.interaction.react", version: 1, target: "/communities/run-club/capabilities/community.interaction.react.json",
        input: { ref: "interaction:root:a1", emoji: "👍", on: true } } });
    expect(run("polynet_react", { community: "run-club", post: "interaction:root:a1", emoji: "👍", on: false }).input).toMatchObject({ input: { on: false } });
    expect(run("polynet_require_approval_to_join", { community: "run-club" }).input).toMatchObject({ operation: "community.join_mode.set", input: { mode: "approval" } });
    expect(run("polynet_update_event", { community: "run-club", event: "e1", location_label: "Boathouse" }).input)
      .toMatchObject({ operation: "community.event.update", input: { event: "e1", location_label: "Boathouse" } });
    expect(run("polynet_approve_join_requests", { community: "run-club", requests: [{ ref: "join-request:r1", created_at: "t1", updated_at: "t2" }] }).input)
      .toMatchObject({ operation: "community.admission.approve", input: { requests: [{ request_ref: "join-request:r1", expected_created_at: "t1", expected_updated_at: "t2" }] } });
    expect(run("polynet_update_community", { community: "run-club", revision: 4, one_liner: "We run." }).input)
      .toMatchObject({ operation: "community.settings.update", input: { expected_revision: 4, one_liner: "We run." } });
  });

  it("the AI may name an action; unnamed, the very same action within a few minutes is a retry, and anything else is new", () => {
    const post = { community: "run-club", channel: "general", text: "Hi" };
    expect(run("polynet_post", { ...post, idempotency_key: "mine" }).input.idempotency_key).toBe("mine");
    const first = run("polynet_post", post).input.idempotency_key;
    expect(String(first).length).toBeLessThanOrEqual(135);
    expect(run("polynet_post", post, now + 1_000).input.idempotency_key).toBe(first);
    expect(run("polynet_post", post, now + ACTION_TOOL_RETRY_WINDOW_MS).input.idempotency_key).not.toBe(first);
    expect(run("polynet_post", { ...post, text: "Hi again" }).input.idempotency_key).not.toBe(first);
    expect(run("polynet_reply", { ...post, post: "interaction:root:a1" }).input.idempotency_key).not.toBe(first);
  });

  it("in the guide's talk the key is the server's, one per tool call; a key the guide sends is ignored", () => {
    const post = { community: "run-club", channel: "general", text: "Hi" };
    const guide = (callId: string, args: Record<string, unknown> = post, runId = "run1") =>
      translateActionTool(actionTool("polynet_post")!, args, now, { key: guideActionKey(runId, callId) }).input.idempotency_key;
    expect(guide("call_a")).toBe(guide("call_a"));
    expect(guide("call_a")).not.toBe(guide("call_b"));
    expect(guide("call_a")).not.toBe(guide("call_a", post, "run2"));
    expect(guide("call_a", { ...post, idempotency_key: "make-sam-moderator-20261118" })).toBe(guide("call_a"));
    expect(String(guide("call_a", post, "r".repeat(300))).length).toBeLessThanOrEqual(200);
  });

  it("in the guide's talk a settings change carries the revision the server read, not one the guide guessed", () => {
    const update = actionTool("polynet_update_community")!;
    const out = translateActionTool(update, { community: "run-club", revision: 0, one_liner: "We run." }, now, { key: "k", settingsRevision: 7 });
    expect(out.input).toMatchObject({ idempotency_key: "k", input: { expected_revision: 7, one_liner: "We run." } });
    // A person's own AI still sends its own.
    expect(translateActionTool(update, { community: "run-club", revision: 3, one_liner: "x" }, now).input).toMatchObject({ input: { expected_revision: 3 } });
  });
});
