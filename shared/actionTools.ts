// One named tool per action, for a person's own AI (the MCP).
//
// Reading Polynet is browsing, so three general tools do it: polynet_list,
// polynet_read, polynet_search. Acting is a short, fixed set of verbs, and an
// AI gets a verb right when the tool's own name and inputs say what to do. So
// each action in shared/operationCatalog.ts is published as its own tool with
// plain inputs. Nothing new runs: a named tool is translated into the same
// polynet_write or polynet_call the executor already runs, with the same
// checks, limits and receipts (convex/polynetCanonicalExecutor.ts).
//
// The table below is the whole presentation. `catalog` names the entry each
// tool stands for; its labels (who may do it, how the person is asked) come
// from there, never from here. scripts/action_tools.test.ts holds that every
// action has exactly one named tool or is listed in NOT_PUBLISHED.

import { CALL_OPERATION_VARIANTS, CALL_OPERATIONS, requestFingerprint, TOOL_OPERATIONS, type OperationEntry } from "./operationCatalog.ts";
import type { PlatformOperationJsonSchema } from "./platformOperationContract.ts";

export type ActionToolRole = "member" | "moderator" | "builder";

type Args = Record<string, any>;
type Translated = { toolName: "polynet_write" | "polynet_call"; input: Record<string, unknown> };

export type ActionTool = {
  name: string;
  title: string;
  description: string;
  // The entry in the one list this tool stands for.
  catalog: string;
  properties: Record<string, PlatformOperationJsonSchema>;
  required: string[];
  translate: (args: Args) => Omit<Translated, "input"> & { input: Record<string, unknown> };
};

// ---- shared input pieces

const COMMUNITY: PlatformOperationJsonSchema = { type: "string", minLength: 1, maxLength: 64,
  description: "The community's address: the <slug> in /communities/<slug>/ from polynet_list." };
const CHANNEL: PlatformOperationJsonSchema = { type: "string", minLength: 1, maxLength: 64,
  description: "The channel's slug from the channels listing, such as general." };
const POST: PlatformOperationJsonSchema = { type: "string", pattern: "^interaction:(root|reply):[A-Za-z0-9_-]+$", maxLength: 180,
  description: "The post's ref from a channel or thread listing, such as interaction:root:abc123." };
const ROOT_POST: PlatformOperationJsonSchema = { type: "string", pattern: "^interaction:root:[A-Za-z0-9_-]+$", maxLength: 180,
  description: "The ref of the post being answered (the first post of the thread), such as interaction:root:abc123." };
const TEXT = (what: string, max: number): PlatformOperationJsonSchema => ({ type: "string", minLength: 1, maxLength: max, description: what });
const MEMBERS: PlatformOperationJsonSchema = { type: "array", minItems: 1, maxItems: 50,
  items: { type: "string", pattern: "^user:[A-Za-z0-9]+$", maxLength: 180 },
  description: "The people, as user:<id> refs from the members listing." };
const EVENT: PlatformOperationJsonSchema = { type: "string", minLength: 1, maxLength: 64,
  description: "The event's parent_event_id from the events listing." };
const KEY: PlatformOperationJsonSchema = { type: "string", minLength: 1, maxLength: 120,
  description: "Optional. A name of your own for this one action; sending the same name again replays the first answer instead of doing it twice." };

const EVENT_FIELDS: Record<string, PlatformOperationJsonSchema> = {
  title: TEXT("What the event is called.", 200),
  starts_at: { type: "string", maxLength: 40, description: "When it starts: an ISO time with its offset, such as 2026-11-21T07:00:00-05:00." },
  ends_at: { type: ["string", "null"], maxLength: 40, description: "When it ends (ISO), or null for no set end." },
  timezone: { type: "string", maxLength: 64, description: "The zone members read the time in: an IANA zone such as America/New_York." },
  location_type: { type: "string", enum: ["online", "physical", "tbd"], description: "online, physical or tbd." },
  location_label: { type: ["string", "null"], maxLength: 500, description: "The place, in words." },
  url: { type: ["string", "null"], maxLength: 2_000, description: "A link to join or read more (https)." },
  description_md: { type: ["string", "null"], maxLength: 10_000, description: "What to expect, in markdown." },
  recurrence_frequency: { type: "string", enum: ["none", "daily", "weekly", "monthly"], description: "How it repeats." },
  recurrence_interval: { type: "integer", minimum: 1, maximum: 52, description: "Every how many (1 by default)." },
  recurrence_until: { type: ["string", "null"], maxLength: 40, description: "The last day it repeats (ISO), or null." },
};

// ---- translation helpers

const root = (community: unknown) => `/communities/${String(community ?? "").trim().toLowerCase()}/`;
const only = (args: Args, keys: string[]) => Object.fromEntries(keys.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
const call = (operation: string, args: Args, input: Record<string, unknown>): Translated => ({
  toolName: "polynet_call",
  input: { operation, version: 1, target: `${root(args.community)}capabilities/${operation}.json`, input },
});
const write = (path: string, mode: string, content: Record<string, unknown>): Translated => ({ toolName: "polynet_write", input: { path, mode, content } });

function tool(name: string, catalog: string, title: string, description: string, properties: Record<string, PlatformOperationJsonSchema>,
  required: string[], translate: ActionTool["translate"]): ActionTool {
  return { name, catalog, title, description, properties: { ...properties, idempotency_key: KEY }, required, translate };
}

// ---- the tools

export const ACTION_TOOLS: ActionTool[] = [
  // A member, as themselves.
  tool("polynet_post", "polynet_write:channels", "Post in a channel",
    "Start a new post in a channel, as the person you act for. Read the community's rules.md and the channel's recent posts first.",
    { community: COMMUNITY, channel: CHANNEL, text: TEXT("The post, as it will appear.", 8_000) }, ["community", "channel", "text"],
    (a) => write(`${root(a.community)}channels/${a.channel}/`, "create", { text: a.text })),
  tool("polynet_reply", "polynet_write:channels", "Reply to a post",
    "Reply in a post's thread, as the person you act for.",
    { community: COMMUNITY, channel: CHANNEL, post: ROOT_POST, text: TEXT("The reply, as it will appear.", 8_000) }, ["community", "channel", "post", "text"],
    (a) => write(`${root(a.community)}channels/${a.channel}/${a.post}/`, "append", { text: a.text })),
  tool("polynet_edit_post", "polynet_write:channels", "Edit your own post",
    "Change the words of a post or reply the person you act for wrote. Not for anyone else's.",
    { community: COMMUNITY, channel: CHANNEL, post: POST, text: TEXT("The new words, in full.", 8_000) }, ["community", "channel", "post", "text"],
    (a) => write(`${root(a.community)}channels/${a.channel}/${a.post}.md`, "update", { text: a.text })),
  tool("polynet_delete_post", "polynet_write:channels:delete", "Delete your own post",
    "Delete a post or reply the person you act for wrote. It can't be brought back. Not for anyone else's.",
    { community: COMMUNITY, channel: CHANNEL, post: POST }, ["community", "channel", "post"],
    (a) => write(`${root(a.community)}channels/${a.channel}/${a.post}.md`, "delete", {})),
  tool("polynet_react", "community.interaction.react", "React to a post",
    "Add the person's reaction to a post or reply, or take it off.",
    { community: COMMUNITY, post: POST, emoji: { type: "string", minLength: 1, maxLength: 32, description: "One emoji." },
      on: { type: "boolean", description: "true adds the reaction (the default), false takes it off." } }, ["community", "post", "emoji"],
    (a) => call("community.interaction.react", a, { ref: a.post, emoji: a.emoji, on: a.on !== false })),
  tool("polynet_mark_lesson_done", "community.lesson.set_done", "Mark a lesson done",
    "Mark a lesson done, or not done, for the person you act for.",
    { community: COMMUNITY, lesson: { type: "string", pattern: "^resource:[A-Za-z0-9_-]+$", maxLength: 180, description: "The lesson's ref from a course listing, such as resource:abc123." },
      done: { type: "boolean", description: "true marks it done (the default), false marks it not done." } }, ["community", "lesson"],
    (a) => call("community.lesson.set_done", a, { ref: a.lesson, done: a.done !== false })),
  tool("polynet_mark_channel_read", "community.channel.mark_read", "Mark a channel read",
    "Mark everything in a channel as read for the person you act for.",
    { community: COMMUNITY, channel: CHANNEL }, ["community", "channel"],
    (a) => call("community.channel.mark_read", a, { channel: a.channel })),
  tool("polynet_reply_message", "polynet_write:messages", "Reply in a direct message",
    "Reply in a direct-message conversation the person is already in. List /messages/ for their conversations and read one before replying. You can't start a new conversation.",
    { conversation: { type: "string", minLength: 4, maxLength: 80, description: "The conversation's id: the <id> in /messages/<id>/ from polynet_list." },
      text: TEXT("The reply, as it will appear.", 4_000) }, ["conversation", "text"],
    (a) => write(`/messages/${a.conversation}/`, "append", { text: a.text })),

  // A moderator.
  ...(["approve", "deny"] as const).map((verb) => tool(`polynet_${verb === "approve" ? "approve" : "decline"}_join_requests`, `community.admission.${verb}`,
    `${verb === "approve" ? "Approve" : "Decline"} people asking to join`,
    `${verb === "approve" ? "Let in" : "Turn down"} people who asked to join. List the community's builder/join-requests/ first and copy each request's ref, created_at and updated_at from it.`,
    { community: COMMUNITY, requests: { type: "array", minItems: 1, maxItems: 50, description: "The requests, each as listed.",
      items: { type: "object", additionalProperties: false, required: ["ref", "created_at", "updated_at"], properties: {
        ref: { type: "string", pattern: "^join-request:[A-Za-z0-9]+$", maxLength: 180 },
        created_at: { type: "string", maxLength: 24 }, updated_at: { type: "string", maxLength: 24 } } } } }, ["community", "requests"],
    (a) => call(`community.admission.${verb}`, a, { requests: (Array.isArray(a.requests) ? a.requests : []).map((request: Args) => ({
      request_ref: request?.ref, expected_created_at: request?.created_at, expected_updated_at: request?.updated_at })) }))),

  // A builder (owner or admin).
  tool("polynet_update_community", "community.settings.update", "Change the community's details",
    "Change the community's name, address, one-liner, about text or whether it is listed. Read builder/community.json first for the current values and its settings_revision.",
    { community: COMMUNITY, revision: { type: "integer", minimum: 0, description: "settings_revision from builder/community.json: a change made since you read it is refused." },
      name: TEXT("The community's name (owner only).", 120), slug: TEXT("Its address (owner only). Its links move with it.", 64),
      one_liner: { type: ["string", "null"], maxLength: 280, description: "One line on what it is." },
      about: { type: ["string", "null"], maxLength: 8_000, description: "The longer description." },
      visibility: { type: "string", enum: ["published", "unlisted"], description: "published lists it in Discover (owner only); unlisted hides it." } }, ["community", "revision"],
    (a) => call("community.settings.update", a, { expected_revision: a.revision, ...only(a, ["name", "slug", "one_liner", "about", "visibility"]) })),
  tool("polynet_require_approval_to_join", "community.join_mode.set", "Make joining need approval",
    "Set the community so people ask to join and a host answers. Opening a community to everyone is done by a person in the app, never here.",
    { community: COMMUNITY }, ["community"],
    (a) => call("community.join_mode.set", a, { mode: "approval" })),
  tool("polynet_set_guide_instructions", "community.agent.instructions.set", "Set the guide's instructions",
    "Replace what the community's own guide is told about this community. Empty text clears it.",
    { community: COMMUNITY, text: { type: "string", maxLength: 40_000, description: "The instructions, in full." } }, ["community", "text"],
    (a) => call("community.agent.instructions.set", a, { text: a.text })),
  tool("polynet_save_handbook_draft", "community.handbook.save_draft", "Save a handbook draft",
    "Save a draft of the community's handbook. Members and the guide don't see a draft.",
    { community: COMMUNITY, text: { type: "string", maxLength: 6_000, description: "The draft, in markdown." } }, ["community", "text"],
    (a) => call("community.handbook.save_draft", a, { text: a.text })),
  tool("polynet_publish_handbook", "community.handbook.approve", "Publish the handbook to members",
    "Publish exactly this text as the handbook every member and the guide reads. Show the person the text and get their yes first. Empty text takes the handbook away.",
    { community: COMMUNITY, text: { type: "string", maxLength: 6_000, description: "The handbook, in markdown, exactly as members will read it." } }, ["community", "text"],
    (a) => call("community.handbook.approve", a, { text: a.text })),
  tool("polynet_create_channel", "community.channel.create", "Make a channel",
    "Make a new channel open to every member. A private channel is made in the app.",
    { community: COMMUNITY, name: TEXT("The channel's name.", 40) }, ["community", "name"],
    (a) => call("community.channel.create", a, { name: a.name })),
  tool("polynet_rename_channel", "community.channel.rename", "Rename a channel",
    "Give a channel a new name. Its slug stays. General can't be renamed.",
    { community: COMMUNITY, channel: CHANNEL, name: TEXT("The new name.", 40) }, ["community", "channel", "name"],
    (a) => call("community.channel.rename", a, { channel: a.channel, name: a.name })),
  tool("polynet_describe_channel", "community.channel.describe", "Describe a channel",
    "Set the one line that says what a channel is for. Empty text clears it.",
    { community: COMMUNITY, channel: CHANNEL, description: { type: "string", maxLength: 120, description: "One line, or empty to clear it." } }, ["community", "channel", "description"],
    (a) => call("community.channel.describe", a, { channel: a.channel, description: a.description })),
  tool("polynet_move_channel", "community.channel.move", "Put a channel in order",
    "Move a channel to sit after another one, or first. General is always first and can't be moved.",
    { community: COMMUNITY, channel: CHANNEL, after: { type: ["string", "null"], maxLength: 64, description: "The slug of the channel it should follow; leave out or null to put it first." } }, ["community", "channel"],
    (a) => call("community.channel.move", a, { channel: a.channel, after: a.after ?? null })),
  tool("polynet_create_event", "community.event.create", "Make an event",
    "Make an event members see. Work out the exact date, time and time zone with the person first. Nothing is sent to members.",
    { community: COMMUNITY, ...EVENT_FIELDS }, ["community", "title", "starts_at", "timezone"],
    (a) => call("community.event.create", a, only(a, Object.keys(EVENT_FIELDS)))),
  tool("polynet_update_event", "community.event.update", "Change an event",
    "Change an event. Only the fields you give are changed.",
    { community: COMMUNITY, event: EVENT, ...EVENT_FIELDS }, ["community", "event"],
    (a) => call("community.event.update", a, { event: a.event, ...only(a, Object.keys(EVENT_FIELDS)) })),
  tool("polynet_cancel_event", "community.event.cancel", "Cancel an event",
    "Cancel an event. It stays in the list, marked cancelled; a person can put it back in the app.",
    { community: COMMUNITY, event: EVENT }, ["community", "event"],
    (a) => call("community.event.cancel", a, { event: a.event })),
  tool("polynet_set_member_role", "community.members.set_role", "Change people's role",
    "Make people admins, moderators or plain members. This changes who runs the community: name the people and the role to the person and get their yes first.",
    { community: COMMUNITY, members: MEMBERS, role: { type: "string", enum: ["member", "moderator", "admin"], description: "The role to give them." } }, ["community", "members", "role"],
    (a) => call("community.members.set_role", a, { members: a.members, role: a.role })),
  tool("polynet_unban_members", "community.members.unban", "Lift a ban",
    "Lift the ban on people so they can ask to join again.",
    { community: COMMUNITY, members: MEMBERS }, ["community", "members"],
    (a) => call("community.members.unban", a, { members: a.members })),
  tool("polynet_change_courses", "polynet_write:builder", "Change courses and lessons",
    "Make, edit, move and order courses and lessons, as one batch that is applied whole or not at all. A new course is a draft; publishing is done by a person in the app. Read the community's builder/resources/ first: it lists the courses and says how each operation is written.",
    { community: COMMUNITY, summary: { type: "string", maxLength: 1_000, description: "One line on what this batch does." },
      operations: { type: "array", minItems: 1, maxItems: 25, description: "The changes, in order, each as builder/resources/ describes.", items: { type: "object" } } },
    ["community", "operations"],
    (a) => write(`${root(a.community)}builder/resources/`, "create", { summary: a.summary ?? "", operations: a.operations })),
];

// What is in the one list but has no named tool, and why.
export const NOT_PUBLISHED: Record<string, string> = {
  "polynet_list": "reading: its own general tool",
  "polynet_read": "reading: its own general tool",
  "polynet_search": "reading: its own general tool",
  "polynet_list:messages": "reading: polynet_list on /messages/",
  "polynet_write:builder:delete": "part of polynet_change_courses; deleting what members see is refused there",
  "community.presence.heartbeat": "that a person is here right now: only their own open site says so",
  "community.typing.set": "that a person is typing: only their own open site says so",
  "member.memory.remember": "the guide's memory of a member: only in their private talk with the guide",
  "community.interaction.remove": "can't be taken back: a person removes a post in the app, or says yes to the guide",
  "community.members.remove": "only a person, in the app",
  "community.members.ban": "only a person, in the app",
  "community.join_mode.set:open": "only a person, in the app",
};

const BY_NAME = new Map(ACTION_TOOLS.map((entry) => [entry.name, entry]));
export function actionTool(name: string): ActionTool | null {
  return BY_NAME.get(name) ?? null;
}

export function actionToolEntry(entry: ActionTool): OperationEntry {
  const all = { ...TOOL_OPERATIONS, ...CALL_OPERATIONS, ...CALL_OPERATION_VARIANTS } as Record<string, OperationEntry>;
  return all[entry.catalog];
}

// The tools one person is shown: everyone gets a member's; someone who
// moderates or builds any community also gets those. Each call is still
// checked for the community it names.
const SHOWN_TO: Record<ActionToolRole, OperationEntry["lens"][]> = {
  member: ["member"], moderator: ["member", "moderator"], builder: ["member", "moderator", "builder"],
};
export function actionToolsFor(role: ActionToolRole): ActionTool[] {
  return ACTION_TOOLS.filter((entry) => SHOWN_TO[role].includes(actionToolEntry(entry).lens));
}

// A named tool as an MCP tool. The labels are the list's: what asks every
// time is marked as needing care, so the person's own AI app asks them.
export function actionToolDefinition(entry: ActionTool) {
  const listed = actionToolEntry(entry);
  return {
    name: entry.name,
    title: entry.title,
    description: entry.description,
    inputSchema: { type: "object", additionalProperties: false, required: entry.required, properties: entry.properties } as PlatformOperationJsonSchema,
    annotations: {
      title: entry.title,
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: listed.ask === "every_time" || listed.effect === "destroy",
      openWorldHint: false,
    },
  };
}

// How long a repeat of the very same action counts as a retry when the AI
// gave it no name of its own.
export const ACTION_TOOL_RETRY_WINDOW_MS = 5 * 60 * 1000;

// The call the executor runs for a named tool. The AI may name the action
// (idempotency_key); otherwise the same action with the same inputs inside a
// few minutes is taken as a retry, never done twice.
export function translateActionTool(entry: ActionTool, args: Args, nowMs: number): Translated {
  const { idempotency_key: given, ...rest } = args ?? {};
  const translated = entry.translate(rest);
  const key = typeof given === "string" && given.trim()
    ? given.trim().slice(0, 120)
    : requestFingerprint(`auto-${Math.floor(nowMs / ACTION_TOOL_RETRY_WINDOW_MS)}`, entry.name, rest);
  return { toolName: translated.toolName, input: { ...translated.input, idempotency_key: key } };
}
