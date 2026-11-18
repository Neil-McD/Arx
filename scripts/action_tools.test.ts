import { describe, expect, it } from "vitest";
import { ACTION_TOOLS, ACTION_TOOL_RETRY_WINDOW_MS, NOT_PUBLISHED, actionTool, actionToolDefinition, actionToolEntry, actionToolsFor, translateActionTool } from "../shared/actionTools";
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

  it("a person is shown the tools they can use somewhere: a member's, plus a moderator's, plus a builder's", () => {
    const names = (role: "member" | "moderator" | "builder") => actionToolsFor(role).map((tool) => tool.name);
    expect(names("member")).toEqual(["polynet_post", "polynet_reply", "polynet_edit_post", "polynet_delete_post", "polynet_react",
      "polynet_mark_lesson_done", "polynet_mark_channel_read", "polynet_reply_message"]);
    expect(names("moderator").filter((name) => !names("member").includes(name))).toEqual(["polynet_approve_join_requests", "polynet_decline_join_requests"]);
    expect(names("builder")).toHaveLength(ACTION_TOOLS.length);
    expect(names("builder")).toContain("polynet_create_event");
    expect(names("moderator")).not.toContain("polynet_set_member_role");
  });

  it("labels come from the list: what asks every time is marked as needing care, so the person's own AI app asks them", () => {
    const careful = ACTION_TOOLS.filter((tool) => actionToolDefinition(tool).annotations.destructiveHint).map((tool) => tool.name);
    expect(careful).toEqual(["polynet_delete_post", "polynet_publish_handbook", "polynet_set_member_role"]);
    for (const tool of ACTION_TOOLS) {
      expect(actionToolDefinition(tool).annotations.destructiveHint).toBe(actionToolEntry(tool).ask === "every_time");
      expect(actionToolDefinition(tool).annotations.readOnlyHint).toBe(false);
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
});
