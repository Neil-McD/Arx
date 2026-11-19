// Lenses (docs/specs/agent-system-end-state.md §4): who a call acts for, how it
// reached Polynet, and so what it may see and do. This file is the one place
// that says so; the canonical executor works out a call's lens once and asks
// this table. Paths select; they never authorise.
//
// Three families:
// - member: a member, through a private talk with the guide, their own AI (MCP)
//   or their site (a community app);
// - builder: an owner or admin, through a private talk with the guide or their
//   own AI;
// - community: nobody; the guide speaking as the community (tagged in a
//   channel) or the worker (nobody present; it reads what the server hands it
//   and never calls the executor).
// Moderating (reviewing join requests, removing posts) is a permission a
// member or builder may hold, not a lens: it counts through their own AI and
// in their private talk with the guide alike.
//
// Scope: every lens sees the community. The guide working inside a pod (tagged
// in its room) also sees that one pod: its facts and its room, and no other
// pod. People and builders see the pods their own access lets them enter.

import type { PolynetPrincipalKind, PolynetResolvedAuthority } from "./polynetAuthority.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";
import { actionTool, actionToolsFor, type ActionToolRole } from "./actionTools.ts";

export type LensFamily = "member" | "builder" | "community";

export type LensName =
  | "member_private"
  | "member_own_ai"
  | "member_site"
  | "builder_private"
  | "builder_own_ai"
  | "guide_public"
  | "worker"
  // A caller Polynet no longer serves (the retired funnel builder): sees and
  // does nothing.
  | "retired";

export type Lens = {
  name: LensName;
  family: LensFamily | null;
  // Moderation permissions, for a person through their own AI or the guide.
  reviewsJoins: boolean;
  moderatesPosts: boolean;
  // The pod (its room's id) the guide is working in, for this run only.
  podRoomId: string | null;
};

export const LENS_FAMILY: Record<LensName, LensFamily | null> = {
  member_private: "member",
  member_own_ai: "member",
  member_site: "member",
  builder_private: "builder",
  builder_own_ai: "builder",
  guide_public: "community",
  worker: "community",
  retired: null,
};

// A person working through their own AI or the guide in a private talk: the
// two doors do the same things (docs/specs/agent-access-v0.md).
const PERSON_LENSES: LensName[] = ["member_private", "member_own_ai", "builder_private", "builder_own_ai"];

// The lens of one call, from who is calling, where from and their authority.
export function resolveLens(args: {
  principalKind: PolynetPrincipalKind;
  evidenceSurface: string;
  authority: Pick<PolynetResolvedAuthority, "canUseBuilderProjection" | "canReviewJoinRequests" | "canModerateContent">;
  // Set by the server for a guide run that started in a pod's room.
  podRoomId?: string | null;
}): Lens {
  const builder = args.authority.canUseBuilderProjection === true;
  let name: LensName;
  if (args.evidenceSurface === "community_funnel_builder") name = "retired";
  else if (args.principalKind === "community_agent") name = "guide_public";
  else if (args.principalKind === "community_app") name = "member_site";
  else if (args.principalKind === "community_agent_for_member") {
    // A private talk happens only in the dock.
    name = args.evidenceSurface !== "member_agent_dock" ? "retired" : builder ? "builder_private" : "member_private";
  } else name = builder ? "builder_own_ai" : "member_own_ai";
  const person = PERSON_LENSES.includes(name);
  return {
    name,
    family: LENS_FAMILY[name],
    reviewsJoins: person && args.authority.canReviewJoinRequests === true,
    moderatesPosts: person && args.authority.canModerateContent === true,
    podRoomId: name === "guide_public" && args.podRoomId ? String(args.podRoomId) : null,
  };
}

// What a lens reads: parts of the community's folder.
export type LensView =
  | "handbook"            // handbook.md
  | "member_timeline"     // members/<handle>/timeline.md
  | "members_self"        // members/me/: context.md, timeline.md, memory.md
  | "member_profile"      // members/<handle>.json (people facts, cut by lens)
  | "presence"            // presence.json
  | "memory_notes"        // memory.md and memory/: what the guide knows
  | "builder_directory"   // builder/ (join requests for moderators)
  | "builder_records"     // builder/community.json, builder/analytics.json, builder/resources/, skills/
  | "pods"                // pods/ and pods/<slug>/pod.md (inside or outside, by access)
  | "brief";              // brief.md: what's happening in the community

const MEMBERS_AND_BUILDERS: LensName[] = ["member_private", "member_own_ai", "member_site", "builder_private", "builder_own_ai"];
const PEOPLE: LensName[] = [...MEMBERS_AND_BUILDERS, "guide_public"];
const BUILDERS: LensName[] = ["builder_private", "builder_own_ai"];

export const LENS_READS: Record<LensView, LensName[]> = {
  handbook: PEOPLE,
  member_timeline: PEOPLE,
  // The guide in public has no "me": it never reads its sponsor's own context.
  members_self: MEMBERS_AND_BUILDERS,
  // The guide in public reads people as any member sees them.
  member_profile: PEOPLE,
  presence: MEMBERS_AND_BUILDERS,
  // Notes are the guide's memory: the guide reads them; of people's own
  // tools, only builders' (docs: notes are back-end; members see courses).
  memory_notes: ["guide_public", "member_private", "builder_private", "builder_own_ai"],
  builder_directory: BUILDERS,
  builder_records: BUILDERS,
  // Each lens sees the pods its access allows (convex/communityPodFacts.ts).
  pods: PEOPLE,
  // The community's brief is written for everyone in it; a pod's is read
  // through pods, inside only.
  brief: PEOPLE,
};

// What a lens may do: polynet_call operations.
export type LensAction =
  | "react"                 // community.interaction.react
  | "lesson_done"           // community.lesson.set_done
  | "mark_read"             // community.channel.mark_read
  | "presence"              // community.presence.heartbeat, community.typing.set
  | "personal_memory"       // member.memory.remember
  | "review_joins"          // admission approve / deny
  | "remove_posts"          // community.interaction.remove
  | "builder_change";       // members.* and community settings

export const LENS_CALLS: Record<LensAction, LensName[]> = {
  // The member's own reaction and progress: their own tools, and the guide
  // when they tell it to.
  react: [...PERSON_LENSES, "member_site"],
  lesson_done: [...PERSON_LENSES, "member_site"],
  mark_read: MEMBERS_AND_BUILDERS,
  // That a person is here right now: only their own open site.
  presence: ["member_site"],
  // The guide remembers a member only in their own private talk.
  personal_memory: ["member_private", "builder_private"],
  // Decisions about people and others' posts, with the permission. Through
  // the guide a removal waits for the person's yes, every time
  // (shared/operationCatalog.ts, guideAskFor); through their own AI it is
  // refused with a link, because Polynet can't show its question there.
  review_joins: PERSON_LENSES,
  remove_posts: PERSON_LENSES,
  // The community's settings, channels and roles: a builder through their
  // own AI or the guide. A role change, removing or banning a member and
  // publishing the handbook wait for their yes through the guide, every time
  // (guideAskFor); removing and banning are refused with a link through their
  // own AI.
  builder_change: ["builder_private", "builder_own_ai"],
};

export function lensReads(lens: Lens, view: LensView): boolean {
  if (view === "builder_directory" && lens.reviewsJoins) return true;
  return LENS_READS[view].includes(lens.name);
}

export function lensCalls(lens: Lens, action: LensAction): boolean {
  if (!LENS_CALLS[action].includes(lens.name)) return false;
  if (action === "review_joins") return lens.reviewsJoins;
  if (action === "remove_posts") return lens.moderatesPosts;
  return true;
}

// The tools a lens is given: the one list a run's model sees. What each call
// may then see and do is the executor's, per call, from the tables above.
// Reading is three general tools. Acting is one named tool per action
// (shared/actionTools.ts): a private talk is given the ones its person may use
// in this community (talkToolNames); a person's own AI is given its own over
// the MCP (convex/httpMcp.ts). The two general action tools the named ones
// are translated into are given to no AI.
const READ_TOOLS = ["polynet_list", "polynet_read", "polynet_search"] as const;

export const LENS_TOOLS: Record<LensName, readonly RetrievalToolName[]> = {
  // A private talk also researches the web, paid by the community.
  member_private: [...READ_TOOLS, "web_research"],
  builder_private: [...READ_TOOLS, "web_research"],
  // Through MCP: the person's own AI does its own web.
  member_own_ai: READ_TOOLS,
  builder_own_ai: READ_TOOLS,
  // A site calls operations through its app API, not tools.
  member_site: [],
  // Tagged in a channel, the guide reads; its reply is its only speech.
  guide_public: READ_TOOLS,
  // The night review is handed everything and makes one write, checked by
  // the review's own rules (convex/communityMemoryReview.ts).
  worker: ["polynet_call"],
  retired: [],
};

// A named action tool the guide may be given in a private talk.
function isGuideActionTool(toolName: string): boolean {
  const named = actionTool(toolName);
  return Boolean(named) && named!.door !== "own_ai";
}

export function lensHasTool(name: LensName, toolName: string): toolName is RetrievalToolName {
  if ((LENS_TOOLS[name] as readonly string[]).includes(toolName)) return true;
  return (name === "member_private" || name === "builder_private") && isGuideActionTool(toolName);
}

// The tools one private talk is given: reading and the web, then the named
// tools for what this person may do in this community. A host sees a host's,
// a moderator a moderator's, a member a member's.
export function talkToolNames(talk: TalkLens | null | undefined): RetrievalToolName[] {
  const base: RetrievalToolName[] = [...LENS_TOOLS.member_private];
  if (!talk) return base;
  const role: ActionToolRole = talk.lens === "builder_private" ? "builder" : talk.relation === "moderator" ? "moderator" : "member";
  return [...base, ...actionToolsFor(role, "guide").map((tool) => tool.name)];
}

// A guide run's lens before any call resolves it: in public (tagged in a
// channel) or a private talk. Members and builders get the same tools in a
// private talk, so the member lens stands for both here.
export function guideRunLens(evidenceSurface: string | null | undefined): "guide_public" | "member_private" {
  return evidenceSurface === "community_concierge" ? "guide_public" : "member_private";
}

// A private talk's lens, worked out once when the turn starts (from the same
// authority the executor checks every call against) and who the person is.
export type TalkLens = {
  lens: "member_private" | "builder_private";
  relation: "owner" | "admin" | "moderator" | "member";
  // What the person answered to the guide's questions since it last spoke
  // (convex/communityGuideQuestions.ts), one plain line each.
  answers?: string[];
  // The community's time zone (its most recent event's), for the guide's
  // date line: convex/communityAgent.ts. Not part of the lens's authority.
  timeZone?: string;
};

export const TALK_LENS_ANSWERS_MAX = 5;

const RELATIONS = new Set(["owner", "admin", "moderator", "member"]);

export function parseTalkLens(value: unknown): TalkLens | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const lens = record.lens === "member_private" || record.lens === "builder_private" ? record.lens : null;
  const relation = RELATIONS.has(String(record.relation)) ? record.relation as TalkLens["relation"] : null;
  const answers = (Array.isArray(record.answers) ? record.answers : [])
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .slice(0, TALK_LENS_ANSWERS_MAX).map((line) => line.trim().slice(0, 300));
  const timeZone = typeof record.timeZone === "string" && /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(record.timeZone) ? record.timeZone : null;
  return lens && relation ? { lens, relation, ...(answers.length > 0 ? { answers } : {}), ...(timeZone ? { timeZone } : {}) } : null;
}

// What the guide is told from its talk that its instructions can't work out
// from the tools it is given (shared/runtimePrompt.ts, what_you_may_do): the
// person's answers to its questions since it last spoke. Orientation only:
// the executor checks every call.
export function renderTalkLensForPrompt(talk: TalkLens | null | undefined): string | null {
  if (!talk?.answers?.length) return null;
  return ["RECENT ANSWERS", "Since you last spoke, they answered your questions:", ...talk.answers.map((line) => `- ${line}`)].join("\n");
}

// How a lens sees one person (people facts, convex/communityPersonFacts.ts):
// - member: what any member sees; the guide in public always sees this;
// - self: a person about themselves (adds when they joined);
// - builder: owners and admins (adds plan, state and their notes).
export type PersonView = "member" | "self" | "builder";

export function personViewFor(family: LensFamily | null, isSelf: boolean): PersonView {
  if (family === "community" || family === null) return "member";
  if (isSelf) return "self";
  return family === "builder" ? "builder" : "member";
}
