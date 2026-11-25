// The one list of what can be done to a community from outside the app's own
// screens: by a person's own AI (the MCP), a community's site, the guide.
// Each entry says who may do it, what kind of thing it does, which budget it
// spends, whether the community needs the paid plan, and how the person is
// asked before an AI does it. The executor advertises and runs only what is
// listed here (convex/polynetCanonicalExecutor.ts), so an operation cannot be
// added without saying these five things. Spec: docs/specs/agent-access-v0.md.

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

// How the person is asked before an AI does it for them.
// - "none": they said exactly what to do and it can be undone. It is done.
// - "words": words the AI wrote go out under their name (a post, a reply, a
//   reply in their messages). The guide shows them the words first, and they
//   may switch that to "always allow". A person's own AI app decides for itself.
// - "every_time": it can't be taken back, or it changes who runs the
//   community or what every member is told. Asked every time.
// - "person_only": never done by an AI. It is handed the place in the app
//   where the person does it.
//
// The rule (Neil, Nov 19 2026): Polynet asks for its own Yes only for what
// takes something from other people that can't be given back, or changes who
// holds power or what every member (or the guide) is told. Everything else is
// the person's own AI app's call, by its own approval settings and the labels
// on each tool. The guide is Polynet's own AI, so it also asks before words
// go out under the person's name (posts, and replies in their direct
// messages), which they may switch to "always allow".
export type OperationAsk = "none" | "words" | "every_time" | "person_only";

export type OperationEntry = {
  lens: OperationLens;
  effect: OperationEffect;
  budget: OperationBudget;
  plan: OperationPlan;
  ask: OperationAsk;
  // How a person's own AI (through the MCP) is asked, where it differs from
  // the guide: their own words and their own posts are their AI app's call.
  ownAi?: OperationAsk;
};

const entry = (lens: OperationLens, effect: OperationEffect, budget: OperationBudget,
  more: { plan?: OperationPlan; ask?: OperationAsk; ownAi?: OperationAsk } = {}): OperationEntry =>
  ({ lens, effect, budget, plan: more.plan ?? "free", ask: more.ask ?? "none", ...(more.ownAi ? { ownAi: more.ownAi } : {}) });

// How this door is asked about an entry: the guide by `ask`; a person's own AI
// by `ownAi` where the list says so.
export function askAt(found: OperationEntry, door: "guide" | "own_ai"): OperationAsk {
  return door === "own_ai" && found.ownAi ? found.ownAi : found.ask;
}

// The five tools, by what they are pointed at.
export const TOOL_OPERATIONS = {
  "polynet_list": entry("member", "read", "read"),
  "polynet_read": entry("member", "read", "read"),
  "polynet_search": entry("member", "read", "search"),
  // polynet_write on a channel: a post or a reply, or a change to your own.
  "polynet_write:channels": entry("member", "write", "post", { ask: "words" }),
  // polynet_write on a post of your own, mode delete.
  // It takes nothing from anyone else, so a person's own AI does it.
  "polynet_write:channels:delete": entry("member", "write", "post", { ask: "every_time", ownAi: "none" }),
  // polynet_write under builder/: a batch of changes to courses and lessons,
  // made in draft. Publishing, and deleting what is live, are a person's
  // (convex/communityResourceChangesets.ts).
  "polynet_write:builder": entry("builder", "write", "builder_change"),
  "polynet_write:builder:delete": entry("builder", "destroy", "builder_change"),
  // A person's own direct messages (/messages/): reading the conversations
  // they are in, and replying in one that exists. Never starting one. Through
  // the guide a reply is asked about (the person may "always allow" it); their
  // own AI sends it, within the message limits and checks.
  "polynet_list:messages": entry("member", "read", "read"),
  "polynet_write:messages": entry("member", "write", "message_reply", { ask: "words" }),
} satisfies Record<string, OperationEntry>;

// polynet_call operations, in the order the capabilities directory lists them.
export const CALL_OPERATIONS = {
  "community.interaction.react": entry("member", "write", "light"),
  "community.lesson.set_done": entry("member", "write", "light"),
  "community.channel.mark_read": entry("member", "write", "none"),
  "community.presence.heartbeat": entry("member", "write", "none"),
  "community.typing.set": entry("member", "write", "none"),
  // What the guide remembers about a member, and its personal Soul with them, in their private talk.
  "member.memory.remember": entry("member", "write", "none", { plan: "paid" }),
  "member.soul.update": entry("member", "write", "none", { plan: "paid" }),
  "community.admission.approve": entry("moderator", "write", "builder_change"),
  "community.admission.deny": entry("moderator", "write", "builder_change"),
  "community.interaction.remove": entry("moderator", "destroy", "builder_change", { ask: "every_time" }),
  "community.settings.update": entry("builder", "write", "builder_change"),
  // Setting it to approval takes nothing from anyone. Opening it lets in
  // everyone who was waiting, and tells them: CALL_OPERATION_VARIANTS.
  "community.join_mode.set": entry("builder", "write", "builder_change"),
  // What the guide is told changes how it answers every member: asked every time.
  "community.agent.instructions.set": entry("builder", "broadcast", "builder_change", { ask: "every_time" }),
  "community.handbook.save_draft": entry("builder", "write", "builder_change"),
  // What every member, and the guide, is told.
  "community.handbook.approve": entry("builder", "broadcast", "builder_change", { ask: "every_time" }),
  // Channels (slice 4). What takes something away from members (deleting a
  // channel, opening a private one, pinning) waits for the two-step confirm.
  "community.channel.create": entry("builder", "write", "builder_change"),
  "community.channel.rename": entry("builder", "write", "builder_change"),
  "community.channel.describe": entry("builder", "write", "builder_change"),
  "community.channel.move": entry("builder", "write", "builder_change"),
  // Who runs the community.
  // Events members see (not a pod's calls: those are changed in the pod).
  // Cancelling emails members automatically, so it waits for the person's yes.
  "community.event.create": entry("builder", "write", "builder_change"),
  "community.event.update": entry("builder", "write", "builder_change"),
  "community.event.cancel": entry("builder", "broadcast", "builder_change", { ask: "every_time" }),
  // An @everybody announcement to the whole community (owners and admins only).
  "community.announcement.post": entry("builder", "broadcast", "builder_change", { ask: "every_time" }),
  // A course members see, or stop seeing, all at once; and deleting what they
  // can see. Asked every time (a course batch builds in draft only).
  "community.course.publish": entry("builder", "broadcast", "builder_change", { ask: "every_time" }),
  "community.course.delete": entry("builder", "destroy", "builder_change", { ask: "every_time" }),
  "community.members.set_role": entry("builder", "write", "builder_change", { ask: "every_time" }),
  // Removing or banning someone always waits for the person's yes.
  "community.members.remove": entry("builder", "destroy", "builder_change", { ask: "every_time" }),
  "community.members.ban": entry("builder", "destroy", "builder_change", { ask: "every_time" }),
  "community.members.unban": entry("builder", "write", "builder_change"),
  // Member Board (owners and admins only): move members between stages, pin or
  // reset statuses, check off milestones, log or remove wins, leave a private
  // coaching note for the community AI, update stages, or remove a stage
  // (removing a stage always asks the host first).
  "community.journey.move_stage": entry("builder", "write", "builder_change"),
  "community.journey.set_status": entry("builder", "write", "builder_change"),
  "community.journey.set_milestone": entry("builder", "write", "builder_change"),
  "community.journey.record_win": entry("builder", "write", "builder_change"),
  "community.journey.set_guide_note": entry("builder", "write", "builder_change"),
  "community.journey.save_stages": entry("builder", "write", "builder_change"),
  "community.journey.remove_stage": entry("builder", "destroy", "builder_change", { ask: "every_time" }),
  "community.journey.decide_stage_move": entry("builder", "write", "builder_change"),
  // Waiting Chief of Staff Guide drafts on Home (owner-only; sending always asks Yes/No first).
  "community.guide_draft.send": entry("builder", "broadcast", "builder_change", { ask: "every_time" }),
  "community.guide_draft.skip": entry("builder", "write", "builder_change"),
} satisfies Record<string, OperationEntry>;

// An operation that is a different thing for one of its inputs.
export const CALL_OPERATION_VARIANTS = {
  // Opening lets in everyone waiting and can't be taken back: asked every time.
  "community.join_mode.set:open": entry("builder", "broadcast", "builder_change", { ask: "every_time" }),
} satisfies Record<string, OperationEntry>;

// What only the background worker writes; never advertised to anyone's tools.
export const WORKER_OPERATIONS = {
  "memory.apply": entry("worker", "write", "none", { plan: "paid" }),
  "brief.write": entry("worker", "write", "none", { plan: "paid" }),
  "reply.draft": entry("worker", "write", "none", { plan: "paid" }),
} satisfies Record<string, OperationEntry>;

// ---- asking the person
//
// One call's entry in the list: the tool and where it points, or the named
// operation and (for the one that has them) its input.
export function operationFor(args: {
  toolName: string; operation?: string | null; mode?: string | null; localPath?: string | null; input?: Record<string, unknown> | null;
}): OperationEntry | null {
  if (args.toolName === "polynet_call") {
    const name = String(args.operation ?? "");
    const variant = name === "community.join_mode.set" && args.input?.mode === "open" ? `${name}:open` : null;
    if (variant) return CALL_OPERATION_VARIANTS[variant as keyof typeof CALL_OPERATION_VARIANTS];
    return callOperation(name);
  }
  if (args.toolName !== "polynet_write") return null;
  if (isMessagesPath(args.localPath)) return TOOL_OPERATIONS["polynet_write:messages"];
  const path = String(args.localPath ?? "");
  if (/^\/channels\//.test(path)) return TOOL_OPERATIONS[args.mode === "delete" ? "polynet_write:channels:delete" : "polynet_write:channels"];
  if (path.startsWith("/builder/")) return TOOL_OPERATIONS["polynet_write:builder"];
  return null;
}

// The question the guide puts to the person in their private talk, by kind:
// "post" (the words, with "always allow" offered), "remove" (can't be taken
// back: posts, or a member removed or banned), "change" (who runs the place,
// what every member is told) and "message" (a reply in their direct messages,
// with the words and who it goes to). Posts and message replies can be always
// allowed; what takes from others or changes who runs the place never can.
export type GuideAsk = "post" | "remove" | "change" | "message";
export const GUIDE_ASK_ALWAYS_ALLOWABLE: Record<GuideAsk, boolean> = { post: true, remove: false, change: false, message: true };

export function guideAskFor(args: Parameters<typeof operationFor>[0]): GuideAsk | null {
  const found = operationFor(args);
  if (found && found === TOOL_OPERATIONS["polynet_write:messages"]) return "message";
  if (found?.ask === "words") return "post";
  if (found?.ask === "every_time") return found.effect === "destroy" || args.toolName === "polynet_write" ? "remove" : "change";
  return null;
}

// Whether an AI is handed the place in the app instead of doing it.
// - Any AI, for what only a person does.
// - Where Polynet asks the person (the guide in their private talk, and a
//   person's own AI through the MCP: a Yes/No card in Polynet,
//   convex/communityGuideQuestions.ts), what asks every time runs only after
//   their yes.
// - Where nobody can be asked (a community's own site), what can't be taken
//   back is the person's to do in the app.
export function handedBackToPerson(found: OperationEntry | null, door: { asks: boolean; personSaidYes: boolean }): boolean {
  if (!found) return false;
  if (found.ask === "person_only") return true;
  if (found.ask !== "every_time") return false;
  return door.asks ? !door.personSaidYes : found.effect === "destroy";
}

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
