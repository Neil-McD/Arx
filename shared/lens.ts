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
// member or builder may hold through their own AI, not a lens.
//
// Scope: every lens sees the community. The guide working inside a pod (tagged
// in its room) also sees that one pod: its facts and its room, and no other
// pod. People and builders see the pods their own access lets them enter.

import type { PolynetPrincipalKind, PolynetResolvedAuthority } from "./polynetAuthority.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";

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
  // Moderation permissions, held only through someone's own AI.
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
  const ownAi = name === "member_own_ai" || name === "builder_own_ai";
  return {
    name,
    family: LENS_FAMILY[name],
    reviewsJoins: ownAi && args.authority.canReviewJoinRequests === true,
    moderatesPosts: ownAi && args.authority.canModerateContent === true,
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
  | "builder_records"     // builder/community.json, builder/resources/
  | "pods";               // pods/ and pods/<slug>/pod.md (inside or outside, by access)

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
  // Speaking for the member (their reaction, their progress): only their own
  // tools; the guide suggests and the member acts.
  react: ["member_own_ai", "builder_own_ai", "member_site"],
  lesson_done: ["member_own_ai", "builder_own_ai", "member_site"],
  mark_read: MEMBERS_AND_BUILDERS,
  // That a person is here right now: only their own open site.
  presence: ["member_site"],
  // The guide remembers a member only in their own private talk.
  personal_memory: ["member_private", "builder_private"],
  // Decisions about people and others' posts: only from a harness the person
  // operates directly, with the permission.
  review_joins: ["member_own_ai", "builder_own_ai"],
  remove_posts: ["member_own_ai", "builder_own_ai"],
  builder_change: ["builder_own_ai"],
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
const POLYNET_TOOLS = ["polynet_list", "polynet_read", "polynet_search", "polynet_write", "polynet_call"] as const;

export const LENS_TOOLS: Record<LensName, readonly RetrievalToolName[]> = {
  // A private talk also researches the web, paid by the community.
  member_private: [...POLYNET_TOOLS, "web_research"],
  builder_private: [...POLYNET_TOOLS, "web_research"],
  // Through MCP: the five tools; the person's own AI does its own web.
  member_own_ai: POLYNET_TOOLS,
  builder_own_ai: POLYNET_TOOLS,
  // A site calls operations through its app API, not tools.
  member_site: [],
  guide_public: POLYNET_TOOLS,
  // The night review is handed everything and makes one write, checked by
  // the review's own rules (convex/communityMemoryReview.ts).
  worker: ["polynet_call"],
  retired: [],
};

export function lensHasTool(name: LensName, toolName: string): toolName is RetrievalToolName {
  return (LENS_TOOLS[name] as readonly string[]).includes(toolName);
}

// A guide run's lens before any call resolves it: in public (tagged in a
// channel) or a private talk. Members and builders get the same tools in a
// private talk, so the member lens stands for both here.
export function guideRunLens(evidenceSurface: string | null | undefined): "guide_public" | "member_private" {
  return evidenceSurface === "community_concierge" ? "guide_public" : "member_private";
}

// People facts (convex/communityPersonFacts.ts): the guide in public sees
// people as any member does; everyone else at their own lens.
export function peopleLensFor(lens: Lens): "public" | "viewer" {
  return lens.family === "community" ? "public" : "viewer";
}
