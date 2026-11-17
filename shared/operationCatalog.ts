// The one list of what can be done to a community from outside the app's own
// screens: by a person's own AI (the MCP), a community's site, the guide.
// Each entry says who may do it, what kind of thing it does, which budget it
// spends and whether the community needs the paid plan. The executor
// advertises and runs only what is listed here
// (convex/polynetCanonicalExecutor.ts), so an operation cannot be added
// without saying these four things. Spec: docs/specs/agent-access-v0.md.

// Who may do it. A moderator's operations are also a builder's.
export type OperationLens = "member" | "moderator" | "builder" | "worker";

// What kind of thing it does. "destroy" takes something away from other
// people; "broadcast" reaches many people at once; "money" moves or prices
// money and is never offered outside the app's own screens.
export type OperationEffect = "read" | "write" | "destroy" | "broadcast" | "money";

// Which budget it spends (BUDGET_LIMITS). "none": keeping a session alive
// (presence, typing, read position) or work bounded another way (the guide's
// AI quota).
export type OperationBudget = "read" | "search" | "post" | "message_reply" | "light" | "builder_change" | "none";

export type OperationPlan = "free" | "paid";

export type OperationEntry = {
  lens: OperationLens;
  effect: OperationEffect;
  budget: OperationBudget;
  plan: OperationPlan;
};

const entry = (lens: OperationLens, effect: OperationEffect, budget: OperationBudget, plan: OperationPlan = "free"): OperationEntry =>
  ({ lens, effect, budget, plan });

// The five tools, by what they are pointed at.
export const TOOL_OPERATIONS = {
  "polynet_list": entry("member", "read", "read"),
  "polynet_read": entry("member", "read", "read"),
  "polynet_search": entry("member", "read", "search"),
  // polynet_write on a channel: a post or a reply, or a change to your own.
  "polynet_write:channels": entry("member", "write", "post"),
  // polynet_write under builder/: staging a change to the community's courses.
  "polynet_write:builder": entry("builder", "write", "builder_change"),
  // A person's own direct messages (/messages/): reading the conversations
  // they are in, and replying in one that exists. Never starting one.
  "polynet_list:messages": entry("member", "read", "read"),
  "polynet_write:messages": entry("member", "write", "message_reply"),
} satisfies Record<string, OperationEntry>;

// polynet_call operations, in the order the capabilities directory lists them.
export const CALL_OPERATIONS = {
  "community.interaction.react": entry("member", "write", "light"),
  "community.lesson.set_done": entry("member", "write", "light"),
  "community.channel.mark_read": entry("member", "write", "none"),
  "community.presence.heartbeat": entry("member", "write", "none"),
  "community.typing.set": entry("member", "write", "none"),
  // What the guide remembers about a member, in their private talk with it.
  "member.memory.remember": entry("member", "write", "none", "paid"),
  "community.admission.approve": entry("moderator", "write", "builder_change"),
  "community.admission.deny": entry("moderator", "write", "builder_change"),
  "community.interaction.remove": entry("moderator", "destroy", "builder_change"),
  "community.settings.update": entry("builder", "write", "builder_change"),
  // Opening a community lets in everyone who was waiting, and tells them.
  "community.join_mode.set": entry("builder", "broadcast", "builder_change"),
  "community.agent.instructions.set": entry("builder", "write", "builder_change"),
  "community.handbook.save_draft": entry("builder", "write", "builder_change"),
  "community.handbook.approve": entry("builder", "write", "builder_change"),
  // Channels (slice 4). What takes something away from members (deleting a
  // channel, opening a private one, pinning) waits for the two-step confirm.
  "community.channel.create": entry("builder", "write", "builder_change"),
  "community.channel.rename": entry("builder", "write", "builder_change"),
  "community.channel.describe": entry("builder", "write", "builder_change"),
  "community.channel.move": entry("builder", "write", "builder_change"),
  "community.members.set_role": entry("builder", "write", "builder_change"),
  "community.members.remove": entry("builder", "destroy", "builder_change"),
  "community.members.ban": entry("builder", "destroy", "builder_change"),
  "community.members.unban": entry("builder", "write", "builder_change"),
} satisfies Record<string, OperationEntry>;

// What only the background worker writes; never advertised to anyone's tools.
export const WORKER_OPERATIONS = {
  "memory.apply": entry("worker", "write", "none", "paid"),
  "brief.write": entry("worker", "write", "none", "paid"),
} satisfies Record<string, OperationEntry>;

export type CallOperationName = keyof typeof CALL_OPERATIONS;
export const CALL_OPERATION_NAMES = Object.keys(CALL_OPERATIONS) as CallOperationName[];

export function callOperation(name: string): OperationEntry | null {
  return Object.prototype.hasOwnProperty.call(CALL_OPERATIONS, name) ? CALL_OPERATIONS[name as CallOperationName] : null;
}

// ---- budgets

export type BudgetLimit = { perMinute: number; perDay: number | null };

// What one person may do through their own AI or a community's site. The
// app's own screens are not counted here. Numbers are a first judgment (Nov
// 17 2026), to be tuned on real use.
export const BUDGET_LIMITS = {
  read: { perMinute: 120, perDay: 5_000 },
  search: { perMinute: 30, perDay: 1_000 },
  // Posts and replies together.
  post: { perMinute: 10, perDay: 100 },
  // New posts (not replies) in one channel.
  post_channel: { perMinute: 1, perDay: null },
  // Replies in direct messages: fewer than posts, because each one lands in
  // one person's inbox.
  message_reply: { perMinute: 5, perDay: 50 },
  // Reactions, marking a lesson done.
  light: { perMinute: 30, perDay: 500 },
  // A builder's or moderator's changes, by whether the community has the plan.
  builder_change_free: { perMinute: 30, perDay: 300 },
  builder_change_paid: { perMinute: 60, perDay: 2_000 },
} satisfies Record<string, BudgetLimit>;

export type BudgetName = keyof typeof BUDGET_LIMITS;

// Names one exact request: its idempotency key and everything it asks for.
// The same request sent again is not counted twice; the same key with
// anything changed is a different request.
export function requestFingerprint(key: string, toolName: string, input: unknown): string {
  const text = `${toolName}\n${JSON.stringify(input) ?? ""}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ ((code << 5) | (code >>> 3)), 0x85ebca6b) >>> 0;
  }
  return `${key.slice(0, 120)}:${text.length.toString(36)}:${a.toString(36)}${b.toString(36)}`;
}

// A person's own direct messages, at the top of the repository.
export const MESSAGES_DIRECTORY_PATH = "/messages/";
export function isMessagesPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith(MESSAGES_DIRECTORY_PATH);
}
// /messages/<conversation>/ names one conversation.
export function messagesConversationId(path: unknown): string | null {
  // An id as the database writes it; the database itself decides whether it is one.
  const match = typeof path === "string" ? /^\/messages\/([A-Za-z0-9_;-]{4,80})\/$/.exec(path) : null;
  return match ? match[1] : null;
}

// One thing to count: which budget, and for a per-place budget, which place.
export type BudgetTake = { budget: Exclude<OperationBudget, "none"> | "post_channel"; scope: string };

// What a tool call spends, worked out from the call alone (no lookups), so it
// is counted before anything runs. `communitySlug` and `localPath` come from
// the path the caller named. A person's own AI is counted for everything; a
// community's site only for what it writes (it reads to draw its pages).
export function budgetTakesFor(args: {
  ownAi: boolean;
  toolName: string;
  operation?: string | null;
  mode?: string | null;
  communitySlug?: string | null;
  localPath?: string | null;
  // The path as the caller named it, for what is not inside a community.
  path?: string | null;
}): BudgetTake[] {
  // A person's own messages: reading is a read, a reply is a message reply.
  if (isMessagesPath(args.path) && args.toolName === "polynet_write") return [{ budget: "message_reply", scope: "" }];
  if (args.toolName === "polynet_list" || args.toolName === "polynet_read") return args.ownAi ? [{ budget: "read", scope: "" }] : [];
  if (args.toolName === "polynet_search") return args.ownAi ? [{ budget: "search", scope: "" }] : [];
  if (args.toolName === "polynet_call") {
    const budget = callOperation(String(args.operation ?? ""))?.budget ?? "builder_change";
    return budget === "none" ? [] : [{ budget, scope: budget === "builder_change" ? String(args.communitySlug ?? "") : "" }];
  }
  if (args.toolName !== "polynet_write") return [];
  const path = String(args.localPath ?? "");
  if (path.startsWith("/builder/")) return [{ budget: "builder_change", scope: String(args.communitySlug ?? "") }];
  // A new post is a create at the channel itself, whatever else the call
  // says: the executor refuses a create that names a post to answer, so
  // nothing in the content can turn a new post into something cheaper. A
  // reply is an append, at the channel or inside a thread.
  const channel = /^\/channels\/([a-z0-9-]+)\/$/.exec(path);
  const takes: BudgetTake[] = [{ budget: "post", scope: "" }];
  if (channel && args.mode === "create") {
    takes.push({ budget: "post_channel", scope: `${String(args.communitySlug ?? "")}/${channel[1]}` });
  }
  return takes;
}
