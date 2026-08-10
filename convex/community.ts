import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import * as communityAccessQueries from "./communityAccessQueries";
import * as communityActivity from "./communityActivity";
import * as communityAdmin from "./communityAdmin";
import * as communityAgent from "./communityAgent";
import * as communityAiFeed from "./communityAiFeed";
import * as communityAttention from "./communityAttention";
import * as communityChat from "./communityChat";
import * as communityDirectory from "./communityDirectory";
import * as communityEvents from "./communityEvents";
import * as communityFunnel from "./communityFunnel";
import * as communityInteractions from "./communityInteractions";
import * as communityIntelligenceDirectory from "./communityIntelligenceDirectory";
import * as communityLaunchSetup from "./communityLaunchSetup";
import * as communityLifecycle from "./communityLifecycle";
import * as communityPublic from "./communityPublic";
import * as communityResources from "./communityResources";
import * as communitySkillAttachments from "./communitySkillAttachments";
import * as skillPackages from "./skillPackages";
import {
  retiredAuthTypeValidator,
  THIRD_PARTY_MCP_RETIRED_CODE,
} from "./thirdPartyMcpCompatibility";

// Rolling-deployment facade for the production web build at dbec82f.
// These names contain no business logic; canonical ownership stays in the
// domain modules on the right-hand side.
export const applyCommunityResourceBuilderChangeset =
  communityResources.applyCommunityResourceBuilderChangeset;
export const approveCommunityResourceBuilderChangeset =
  communityResources.approveCommunityResourceBuilderChangeset;
export const beginGitHubSourceOAuth = communityResources.beginGitHubSourceOAuth;
export const beginGoogleDriveSourceOAuth =
  communityResources.beginGoogleDriveSourceOAuth;
export const crawlCommunitySourceRoot =
  communityResources.crawlCommunitySourceRoot;
export const createCommunityResourcePageDraftFromSource =
  communityResources.createCommunityResourcePageDraftFromSource;
export const deleteCommunityResource =
  communityResources.deleteCommunityResource;
export const deleteCommunityResourceModule =
  communityResources.deleteCommunityResourceModule;
export const disconnectGitHubSourceConnection =
  communityResources.disconnectGitHubSourceConnection;
export const disconnectGoogleDriveSourceConnection =
  communityResources.disconnectGoogleDriveSourceConnection;
export const finalizeGitHubSourceOAuth =
  communityResources.finalizeGitHubSourceOAuth;
export const finalizeGoogleDriveSourceOAuth =
  communityResources.finalizeGoogleDriveSourceOAuth;
export const generateCommunityResourceSourceUploadUrl =
  communityResources.generateCommunityResourceSourceUploadUrl;
export const getCommunityResourceBuilderChangesetStatus =
  communityResources.getCommunityResourceBuilderChangesetStatus;
export const getCommunitySourceCrawlJob =
  communityResources.getCommunitySourceCrawlJob;
export const getGitHubSourceConnectionStatus =
  communityResources.getGitHubSourceConnectionStatus;
export const getGoogleDriveSourceConnectionStatus =
  communityResources.getGoogleDriveSourceConnectionStatus;
export const importGitHubSourceFiles =
  communityResources.importGitHubSourceFiles;
export const importGoogleDriveSourceFiles =
  communityResources.importGoogleDriveSourceFiles;
export const ingestCommunitySources = communityResources.ingestCommunitySources;
export const listCommunityLaunchKnowledgeSources =
  communityResources.listCommunityLaunchKnowledgeSources;
export const listCommunityResourceModules =
  communityResources.listCommunityResourceModules;
export const listCommunityResources = communityResources.listCommunityResources;
export const listGitHubSourceFiles = communityResources.listGitHubSourceFiles;
export const listGitHubSourceRepositories =
  communityResources.listGitHubSourceRepositories;
export const listGoogleDriveSourceFiles =
  communityResources.listGoogleDriveSourceFiles;
export const moveCommunityResourceToModule =
  communityResources.moveCommunityResourceToModule;
export const rejectCommunityResourceBuilderChangeset =
  communityResources.rejectCommunityResourceBuilderChangeset;
export const reorderCommunityResourceModules =
  communityResources.reorderCommunityResourceModules;
export const reorderCommunityResources =
  communityResources.reorderCommunityResources;
export const saveCommunityResource = communityResources.saveCommunityResource;
export const saveCommunityResourceModule =
  communityResources.saveCommunityResourceModule;

export const approveCommunityJoinRequest =
  communityAdmin.approveCommunityJoinRequest;
export const banCommunityMember = communityAdmin.banCommunityMember;
export const countCommunityMemberships =
  communityAdmin.countCommunityMemberships;
export const denyCommunityJoinRequest =
  communityAdmin.denyCommunityJoinRequest;
export const getCommunityAnalyticsSnapshot =
  communityAdmin.getCommunityAnalyticsSnapshot;
export const getCommunityMemberBillingHistory =
  communityAdmin.getCommunityMemberBillingHistory;
export const getCommunityMemberSettings =
  communityAdmin.getCommunityMemberSettings;
export const leaveCommunity = communityAdmin.leaveCommunity;
export const listCommunityJoinRequests =
  communityAdmin.listCommunityJoinRequests;
export const listCommunityMemberships =
  communityAdmin.listCommunityMemberships;
export const listCommunityPricePoints =
  communityAdmin.listCommunityPricePoints;
export const removeCommunityMember = communityAdmin.removeCommunityMember;
export const saveCommunityMemberSettings =
  communityAdmin.saveCommunityMemberSettings;
export const setCommunityFreeAccessMode =
  communityAdmin.setCommunityFreeAccessMode;
export const setCommunityMemberRole = communityAdmin.setCommunityMemberRole;
export const syncCommunityMembershipCount =
  communityAdmin.syncCommunityMembershipCount;

export const attachSkillPackageToCommunity =
  communitySkillAttachments.attachSkillPackageToCommunity;
export const detachCommunitySkill =
  communitySkillAttachments.detachCommunitySkill;
export const listCommunitySkillAttachments =
  communitySkillAttachments.listCommunitySkillAttachments;
export const updateCommunitySkillAttachment =
  communitySkillAttachments.updateCommunitySkillAttachment;

export const cancelCommunityEvent = communityEvents.cancelCommunityEvent;
export const listCommunityEvents = communityEvents.listCommunityEvents;
export const saveCommunityEvent = communityEvents.saveCommunityEvent;

export const cancelMyJoinRequestBySlug =
  communityPublic.cancelMyJoinRequestBySlug;
export const getCommunityPresenceSummary =
  communityPublic.getCommunityPresenceSummary;
export const getMyJoinRequestBySlug = communityPublic.getMyJoinRequestBySlug;
export const heartbeatCommunityPresence =
  communityPublic.heartbeatCommunityPresence;
export const joinPublicCommunity = communityPublic.joinPublicCommunity;
export const joinPublicCommunityBySlug =
  communityPublic.joinPublicCommunityBySlug;
export const listPublicDiscoverCommunities =
  communityPublic.listPublicDiscoverCommunities;
export const recordPublicFunnelVisitBySlug =
  communityPublic.recordPublicFunnelVisitBySlug;
export const resolvePublicFunnelBySlug =
  communityPublic.resolvePublicFunnelBySlug;
export const resolvePublicFunnelStatsBySlug =
  communityPublic.resolvePublicFunnelStatsBySlug;

export const createCommunity = communityLifecycle.createCommunity;
export const generateCommunityBrandingUploadUrl =
  communityLifecycle.generateCommunityBrandingUploadUrl;
export const saveCommunityLaunchProfile =
  communityLifecycle.saveCommunityLaunchProfile;
export const saveCommunityPublicPresentation =
  communityLifecycle.saveCommunityPublicPresentation;
export const saveCommunitySettings = communityLifecycle.saveCommunitySettings;

export const createCommunityInteractionComposerMessage =
  communityInteractions.createCommunityInteractionComposerMessage;
export const deleteCommunityInteractionMessage =
  communityInteractions.deleteCommunityInteractionMessage;
export const editCommunityInteractionMessage =
  communityInteractions.editCommunityInteractionMessage;
export const listCommunityInteractionReplies =
  communityInteractions.listCommunityInteractionReplies;
export const listCommunityInteractionRoots =
  communityInteractions.listCommunityInteractionRoots;
export const toggleCommunityInteractionReaction =
  communityInteractions.toggleCommunityInteractionReaction;

export const createMessageReaction = communityChat.createMessageReaction;
export const createThreadUserMessage = communityChat.createThreadUserMessage;
export const deleteMessageReactionById =
  communityChat.deleteMessageReactionById;
export const deleteOwnMessage = communityChat.deleteOwnMessage;
export const ensureCommunityChatThread =
  communityChat.ensureCommunityChatThread;
export const generateCommunityChatAttachmentUploadUrl =
  communityChat.generateCommunityChatAttachmentUploadUrl;
export const listMessageReactions = communityChat.listMessageReactions;
export const listThreadMessages = communityChat.listThreadMessages;
export const patchOwnMessageContent = communityChat.patchOwnMessageContent;
export const setCommunityTyping = communityChat.setCommunityTyping;

export const getActiveCommunityAgentLanding =
  communityAgent.getActiveCommunityAgentLanding;
export const getCommunityAgentConfig =
  communityAgent.getCommunityAgentConfig;
export const saveCommunityAgentConfig =
  communityAgent.saveCommunityAgentConfig;

export const getCommunityFunnelConfig =
  communityFunnel.getCommunityFunnelConfig;

export const getCommunityPolynetOverview =
  communityIntelligenceDirectory.getCommunityPolynetOverview;
export const resolvePublicCommunityMemoryOverviewBySlug =
  communityIntelligenceDirectory.resolvePublicCommunityMemoryOverviewBySlug;

export const getMyCommunityAccess =
  communityAccessQueries.getMyCommunityAccess;
export const getMyCommunityAccessBySlug =
  communityAccessQueries.getMyCommunityAccessBySlug;

export const hideCommunityAiFeedPost =
  communityAiFeed.hideCommunityAiFeedPost;
export const listCommunityAiFeedBundle =
  communityAiFeed.listCommunityAiFeedBundle;
export const reactToCommunityAiFeedPost =
  communityAiFeed.reactToCommunityAiFeedPost;

export const listCommunityActivityEvents =
  communityActivity.listCommunityActivityEvents;

export const listCommunityDirectoryPage =
  communityDirectory.listCommunityDirectoryPage;
export const searchCommunityMentionCandidates =
  communityDirectory.searchCommunityMentionCandidates;

export const listMyCommunityAttention =
  communityAttention.listMyCommunityAttention;
export const markCommunityChatReadAt =
  communityAttention.markCommunityChatReadAt;
export const markCommunitySurfaceSeen =
  communityAttention.markCommunitySurfaceSeen;

export const listOwnedSkillPackages = skillPackages.listOwnedSkillPackages;
export const getCommunityLaunchSetupStatus =
  communityLaunchSetup.getCommunityLaunchSetupStatus;

// Cached clients may still invoke the retired third-party MCP names. Preserve
// their validators and stable result shapes, but never perform I/O or writes.
const COMMUNITY_WIKI_ARCHITECT_RETIRED_CODE = "community_wiki_architect_retired";
const COMMUNITY_WIKI_ARCHITECT_RETIRED_MESSAGE =
  "The legacy Wiki Architect is retired. Use the canonical Polynet resource builder.";

function retiredCommunityWikiArchitectResult(kind: string) {
  return {
    ok: false as const,
    kind,
    code: COMMUNITY_WIKI_ARCHITECT_RETIRED_CODE,
    message: COMMUNITY_WIKI_ARCHITECT_RETIRED_MESSAGE,
  };
}

// Cached production clients may also invoke these retired Wiki Architect
// names during the rollout window. They preserve validators and stable errors,
// but never run inference or mutate resources.
export const runCommunityWikiArchitectProposal = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    builderIntent: v.optional(v.union(v.string(), v.null())),
    requestId: v.optional(v.string()),
  },
  handler: async () => retiredCommunityWikiArchitectResult("community_wiki_architect_proposal"),
});

export const applyCommunityWikiArchitectProposal = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    proposal: v.any(),
  },
  handler: async () => retiredCommunityWikiArchitectResult("community_wiki_architect_apply"),
});

export const draftCommunityResourceContentFromSources = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    requestId: v.optional(v.string()),
  },
  handler: async () => retiredCommunityWikiArchitectResult("community_resource_content_writer"),
});

export const listCommunityAppMounts = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    userId: v.optional(v.id("users")),
  },
  handler: async () => [],
});

export const connectCommunityApp = action({
  args: {
    authSubject: v.optional(v.string()),
    authType: retiredAuthTypeValidator,
    catalogAppId: v.optional(v.string()),
    communityId: v.id("communities"),
    description: v.optional(v.string()),
    endpointUrl: v.string(),
    name: v.string(),
  },
  handler: async () => null,
});

export const refreshCommunityApp = action({
  args: {
    authSubject: v.optional(v.string()),
    communityAppMountId: v.id("communityAppMounts"),
    communityId: v.id("communities"),
  },
  handler: async () => null,
});

export const setupImportedCommunityMcpApp = action({
  args: {
    authSubject: v.optional(v.string()),
    authType: retiredAuthTypeValidator,
    communityAppMountId: v.id("communityAppMounts"),
    communityId: v.id("communities"),
    endpointUrl: v.string(),
  },
  handler: async () => null,
});

export const unmountCommunityApp = action({
  args: {
    authSubject: v.optional(v.string()),
    communityAppMountId: v.id("communityAppMounts"),
    communityId: v.id("communities"),
    userId: v.optional(v.id("users")),
  },
  handler: async () => ({
    removed: false,
    error_code: THIRD_PARTY_MCP_RETIRED_CODE,
  }),
});

export const updateCommunityAppMount = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityAppMountId: v.id("communityAppMounts"),
    communityId: v.id("communities"),
    enabled: v.optional(v.boolean()),
    enabledTools: v.optional(v.array(v.string())),
    nowMs: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async () => null,
});
