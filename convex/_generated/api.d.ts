/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authActor from "../authActor.js";
import type * as authIdentity from "../authIdentity.js";
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
import type * as communityArchive from "../communityArchive.js";
import type * as communityArchiveDocuments from "../communityArchiveDocuments.js";
import type * as communityArchiveEmbeddingPipeline from "../communityArchiveEmbeddingPipeline.js";
import type * as communityArchiveRetrieval from "../communityArchiveRetrieval.js";
import type * as communityArchiveShared from "../communityArchiveShared.js";
import type * as communityChat from "../communityChat.js";
import type * as communityCommerce from "../communityCommerce.js";
import type * as communityCore from "../communityCore.js";
import type * as communityExperience from "../communityExperience.js";
import type * as communityFunnel from "../communityFunnel.js";
import type * as communityLifecycle from "../communityLifecycle.js";
import type * as communityPublic from "../communityPublic.js";
import type * as communityRecentContext from "../communityRecentContext.js";
import type * as communityResources from "../communityResources.js";
import type * as daytonaRuntimeEvents from "../daytonaRuntimeEvents.js";
import type * as daytonaSandboxClient from "../daytonaSandboxClient.js";
import type * as daytonaToolboxExecutor from "../daytonaToolboxExecutor.js";
import type * as daytonaToolboxFileSystem from "../daytonaToolboxFileSystem.js";
import type * as daytonaWorkspaceSession from "../daytonaWorkspaceSession.js";
import type * as daytonaWorkspaceTools from "../daytonaWorkspaceTools.js";
import type * as entitlements from "../entitlements.js";
import type * as gates from "../gates.js";
import type * as http from "../http.js";
import type * as httpAuth from "../httpAuth.js";
import type * as httpBilling from "../httpBilling.js";
import type * as httpChatgpt from "../httpChatgpt.js";
import type * as httpContext from "../httpContext.js";
import type * as httpDaytona from "../httpDaytona.js";
import type * as httpInferenceConfig from "../httpInferenceConfig.js";
import type * as httpRuntimeRoutes from "../httpRuntimeRoutes.js";
import type * as httpRuntimeSupport from "../httpRuntimeSupport.js";
import type * as httpRuntimeTurnState from "../httpRuntimeTurnState.js";
import type * as httpVoice from "../httpVoice.js";
import type * as modelRegistry from "../modelRegistry.js";
import type * as openRouterNativeTransport from "../openRouterNativeTransport.js";
import type * as personalMemory from "../personalMemory.js";
import type * as probe from "../probe.js";
import type * as profiles from "../profiles.js";
import type * as projects from "../projects.js";
import type * as providerConnectionProbes from "../providerConnectionProbes.js";
import type * as providerConnections from "../providerConnections.js";
import type * as runtimeTurnHandlers from "../runtimeTurnHandlers.js";
import type * as runtimeTurnPersistence from "../runtimeTurnPersistence.js";
import type * as runtimeTurnResolution from "../runtimeTurnResolution.js";
import type * as settings from "../settings.js";
import type * as threads from "../threads.js";
import type * as webResearchTools from "../webResearchTools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authActor: typeof authActor;
  authIdentity: typeof authIdentity;
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
  communityArchive: typeof communityArchive;
  communityArchiveDocuments: typeof communityArchiveDocuments;
  communityArchiveEmbeddingPipeline: typeof communityArchiveEmbeddingPipeline;
  communityArchiveRetrieval: typeof communityArchiveRetrieval;
  communityArchiveShared: typeof communityArchiveShared;
  communityChat: typeof communityChat;
  communityCommerce: typeof communityCommerce;
  communityCore: typeof communityCore;
  communityExperience: typeof communityExperience;
  communityFunnel: typeof communityFunnel;
  communityLifecycle: typeof communityLifecycle;
  communityPublic: typeof communityPublic;
  communityRecentContext: typeof communityRecentContext;
  communityResources: typeof communityResources;
  daytonaRuntimeEvents: typeof daytonaRuntimeEvents;
  daytonaSandboxClient: typeof daytonaSandboxClient;
  daytonaToolboxExecutor: typeof daytonaToolboxExecutor;
  daytonaToolboxFileSystem: typeof daytonaToolboxFileSystem;
  daytonaWorkspaceSession: typeof daytonaWorkspaceSession;
  daytonaWorkspaceTools: typeof daytonaWorkspaceTools;
  entitlements: typeof entitlements;
  gates: typeof gates;
  http: typeof http;
  httpAuth: typeof httpAuth;
  httpBilling: typeof httpBilling;
  httpChatgpt: typeof httpChatgpt;
  httpContext: typeof httpContext;
  httpDaytona: typeof httpDaytona;
  httpInferenceConfig: typeof httpInferenceConfig;
  httpRuntimeRoutes: typeof httpRuntimeRoutes;
  httpRuntimeSupport: typeof httpRuntimeSupport;
  httpRuntimeTurnState: typeof httpRuntimeTurnState;
  httpVoice: typeof httpVoice;
  modelRegistry: typeof modelRegistry;
  openRouterNativeTransport: typeof openRouterNativeTransport;
  personalMemory: typeof personalMemory;
  probe: typeof probe;
  profiles: typeof profiles;
  projects: typeof projects;
  providerConnectionProbes: typeof providerConnectionProbes;
  providerConnections: typeof providerConnections;
  runtimeTurnHandlers: typeof runtimeTurnHandlers;
  runtimeTurnPersistence: typeof runtimeTurnPersistence;
  runtimeTurnResolution: typeof runtimeTurnResolution;
  settings: typeof settings;
  threads: typeof threads;
  webResearchTools: typeof webResearchTools;
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
