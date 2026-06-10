/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as accountSetupCore from "../accountSetupCore.js";
import type * as anonymousUserCleanup from "../anonymousUserCleanup.js";
import type * as appConnections from "../appConnections.js";
import type * as appCore from "../appCore.js";
import type * as appFetchPolicy from "../appFetchPolicy.js";
import type * as appOAuth from "../appOAuth.js";
import type * as appValidation from "../appValidation.js";
import type * as auth from "../auth.js";
import type * as authActor from "../authActor.js";
import type * as authIdentity from "../authIdentity.js";
import type * as authSessions from "../authSessions.js";
import type * as billing from "../billing.js";
import type * as billingCore from "../billingCore.js";
import type * as blaxelRuntimeWorkspaceToolsSmoke from "../blaxelRuntimeWorkspaceToolsSmoke.js";
import type * as blaxelWorkspaceClient from "../blaxelWorkspaceClient.js";
import type * as blaxelWorkspaceComputerProvider from "../blaxelWorkspaceComputerProvider.js";
import type * as blaxelWorkspaceDiagnostics from "../blaxelWorkspaceDiagnostics.js";
import type * as blaxelWorkspaceInspectorDiagnostics from "../blaxelWorkspaceInspectorDiagnostics.js";
import type * as blaxelWorkspaceProjectNames from "../blaxelWorkspaceProjectNames.js";
import type * as blaxelWorkspaceResourceInventory from "../blaxelWorkspaceResourceInventory.js";
import type * as blaxelWorkspaceSandboxSmoke from "../blaxelWorkspaceSandboxSmoke.js";
import type * as blaxelWorkspaceVolumeQuota from "../blaxelWorkspaceVolumeQuota.js";
import type * as blaxelWorkspaceVolumeSmoke from "../blaxelWorkspaceVolumeSmoke.js";
import type * as blaxelWorkspaceWake from "../blaxelWorkspaceWake.js";
import type * as builderPartners from "../builderPartners.js";
import type * as businessAnalytics from "../businessAnalytics.js";
import type * as businessAnalyticsCore from "../businessAnalyticsCore.js";
import type * as chatgptAuth from "../chatgptAuth.js";
import type * as chatgptResponsesTransport from "../chatgptResponsesTransport.js";
import type * as community from "../community.js";
import type * as communityAccessAudit from "../communityAccessAudit.js";
import type * as communityAccessQueries from "../communityAccessQueries.js";
import type * as communityActivity from "../communityActivity.js";
import type * as communityAdmin from "../communityAdmin.js";
import type * as communityAgent from "../communityAgent.js";
import type * as communityAgentFilesystem from "../communityAgentFilesystem.js";
import type * as communityAgentHeartbeat from "../communityAgentHeartbeat.js";
import type * as communityAgentRuntime from "../communityAgentRuntime.js";
import type * as communityAiFeed from "../communityAiFeed.js";
import type * as communityAppMounts from "../communityAppMounts.js";
import type * as communityArchive from "../communityArchive.js";
import type * as communityArchiveDocuments from "../communityArchiveDocuments.js";
import type * as communityArchiveEmbeddingPipeline from "../communityArchiveEmbeddingPipeline.js";
import type * as communityArchiveRetrieval from "../communityArchiveRetrieval.js";
import type * as communityArchiveShared from "../communityArchiveShared.js";
import type * as communityAttention from "../communityAttention.js";
import type * as communityChat from "../communityChat.js";
import type * as communityCommerce from "../communityCommerce.js";
import type * as communityCompilerCandidates from "../communityCompilerCandidates.js";
import type * as communityCompilerDigest from "../communityCompilerDigest.js";
import type * as communityCompilerEvidence from "../communityCompilerEvidence.js";
import type * as communityCompilerEvidenceCore from "../communityCompilerEvidenceCore.js";
import type * as communityCompilerInputs from "../communityCompilerInputs.js";
import type * as communityCompilerWindow from "../communityCompilerWindow.js";
import type * as communityCore from "../communityCore.js";
import type * as communityEvents from "../communityEvents.js";
import type * as communityExperience from "../communityExperience.js";
import type * as communityFunnel from "../communityFunnel.js";
import type * as communityIntelligenceDirectory from "../communityIntelligenceDirectory.js";
import type * as communityLaunchSetup from "../communityLaunchSetup.js";
import type * as communityLifecycle from "../communityLifecycle.js";
import type * as communityPublic from "../communityPublic.js";
import type * as communityRecentContext from "../communityRecentContext.js";
import type * as communityRecipientCore from "../communityRecipientCore.js";
import type * as communityResourceContent from "../communityResourceContent.js";
import type * as communityResources from "../communityResources.js";
import type * as communitySkillAttachments from "../communitySkillAttachments.js";
import type * as communityWikiArchitect from "../communityWikiArchitect.js";
import type * as creatorCommerce from "../creatorCommerce.js";
import type * as criticalAudit from "../criticalAudit.js";
import type * as crons from "../crons.js";
import type * as developerApps from "../developerApps.js";
import type * as directMessages from "../directMessages.js";
import type * as discoverMarketplace from "../discoverMarketplace.js";
import type * as email from "../email.js";
import type * as emailCore from "../emailCore.js";
import type * as emailDiagnostics from "../emailDiagnostics.js";
import type * as emailDigests from "../emailDigests.js";
import type * as emailEvents from "../emailEvents.js";
import type * as emailPreferences from "../emailPreferences.js";
import type * as emailVerificationRepair from "../emailVerificationRepair.js";
import type * as entitlements from "../entitlements.js";
import type * as errorLogging from "../errorLogging.js";
import type * as eventReminders from "../eventReminders.js";
import type * as fallbackHtmlSearchTransport from "../fallbackHtmlSearchTransport.js";
import type * as gates from "../gates.js";
import type * as harnessMounts from "../harnessMounts.js";
import type * as harnessSkills from "../harnessSkills.js";
import type * as http from "../http.js";
import type * as httpAppOAuth from "../httpAppOAuth.js";
import type * as httpAuth from "../httpAuth.js";
import type * as httpAuthBridge from "../httpAuthBridge.js";
import type * as httpBilling from "../httpBilling.js";
import type * as httpChatgpt from "../httpChatgpt.js";
import type * as httpCommunitySourceIntegrations from "../httpCommunitySourceIntegrations.js";
import type * as httpContext from "../httpContext.js";
import type * as httpEmail from "../httpEmail.js";
import type * as httpInferenceConfig from "../httpInferenceConfig.js";
import type * as httpMcp from "../httpMcp.js";
import type * as httpRuntimeRoutes from "../httpRuntimeRoutes.js";
import type * as httpRuntimeSupport from "../httpRuntimeSupport.js";
import type * as httpRuntimeTurnState from "../httpRuntimeTurnState.js";
import type * as httpVoice from "../httpVoice.js";
import type * as legalAcceptances from "../legalAcceptances.js";
import type * as mcpHttpClient from "../mcpHttpClient.js";
import type * as mcpSnapshotCodec from "../mcpSnapshotCodec.js";
import type * as modelRegistry from "../modelRegistry.js";
import type * as openAiNativeToolCompletion from "../openAiNativeToolCompletion.js";
import type * as openAiWebSearchTransport from "../openAiWebSearchTransport.js";
import type * as openRouterNativeTransport from "../openRouterNativeTransport.js";
import type * as operatorAccess from "../operatorAccess.js";
import type * as operatorDashboard from "../operatorDashboard.js";
import type * as operatorIntelligence from "../operatorIntelligence.js";
import type * as operatorSentryDiagnostics from "../operatorSentryDiagnostics.js";
import type * as paidToolCreditReservation from "../paidToolCreditReservation.js";
import type * as personalMemory from "../personalMemory.js";
import type * as platformDiagnostics from "../platformDiagnostics.js";
import type * as platformHomeCommunity from "../platformHomeCommunity.js";
import type * as platformSkillRuntime from "../platformSkillRuntime.js";
import type * as polynetCodexWorkerBridge from "../polynetCodexWorkerBridge.js";
import type * as polynetCodexWorkerIngest from "../polynetCodexWorkerIngest.js";
import type * as previewProxySessionToken from "../previewProxySessionToken.js";
import type * as probe from "../probe.js";
import type * as profileRelationshipCore from "../profileRelationshipCore.js";
import type * as profiles from "../profiles.js";
import type * as projects from "../projects.js";
import type * as providerConnectionProbes from "../providerConnectionProbes.js";
import type * as providerConnections from "../providerConnections.js";
import type * as publicAppUrl from "../publicAppUrl.js";
import type * as runtimeAgentLoop from "../runtimeAgentLoop.js";
import type * as runtimeCancellation from "../runtimeCancellation.js";
import type * as runtimeExecutionSession from "../runtimeExecutionSession.js";
import type * as runtimeHarnessComposition from "../runtimeHarnessComposition.js";
import type * as runtimeHarnessShaping from "../runtimeHarnessShaping.js";
import type * as runtimeHarnessTelemetry from "../runtimeHarnessTelemetry.js";
import type * as runtimeMcpManager from "../runtimeMcpManager.js";
import type * as runtimeMountedToolExposure from "../runtimeMountedToolExposure.js";
import type * as runtimeReasoningSummaryEvents from "../runtimeReasoningSummaryEvents.js";
import type * as runtimeSkillResolution from "../runtimeSkillResolution.js";
import type * as runtimeToolCallEvents from "../runtimeToolCallEvents.js";
import type * as runtimeTurnContext from "../runtimeTurnContext.js";
import type * as runtimeTurnHandlers from "../runtimeTurnHandlers.js";
import type * as runtimeTurnPersistence from "../runtimeTurnPersistence.js";
import type * as runtimeTurnResolution from "../runtimeTurnResolution.js";
import type * as settings from "../settings.js";
import type * as skillCore from "../skillCore.js";
import type * as skillPackages from "../skillPackages.js";
import type * as stripeConnectAccountCore from "../stripeConnectAccountCore.js";
import type * as stripeCore from "../stripeCore.js";
import type * as stripeCustomers from "../stripeCustomers.js";
import type * as threads from "../threads.js";
import type * as userPlatformAppMounts from "../userPlatformAppMounts.js";
import type * as userPlatformSkills from "../userPlatformSkills.js";
import type * as userProfileProjection from "../userProfileProjection.js";
import type * as webResearchTools from "../webResearchTools.js";
import type * as webSearchTypes from "../webSearchTypes.js";
import type * as workosEmailVerification from "../workosEmailVerification.js";
import type * as workspaceComputerProviderPolicy from "../workspaceComputerProviderPolicy.js";
import type * as workspaceCreditBudgetSignal from "../workspaceCreditBudgetSignal.js";
import type * as workspaceCreditSettlement from "../workspaceCreditSettlement.js";
import type * as workspaceCredits from "../workspaceCredits.js";
import type * as workspaceInspector from "../workspaceInspector.js";
import type * as workspaceRuntimeSession from "../workspaceRuntimeSession.js";
import type * as workspaceRuntimeTools from "../workspaceRuntimeTools.js";
import type * as workspaceTerminalProcessCore from "../workspaceTerminalProcessCore.js";
import type * as workspaceTerminals from "../workspaceTerminals.js";
import type * as workspaceUsageCardBillingSmoke from "../workspaceUsageCardBillingSmoke.js";
import type * as workspaceUsageCardBillingSmokeRows from "../workspaceUsageCardBillingSmokeRows.js";
import type * as xAiSearchTransport from "../xAiSearchTransport.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  accountSetupCore: typeof accountSetupCore;
  anonymousUserCleanup: typeof anonymousUserCleanup;
  appConnections: typeof appConnections;
  appCore: typeof appCore;
  appFetchPolicy: typeof appFetchPolicy;
  appOAuth: typeof appOAuth;
  appValidation: typeof appValidation;
  auth: typeof auth;
  authActor: typeof authActor;
  authIdentity: typeof authIdentity;
  authSessions: typeof authSessions;
  billing: typeof billing;
  billingCore: typeof billingCore;
  blaxelRuntimeWorkspaceToolsSmoke: typeof blaxelRuntimeWorkspaceToolsSmoke;
  blaxelWorkspaceClient: typeof blaxelWorkspaceClient;
  blaxelWorkspaceComputerProvider: typeof blaxelWorkspaceComputerProvider;
  blaxelWorkspaceDiagnostics: typeof blaxelWorkspaceDiagnostics;
  blaxelWorkspaceInspectorDiagnostics: typeof blaxelWorkspaceInspectorDiagnostics;
  blaxelWorkspaceProjectNames: typeof blaxelWorkspaceProjectNames;
  blaxelWorkspaceResourceInventory: typeof blaxelWorkspaceResourceInventory;
  blaxelWorkspaceSandboxSmoke: typeof blaxelWorkspaceSandboxSmoke;
  blaxelWorkspaceVolumeQuota: typeof blaxelWorkspaceVolumeQuota;
  blaxelWorkspaceVolumeSmoke: typeof blaxelWorkspaceVolumeSmoke;
  blaxelWorkspaceWake: typeof blaxelWorkspaceWake;
  builderPartners: typeof builderPartners;
  businessAnalytics: typeof businessAnalytics;
  businessAnalyticsCore: typeof businessAnalyticsCore;
  chatgptAuth: typeof chatgptAuth;
  chatgptResponsesTransport: typeof chatgptResponsesTransport;
  community: typeof community;
  communityAccessAudit: typeof communityAccessAudit;
  communityAccessQueries: typeof communityAccessQueries;
  communityActivity: typeof communityActivity;
  communityAdmin: typeof communityAdmin;
  communityAgent: typeof communityAgent;
  communityAgentFilesystem: typeof communityAgentFilesystem;
  communityAgentHeartbeat: typeof communityAgentHeartbeat;
  communityAgentRuntime: typeof communityAgentRuntime;
  communityAiFeed: typeof communityAiFeed;
  communityAppMounts: typeof communityAppMounts;
  communityArchive: typeof communityArchive;
  communityArchiveDocuments: typeof communityArchiveDocuments;
  communityArchiveEmbeddingPipeline: typeof communityArchiveEmbeddingPipeline;
  communityArchiveRetrieval: typeof communityArchiveRetrieval;
  communityArchiveShared: typeof communityArchiveShared;
  communityAttention: typeof communityAttention;
  communityChat: typeof communityChat;
  communityCommerce: typeof communityCommerce;
  communityCompilerCandidates: typeof communityCompilerCandidates;
  communityCompilerDigest: typeof communityCompilerDigest;
  communityCompilerEvidence: typeof communityCompilerEvidence;
  communityCompilerEvidenceCore: typeof communityCompilerEvidenceCore;
  communityCompilerInputs: typeof communityCompilerInputs;
  communityCompilerWindow: typeof communityCompilerWindow;
  communityCore: typeof communityCore;
  communityEvents: typeof communityEvents;
  communityExperience: typeof communityExperience;
  communityFunnel: typeof communityFunnel;
  communityIntelligenceDirectory: typeof communityIntelligenceDirectory;
  communityLaunchSetup: typeof communityLaunchSetup;
  communityLifecycle: typeof communityLifecycle;
  communityPublic: typeof communityPublic;
  communityRecentContext: typeof communityRecentContext;
  communityRecipientCore: typeof communityRecipientCore;
  communityResourceContent: typeof communityResourceContent;
  communityResources: typeof communityResources;
  communitySkillAttachments: typeof communitySkillAttachments;
  communityWikiArchitect: typeof communityWikiArchitect;
  creatorCommerce: typeof creatorCommerce;
  criticalAudit: typeof criticalAudit;
  crons: typeof crons;
  developerApps: typeof developerApps;
  directMessages: typeof directMessages;
  discoverMarketplace: typeof discoverMarketplace;
  email: typeof email;
  emailCore: typeof emailCore;
  emailDiagnostics: typeof emailDiagnostics;
  emailDigests: typeof emailDigests;
  emailEvents: typeof emailEvents;
  emailPreferences: typeof emailPreferences;
  emailVerificationRepair: typeof emailVerificationRepair;
  entitlements: typeof entitlements;
  errorLogging: typeof errorLogging;
  eventReminders: typeof eventReminders;
  fallbackHtmlSearchTransport: typeof fallbackHtmlSearchTransport;
  gates: typeof gates;
  harnessMounts: typeof harnessMounts;
  harnessSkills: typeof harnessSkills;
  http: typeof http;
  httpAppOAuth: typeof httpAppOAuth;
  httpAuth: typeof httpAuth;
  httpAuthBridge: typeof httpAuthBridge;
  httpBilling: typeof httpBilling;
  httpChatgpt: typeof httpChatgpt;
  httpCommunitySourceIntegrations: typeof httpCommunitySourceIntegrations;
  httpContext: typeof httpContext;
  httpEmail: typeof httpEmail;
  httpInferenceConfig: typeof httpInferenceConfig;
  httpMcp: typeof httpMcp;
  httpRuntimeRoutes: typeof httpRuntimeRoutes;
  httpRuntimeSupport: typeof httpRuntimeSupport;
  httpRuntimeTurnState: typeof httpRuntimeTurnState;
  httpVoice: typeof httpVoice;
  legalAcceptances: typeof legalAcceptances;
  mcpHttpClient: typeof mcpHttpClient;
  mcpSnapshotCodec: typeof mcpSnapshotCodec;
  modelRegistry: typeof modelRegistry;
  openAiNativeToolCompletion: typeof openAiNativeToolCompletion;
  openAiWebSearchTransport: typeof openAiWebSearchTransport;
  openRouterNativeTransport: typeof openRouterNativeTransport;
  operatorAccess: typeof operatorAccess;
  operatorDashboard: typeof operatorDashboard;
  operatorIntelligence: typeof operatorIntelligence;
  operatorSentryDiagnostics: typeof operatorSentryDiagnostics;
  paidToolCreditReservation: typeof paidToolCreditReservation;
  personalMemory: typeof personalMemory;
  platformDiagnostics: typeof platformDiagnostics;
  platformHomeCommunity: typeof platformHomeCommunity;
  platformSkillRuntime: typeof platformSkillRuntime;
  polynetCodexWorkerBridge: typeof polynetCodexWorkerBridge;
  polynetCodexWorkerIngest: typeof polynetCodexWorkerIngest;
  previewProxySessionToken: typeof previewProxySessionToken;
  probe: typeof probe;
  profileRelationshipCore: typeof profileRelationshipCore;
  profiles: typeof profiles;
  projects: typeof projects;
  providerConnectionProbes: typeof providerConnectionProbes;
  providerConnections: typeof providerConnections;
  publicAppUrl: typeof publicAppUrl;
  runtimeAgentLoop: typeof runtimeAgentLoop;
  runtimeCancellation: typeof runtimeCancellation;
  runtimeExecutionSession: typeof runtimeExecutionSession;
  runtimeHarnessComposition: typeof runtimeHarnessComposition;
  runtimeHarnessShaping: typeof runtimeHarnessShaping;
  runtimeHarnessTelemetry: typeof runtimeHarnessTelemetry;
  runtimeMcpManager: typeof runtimeMcpManager;
  runtimeMountedToolExposure: typeof runtimeMountedToolExposure;
  runtimeReasoningSummaryEvents: typeof runtimeReasoningSummaryEvents;
  runtimeSkillResolution: typeof runtimeSkillResolution;
  runtimeToolCallEvents: typeof runtimeToolCallEvents;
  runtimeTurnContext: typeof runtimeTurnContext;
  runtimeTurnHandlers: typeof runtimeTurnHandlers;
  runtimeTurnPersistence: typeof runtimeTurnPersistence;
  runtimeTurnResolution: typeof runtimeTurnResolution;
  settings: typeof settings;
  skillCore: typeof skillCore;
  skillPackages: typeof skillPackages;
  stripeConnectAccountCore: typeof stripeConnectAccountCore;
  stripeCore: typeof stripeCore;
  stripeCustomers: typeof stripeCustomers;
  threads: typeof threads;
  userPlatformAppMounts: typeof userPlatformAppMounts;
  userPlatformSkills: typeof userPlatformSkills;
  userProfileProjection: typeof userProfileProjection;
  webResearchTools: typeof webResearchTools;
  webSearchTypes: typeof webSearchTypes;
  workosEmailVerification: typeof workosEmailVerification;
  workspaceComputerProviderPolicy: typeof workspaceComputerProviderPolicy;
  workspaceCreditBudgetSignal: typeof workspaceCreditBudgetSignal;
  workspaceCreditSettlement: typeof workspaceCreditSettlement;
  workspaceCredits: typeof workspaceCredits;
  workspaceInspector: typeof workspaceInspector;
  workspaceRuntimeSession: typeof workspaceRuntimeSession;
  workspaceRuntimeTools: typeof workspaceRuntimeTools;
  workspaceTerminalProcessCore: typeof workspaceTerminalProcessCore;
  workspaceTerminals: typeof workspaceTerminals;
  workspaceUsageCardBillingSmoke: typeof workspaceUsageCardBillingSmoke;
  workspaceUsageCardBillingSmokeRows: typeof workspaceUsageCardBillingSmokeRows;
  xAiSearchTransport: typeof xAiSearchTransport;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
