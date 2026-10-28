import { getFunctionName } from "convex/server";
import { internal } from "./_generated/api";
import { buildCommunityResourceRuntimeLaneState } from "../shared/communityResourceLane";

// A member's personal agent, run from a community front end. The front end has
// no Convex identity: the member was authenticated by its session. Studio's
// runtime turn re-checks the Convex identity in a few places, so the turn runs
// on a context that sends exactly those calls to internal twins carrying the
// already-authenticated member. Any other identity-bound call still demands a
// Convex identity and fails closed.
//
// A front end is the member experience: the agent runs in the member lane even
// for owners and admins. Administration stays in Polynet Studio.

type TrustedMember = { userId: string; authSubject: string };

type Redirect = (args: Record<string, unknown>, member: TrustedMember) => { ref: any; args: Record<string, unknown> };

const ownerTwin = (ref: any): Redirect => (args, member) => ({ ref, args: { ...args, trustedOwnerId: member.userId } });
const userTwin = (ref: any): Redirect => (args, member) => ({ ref, args: { ...args, trustedUserId: member.userId } });

const REDIRECTS: Record<string, Redirect> = {
  "threads:getCloudThreadByThreadKey": ownerTwin(internal.threads.getCloudThreadByThreadKeyForTrustedOwnerInternal),
  "threads:getCloudThreadMessageByOwnerMessageKey": ownerTwin(internal.threads.getCloudThreadMessageByOwnerMessageKeyForTrustedOwnerInternal),
  "threads:addCloudThreadMessage": ownerTwin(internal.threads.addCloudThreadMessageForTrustedOwnerInternal),
  "threads:upsertCloudThreadMessageByMessageKey": ownerTwin(internal.threads.upsertCloudThreadMessageByMessageKeyForTrustedOwnerInternal),
  "threads:ensureCloudRuntimeRunStarted": ownerTwin(internal.threads.ensureCloudRuntimeRunStartedForTrustedOwnerInternal),
  "threads:appendCloudRuntimeRunEvent": ownerTwin(internal.threads.appendCloudRuntimeRunEventForTrustedOwnerInternal),
  "threads:finishCloudRuntimeRun": ownerTwin(internal.threads.finishCloudRuntimeRunForTrustedOwnerInternal),
  "runtimeCommunityResourceLane:resolveRuntimeCommunityResourceLaneInternal": userTwin(internal.runtimeCommunityResourceLane.resolveRuntimeCommunityResourceLaneInternal),
  "memberOntology:confirmMemberInterviewFacts": userTwin(internal.memberOntology.confirmMemberInterviewFactsForTrustedUserInternal),
  "communityInteractions:createCommunityInteractionComposerMessage":
    userTwin(internal.communityInteractions.createCommunityInteractionComposerMessageForTrustedUserInternal),
  "communityIntelligenceDirectory:searchCommunityMemoryInternal": userTwin(internal.communityIntelligenceDirectory.searchCommunityMemoryInternal),
  "communityIntelligenceDirectory:readCommunityMemoryInternal": userTwin(internal.communityIntelligenceDirectory.readCommunityMemoryInternal),
  "communityIntelligenceDirectory:recordCommunityOutcomeObservationInternal":
    userTwin(internal.communityIntelligenceDirectory.recordCommunityOutcomeObservationInternal),
  // The door's authority for a personal agent: resolved for the trusted member.
  "communityCapabilityContext:resolveCommunityCapabilityContextInternal": (args, member) => ({
    ref: internal.communityCapabilityContext.resolveCommunityCapabilityContextForTrustedActorInternal,
    args: { ...args, userId: member.userId },
  }),
};

// Member lane: the door grants builder authority only with can_manage_resources.
function memberLaneCapabilityContext(result: any) {
  if (!result?.ok || !result.context?.access) return result;
  return { ...result, context: { ...result.context, access: { ...result.context.access, can_manage_resources: false } } };
}

// Member lane in the agent's prompt and tool shaping as well.
function memberLanePromptContext(result: any) {
  const lens = result?.community_lens_authority;
  if (!lens || typeof lens !== "object") return result;
  const { communityResourceLane: _lane, community_resource_lane: _laneSnake, ...rest } = lens as Record<string, unknown>;
  const denied = [
    "canManage", "can_manage", "canManageMembers", "can_manage_members", "canModerate", "can_moderate",
    "canModerateContent", "can_moderate_content", "canManageResources", "can_manage_resources",
    "canReviewJoinRequests", "can_review_join_requests",
  ];
  return { ...result, community_lens_authority: { ...rest, ...Object.fromEntries(denied.map((key) => [key, false])) } };
}

// Member lane for resources: no resources architect on a front end.
function memberLaneResourceLane(result: any) {
  return result?.lane === "builder" ? buildCommunityResourceRuntimeLaneState("member") : result;
}

const RESULT_FILTERS: Record<string, (result: any) => any> = {
  "runtimeCommunityResourceLane:resolveRuntimeCommunityResourceLaneInternal": memberLaneResourceLane,
  "communityCapabilityContext:resolveCommunityCapabilityContextInternal": memberLaneCapabilityContext,
  "communityCapabilityContext:resolveCommunityCapabilityContextForTrustedActorInternal": memberLaneCapabilityContext,
  "communityAgent:resolveRuntimeCommunityPromptContextInternal": memberLanePromptContext,
};

export function trustedMemberTurnContext<T extends { runQuery: any; runMutation: any; runAction: any }>(ctx: T, member: TrustedMember): T {
  const route = (run: (ref: any, args: any) => Promise<any>) => async (ref: any, args: Record<string, unknown> = {}) => {
    const name = getFunctionName(ref);
    const redirect = REDIRECTS[name];
    const target = redirect ? redirect(args, member) : { ref, args };
    const result = await run(target.ref, target.args);
    const filter = RESULT_FILTERS[name] ?? RESULT_FILTERS[getFunctionName(target.ref)];
    return filter ? filter(result) : result;
  };
  const runQuery = route((ref, args) => ctx.runQuery(ref, args));
  const runMutation = route((ref, args) => ctx.runMutation(ref, args));
  const runAction = route((ref, args) => ctx.runAction(ref, args));
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      if (prop === "runQuery") return runQuery;
      if (prop === "runMutation") return runMutation;
      if (prop === "runAction") return runAction;
      return Reflect.get(target, prop, receiver);
    },
  });
}
