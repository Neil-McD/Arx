/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appConnections from "../appConnections.js";
import type * as appCore from "../appCore.js";
import type * as appValidation from "../appValidation.js";
import type * as auth from "../auth.js";
import type * as authActor from "../authActor.js";
import type * as authIdentity from "../authIdentity.js";
import type * as authSessions from "../authSessions.js";
import type * as billing from "../billing.js";
import type * as billingCore from "../billingCore.js";
import type * as builderCommerce from "../builderCommerce.js";
import type * as chatgptAuth from "../chatgptAuth.js";
import type * as chatgptResponsesTransport from "../chatgptResponsesTransport.js";
import type * as community from "../community.js";
import type * as communityAccessQueries from "../communityAccessQueries.js";
import type * as communityAdmin from "../communityAdmin.js";
import type * as communityAgent from "../communityAgent.js";
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
import type * as communityCore from "../communityCore.js";
import type * as communityExperience from "../communityExperience.js";
import type * as communityFunnel from "../communityFunnel.js";
import type * as communityLifecycle from "../communityLifecycle.js";
import type * as communityPublic from "../communityPublic.js";
import type * as communityRecentContext from "../communityRecentContext.js";
import type * as communityResources from "../communityResources.js";
import type * as communitySkillAttachments from "../communitySkillAttachments.js";
import type * as crons from "../crons.js";
import type * as daytonaBrowserNavigation from "../daytonaBrowserNavigation.js";
import type * as daytonaComputerUse from "../daytonaComputerUse.js";
import type * as daytonaComputerUseTransport from "../daytonaComputerUseTransport.js";
import type * as daytonaOrphanReconciler from "../daytonaOrphanReconciler.js";
import type * as daytonaProcessSessions from "../daytonaProcessSessions.js";
import type * as daytonaRuntimeEvents from "../daytonaRuntimeEvents.js";
import type * as daytonaSandboxClient from "../daytonaSandboxClient.js";
import type * as daytonaToolboxExecutor from "../daytonaToolboxExecutor.js";
import type * as daytonaToolboxFileSystem from "../daytonaToolboxFileSystem.js";
import type * as daytonaWorkspaceSession from "../daytonaWorkspaceSession.js";
import type * as daytonaWorkspaceTools from "../daytonaWorkspaceTools.js";
import type * as developerApps from "../developerApps.js";
import type * as discoverMarketplace from "../discoverMarketplace.js";
import type * as email from "../email.js";
import type * as emailCore from "../emailCore.js";
import type * as emailDigests from "../emailDigests.js";
import type * as emailEvents from "../emailEvents.js";
import type * as emailPreferences from "../emailPreferences.js";
import type * as entitlements from "../entitlements.js";
import type * as errorLogging from "../errorLogging.js";
import type * as fallbackHtmlSearchTransport from "../fallbackHtmlSearchTransport.js";
import type * as gates from "../gates.js";
import type * as http from "../http.js";
import type * as httpAuth from "../httpAuth.js";
import type * as httpAuthBridge from "../httpAuthBridge.js";
import type * as httpBilling from "../httpBilling.js";
import type * as httpChatgpt from "../httpChatgpt.js";
import type * as httpContext from "../httpContext.js";
import type * as httpDaytona from "../httpDaytona.js";
import type * as httpEmail from "../httpEmail.js";
import type * as httpInferenceConfig from "../httpInferenceConfig.js";
import type * as httpMcp from "../httpMcp.js";
import type * as httpRuntimeRoutes from "../httpRuntimeRoutes.js";
import type * as httpRuntimeSupport from "../httpRuntimeSupport.js";
import type * as httpRuntimeTurnState from "../httpRuntimeTurnState.js";
import type * as httpVoice from "../httpVoice.js";
import type * as mcpHttpClient from "../mcpHttpClient.js";
import type * as mcpSnapshotCodec from "../mcpSnapshotCodec.js";
import type * as modelRegistry from "../modelRegistry.js";
import type * as openAiNativeToolCompletion from "../openAiNativeToolCompletion.js";
import type * as openAiWebSearchTransport from "../openAiWebSearchTransport.js";
import type * as openRouterNativeTransport from "../openRouterNativeTransport.js";
import type * as personalMemory from "../personalMemory.js";
import type * as platformHomeCommunity from "../platformHomeCommunity.js";
import type * as previewProxySessionToken from "../previewProxySessionToken.js";
import type * as probe from "../probe.js";
import type * as profiles from "../profiles.js";
import type * as projects from "../projects.js";
import type * as providerConnectionProbes from "../providerConnectionProbes.js";
import type * as providerConnections from "../providerConnections.js";
import type * as runtimeCancellation from "../runtimeCancellation.js";
import type * as runtimeExecutionSession from "../runtimeExecutionSession.js";
import type * as runtimeHarnessComposition from "../runtimeHarnessComposition.js";
import type * as runtimeHarnessShaping from "../runtimeHarnessShaping.js";
import type * as runtimeHarnessTelemetry from "../runtimeHarnessTelemetry.js";
import type * as runtimeMcpManager from "../runtimeMcpManager.js";
import type * as runtimeMountedToolExposure from "../runtimeMountedToolExposure.js";
import type * as runtimeReasoningSummaryEvents from "../runtimeReasoningSummaryEvents.js";
import type * as runtimeSkillResolution from "../runtimeSkillResolution.js";
import type * as runtimeTurnHandlers from "../runtimeTurnHandlers.js";
import type * as runtimeTurnPersistence from "../runtimeTurnPersistence.js";
import type * as runtimeTurnResolution from "../runtimeTurnResolution.js";
import type * as settings from "../settings.js";
import type * as skillCore from "../skillCore.js";
import type * as skillPackages from "../skillPackages.js";
import type * as stripeConnectAccountCore from "../stripeConnectAccountCore.js";
import type * as stripeCore from "../stripeCore.js";
import type * as threads from "../threads.js";
import type * as userPlatformAppMounts from "../userPlatformAppMounts.js";
import type * as userPlatformSkills from "../userPlatformSkills.js";
import type * as webResearchTools from "../webResearchTools.js";
import type * as webSearchTypes from "../webSearchTypes.js";
import type * as workspaceCredits from "../workspaceCredits.js";
import type * as workspaceTerminalBackgroundService from "../workspaceTerminalBackgroundService.js";
import type * as workspaceTerminalProcessCore from "../workspaceTerminalProcessCore.js";
import type * as workspaceTerminalReconciliation from "../workspaceTerminalReconciliation.js";
import type * as workspaceTerminals from "../workspaceTerminals.js";
import type * as xAiSearchTransport from "../xAiSearchTransport.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  appConnections: typeof appConnections;
  appCore: typeof appCore;
  appValidation: typeof appValidation;
  auth: typeof auth;
  authActor: typeof authActor;
  authIdentity: typeof authIdentity;
  authSessions: typeof authSessions;
  billing: typeof billing;
  billingCore: typeof billingCore;
  builderCommerce: typeof builderCommerce;
  chatgptAuth: typeof chatgptAuth;
  chatgptResponsesTransport: typeof chatgptResponsesTransport;
  community: typeof community;
  communityAccessQueries: typeof communityAccessQueries;
  communityAdmin: typeof communityAdmin;
  communityAgent: typeof communityAgent;
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
  communityCore: typeof communityCore;
  communityExperience: typeof communityExperience;
  communityFunnel: typeof communityFunnel;
  communityLifecycle: typeof communityLifecycle;
  communityPublic: typeof communityPublic;
  communityRecentContext: typeof communityRecentContext;
  communityResources: typeof communityResources;
  communitySkillAttachments: typeof communitySkillAttachments;
  crons: typeof crons;
  daytonaBrowserNavigation: typeof daytonaBrowserNavigation;
  daytonaComputerUse: typeof daytonaComputerUse;
  daytonaComputerUseTransport: typeof daytonaComputerUseTransport;
  daytonaOrphanReconciler: typeof daytonaOrphanReconciler;
  daytonaProcessSessions: typeof daytonaProcessSessions;
  daytonaRuntimeEvents: typeof daytonaRuntimeEvents;
  daytonaSandboxClient: typeof daytonaSandboxClient;
  daytonaToolboxExecutor: typeof daytonaToolboxExecutor;
  daytonaToolboxFileSystem: typeof daytonaToolboxFileSystem;
  daytonaWorkspaceSession: typeof daytonaWorkspaceSession;
  daytonaWorkspaceTools: typeof daytonaWorkspaceTools;
  developerApps: typeof developerApps;
  discoverMarketplace: typeof discoverMarketplace;
  email: typeof email;
  emailCore: typeof emailCore;
  emailDigests: typeof emailDigests;
  emailEvents: typeof emailEvents;
  emailPreferences: typeof emailPreferences;
  entitlements: typeof entitlements;
  errorLogging: typeof errorLogging;
  fallbackHtmlSearchTransport: typeof fallbackHtmlSearchTransport;
  gates: typeof gates;
  http: typeof http;
  httpAuth: typeof httpAuth;
  httpAuthBridge: typeof httpAuthBridge;
  httpBilling: typeof httpBilling;
  httpChatgpt: typeof httpChatgpt;
  httpContext: typeof httpContext;
  httpDaytona: typeof httpDaytona;
  httpEmail: typeof httpEmail;
  httpInferenceConfig: typeof httpInferenceConfig;
  httpMcp: typeof httpMcp;
  httpRuntimeRoutes: typeof httpRuntimeRoutes;
  httpRuntimeSupport: typeof httpRuntimeSupport;
  httpRuntimeTurnState: typeof httpRuntimeTurnState;
  httpVoice: typeof httpVoice;
  mcpHttpClient: typeof mcpHttpClient;
  mcpSnapshotCodec: typeof mcpSnapshotCodec;
  modelRegistry: typeof modelRegistry;
  openAiNativeToolCompletion: typeof openAiNativeToolCompletion;
  openAiWebSearchTransport: typeof openAiWebSearchTransport;
  openRouterNativeTransport: typeof openRouterNativeTransport;
  personalMemory: typeof personalMemory;
  platformHomeCommunity: typeof platformHomeCommunity;
  previewProxySessionToken: typeof previewProxySessionToken;
  probe: typeof probe;
  profiles: typeof profiles;
  projects: typeof projects;
  providerConnectionProbes: typeof providerConnectionProbes;
  providerConnections: typeof providerConnections;
  runtimeCancellation: typeof runtimeCancellation;
  runtimeExecutionSession: typeof runtimeExecutionSession;
  runtimeHarnessComposition: typeof runtimeHarnessComposition;
  runtimeHarnessShaping: typeof runtimeHarnessShaping;
  runtimeHarnessTelemetry: typeof runtimeHarnessTelemetry;
  runtimeMcpManager: typeof runtimeMcpManager;
  runtimeMountedToolExposure: typeof runtimeMountedToolExposure;
  runtimeReasoningSummaryEvents: typeof runtimeReasoningSummaryEvents;
  runtimeSkillResolution: typeof runtimeSkillResolution;
  runtimeTurnHandlers: typeof runtimeTurnHandlers;
  runtimeTurnPersistence: typeof runtimeTurnPersistence;
  runtimeTurnResolution: typeof runtimeTurnResolution;
  settings: typeof settings;
  skillCore: typeof skillCore;
  skillPackages: typeof skillPackages;
  stripeConnectAccountCore: typeof stripeConnectAccountCore;
  stripeCore: typeof stripeCore;
  threads: typeof threads;
  userPlatformAppMounts: typeof userPlatformAppMounts;
  userPlatformSkills: typeof userPlatformSkills;
  webResearchTools: typeof webResearchTools;
  webSearchTypes: typeof webSearchTypes;
  workspaceCredits: typeof workspaceCredits;
  workspaceTerminalBackgroundService: typeof workspaceTerminalBackgroundService;
  workspaceTerminalProcessCore: typeof workspaceTerminalProcessCore;
  workspaceTerminalReconciliation: typeof workspaceTerminalReconciliation;
  workspaceTerminals: typeof workspaceTerminals;
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
