import { describe, expect, it } from "vitest";
import { ACTION_TOOLS, ACTION_TOOL_RETRY_WINDOW_MS, NOT_PUBLISHED, actionTool, actionToolDefinition, actionToolEntry, actionToolsFor, guideActionKey, guideToolDefinition, translateActionTool } from "../shared/actionTools";
import { talkToolNames } from "../shared/lens";
import { getPolynetMcpToolDefinitions } from "../shared/polynetMcp";
import { toolArgumentProblems } from "../shared/toolArgumentCheck";
import { CALL_OPERATIONS, CALL_OPERATION_VARIANTS, TOOL_OPERATIONS } from "../shared/operationCatalog";

const LISTED = { ...TOOL_OPERATIONS, ...CALL_OPERATIONS, ...CALL_OPERATION_VARIANTS } as Record<string, { ask: string; lens: string }>;

describe("one named tool per action", () => {
  // Remembering, and building courses in one batch, are the guide's own. An
  // outside AI gets one tool per course job instead (OpenAI's plugin review
  // asks that every operation be its own tool). Removing posts and members,
  // and banning, are offered through both doors: Polynet asks first.
  const GUIDE_ONLY = ["polynet_change_courses", "polynet_remember", "polynet_update_soul"];
  const OWN_AI_ONLY = ["polynet_create_course", "polynet_add_lesson", "polynet_edit_lesson", "polynet_edit_course",
    "polynet_order_lessons", "polynet_order_courses", "polynet_delete_draft"];

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
      "polynet_mark_lesson_done", "polynet_mark_channel_read", "polynet_request_join_pod", "polynet_reply_message"]);
    // Removing posts, like changing a role or banning, is asked about in Polynet before it runs.
    expect(names("moderator").filter((name) => !names("member").includes(name))).toEqual(["polynet_approve_join_requests", "polynet_decline_join_requests", "polynet_remove_posts"]);
    // Every tool but the guide's own ones (remembering, and building courses in one batch).
    expect(names("builder")).toEqual(ACTION_TOOLS.filter((tool) => tool.door !== "guide").map((tool) => tool.name));
    expect(names("builder")).toHaveLength(ACTION_TOOLS.length - GUIDE_ONLY.length);
    expect(names("builder")).toContain("polynet_create_event");
    expect(names("moderator")).not.toContain("polynet_set_member_role");
  });

  it("over the MCP a guide-only tool doesn't exist: no role's own AI is given remembering or the course batch", () => {
    expect(ACTION_TOOLS.filter((tool) => tool.door === "guide").map((tool) => tool.name).sort()).toEqual([...GUIDE_ONLY].sort());
    for (const role of ["member", "moderator", "builder"] as const) {
      const names = actionToolsFor(role, "own_ai").map((tool) => tool.name);
      for (const name of GUIDE_ONLY) expect(names, role).not.toContain(name);
    }
  });

  it("both doors, same tools: the guide has everything a person's own AI has, plus remembering; courses are one batch for the guide, one tool per job for an outside AI", () => {
    const names = (role: "member" | "moderator" | "builder", door: "own_ai" | "guide") => actionToolsFor(role, door).map((tool) => tool.name);
    for (const role of ["member", "moderator", "builder"] as const) {
      const ownAi = names(role, "own_ai");
      const guide = names(role, "guide");
      const builder = role === "builder";
      expect(ownAi.filter((name) => !guide.includes(name)).sort(), role).toEqual(builder ? [...OWN_AI_ONLY].sort() : []);
      expect(guide.filter((name) => !ownAi.includes(name)).sort(), role)
        .toEqual(builder ? [...GUIDE_ONLY].sort() : ["polynet_remember", "polynet_update_soul"]);
      expect(guide.filter((name) => !GUIDE_ONLY.includes(name)), role).toEqual(ownAi.filter((name) => !OWN_AI_ONLY.includes(name)));
    }
    expect(names("member", "guide")).toEqual(["polynet_post", "polynet_reply", "polynet_edit_post", "polynet_delete_post", "polynet_react",
      "polynet_mark_lesson_done", "polynet_mark_channel_read", "polynet_request_join_pod", "polynet_reply_message", "polynet_remember", "polynet_update_soul"]);
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
      // The MCP's words, except where the guide has its own: only for a tool the
      // guide asks about, whose yes in a private talk is a button, never words.
      // The guide's only inputs (the person's talk pictures) are told in one sentence on the tool.
      expect(guide.description).toBe(`${tool.guideDescription ?? tool.description}${tool.guideOnly ? ` ${tool.guideOnly.sentence}` : ""}`);
      if (tool.guideDescription) {
        expect(["every_time", "words"], tool.name).toContain(actionToolEntry(tool).ask);
        expect(tool.guideDescription, tool.name).not.toMatch(/get their yes/);
      }
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      for (const filled of ["community", "idempotency_key", "revision"]) {
        expect(Object.keys(schema.properties)).not.toContain(filled);
        expect(schema.required).not.toContain(filled);
      }
      const { community: _community, idempotency_key: _key, revision: _revision, ...rest } = mcp.properties;
      expect(schema.properties, tool.name).toEqual({ ...rest, ...tool.guideOnly?.properties });
      expect(schema.required, tool.name).toEqual(tool.guideOnly?.required ?? mcp.required.filter((key) => !["community", "revision"].includes(key)));
      // A person's own AI is never shown the guide's only inputs.
      for (const key of Object.keys(tool.guideOnly?.properties ?? {})) expect(Object.keys(mcp.properties), tool.name).not.toContain(key);
      // A person's own AI still names its action and gives the revision it read.
      expect(Object.keys(mcp.properties)).toContain("idempotency_key");
    }
    expect(guideToolDefinition(actionTool("polynet_remember")!).inputSchema).toMatchObject({ required: ["operations"] });
    const update = actionTool("polynet_update_community")!;
    expect((actionToolDefinition(update).inputSchema as any).required).toEqual(["community", "revision"]);
    expect((guideToolDefinition(update).inputSchema as any).required).toEqual([]);
    expect(Object.keys((guideToolDefinition(update).inputSchema as any).properties)).not.toContain("revision");
  });

  it("only posting and replying have a guide-only input: the pictures the person attached in the talk, said in one sentence, never on the MCP", () => {
    expect(ACTION_TOOLS.filter((tool) => tool.guideOnly).map((tool) => tool.name)).toEqual(["polynet_post", "polynet_reply"]);
    for (const name of ["polynet_post", "polynet_reply"]) {
      const tool = actionTool(name)!;
      const guide = guideToolDefinition(tool) as any;
      expect(Object.keys(guide.inputSchema.properties)).toContain("pictures");
      expect(guide.description).toMatch(/If they attached pictures and want them in the (post|reply), set pictures\.$/);
      const mcp = actionToolDefinition(tool) as any;
      expect(Object.keys(mcp.inputSchema.properties)).not.toContain("pictures");
      expect(mcp.description).not.toMatch(/pictures/);
      // A post may be pictures alone for the guide; a person's own AI still gives words.
      expect(mcp.inputSchema.required).toContain("text");
      expect(guide.inputSchema.required).not.toContain("text");
    }
    // The pictures go to the executor from either door (which refuses them from a person's own AI).
    expect(translateActionTool(actionTool("polynet_post")!, { community: "c", channel: "general", text: "Hi", pictures: "all" }, 0).input)
      .toMatchObject({ content: { text: "Hi", pictures: "all" } });
    expect((translateActionTool(actionTool("polynet_post")!, { community: "c", channel: "general", text: "Hi" }, 0).input as any).content).toEqual({ text: "Hi" });
  });

  it("labels tell the person's own AI app the truth: what emails members, replaces, removes or decides who is in needs care; what makes something new isn't a retry", () => {
    const careful = (tools: typeof ACTION_TOOLS) => tools.filter((tool) => actionToolDefinition(tool).annotations.destructiveHint).map((tool) => tool.name).sort();
    // Only adding or marking something for the person runs without care.
    expect(ACTION_TOOLS.filter((tool) => !actionToolDefinition(tool).annotations.destructiveHint).map((tool) => tool.name).sort()).toEqual([
      "polynet_create_channel", "polynet_create_course", "polynet_mark_channel_read", "polynet_mark_lesson_done", "polynet_move_channel",
      "polynet_post", "polynet_react", "polynet_remember", "polynet_reply", "polynet_request_join_pod", "polynet_update_soul",
    ]);
    // Everything that asks every time is among the careful ones.
    for (const tool of ACTION_TOOLS) {
      if (actionToolEntry(tool).ask === "every_time") expect(actionToolDefinition(tool).annotations.destructiveHint).toBe(true);
      expect(actionToolDefinition(tool).annotations.readOnlyHint).toBe(false);
    }
    expect(careful(actionToolsFor("builder", "own_ai"))).toContain("polynet_create_event");
    // A careful tool tells an outside AI to get the person's yes; the guide's copy doesn't (its questions come from the server).
    const event = ACTION_TOOLS.find((tool) => tool.name === "polynet_create_event")!;
    expect(actionToolDefinition(event).description).toMatch(/emailed a reminder[\s\S]*get their yes before calling it/);
    expect(guideToolDefinition(event).description).not.toMatch(/get their yes/);
    expect(event.description).not.toMatch(/Nothing is sent/);
    // Making something new twice makes two; setting something twice is the same as once.
    const repeats = (name: string) => actionToolDefinition(ACTION_TOOLS.find((tool) => tool.name === name)!).annotations.idempotentHint;
    for (const name of ["polynet_post", "polynet_reply", "polynet_reply_message", "polynet_create_channel", "polynet_create_event"]) expect(repeats(name)).toBe(false);
    for (const name of ["polynet_react", "polynet_rename_channel", "polynet_update_community", "polynet_cancel_event"]) expect(repeats(name)).toBe(true);
  });
});

describe("a private talk's tools", () => {
  const read = ["polynet_list", "polynet_read", "polynet_search", "web_research"];
  const memberGuide = ["polynet_post", "polynet_reply", "polynet_edit_post", "polynet_delete_post", "polynet_react",
    "polynet_mark_lesson_done", "polynet_mark_channel_read", "polynet_request_join_pod", "polynet_reply_message", "polynet_remember", "polynet_update_soul"];

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

  it("no talk is given the general action tools; replying in the person's own messages is a private talk's only", () => {
    for (const talk of [null, { lens: "member_private", relation: "member" }, { lens: "member_private", relation: "moderator" },
      { lens: "builder_private", relation: "owner" }] as const) {
      const names = talkToolNames(talk);
      for (const forbidden of ["polynet_write", "polynet_call"]) expect(names, JSON.stringify(talk)).not.toContain(forbidden);
      expect(names.includes("polynet_reply_message"), JSON.stringify(talk)).toBe(talk !== null);
    }
  });
});

describe("a named tool is the call the executor already runs", () => {
  const now = 1_800_000_000_000;
  const run = (name: string, args: Record<string, unknown>, at = now) => translateActionTool(actionTool(name)!, args, at);

  it("every course change carries a summary line: the engine refuses a batch without one", () => {
    const summaryOf = (name: string, args: Record<string, unknown>) => (run(name, { community: "run-club", ...args }).input as any).content.summary;
    expect(summaryOf("polynet_create_course", { name: "Your first 5k" })).toBe("Make a course: Your first 5k");
    expect(summaryOf("polynet_add_lesson", { course: "m1", title: "Week 1" })).toBe("Add a lesson: Week 1");
    expect(summaryOf("polynet_order_lessons", { course: "m1", lessons: ["a", "b"] })).toBe("Put a course's lessons in order");
    expect(summaryOf("polynet_delete_draft", { course: "m1", updated_at: 1 })).toBe("Delete a draft course");
    // The guide's batch keeps its own line, and gets one when it gave none.
    expect(summaryOf("polynet_change_courses", { summary: "Tidy week 1.", operations: [{ op: "create_module", name: "X" }] })).toBe("Tidy week 1.");
    expect(summaryOf("polynet_change_courses", { operations: [{ op: "create_module", name: "X" }, { op: "create_page", title: "Y" }] }))
      .toBe("Change courses and lessons (2 changes)");
  });

  it("a lesson's video goes to the engine as its url; null or empty removes it; left out, nothing", () => {
    const op = (name: string, args: Record<string, unknown>) => (run(name, { community: "run-club", ...args }).input as any).content.operations[0];
    expect(op("polynet_add_lesson", { course: "m1", title: "Week 1", video: " https://youtu.be/dQw4w9WgXcQ ", lesson_links: [{ title: "Plan", url: "https://example.com/plan" }] }))
      .toEqual({ op: "create_page", module_id: "m1", title: "Week 1", url: "https://youtu.be/dQw4w9WgXcQ", lesson_links: [{ title: "Plan", url: "https://example.com/plan" }] });
    expect(op("polynet_edit_lesson", { lesson: "l1", updated_at: 1, video: null })).toMatchObject({ op: "edit_page", url: "" });
    expect(op("polynet_edit_lesson", { lesson: "l1", updated_at: 1, video: "" })).toMatchObject({ url: "" });
    expect(op("polynet_edit_lesson", { lesson: "l1", updated_at: 1, title: "New" })).not.toHaveProperty("url");
    // The guide's batch: a null url (no video) goes as "", so the executor doesn't drop it.
    expect(op("polynet_change_courses", { operations: [{ op: "edit_page", resource_id: "l1", expected_updated_at: 1, url: null }] }))
      .toEqual({ op: "edit_page", resource_id: "l1", expected_updated_at: 1, url: "" });
  });

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
    // Removing and banning members name the people; a ban's reason goes with it only when given.
    expect(run("polynet_remove_members", { community: "run-club", members: ["priya-shah"] })).toMatchObject({ toolName: "polynet_call",
      input: { operation: "community.members.remove", input: { members: ["priya-shah"] } } });
    expect(run("polynet_ban_members", { community: "run-club", members: ["priya-shah"], reason: "Spam" }).input)
      .toMatchObject({ operation: "community.members.ban", input: { members: ["priya-shah"], reason: "Spam" } });
    expect((run("polynet_ban_members", { community: "run-club", members: ["priya-shah"] }).input as any).input).toEqual({ members: ["priya-shah"] });
  });

  it("actions are written out, with their defaults", () => {
    expect(run("polynet_react", { community: "run-club", post: "interaction:root:a1", emoji: "👍" })).toMatchObject({ toolName: "polynet_call",
      input: { operation: "community.interaction.react", version: 1, target: "/communities/run-club/capabilities/community.interaction.react.json",
        input: { ref: "interaction:root:a1", emoji: "👍", on: true } } });
    expect(run("polynet_react", { community: "run-club", post: "interaction:root:a1", emoji: "👍", on: false }).input).toMatchObject({ input: { on: false } });
    expect(run("polynet_require_approval_to_join", { community: "run-club" }).input).toMatchObject({ operation: "community.join_mode.set", input: { mode: "approval" } });
    expect(run("polynet_update_event", { community: "run-club", event: "e1", location_label: "Boathouse" }).input)
      .toMatchObject({ operation: "community.event.update", input: { event: "e1", location_label: "Boathouse" } });
    expect(run("polynet_cancel_event", { community: "run-club", event: "e1", scope: "occurrence", occurrence_starts_at: "2026-12-04T15:00:00.000Z", note: "Out this week" }).input)
      .toMatchObject({ operation: "community.event.cancel", input: { event: "e1", scope: "occurrence", occurrence_starts_at: "2026-12-04T15:00:00.000Z", note: "Out this week" } });
    expect(run("polynet_announce", { community: "run-club", channel: "general", text: "No call this Thursday.", send_email: false }).input)
      .toMatchObject({ operation: "community.announcement.post", input: { channel: "general", text: "No call this Thursday.", send_email: false } });
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

describe("an outside AI's arguments are checked against the published shapes", () => {
  it("every pattern in every published shape is a valid check, and an empty call says what is missing", () => {
    const patterns: string[] = [];
    const walk = (schema: unknown) => {
      if (!schema || typeof schema !== "object") return;
      for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
        if (key === "pattern" && typeof value === "string") patterns.push(value);
        else if (value && typeof value === "object") Array.isArray(value) ? value.forEach(walk) : walk(value);
      }
    };
    const shapes = [...ACTION_TOOLS.map((tool) => actionToolDefinition(tool).inputSchema),
      ...getPolynetMcpToolDefinitions().filter((tool) => tool.annotations.readOnlyHint === true).map((tool) => tool.inputSchema)];
    shapes.forEach(walk);
    for (const pattern of patterns) expect(() => new RegExp(pattern, "u")).not.toThrow();
    for (const tool of ACTION_TOOLS) {
      const required = actionToolDefinition(tool).inputSchema.required as string[];
      expect(toolArgumentProblems(actionToolDefinition(tool).inputSchema, {})).toEqual(required.slice(0, 8).map((key) => `${key}: missing`));
    }
  });
});

describe("what reviewers and their scanners check, on every tool an outside AI is shown", () => {
  // Internal words an outside AI should never read, and anything that sells.
  const BANNED = /repository|subtree|private talk|stable resource|\blens\b|semantic|authority_lane|principal|\bthe guide\b|\$\d|price|checkout|upgrade|subscribe/i;
  const shown = () => [
    ...getPolynetMcpToolDefinitions().filter((tool) => tool.annotations.readOnlyHint === true),
    ...actionToolsFor("builder", "own_ai").map(actionToolDefinition),
  ];
  it("each has a title, all four labels set on purpose, a short name, a short plain description, and a result shape", () => {
    for (const tool of shown() as any[]) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(64);
      expect(tool.title ?? tool.annotations.title, tool.name).toBeTruthy();
      for (const label of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) expect(typeof tool.annotations[label], `${tool.name} ${label}`).toBe("boolean");
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(600);
      expect(tool.description, tool.name).not.toMatch(BANNED);
      expect(JSON.stringify(tool.inputSchema), tool.name).not.toMatch(/repository|subtree|private talk|stable resource/i);
      expect(tool.outputSchema, tool.name).toBeTruthy();
      // What waits for the person's Yes is said once.
      expect((tool.description.match(/asked first|Waits for the person's Yes/g) ?? []).length, tool.name).toBeLessThanOrEqual(1);
    }
  });
  it("what emails people is labelled as reaching beyond the chat; the rest isn't", () => {
    const open = (shown() as any[]).filter((tool) => tool.annotations.openWorldHint).map((tool) => tool.name).sort();
    expect(open).toEqual(["polynet_announce", "polynet_approve_join_requests", "polynet_cancel_event", "polynet_create_event", "polynet_send_guide_draft", "polynet_update_community", "polynet_update_event"]);
  });
  it("an outside AI is told a DM reply is sent, never that the person is asked", () => {
    const dm = actionToolDefinition(ACTION_TOOLS.find((tool) => tool.name === "polynet_reply_message")!);
    expect(dm.description).toMatch(/sent at once and marked as written through an AI/);
    expect(dm.description).not.toMatch(/asked first|shown who it goes to/);
  });
});
