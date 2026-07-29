import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
} from "react";
import { MessageCircle } from "lucide-react";
import "highlight.js/styles/github-dark.css";
import {
  beginBrowserSignedOutState,
  getAuthPublicKey,
  getAuthUrl,
  hasRecentAuthFlowPending,
  type AuthSession,
} from "./auth";
import {
  clearPendingPurchaseClaimToken, readPendingPurchaseClaimToken, storePendingPublicJoin, storePendingPurchaseClaimToken, type PendingPurchaseClaim
} from "../../../shared/pay_first";
import {
  readProfileDraftForUser, writeProfileDraftForUser, } from "../../../shared/profileDraftStorage";
import {
  resolveAuthSubject,
} from "../../../shared/authSession";
import { getAuthUid } from "../../../shared/authCore";
import {
  identifyCloudBusinessVisitor,
} from "../../../shared/cloudBusinessAnalyticsGateway";
import { CommunityAvatar } from "../../../shared/CommunityAvatar";
import {
  formatProviderConnectionErrorMessage,
  formatWorkspaceBillingCheckoutError,
} from "../../../shared/appErrorMappings";
import {
  isLikelyImageFile,
} from "../../../shared/attachmentHelpers";
import {
  type CreateCommunityIntentDraft,
} from "../../../shared/createCommunityIntent";
import {
  DEFAULT_EMPTY_THREAD_LANDING, normalizeCommunityAgentDraftForSave, normalizeCommunityAgentLanding, type CommunityAgentLanding, } from "../../../shared/communityAgentLanding";
import { normalizeCommunityFunnelConfig } from "../../../shared/communityFunnel";
import {
  formatChatTime, formatCount, formatMoneyBaseUnits, formatPercent, formatRelativeTimeFromIso as formatRelativeTime, } from "../../../shared/contentFormatting";
import {
  formatAccountTierLabel, isAccountTierFree, formatPlanPrice, formatSubscriptionPrice, type StripeConnectReturn, } from "../../../shared/accountCommerce";
import { canUseCreatorDevTierOverride } from "../../../shared/devTierOverride";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";
import { useWebCommunityUiController } from "./controllers/useWebCommunityUiController";
import { useWebPersonalAccountSettingsController } from "./controllers/useWebPersonalAccountSettingsController";
import {
  COMMUNITY_INTERACTION_PROJECTION_ENABLED,
  useWebCommunityInteractionProjection,
} from "./controllers/useWebCommunityInteractionProjection";
import {
  useWebCommunityChatController,
  WEB_COMMUNITY_REACTION_EMOJIS,
  type WebCommunityMessageAttachment,
} from "./controllers/useWebCommunityChatController";
import {
  getWebCommunityEventsMonthRange,
  useWebCommunityContentController,
} from "./controllers/useWebCommunityContentController";
import { useWebCommunityAttentionModel } from "./controllers/useWebCommunityAttentionController";
import {
  useWebCommunityAdministrationState,
  type WebCommunityJoinRequest,
} from "./controllers/useWebCommunityAdministrationState";
import { useWebPublicCommunityUiController } from "./controllers/useWebPublicCommunityUiController";
import { useWebProfileSettingsUiController } from "./controllers/useWebProfileSettingsUiController";
import { useWebAccountSetupSurfaceController } from "./controllers/useWebAccountSetupSurfaceController";
import { useWebProviderConnectionUiController } from "./controllers/useWebProviderConnectionUiController";
import { useWebSkillsModel } from "./controllers/useWebSkillsModel";
import { useWebAppAuthController } from "./controllers/useWebAppAuthController";
import { updateSentryUiContext } from "./instrument";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "./lib/workspaceInstrumentation";
import {
  captureProductAnalyticsEvent,
  updatePosthogUiContext,
} from "./posthogAnalytics";

import {
  useCommunityAiFeedController,
} from "../../../shared/useCommunityAiFeedController";
import {
  saveCloudCommunityAbout,
  saveCloudCommunityPublicPresentation,
  type CloudCommunityAboutSaveResult,
} from "../../../shared/cloudCommunityFunnelGateway";
import {
  resolveCloudMemberEntryDestination,
  type CloudMemberEntryDestination,
} from "../../../shared/cloudMemberEntryDestinationGateway";
import {
  loadCloudAccountSetupStatus,
  prepareCloudProfileAvatarField,
  recordMemberTimezoneRpc,
  resolveCloudOnboardingProfileDetail,
  upsertCloudProfileDetail,
} from "../../../shared/cloudProfilesGateway";
import { formatProfileMutationError } from "../../../shared/profileMutationErrors";
import {
  formatAccountSetupMissingGuidance,
  isAccountSetupStatusIdentityComplete,
  type AccountSetupStatus,
} from "../../../shared/accountSetup";
import {
  saveCloudCommunityAgentConfig as saveCloudCommunityAgentConfigDirect,
} from "../../../shared/cloudCommunityAgentGateway";
import {
  fetchCloudCommunityMemberBillingHistory,
  setCloudCommunityFreeAccessMode,
} from "../../../shared/cloudCommunityAdminGateway";
import {
  loadCloudProviderConnections,
  type CloudChatgptConnectionStatus,
  type CloudOpenAiConnectionStatus,
} from "../../../shared/cloudProviderConnectionsGateway";
import { AnalyticsLineChart } from "../../../shared/AnalyticsLineChart";
import {
  copyTextToClipboard,
  getAvatarColor,
  getInitials,
  shortId,
  shouldShowCommunitySenderMeta,
} from "../../../shared/chatUi";
import {
  type AppPage,
  type AppView,
  type CommunitySettingsPane,
  type CommunityTab,
  isCommunityRouteManagedTab,
  normalizeCommunityTabForAccess,
  type OperatorTab,
  type SettingsGroup,
  type SettingsPage,
  settingsGroupLabel,
  settingsGroupForPage,
} from "../../../shared/appShellNavigation";
import type {
  CommunityAiFeedPost as SharedCommunityAiFeedPost,
  CommunityAiFeedReactionType as SharedCommunityAiFeedReactionType,
  CommunityAccess as SharedCommunityAccess,
  CommunityAgentConfig as SharedCommunityAgentConfig,
  CommunityFunnelConfig as SharedCommunityFunnelConfig,
  DiscoverCommunitySnapshot as SharedDiscoverCommunitySnapshot,
  PublicPlanSummary as SharedPublicPlanSummary,
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../shared/communityTypes";
import { deriveOpenDiscoverTransition } from "../../../shared/appNavTransitions";
import {
  type AppShellVariant,
  type AppRouteState,
  type CommunityExperienceMode,
  type PublicRoute,
  STANDALONE_APP_LAUNCH_SEARCH_PARAM,
  STANDALONE_APP_LAUNCH_SEARCH_VALUE,
  applyShellVariantToPublicPath,
  applyShellVariantToAppPath,
  applyShellVariantToKnownPath,
  buildAppRoutePath,
  buildCommunityFunnelPath,
  buildCommunityOnboardingPreviewPath,
  buildCommunityTabPath,
  buildSettingsPath,
  buildCommunityFunnelPreviewPath,
  isLegacyWorkspaceRoutePath,
  isRootAppRoutePath,
  readLegacyWorkspaceRouteContext,
  readAppRouteFromLocation,
  readPublicRouteFromLocation,
  readShellVariantFromPathname,
} from "../../../shared/webAppRouteState";
import { PRODUCT_DOCS_DEFAULT_SLUG } from "./docs/productDocsMeta";
import {
  formatBackTargetLabel as formatBackTargetLabelShared,
  popDistinctNavSnapshot,
  pushUniqueNavSnapshot,
} from "../../../shared/navSnapshot";
import {
  communityInitials,
  parseHistoryUsedArray,
  parseMessageHistoryUsed,
  parseMemoryUsedArray,
  parseMessageMemoryAdded,
  parseMessageMemorySuggestions,
  parseMessageMemoryUsed,
  type HistoryUsedItem,
  type MemorySuggestion,
  type MemoryUsedItem,
} from "../../../shared/messageMetadataUi";
import { renderTextWithLinks } from "../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../shared/markdownUi";
import {
  readBannerFileAsWideDataUrlWithinLimit,
} from "../../../shared/imageTransforms";
import {
  clearAuthResumeState,
  readAuthResumeState,
  storeAuthResumeState,
} from "../../../shared/authResumeState";
import {
  hasOAuthCallbackParamsInLocation,
  readOAuthCallbackShellVariantFromLocation,
} from "../../../shared/cloudPkce";
import { routePendingAuthIntent } from "../../../shared/authResumeRouter";
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { resolveUserAccessPolicy } from "../../../shared/capabilities";
import { isStandaloneWebApp } from "../../../shared/browserRuntimeMode";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  LEGACY_APP_THEME_STORAGE_KEY,
  applyAppThemeAttributes,
  parseAppTheme,
  type AppTheme,
} from "../../../shared/theme";
import { useCommunityRailOrder } from "../../../shared/useCommunityRailOrder";
import { useRailPointerReorder } from "../../../shared/useRailPointerReorder";
import { useWebCommunityAccessController } from "../../../shared/useWebCommunityAccessController";
import { useWebDiscoverController } from "../../../shared/useWebDiscoverController";
import { useWebToastController } from "../../../shared/useWebToastController";
import { useWebSettingsImageUploadController } from "../../../shared/useWebSettingsImageUploadController";
import { useCommunityAdminController } from "../../../shared/useCommunityAdminController";
import { useCommunityDirectoryLifecycle } from "../../../shared/useCommunityDirectoryLifecycle";
import { useCommunityAgentConfigController } from "../../../shared/useCommunityAgentDraftController";
import { useCommunityFunnelController } from "../../../shared/useCommunityFunnelController";
import { useCommunitySettingsGovernanceController } from "../../../shared/useCommunitySettingsGovernanceController";
import { useCommunitySettingsDataController } from "../../../shared/useCommunitySettingsDataController";
import { useCommunitySettingsFormController } from "../../../shared/useCommunitySettingsFormController";
import { useCommunityMembersReviewController } from "../../../shared/useCommunityMembersReviewController";
import { useCommunityAdminAnalyticsLifecycle } from "../../../shared/useCommunityAdminAnalyticsLifecycle";
import { useCommunityMembersReviewLifecycle } from "../../../shared/useCommunityMembersReviewLifecycle";
import {
  parseReplyPrefix,
  truncateReplyPreview,
} from "../../../shared/communityMessageParsing";
import { isValidCommunitySlug, slugifyCommunityName } from "../../../shared/communitySlug";
import {
  formatCommunityVisibilityLabel,
  toCanonicalCommunityVisibility,
} from "../../../shared/communityVisibility";
import {
  loadAccountCommerceStatusCanonical,
  setDevAccountTierCanonical,
  type AccountCommerceStatus,
} from "../../../shared/accountCommerceStatusGateway";
import {
  acceptBuilderPartnerTermsCanonical,
  captureBuilderPartnerAttributionFromCurrentUrl,
  loadBuilderPartnerProgramCanonical,
  type BuilderPartnerProgramSnapshot,
} from "../../../shared/builderPartnerProgramGateway";
import type { WebBuilderPartnerProgramPanelProps } from "./components/WebBuilderPartnerProgramPanel";
import {
  startCloudPremiumSubscriptionCheckout,
} from "../../../shared/cloudAccountCommerceGateway";
import { loadOptionalOperatorAccessCanonical } from "../../../shared/cloudOperatorDashboardGateway";
import type { OperatorAccessSnapshot } from "../../../shared/operatorTypes";
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import {
  deriveCommunityFunnelAction,
  deriveCommunityMembersJoinReviewMode,
  type CommunityFunnelAction,
  type CommunityMembersJoinReviewMode,
} from "./communityJoinPolicy";
import { useWebAccountCommerceActions } from "./controllers/useWebAccountCommerceActions";
import { useWebCommerceClaimActions } from "./controllers/useWebCommerceClaimActions";
import { useWebPublicFunnelActions } from "./controllers/useWebPublicFunnelActions";
import { useWebCommunityChatPreloadLifecycle } from "./controllers/useWebCommunityChatPreloadLifecycle";
import { useWebDiscoverPreloadLifecycle } from "./controllers/useWebDiscoverPreloadLifecycle";
import { useWebBillingUiController } from "./controllers/useWebBillingUiController";
import { useWebMobileShellController } from "./controllers/useWebMobileShellController";
import { useWebCommunityPolynetController } from "./controllers/useWebCommunityPolynetController";
import { useWebPostAuthBillingLifecycle } from "./controllers/useWebPostAuthBillingLifecycle";
import { useWebPostAuthStripeConnectLifecycle } from "./controllers/useWebPostAuthStripeConnectLifecycle";
import { useWebPathRouteLifecycle } from "./controllers/useWebPathRouteLifecycle";
import { useWebCommunityRouteController } from "./controllers/useWebCommunityRouteController";
import { useWebJoinedCommunityRouteResolution } from "./controllers/useWebJoinedCommunityRouteResolution";
import { useWebSelectedCommunityController } from "./controllers/useWebSelectedCommunityController";
import { useWebPublicCommunityRouteController } from "./controllers/useWebPublicCommunityRouteController";
import { useWebUiPersistenceLifecycle } from "./controllers/useWebUiPersistenceLifecycle";
import { buildWebShellProjection } from "./controllers/buildWebShellProjection";
import { buildWebCommunitySurfaceProjection } from "./controllers/buildWebCommunitySurfaceProjection";
import { useWebVoiceInputController } from "../../../shared/useWebVoiceInputController";
import { useCommunityAgentConfigLifecycle } from "../../../shared/useCommunityAgentConfigLifecycle";
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import { confirmDiscardUnsavedCommunitySettingsWeb } from "../../../shared/communityUnsavedGuard";
import type { WebSettingsPanelsProps } from "./components/WebSettingsPanels";
import { WebGlobalOverlayHost } from "./components/WebGlobalOverlayHost";
import { WebShellChromeHost } from "./components/WebShellChromeHost";
import { WebDirectMessagesHost } from "./components/WebDirectMessagesHost";
import { useDirectMessageWebNotifications } from "./controllers/useDirectMessageWebNotifications";
import { useWebDirectMessagesController } from "./controllers/useWebDirectMessagesController";
import { mergeUserProfileEntry } from "../../../shared/userProfileMerge";
import type { MobileOverlay, MobileRootPage } from "./components/webShellChromeShared";
import { buildWebStandalonePublicRouteViewProps } from "./controllers/buildWebStandalonePublicRouteViewProps";
import { buildWebGlobalOverlayHostProps } from "./controllers/buildWebGlobalOverlayHostProps";
import { buildWebAppMainSurfaceHostProps } from "./controllers/buildWebAppMainSurfaceHostProps";
import { buildWebShellChromeHostProps } from "./controllers/buildWebShellChromeHostProps";
import type { MemberAgentSurfaceContextV1 } from "../../../shared/memberAgentSurfaceContext";
import { WebCommunityOnboardingController } from "./components/WebCommunityOnboardingController";
import type { WebMemberAgentDockHandle } from "./components/WebMemberAgentDock";
import type {
  WebAccountGraphHydrationPhase,
  WebCommunityRecord,
  WebCommunityVoiceButtonOwner,
  WebCommunityVoiceTranscriptTarget,
  WebMyCommunityJoinRequest,
  WebNavSnapshot,
  WebPersonalMemoryItem,
  WebPublicCommunityRecord,
} from "./webAppContracts";
import {
  buildCurrentTelemetryPathname,
  buildPremiumSubscriptionReturnUrl,
  buildSourceIntegrationOAuthFinalizeSessionGuardKey,
  CHATGPT_SECURITY_SETTINGS_URL,
  claimSourceIntegrationOAuthFinalizeSessionGuard,
  clearSourceIntegrationOAuthFinalizeSessionGuard,
  COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX,
  isTransportRefreshError,
  readFirstLocalStorageValue,
  scrubCurrentRouteSearchParams,
  WEB_IMAGE_DATA_URL_CHAR_LIMIT,
} from "./webAppRuntime";

const WebAppMainSurfaceHost = lazy(() =>
  import("./components/WebAppMainSurfaceHost").then((module) => ({
    default: module.WebAppMainSurfaceHost,
  })),
);

const WebMemberAgentDock = lazy(() =>
  import("./components/WebMemberAgentDock").then((module) => ({
    default: module.WebMemberAgentDock,
  })),
);

const WebStandalonePublicRouteShell = lazy(() =>
  import("./components/WebStandalonePublicRouteShell").then((module) => ({
    default: module.WebStandalonePublicRouteShell,
  })),
);

type CommunityRecord = WebCommunityRecord;
type PublicCommunityRecord = WebPublicCommunityRecord;
type MessageAttachment = WebCommunityMessageAttachment;
type CommunityVoiceTranscriptTarget = WebCommunityVoiceTranscriptTarget;
type CommunityVoiceButtonOwner = WebCommunityVoiceButtonOwner;
type CommunityAgentConfig = SharedCommunityAgentConfig<CommunityAgentLanding>;
type CommunityFunnelConfig = SharedCommunityFunnelConfig;
type CommunityAccess = SharedCommunityAccess;
type UserProfile = SharedUserProfile;
type UserProfileDetail = SharedUserProfileDetail;
type CommunityJoinRequest = WebCommunityJoinRequest;
type MyCommunityJoinRequest = WebMyCommunityJoinRequest;
type PersonalMemoryItem = WebPersonalMemoryItem;
type PublicPlanSummary = SharedPublicPlanSummary;
type DiscoverCommunity = SharedDiscoverCommunitySnapshot;
type CommunityAiFeedPost = SharedCommunityAiFeedPost;
type CommunityAiFeedReactionType = SharedCommunityAiFeedReactionType;
type NavSnapshot = WebNavSnapshot;
type AccountGraphHydrationPhase = WebAccountGraphHydrationPhase;

export default function App() {
  const initialShellVariant: AppShellVariant =
    typeof window === "undefined"
      ? "standard"
      : readOAuthCallbackShellVariantFromLocation() ??
        readShellVariantFromPathname(window.location.pathname || "/");
  const initialPublicRoute = readPublicRouteFromLocation();
  const initialAppRoute = initialPublicRoute.kind === "app" ? readAppRouteFromLocation() : null;
  const lastIdentifiedBusinessVisitorSubjectRef = useRef<string | null>(null);
  const [accountGraphHydrationPhase, setAccountGraphHydrationPhase] =
    useState<AccountGraphHydrationPhase>("idle");
  const directMessages = useWebDirectMessagesController();
  const {
    isOpen: isDirectMessagesOpen,
    openRequest: directMessageOpenRequest,
    openConversationRequest: directMessageOpenConversationRequest,
    unreadCount: directMessagesUnreadCount,
    setUnreadCount: setDirectMessagesUnreadCount,
    openConversationById: handleOpenDirectConversationById,
    toggle: handleToggleDirectMessages,
    open: handleOpenDirectMessages,
    close: handleCloseDirectMessages,
    openFromCommunity: handleOpenDirectMessageFromCommunity,
  } = directMessages;
  const accountGraphHydrationRunIdRef = useRef(0);

  async function runCommunitiesHydration(session: AuthSession, phase: string): Promise<void> {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "communities_load",
      status: "start",
      detail: { phase },
    });
    try {
      await loadCommunities(session);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "communities_load",
        status: "success",
        detail: { phase },
      });
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "communities_load",
        status: "failure",
        detail: { phase },
        error: formatWorkspaceInstrumentationError(error),
      });
      throw error;
    }
  }

  async function runBillingHydration(session: AuthSession, phase: string): Promise<void> {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "billing_status_load",
      status: "start",
      detail: { phase },
    });
    try {
      await loadAccountCommerceStatus(session);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "billing_status_load",
        status: "success",
        detail: { phase },
      });
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "billing_status_load",
        status: "failure",
        detail: { phase },
        error: formatWorkspaceInstrumentationError(error),
      });
      throw error;
    }
  }

  async function runSelfProfileHydration(session: AuthSession, phase: string): Promise<void> {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "self_profile_load",
      status: "start",
      detail: { phase },
    });
    try {
      await loadSelfProfile(session);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "self_profile_load",
        status: "success",
        detail: { phase },
      });
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "self_profile_load",
        status: "failure",
        detail: { phase },
        error: formatWorkspaceInstrumentationError(error),
      });
      throw error;
    }
  }

  const resetWebSessionStateRef = useRef<() => Promise<void>>(async () => {
    await beginBrowserSignedOutState();
  });
  const {
    session,
    setAuthError,
    sessionRef,
    isAuthBootstrapComplete,
    authPresentationState,
    authError,
    requireSignIn,
    handleSignOut,
    ensureUsableAuthSession,
    fetchWithAuth,
    fetchWithPublic,
    sessionArg,
    authenticatedSessionArg,
  } = useWebAppAuthController({
    onSessionLost: async () => {
      accountGraphHydrationRunIdRef.current += 1;
      setAccountGraphHydrationPhase("idle");
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "start",
        detail: {
          reason: "session_lost",
        },
      });
      await resetWebSessionStateRef.current();
      setCloudProfile(null);
      setAccountSetupStatus(null);
      setIsLoadingAccountSetupStatus(false);
      setHasLoadedOnboardingProfile(false);
      setIsOnboardingModalOpen(false);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "success",
        detail: {
          reason: "session_lost",
        },
      });
    },
    onSessionMissingAfterBootstrap: async () => {
      accountGraphHydrationRunIdRef.current += 1;
      setAccountGraphHydrationPhase("idle");
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "start",
        detail: {
          reason: "session_missing_after_bootstrap",
        },
      });
      await resetWebSessionStateRef.current();
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      setPendingPurchaseClaims([]);
      setPendingPurchasesError(null);
      setPendingPurchasesSuccess(null);
      setCloudProfile(null);
      setAccountSetupStatus(null);
      setIsLoadingAccountSetupStatus(false);
      setHasLoadedOnboardingProfile(false);
      setIsOnboardingModalOpen(false);
      profileUi.setProfileSaveError(null);
      profileUi.setProfileSaveSuccess(false);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "success",
        detail: {
          reason: "session_missing_after_bootstrap",
        },
      });
    },
    onSessionReady: async (session) => {
      const hydrationRunId = ++accountGraphHydrationRunIdRef.current;
      const userId = String(session.user?.id ?? "").trim() || null;
      const shouldTreatCommunitiesAsCritical =
        activePage === "community" || Boolean(String(selectedActiveCommunitySlug ?? "").trim());
      const criticalStartedAt = Date.now();
      setAccountGraphHydrationPhase("critical");
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_hydrate",
        status: "start",
        detail: {
          phase: "session_ready",
          userId,
        },
      });
      const criticalTasks: Array<Promise<void>> = [];
      if (shouldTreatCommunitiesAsCritical) {
        criticalTasks.push(runCommunitiesHydration(session, "session_ready_critical"));
      }
      const criticalResults = await Promise.allSettled(criticalTasks);
      const criticalFailureCount = criticalResults.filter((result) => result.status === "rejected").length;
      if (accountGraphHydrationRunIdRef.current === hydrationRunId) {
        setAccountGraphHydrationPhase("secondary");
      }
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_hydrate",
        status: criticalFailureCount > 0 ? "failure" : "success",
        detail: {
          phase: "session_ready",
          stage: "critical_ready",
          userId,
          failureCount: criticalFailureCount,
          durationMs: Date.now() - criticalStartedAt,
        },
        error:
          criticalFailureCount > 0
            ? formatWorkspaceInstrumentationError(
                criticalResults
                  .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                  .map((result) => result.reason)[0],
              )
            : undefined,
      });
      const secondaryTasks: Array<Promise<void>> = [
        runBillingHydration(session, "session_ready_secondary"),
        runSelfProfileHydration(session, "session_ready_secondary"),
      ];
      if (!shouldTreatCommunitiesAsCritical) {
        secondaryTasks.unshift(runCommunitiesHydration(session, "session_ready_secondary"));
      }
      const secondaryStartedAt = Date.now();
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_secondary_hydrate",
        status: "start",
        detail: {
          phase: "session_ready",
          userId,
        },
      });
      void Promise.allSettled(secondaryTasks).then((results) => {
        const failureCount = results.filter((result) => result.status === "rejected").length;
        if (accountGraphHydrationRunIdRef.current === hydrationRunId) {
          setAccountGraphHydrationPhase("ready");
        }
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "account_graph_secondary_hydrate",
          status: failureCount > 0 ? "failure" : "success",
            detail: {
              phase: "session_ready",
              userId,
              failureCount,
              durationMs: Date.now() - secondaryStartedAt,
            },
          error:
            failureCount > 0
              ? formatWorkspaceInstrumentationError(
                  results
                    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                    .map((result) => result.reason)[0],
                )
              : undefined,
        });
      });
    },
    onSessionFocusReady: async (session) => {
      const userId = String(session.user?.id ?? "").trim() || null;
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_refresh",
        status: "start",
        detail: {
          phase: "session_focus_ready",
          userId,
        },
      });
      const focusSecondaryStartedAt = Date.now();
      void Promise.allSettled([
        runBillingHydration(session, "session_focus_ready_secondary"),
        runCommunitiesHydration(session, "session_focus_ready_secondary"),
      ]).then((results) => {
        const failureCount = results.filter((result) => result.status === "rejected").length;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "account_graph_refresh",
          status: failureCount > 0 ? "failure" : "success",
            detail: {
              phase: "session_focus_ready",
              userId,
              failureCount,
              durationMs: Date.now() - focusSecondaryStartedAt,
            },
          error:
            failureCount > 0
              ? formatWorkspaceInstrumentationError(
                  results
                    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                    .map((result) => result.reason)[0],
                )
              : undefined,
        });
      });
    },
    onDidJustSignIn: () => {
      resumePendingAuthIntent();
    },
    onAfterSignOut: () => {
      if (window.location.pathname === "/") return;
      window.location.assign("/");
    },
  });
  const canonicalSessionUserId = useMemo(
    () => resolveAuthSubject(session),
    [session?.access_token, session?.id_token, session?.user?.id],
  );

  useEffect(() => {
    const subject = String(canonicalSessionUserId ?? "").trim();
    if (!session || !subject) {
      lastIdentifiedBusinessVisitorSubjectRef.current = null;
      return;
    }
    if (lastIdentifiedBusinessVisitorSubjectRef.current === subject) return;
    lastIdentifiedBusinessVisitorSubjectRef.current = subject;
    void identifyCloudBusinessVisitor({ session }).catch((error) => {
      if (lastIdentifiedBusinessVisitorSubjectRef.current === subject) {
        lastIdentifiedBusinessVisitorSubjectRef.current = null;
      }
      console.warn("Failed to identify business visitor:", error);
    });
  }, [canonicalSessionUserId, session]);

  const [operatorAccessState, setOperatorAccessState] = useState<{
    subject: string;
    access: OperatorAccessSnapshot | null;
  } | null>(null);
  const isOperatorAccessResolved =
    Boolean(canonicalSessionUserId) && operatorAccessState?.subject === canonicalSessionUserId;
  const operatorAccess = isOperatorAccessResolved ? operatorAccessState?.access ?? null : null;

  useEffect(() => {
    let isAlive = true;
    const operatorSubject = String(canonicalSessionUserId ?? "").trim();

    if (!session || !operatorSubject) {
      setOperatorAccessState(null);
      return;
    }

    loadOptionalOperatorAccessCanonical({ session }).then(
      (access) => {
        if (!isAlive) return;
        if (!access) {
          setOperatorAccessState({ subject: operatorSubject, access: null });
          return;
        }
        setOperatorAccessState({ subject: operatorSubject, access });
      },
      (error) => {
        if (!isAlive) return;
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("operator_access_forbidden") ||
          message.includes("operator_access_identity_mismatch")
        ) {
          setOperatorAccessState({ subject: operatorSubject, access: null });
          return;
        }
        console.warn("Failed to resolve operator access:", error);
        setOperatorAccessState({ subject: operatorSubject, access: null });
      },
    );

    return () => {
      isAlive = false;
    };
  }, [canonicalSessionUserId, session]);
  const hasOperatorAccess = Boolean(session && operatorAccess);
  const profileStorageUserId = canonicalSessionUserId;
  const initialProfileDraft = useMemo(
    () => readProfileDraftForUser(profileStorageUserId),
    [profileStorageUserId],
  );

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => initialPublicRoute);
  const [shellVariant, setShellVariant] = useState<AppShellVariant>(() => initialShellVariant);
  const [mobileOverlay, setMobileOverlay] = useState<MobileOverlay>(null);
  const [mobileRootPage, setMobileRootPage] = useState<MobileRootPage>("community");
  const [communityOnboardingFirstPostFocusRequest, setCommunityOnboardingFirstPostFocusRequest] =
    useState(0);
  const [mobileSettingsView, setMobileSettingsView] = useState<"index" | "detail">("detail");
  const [mobileChromeReadingMode, setMobileChromeReadingMode] = useState(false);

  const [activePage, setActivePage] = useState<AppPage>(() => initialAppRoute?.page ?? "landing");
  const [activeView, setActiveView] = useState<AppView>(() => initialAppRoute?.view ?? "home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => initialAppRoute?.settingsPage ?? "account");
  const [selectedProductDocSlug, setSelectedProductDocSlug] = useState<string | null>(
    () => initialAppRoute?.docsSlug ?? null,
  );
  const [activeOperatorTab, setActiveOperatorTab] = useState<OperatorTab>(
    () => initialAppRoute?.operatorTab ?? "platform",
  );
  const settingsGroup = settingsGroupForPage(settingsPage);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    try {
      const stored = parseAppTheme(
        readFirstLocalStorageValue([APP_THEME_STORAGE_KEY, LEGACY_APP_THEME_STORAGE_KEY]),
      );
      if (stored) return stored;
      return DEFAULT_APP_THEME;
    } catch {
      return DEFAULT_APP_THEME;
    }
  });
  useEffect(() => {
    applyAppThemeAttributes(appTheme, document.documentElement);
    try {
      localStorage.setItem(APP_THEME_STORAGE_KEY, appTheme);
      localStorage.removeItem(LEGACY_APP_THEME_STORAGE_KEY);
    } catch {
      // Theme persistence is a preference only; the active document theme is already applied.
    }
  }, [appTheme]);
  const [cloudProfile, setCloudProfile] = useState<UserProfileDetail | null>(null);
  const [accountSetupStatus, setAccountSetupStatus] = useState<AccountSetupStatus | null>(null);
  const [isLoadingAccountSetupStatus, setIsLoadingAccountSetupStatus] = useState(false);
  const effectiveAccountSetupStatus = accountSetupStatus ?? cloudProfile?.account_setup ?? null;
  const isProfileSetupCompleteForPublicActions =
    !session ||
    Boolean(
      effectiveAccountSetupStatus &&
      isAccountSetupStatusIdentityComplete(effectiveAccountSetupStatus),
    );
  const isAccountSetupCompleteForBuilderActions =
    !session || Boolean(effectiveAccountSetupStatus?.completed);
  const [hasLoadedOnboardingProfile, setHasLoadedOnboardingProfile] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const profileUi = useWebProfileSettingsUiController({
    profileStorageUserId,
    initialProfileDraft,
    session: session,
    cloudProfile,
  });
  const [isSavingOnboarding, setIsSavingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const openProfileSetup = useCallback(() => {
    setOnboardingError(null);
    setIsOnboardingModalOpen(true);
  }, []);
  const closeProfileSetup = useCallback(() => {
    setIsOnboardingModalOpen(false);
  }, []);
  /* The bridge (gate card's second state) opens on an entry ATTEMPT — the
     pitch always converts first. Platform-generic joiners never come here:
     they onboard on the standalone /onboarding page. */
  const [isBridgeGateOpen, setIsBridgeGateOpen] = useState(false);
  const [bridgePendingEntry, setBridgePendingEntry] = useState<{
    communityId: string;
    communitySlug: string | null;
    communityName?: string | null;
  } | null>(null);
  const refreshAccountSetupStatus = useCallback(async (activeSession: AuthSession | null = sessionRef.current ?? session) => {
    if (!activeSession) {
      setAccountSetupStatus(null);
      return null;
    }
    const usableSession = await ensureUsableAuthSession(activeSession);
    if (!usableSession) return null;
    setIsLoadingAccountSetupStatus(true);
    try {
      const status = await loadCloudAccountSetupStatus<AuthSession>({ session: usableSession });
      setAccountSetupStatus(status);
      return status;
    } catch {
      return null;
    } finally {
      setIsLoadingAccountSetupStatus(false);
    }
  }, [ensureUsableAuthSession, session, sessionRef]);

  const publicCommunityUi = useWebPublicCommunityUiController<
    PublicCommunityRecord,
    PublicPlanSummary,
    CommunityAccess,
    MyCommunityJoinRequest
  >();
  const billingUi = useWebBillingUiController<
    AccountCommerceStatus,
    PendingPurchaseClaim
  >();
  const {
    pendingPurchaseClaims,
    setPendingPurchaseClaims,
    isLoadingPendingPurchases,
    setIsLoadingPendingPurchases,
    pendingPurchasesError,
    setPendingPurchasesError,
    isRedeemingPendingPurchases,
    setIsRedeemingPendingPurchases,
    pendingPurchasesSuccess,
    setPendingPurchasesSuccess,
    accountCommerceStatus,
    setAccountCommerceStatus,
    isLoadingAccountCommerce,
    setIsLoadingAccountCommerce,
    accountCommerceError,
    setAccountCommerceError,
    isSettingDevAccountTier,
    setIsSettingDevAccountTier,
    devAccountTierError,
    setDevAccountTierError,
    isStartingStripeConnectOnboarding,
    setIsStartingStripeConnectOnboarding,
    checkoutStatus,
    setCheckoutStatus,
    checkoutError,
    setCheckoutError,
    checkoutClaimToken,
    setCheckoutClaimToken,
    isRedeemingClaim,
    setIsRedeemingClaim,
    redeemClaimError,
    setRedeemClaimError,
    manualClaimToken,
    setManualClaimToken,
    redeemPendingPurchasesInFlightRef,
  } = billingUi;

  const [, setIsPendingPurchasesBannerDismissed] = useState(false);
  const [builderPartnerProgram, setBuilderPartnerProgram] =
    useState<BuilderPartnerProgramSnapshot | null>(null);
  const [isLoadingBuilderPartnerProgram, setIsLoadingBuilderPartnerProgram] =
    useState(false);
  const [builderPartnerProgramError, setBuilderPartnerProgramError] =
    useState<string | null>(null);
  const [isAcceptingBuilderPartnerTerms, setIsAcceptingBuilderPartnerTerms] =
    useState(false);
  const builderPartnerProgramLoadRequestIdRef = useRef(0);
  const lastTrackedAuthSessionUserIdRef = useRef<string | null>(null);
  const [isFreeAccountInfoOpen, setIsFreeAccountInfoOpen] = useState(false);
  const [stripeConnectReturn, setStripeConnectReturn] = useState<StripeConnectReturn | null>(null);
  const lastAutoRedeemPendingPurchasesUserIdRef = useRef<string | null>(null);
  const autoRedeemPendingPurchasesAttemptRef = useRef(0);
  const autoRedeemPendingPurchasesTimeoutRef = useRef<number | null>(null);

  const personalAccountSettings =
    useWebPersonalAccountSettingsController<AuthSession>({
      session,
      isAccountSettingsActive:
        activeView === "settings" && settingsGroup === "agent",
      getSession: () => sessionRef.current,
      ensureSession: ensureUsableAuthSession,
      requireSignIn,
      onUserMemorySettingsSaved: refreshAccountSetupStatus,
    });
  const [isLoadingCommunities, setIsLoadingCommunities] = useState<boolean>(() => Boolean(session));
  const [hasResolvedCommunities, setHasResolvedCommunities] = useState(false);
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [communityRoleById, setCommunityRoleById] = useState<Record<string, string>>({});
  const defaultMemberEntryResolutionRef =
    useRef<{
      authSubject: string;
      promise: Promise<CloudMemberEntryDestination | null>;
    } | null>(null);
  const communityRailOrderStorageKey = useMemo(
    () => `${COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX}:${session?.user?.id ?? "local"}`,
    [session?.user?.id],
  );
  const { orderedCommunities: railCommunities, moveCommunityToIndex: handleReorderCommunityRail } =
    useCommunityRailOrder<CommunityRecord>({
      communities,
      storageKey: communityRailOrderStorageKey,
    });
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfile>>({});
  const [communityTab, setCommunityTab] = useState<CommunityTab>(() => initialAppRoute?.communityTab ?? "chat");
  const [communityExperienceMode, setCommunityExperienceMode] = useState<CommunityExperienceMode>(() =>
    initialAppRoute?.page === "community"
      ? initialAppRoute.communityExperienceMode ?? "standard"
      : "standard",
  );
  const [communityResourceModuleId, setCommunityResourceModuleId] = useState<string | null>(() =>
    initialAppRoute?.page === "community" && initialAppRoute.communityTab === "resources"
      ? initialAppRoute.communityResourceModuleId ?? null
      : null,
  );
  const [communitySettingsPane, setCommunitySettingsPane] = useState<CommunitySettingsPane>(() =>
    initialAppRoute?.page === "community" && initialAppRoute.communityTab === "settings"
      ? initialAppRoute.communitySettingsPane ?? "community"
      : "community",
  );
  const {
    activeCommunity,
    activeCommunityId,
    activeCommunitySlug,
    selectedActiveCommunityId,
    selectedActiveCommunitySlug,
    setActiveCommunityId,
    resolveKnownCommunityIdBySlug,
    resolveKnownCommunitySlugById,
    applyCommunityShellState,
  } = useWebSelectedCommunityController<CommunityRecord>({
    initialCommunitySlug: initialAppRoute?.communitySlug ?? null,
    communities,
    setCommunityTab,
  });

  const communityInteractionProjection = useWebCommunityInteractionProjection<MessageAttachment>({
    activeCommunityId,
    canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    isCommunityChatActive: activePage === "community" && communityTab === "chat",
    session,
    shellVariant,
  });
  const {
    roots: communityInteractionRoots,
    repliesByRootId: communityInteractionRepliesByRootId,
    visibleRoots: visibleCommunityInteractionRoots,
    selectedReplies: selectedCommunityInteractionReplies,
    selectedRootId: selectedCommunityInteractionRootId,
    isLoadingRoots: isLoadingCommunityInteractions,
    isLoadingSelectedReplies: isLoadingCommunityInteractionReplies,
    error: communityInteractionError,
    selectedRepliesError: communityInteractionRepliesError,
    rootChangeReason: communityInteractionRootChangeReason,
    canLoadOlderRoots: canLoadOlderCommunityInteractionRoots,
    isLoadingOlderRoots: isLoadingOlderCommunityInteractionRoots,
    serveIssue: communityAgentServeIssue,
    loadRoots: loadCommunityInteractionRoots,
    loadReplies: loadCommunityInteractionReplies,
    loadOlderRoots: loadOlderCommunityInteractionRoots,
    selectRoot: handleSelectCommunityInteractionRoot,
    closeDrawer: handleCloseCommunityInteractionDrawer,
    toggleReaction: handleToggleCommunityInteractionReaction,
    editMessage: handleEditCommunityInteractionMessage,
    deleteMessage: handleDeleteCommunityInteractionMessage,
    retryPending: handleRetryPendingCanonicalInteraction,
    discardPending: handleDiscardPendingCanonicalInteraction,
    dismissServeIssue: handleDismissCommunityAgentServeIssue,
  } = communityInteractionProjection;

  const memberAgentComposerApiRef = useRef<WebMemberAgentDockHandle | null>(null);
  const communityVoiceTranscriptTargetRef = useRef<CommunityVoiceTranscriptTarget | null>(null);
  const [communityVoiceButtonOwner, setCommunityVoiceButtonOwner] =
    useState<CommunityVoiceButtonOwner | null>(null);
  const canMentionEverybodyRef = useRef(false);
  const communityChat = useWebCommunityChatController({
    activeCommunityId,
    canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    hasActiveCommunity: Boolean(activeCommunity),
    interaction: communityInteractionProjection,
    isCommunityChatActive: activePage === "community" && communityTab === "chat",
    isCommunityPageActive: activePage === "community",
    isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
    loadProfiles: (userIds, activeSession) => loadUserProfiles(userIds, activeSession),
    onMessageSent: ({ communityId, hasAttachments, hasReply }) => {
      captureProductAnalyticsEvent("community message sent", {
        community_id: communityId,
        has_attachments: hasAttachments,
        has_reply: hasReply,
        surface: "community_chat",
      });
    },
    onOpenProfileSetup: openProfileSetup,
    session,
    canMentionEverybodyRef,
  });
  const {
    messages: communityMessages,
    activityEvents: communityActivityEvents,
    messageById: communityMessageById,
    messageInput: communityMessageInput,
    setMessageInput: setCommunityMessageInput,
    messageMentions: communityMessageMentions,
    setMessageMentions: setCommunityMessageMentions,
    attachments: communityAttachments,
    error: communityChatError,
    setError: setCommunityChatError,
    copiedMessageId: copiedCommunityMessageId,
    unreadCount,
    setUnreadCount,
    isUserAtBottom,
    setIsUserAtBottom,
    isUserAtBottomRef,
    isSendingMessage: isSendingCommunityMessage,
    replyingToMessage,
    setReplyingToMessage,
    reactions: messageReactions,
    reactionPickerMessageId,
    setReactionPickerMessageId,
    editingMessageId,
    editingMessageText,
    setEditingMessageText,
    editingMessagePrefix,
    isLoadingChat,
    isLoadingMoreChat,
    communityChatHasMore,
    hasResolvedCommunityChat,
    ensureCommunityChatThread,
    loadCommunityChat,
    resetChatState: resetCommunityChatState,
    messageListRef: communityChatListRef,
    inputRef: chatInputRef,
    fileInputRef: communityFileInputRef,
    handleChatScroll,
    handleAttachmentFileInputChange: handleCommunityFileInputChange,
    ingestAttachmentsFromFileList: ingestCommunityAttachmentsFromFileList,
    handleAttachmentDrop: handleCommunityAttachmentDrop,
    handleAttachmentDragEnter: handleCommunityAttachmentDragEnter,
    handleAttachmentDragOver: handleCommunityAttachmentDragOver,
    handleAttachmentDragLeave: handleCommunityAttachmentDragLeave,
    handleAttachmentPaste: handleCommunityAttachmentPaste,
    isAttachmentDragOver: isCommunityAttachmentDragOver,
    removeAttachment: removeCommunityAttachment,
    openCommunityChatLightbox,
    lightbox: {
      isOpen: isCommunityChatLightboxOpen,
      images: communityChatLightboxImages,
      index: communityChatLightboxIndex,
      setIndex: setCommunityChatLightboxIndex,
      onClose: closeCommunityChatLightbox,
    },
    handleToggleReaction,
    handleStartReply,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleSendCommunityMessage,
    copyMessage: handleCopyCommunityMessage,
    scrollToMessage: scrollToCommunityMessage,
    scrollToBottom: scrollCommunityChatToBottom,
    markChatSelected: markCommunityChatSelected,
    setMessageInputFromTextarea: setCommunityMessageInputFromTextarea,
  } = communityChat;
  const communityContent = useWebCommunityContentController({
    activeCommunityId,
    activePage,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    getSession: () => sessionRef.current ?? session,
    session,
  });
  const {
    resources: communityResources,
    modules: communityResourceModules,
    isLoadingResources,
    isLoadingModules: isLoadingResourceModules,
    openResourceEmbedId,
    setOpenResourceEmbedId,
    events: communityEvents,
    hasLoadedVisibleEventsRange: hasLoadedActiveCommunityEventsRange,
    isLoadingEvents: isLoadingCommunityEvents,
    eventsError: communityEventsError,
    eventsVisibleMonthIso: communityEventsVisibleMonthIso,
    setEventsVisibleMonthIso: setCommunityEventsVisibleMonthIso,
    eventsVisibleRange: communityEventsVisibleRange,
    eventsCacheKey: communityEventsCacheKey,
    resetContentState: resetCommunityContentState,
    loadCommunityResourceModules,
    loadCommunityResources,
    openNewModuleModal,
    handleEditModule,
    handleSetModuleStatus,
    handleDeleteModule,
    handleReorderModules,
    handleReorderResources,
    handleMoveResourceToModule,
    openNewResourceModal,
    openNewSourceModal,
    resourceEditor,
    handleDeleteResource,
    handleCreatePageDraftFromSource,
    handleCreateBlankPageDraft,
    resourceModalProps,
    resourceModuleModalProps,
    resourceModuleDeleteModalProps,
    loadCommunityEvents,
    handleSaveCommunityEvent,
    handleCancelCommunityEvent,
  } = communityContent;
  const communityAdministration = useWebCommunityAdministrationState({
    activeCommunityId,
    ensureSession: ensureUsableAuthSession,
    session,
  });
  const {
    communityJoinRequests,
    setCommunityJoinRequests,
    isLoadingCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    communityJoinRequestsError,
    setCommunityJoinRequestsError,
    decidingCommunityJoinRequestId,
    setDecidingCommunityJoinRequestId,
  } = communityAdministration.joinRequests;
  const {
    isSetting: isSettingCommunityFreeAccessMode,
    setIsSetting: setIsSettingCommunityFreeAccessMode,
    error: communityFreeAccessModeError,
    setError: setCommunityFreeAccessModeError,
  } = communityAdministration.freeAccess;
  const {
    communityDirectoryMembers,
    communityDirectoryMemberCount,
    isLoadingCommunityDirectoryMembers,
    isLoadingMoreCommunityDirectoryMembers,
    communityDirectoryMembersHasMore,
    communityDirectoryMembersLoadError,
    loadCommunityDirectoryMembers,
    loadMoreCommunityDirectoryMembers,
  } = communityAdministration.directory;
  const {
    activeCommunityAccess,
    isLoadingCommunityAccess,
    communityAccessCapabilities,
    communityNavVisibility,
    communityActionGuards,
    isActiveCommunityOwner,
    isActiveCommunityAdmin,
    communitySettingsLayer,
    canManageCommunitySettings,
    canViewActiveCommunityPolynet,
    canViewMemberPlanDetailsActiveCommunity,
    canViewMembersActiveCommunity,
    canViewActiveCommunitySettings,
    canPostMessagesActiveCommunity,
    canManageResourcesActiveCommunity,
    canModerateContentActiveCommunity,
    canManageMembersActiveCommunity,
    canReviewJoinRequestsActiveCommunity,
    canViewActiveCommunityAnalytics,
    communitySocialSummary,
    funnelPreviewAdminCount,
    funnelPreviewOnlineCount,
    funnelPreviewOnlineFaces,
    activeCommunityOnlineUserIds,
    activeCommunityPresenceSummary,
    reloadActiveCommunityAccess,
  } = communityAdministration.access;
  canMentionEverybodyRef.current = canManageMembersActiveCommunity;

  useEffect(() => {
    if (activePage !== "community") return;
    if (!activeCommunityId) return;
    if (isLoadingCommunityAccess) return;
    if (activeCommunityAccess?.community_id !== activeCommunityId) return;
    const normalizedTab = normalizeCommunityTabForAccess(communityTab, {
      canViewSettings: canViewActiveCommunitySettings,
      canViewPolynet: canViewActiveCommunityPolynet,
      canManageMembers: canManageMembersActiveCommunity,
      canViewAnalytics: canViewActiveCommunityAnalytics,
    });
    if (normalizedTab === communityTab) return;
    setCommunityResourceModuleId(null);
    applyCommunityShellState({ communityTab: normalizedTab });
  }, [
    activeCommunityAccess,
    activeCommunityId,
    activePage,
    applyCommunityShellState,
    canManageMembersActiveCommunity,
    canViewActiveCommunityAnalytics,
    canViewActiveCommunityPolynet,
    canViewActiveCommunitySettings,
    communityTab,
    isLoadingCommunityAccess,
  ]);

  const {
    summary: communityAnalyticsSummary,
    setSummary: setCommunityAnalyticsSummary,
    series: communityAnalyticsSeries,
    setSeries: setCommunityAnalyticsSeries,
    range: communityAnalyticsRange,
    setRange: setCommunityAnalyticsRange,
    isLoading: isLoadingCommunityAnalytics,
    setIsLoading: setIsLoadingCommunityAnalytics,
    error: communityAnalyticsError,
    setError: setCommunityAnalyticsError,
  } = communityAdministration.analytics;

  const communitySettingsUi = communityAdministration.settingsUi;
  const {
    communitySettingsName,
    setCommunitySettingsName,
    communitySettingsSlug,
    setCommunitySettingsSlug,
    communitySettingsOneLiner,
    setCommunitySettingsOneLiner,
    communitySettingsAbout,
    setCommunitySettingsAbout,
    communitySettingsVisibility,
    setCommunitySettingsVisibility,
    communitySettingsAvatarUrl,
    setCommunitySettingsAvatarUrl,
    communitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    setCommunitySettingsAvatarFocusY,
    communitySettingsAvatarZoom,
    setCommunitySettingsAvatarZoom,
    communitySettingsBannerUrl,
    setCommunitySettingsBannerUrl,
    communitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    setCommunitySettingsBannerFocusY,
    communitySettingsBannerZoom,
    setCommunitySettingsBannerZoom,
    communitySettingsPricingMode,
    setCommunitySettingsPricingMode,
    communitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdAnnual,
    setCommunitySettingsPriceUsdAnnual,
    communitySettingsError,
    setCommunitySettingsError,
    communitySettingsBannerUploadError,
    setCommunitySettingsBannerUploadError,
    isProcessingCommunitySettingsBanner,
    setIsProcessingCommunitySettingsBanner,
    isCommunityAvatarFocusModalOpen,
    setIsCommunityAvatarFocusModalOpen,
    isCommunityBannerFocusModalOpen,
    setIsCommunityBannerFocusModalOpen,
    isSavingCommunitySettings,
    setIsSavingCommunitySettings,
    isSettingsBannerDragOver,
    setIsSettingsBannerDragOver,
    isSettingsAvatarDragOver,
    setIsSettingsAvatarDragOver,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityPricingDirtyRef,
    markCommunitySettingsDirty,
  } = communitySettingsUi;
  const communityAgentConfigUi = communityAdministration.agentConfigUi;
  const {
    isLoadingCommunityAgentConfig,
    setIsLoadingCommunityAgentConfig,
    communityAgentConfigError,
    setCommunityAgentConfigError,
    communityAgentConfigLoadedCommunityIdRef,
    communityAgentConfigLanding,
    setCommunityAgentConfigLanding,
    communityAgentConfigCommunitySystemPrompt,
    setCommunityAgentConfigCommunitySystemPrompt,
    isSavingCommunityAgentConfig,
    setIsSavingCommunityAgentConfig,
    communityAgentConfigSaveError,
    setCommunityAgentConfigSaveError,
    communityAgentConfigDirtyRef,
    markCommunityAgentConfigDirty,
    hydrateCommunityAgentEditor,
    handleResetCommunityAgentConfig,
  } = communityAgentConfigUi;
  const skillsModel = useWebSkillsModel({
    activeCommunityId,
    activePage,
    canManageMembers: canManageMembersActiveCommunity,
    canManageResources: canManageResourcesActiveCommunity,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    session,
    settingsPage,
  });
  const {
    isLoadingEffectiveSkills,
  } = skillsModel.effective;
  const {
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    isCreatingUserPlatformSkill,
    userPlatformSkillMutationError,
    updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId,
  } = skillsModel.user;
  const {
    communitySkillAttachments,
    ownedSkillPackages,
    isLoadingCommunitySkillAttachments,
    isLoadingOwnedSkillPackages,
    communitySkillAttachmentError,
    ownedSkillPackagesError,
    isCreatingSkill,
    communitySkillMutationError,
    updatingCommunitySkillAttachmentId,
    removingCommunitySkillAttachmentId,
    attachingSkillPackageId,
  } = skillsModel.community;

  const communityAdminUi = communityAdministration.adminUi;
  const {
    communityFunnelConfig,
    setCommunityFunnelConfig,
    isLoadingCommunityFunnel,
    setIsLoadingCommunityFunnel,
    communityFunnelError,
    setCommunityFunnelError,
    isSavingCommunityFunnel,
    setIsSavingCommunityFunnel,
    communityFunnelSaveError,
    setCommunityFunnelSaveError,
    communityFunnelLoadedCommunityIdRef,
    communityFunnelDirtyRef,
    markCommunityFunnelDirty,
    hydrateCommunityFunnelEditor,
    handleResetCommunityFunnel,
    resetCommunityFunnelState,
    communityMemberMuted,
    setCommunityMemberMuted,
    isLoadingCommunityMemberSettings,
    setIsLoadingCommunityMemberSettings,
    communityMemberSettingsError,
    setCommunityMemberSettingsError,
    isLeavingCommunity,
    setIsLeavingCommunity,
  } = communityAdminUi;

  const isLikelyMobileDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent || "";
    const platform = navigator.platform || "";
    return (
      /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent) ||
      (/iPad|Macintosh/i.test(platform) && navigator.maxTouchPoints > 1)
    );
  }, []);

  function navigateTo(path: string, opts: { replace?: boolean; state?: unknown } = {}) {
    const nextPath = applyShellVariantToKnownPath(path, shellVariant);
    const historyState = opts.state ?? {};
    if (opts.replace) {
      window.history.replaceState(historyState, document.title, nextPath);
    } else {
      window.history.pushState(historyState, document.title, nextPath);
    }
    applyLocationToState();
  }

  async function resolveMemberEntryDestination(options?: {
    session?: AuthSession | null;
    communityId?: string | null;
    communitySlug?: string | null;
  }): Promise<CloudMemberEntryDestination | null> {
    const activeSession = options?.session ?? sessionRef.current ?? session;
    if (!activeSession) return null;
    const authSubject = resolveAuthSubject(activeSession);
    if (!authSubject) return null;
    const isDefaultDestination = !options?.communityId && !options?.communitySlug;
    if (
      isDefaultDestination &&
      defaultMemberEntryResolutionRef.current?.authSubject === authSubject
    ) {
      return await defaultMemberEntryResolutionRef.current.promise;
    }
    const request = resolveCloudMemberEntryDestination<AuthSession>({
      session: activeSession,
      communityId: options?.communityId ?? null,
      communitySlug: options?.communitySlug ?? null,
    });
    if (isDefaultDestination) {
      defaultMemberEntryResolutionRef.current = { authSubject, promise: request };
    }
    try {
      return await request;
    } catch (error) {
      console.warn("[member-entry] destination resolution failed:", error);
      return null;
    } finally {
      if (
        isDefaultDestination &&
        defaultMemberEntryResolutionRef.current?.promise === request
      ) {
        defaultMemberEntryResolutionRef.current = null;
      }
    }
  }

  function applyMemberEntryDestination(
    destination: CloudMemberEntryDestination,
    options?: { replace?: boolean },
  ): void {
    if (destination.page === "discover") {
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      navigateTo("/discover", { replace: options?.replace !== false });
      return;
    }

    const path = buildCommunityTabPath(destination.community_slug, "chat");
    if (!path) throw new Error("community_destination_path_required");
    syncCommunitySelection({
      communityId: destination.community_id,
      communitySlug: destination.community_slug,
    });
    setPublicRoute({ kind: "app" });
    navigateTo(path, { replace: options?.replace !== false });

    const activeSession = sessionRef.current ?? session;
    if (activeSession) {
      void loadCommunities(activeSession).catch(() => {
        // Destination access is already authoritative; this refresh is best effort.
      });
    }
  }

  async function resolveAndEnterMemberDestination(options?: {
    session?: AuthSession | null;
    communityId?: string | null;
    communitySlug?: string | null;
    replace?: boolean;
  }): Promise<boolean> {
    const destination = await resolveMemberEntryDestination(options);
    if (!destination) return false;
    applyMemberEntryDestination(destination, { replace: options?.replace });
    return true;
  }

  async function loadProfileForOnboarding(activeSession: AuthSession): Promise<UserProfileDetail | null> {
    const userId = resolveAuthSubject(activeSession);
    if (!userId) return null;
    const row = await resolveCloudOnboardingProfileDetail<AuthSession, UserProfileDetail>({
      session: activeSession,
      userId,
    });
    setHasLoadedOnboardingProfile(true);
    if (row) {
      setCloudProfile(row);
      if (row.account_setup) setAccountSetupStatus(row.account_setup);
      profileUi.applyLoadedProfileToLocal(row);
    }
    return row;
  }

  /* Incomplete accounts with no community context onboard on the standalone
     platform bridge page — the single seam for platform-generic onboarding.
     (Membership in the Polynet home community still happens via auto-join;
     this is presentation only.) */
  function redirectIncompleteAccountToPlatformBridge(): void {
    navigateTo("/onboarding");
  }

  async function routeTryPolynetFree(activeSession: AuthSession | null = sessionRef.current ?? session): Promise<void> {
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return;
    }

    try {
      const row = await loadProfileForOnboarding(activeSession);
      if (row?.account_setup?.completed) {
        setIsOnboardingModalOpen(false);
        const entered = await resolveAndEnterMemberDestination({
          session: activeSession,
          replace: true,
        });
        if (!entered) {
          setOnboardingError("We could not open your community. Try again.");
          navigateTo("/discover", { replace: true });
        }
        return;
      }
    } catch {
      /* Unknown setup state — the bridge collects everything from scratch. */
    }
    redirectIncompleteAccountToPlatformBridge();
  }

  async function finishOnboarding(options?: { navigate?: boolean }): Promise<boolean> {
    const shouldNavigate = options?.navigate !== false;
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return false;
    }

    const userId = resolveAuthSubject(activeSession);
    if (!userId) {
      setOnboardingError("We could not verify your account. Sign in again to continue.");
      return false;
    }

    const displayName = profileUi.profileName.trim() || null;
    const handle = profileUi.profileHandle.trim() || null;
    const bio = profileUi.profileBio.trim() || null;
    const avatarUrl = profileUi.profileAvatarUrl?.trim() || null;
    if (!displayName || !handle || !avatarUrl) {
      setOnboardingError("Add your display name, handle, and profile photo to continue.");
      return false;
    }
    /* Legal acceptance is judged by the server-loaded status below — never by
       render-closure state, which is stale when a save just landed. */

    setIsSavingOnboarding(true);
    setOnboardingError(null);
    try {
      const latestSetup = await loadCloudAccountSetupStatus<AuthSession>({
        session: activeSession,
      });
      if (latestSetup) setAccountSetupStatus(latestSetup);
      if (!latestSetup?.completed) {
        setOnboardingError(formatAccountSetupMissingGuidance(latestSetup));
        if (shouldNavigate) setIsOnboardingModalOpen(true);
        return false;
      }
      const avatarField = await prepareCloudProfileAvatarField<AuthSession>({
        session: activeSession,
        nextValue: profileUi.profileAvatarUrl,
        currentStorageId: profileUi.profileAvatarStorageId,
        currentResolvedUrl: profileUi.profileAvatarUrl,
      });
      const saved = await upsertCloudProfileDetail<AuthSession, UserProfileDetail>({
        session: activeSession,
        userId,
        displayName,
        handle,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        avatarFocusX: profileUi.profileAvatarFocusX,
        avatarFocusY: profileUi.profileAvatarFocusY,
        avatarZoom: profileUi.profileAvatarZoom,
        bio,
        socialLinks: profileUi.profileSocialLinks,
        completeOnboarding: true,
      });
      if (saved) {
        setCloudProfile(saved);
        if (saved.account_setup) setAccountSetupStatus(saved.account_setup);
        setHasLoadedOnboardingProfile(true);
        setIsOnboardingModalOpen(false);
        profileUi.setProfileName(saved.display_name ?? "");
        profileUi.setProfileHandle(saved.handle ?? "");
        profileUi.setProfileBio(saved.bio ?? "");
        profileUi.setProfileSocialLinks(saved.social_links ?? {
          youtube: "",
          x: "",
          instagram: "",
        });
        profileUi.setProfileAvatarUrl(saved.avatar_url ?? null);
        profileUi.setProfileAvatarStorageId(saved.avatar_storage_id ?? null);
        profileUi.setProfileAvatarFocusX(saved.avatar_focus_x ?? 0.5);
        profileUi.setProfileAvatarFocusY(saved.avatar_focus_y ?? 0.5);
        profileUi.setProfileAvatarZoom(saved.avatar_zoom ?? 1);
      }

      if (shouldNavigate) {
        const entered = await resolveAndEnterMemberDestination({
          session: activeSession,
          replace: true,
        });
        if (!entered) {
          setOnboardingError("We could not open your community. Try again.");
          return false;
        }
      }
      return true;
    } catch (error) {
      const message = formatProfileMutationError(error, "Failed to save onboarding.");
      setOnboardingError(message);
      return false;
    } finally {
      setIsSavingOnboarding(false);
    }
  }

  /* One gatekeeper for every entry path (free join, claim redemption, enter
     click): incomplete setup on the funnel route opens the bridge instead of
     entering; everything else passes straight through. */
  function enterCommunityThroughBridge(entry: {
    communityId: string;
    communitySlug: string | null;
    communityName?: string | null;
  }): void {
    const setupStatus = accountSetupStatus ?? cloudProfile?.account_setup ?? null;
    if (publicRoute.kind === "community_funnel" && setupStatus && !setupStatus.completed) {
      const communityName =
        String(entry.communityName ?? "").trim() ||
        (activeCommunity?.id === entry.communityId ? activeCommunity.name : "") ||
        (publicCommunityUi.publicCommunityAccess?.community_id === entry.communityId
          ? publicCommunityUi.publicCommunity?.name ?? ""
          : "");
      setBridgePendingEntry({
        ...entry,
        communityName: communityName || null,
      });
      setIsBridgeGateOpen(true);
      return;
    }
    void resolveAndEnterMemberDestination({
      communityId: entry.communityId,
      communitySlug: entry.communitySlug,
      replace: true,
    });
  }

  /* Platform bridge Enter: save the deterministic account profile, then let
     the server resolve the canonical Polynet community destination. */
  async function completePlatformBridge(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): Promise<boolean> {
    if (!validateOnboardingProfileInputs(legalAcceptance)) return false;
    const savedProfile = await saveOnboardingProfile(legalAcceptance);
    if (!savedProfile) return false;
    const finished = await finishOnboarding({ navigate: false });
    if (!finished) return false;
    const entered = await resolveAndEnterMemberDestination({ replace: true });
    if (!entered) {
      setOnboardingError("We could not open Polynet. Try again.");
      return false;
    }
    return true;
  }

  /* Community bridge Enter: save identity + legal, then revalidate the exact
     requested community before changing the route. */
  async function completeBridgeAndEnter(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): Promise<boolean> {
    /* Approval applicants have nothing to run — the request is already in;
       the gate's "Request pending" state takes over once the bridge clears. */
    if (approvalPending) {
      const savedProfile = await saveOnboardingProfile(legalAcceptance);
      if (!savedProfile) return false;
      const finished = await finishOnboarding({ navigate: false });
      if (!finished) return false;
      setIsBridgeGateOpen(false);
      setBridgePendingEntry(null);
      return true;
    }
    if (!validateOnboardingProfileInputs(legalAcceptance)) return false;
    const entry = bridgePendingEntry ?? (
      activeCommunityId
        ? {
            communityId: activeCommunityId,
            communitySlug: selectedActiveCommunitySlug,
          }
        : null
    );
    if (!entry?.communityId) {
      setOnboardingError("We could not verify this community. Try again.");
      return false;
    }
    const savedProfile = await saveOnboardingProfile(legalAcceptance);
    if (!savedProfile) return false;
    const finished = await finishOnboarding({ navigate: false });
    if (!finished) return false;
    const destination = await resolveMemberEntryDestination({
      communityId: entry.communityId,
      communitySlug: entry.communitySlug,
    });
    if (!destination || destination.page !== "community") {
      setOnboardingError("We could not open this community. Try again.");
      return false;
    }
    setIsBridgeGateOpen(false);
    setBridgePendingEntry(null);
    applyMemberEntryDestination(destination, { replace: true });
    return true;
  }

  /* Client-side bridge validation, shared with saveOnboardingProfile: failures
     here keep the user on the bridge with inline errors. */
  function validateOnboardingProfileInputs(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): boolean {
    const displayName = profileUi.profileName.trim();
    const handle = profileUi.profileHandle.trim() || null;
    const avatarUrl = profileUi.profileAvatarUrl?.trim() || null;
    if (!displayName || !handle || !avatarUrl) {
      setOnboardingError("Add your display name, handle, and profile photo to continue.");
      return false;
    }
    const currentSetup = accountSetupStatus ?? cloudProfile?.account_setup ?? null;
    if (currentSetup?.missing.includes("platform_legal") !== false && !legalAcceptance) {
      setOnboardingError("Agree to the Terms of Service and acknowledge the Privacy & AI Data Policy to continue.");
      return false;
    }
    return true;
  }

  async function saveOnboardingProfile(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): Promise<boolean> {
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return false;
    }

    const userId = resolveAuthSubject(activeSession);
    if (!userId) {
      setOnboardingError("We could not verify your account. Sign in again to continue.");
      return false;
    }

    const displayName = profileUi.profileName.trim();
    const handle = profileUi.profileHandle.trim() || null;
    const bio = profileUi.profileBio.trim() || null;
    const avatarUrl = profileUi.profileAvatarUrl?.trim() || null;
    if (!validateOnboardingProfileInputs(legalAcceptance)) return false;

    setIsSavingOnboarding(true);
    setOnboardingError(null);
    try {
      const avatarField = await prepareCloudProfileAvatarField<AuthSession>({
        session: activeSession,
        nextValue: profileUi.profileAvatarUrl,
        currentStorageId: profileUi.profileAvatarStorageId,
        currentResolvedUrl: profileUi.profileAvatarUrl,
      });
      const saved = await upsertCloudProfileDetail<AuthSession, UserProfileDetail>({
        session: activeSession,
        userId,
        displayName,
        handle,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        avatarFocusX: profileUi.profileAvatarFocusX,
        avatarFocusY: profileUi.profileAvatarFocusY,
        avatarZoom: profileUi.profileAvatarZoom,
        bio,
        socialLinks: profileUi.profileSocialLinks,
        markOnboardingDismissed: false,
        termsOfServiceVersion: legalAcceptance?.termsOfServiceVersion ?? null,
        privacyPolicyVersion: legalAcceptance?.privacyPolicyVersion ?? null,
      });
      if (saved) {
        setCloudProfile(saved);
        if (saved.account_setup) setAccountSetupStatus(saved.account_setup);
        setHasLoadedOnboardingProfile(true);
        profileUi.setProfileName(saved.display_name ?? "");
        profileUi.setProfileHandle(saved.handle ?? "");
        profileUi.setProfileBio(saved.bio ?? "");
        profileUi.setProfileSocialLinks(saved.social_links ?? {
          youtube: "",
          x: "",
          instagram: "",
        });
        profileUi.setProfileAvatarUrl(saved.avatar_url ?? null);
        profileUi.setProfileAvatarStorageId(saved.avatar_storage_id ?? null);
        profileUi.setProfileAvatarFocusX(saved.avatar_focus_x ?? 0.5);
        profileUi.setProfileAvatarFocusY(saved.avatar_focus_y ?? 0.5);
        profileUi.setProfileAvatarZoom(saved.avatar_zoom ?? 1);
      }
      return true;
    } catch (error) {
      const message = formatProfileMutationError(error, "Failed to save your profile.");
      setOnboardingError(message);
      return false;
    } finally {
      setIsSavingOnboarding(false);
    }
  }

  const applyAppRouteState = useCallback((nextAppRoute: AppRouteState) => {
    const normalizedCommunitySlug = String(nextAppRoute.communitySlug ?? "").trim() || null;
    setActivePage(nextAppRoute.page);
    setActiveView("home");
    setSettingsPage(nextAppRoute.settingsPage);
    if (nextAppRoute.page === "docs") {
      setSelectedProductDocSlug(nextAppRoute.docsSlug ?? null);
    }
    if (nextAppRoute.page === "operator") {
      setActiveOperatorTab(nextAppRoute.operatorTab ?? "platform");
    }
    if (nextAppRoute.page === "community") {
      setCommunityExperienceMode(nextAppRoute.communityExperienceMode ?? "standard");
      applyCommunityShellState({
        communitySlug: normalizedCommunitySlug,
        communityTab: nextAppRoute.communityTab,
      });
      setCommunityResourceModuleId(
        nextAppRoute.communityTab === "resources" ? nextAppRoute.communityResourceModuleId ?? null : null,
      );
      setCommunitySettingsPane(
        nextAppRoute.communityTab === "settings" ? nextAppRoute.communitySettingsPane ?? "community" : "community",
      );
    } else {
      setCommunityExperienceMode("standard");
      setCommunityResourceModuleId(null);
      setCommunitySettingsPane("community");
    }
  }, [applyCommunityShellState]);

  const applyLocationToState = useCallback(() => {
    setShellVariant(readShellVariantFromPathname(window.location.pathname || "/"));
    const nextPublicRoute = readPublicRouteFromLocation();
    setPublicRoute(nextPublicRoute);
    if (nextPublicRoute.kind !== "app") return nextPublicRoute;
    applyAppRouteState(readAppRouteFromLocation());
    return nextPublicRoute;
  }, [applyAppRouteState]);

  useEffect(() => {
    if (!isAuthBootstrapComplete) return;
    if (!session) return;
    if (publicRoute.kind !== "app") return;
    if (activePage !== "landing") return;
    if (!isRootAppRoutePath(window.location.pathname || "/")) return;
    void routeTryPolynetFree(session);
  }, [activePage, isAuthBootstrapComplete, publicRoute.kind, session]);

  const legacyWorkspaceRedirectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthBootstrapComplete) return;
    if (publicRoute.kind !== "app") return;
    const pathname = window.location.pathname || "/";
    const legacyContext = readLegacyWorkspaceRouteContext(pathname);
    if (!legacyContext) return;

    const redirectKey = `${resolveAuthSubject(session) ?? "signed-out"}:${pathname}`;
    if (legacyWorkspaceRedirectRef.current === redirectKey) return;
    legacyWorkspaceRedirectRef.current = redirectKey;

    if (!session) {
      navigateTo(
        legacyContext.communitySlug
          ? buildCommunityFunnelPath(legacyContext.communitySlug) ?? "/"
          : "/",
        { replace: true },
      );
      return;
    }

    void resolveAndEnterMemberDestination({
      session,
      communitySlug: legacyContext.communitySlug,
      replace: true,
    }).then((entered) => {
      if (entered) return;
      navigateTo(
        legacyContext.communitySlug
          ? buildCommunityFunnelPath(legacyContext.communitySlug) ?? "/discover"
          : "/discover",
        { replace: true },
      );
    });
  }, [isAuthBootstrapComplete, publicRoute.kind, session]);

  useEffect(() => {
    if (!isStandaloneWebApp()) return;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get(STANDALONE_APP_LAUNCH_SEARCH_PARAM) !== STANDALONE_APP_LAUNCH_SEARCH_VALUE) {
      return;
    }

    currentUrl.searchParams.delete(STANDALONE_APP_LAUNCH_SEARCH_PARAM);
    const nextPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` || "/";
    window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
  }, []);

  /* (Deleted 2026-07-02: the standalone signed-out funnel deferral used to
     bounce /c/:slug to a workspace launch. The visitor lens made that
     backwards — a signed-out /c/ visit IS the community page now.) */

  useEffect(() => {
    if (activePage !== "onboarding") return;
    if (!isAuthBootstrapComplete) return;
    if (session) return;
    if (hasRecentAuthFlowPending()) return;
    requireSignIn({ reason: "try_polynet_free", payload: {} });
  }, [activePage, isAuthBootstrapComplete, requireSignIn, session]);

  useEffect(() => {
    if (activePage !== "onboarding") return;
    if (!session) return;
    void (async () => {
      const row = cloudProfile ?? (await loadProfileForOnboarding(session));
      if (row?.account_setup?.completed) {
        setIsOnboardingModalOpen(false);
        const entered = await resolveAndEnterMemberDestination({
          session,
          replace: true,
        });
        if (!entered) {
          setOnboardingError("We could not open your community. Try again.");
        }
      }
      /* Incomplete accounts stay: this route renders the standalone
         platform bridge page. */
    })();
  }, [activePage, cloudProfile, session]);

  const operatorRouteRedirectRef = useRef<string | null>(null);
  useEffect(() => {
    if (activePage !== "operator") {
      operatorRouteRedirectRef.current = null;
      return;
    }
    if (!isAuthBootstrapComplete) return;
    if (!session) {
      navigateTo("/", { replace: true });
      return;
    }
    if (!isOperatorAccessResolved) return;
    if (operatorAccess) return;

    const redirectKey = String(canonicalSessionUserId ?? "operator-denied");
    if (operatorRouteRedirectRef.current === redirectKey) return;
    operatorRouteRedirectRef.current = redirectKey;
    void resolveAndEnterMemberDestination({ session, replace: true }).then((entered) => {
      if (!entered) navigateTo("/discover", { replace: true });
    });
  }, [
    activePage,
    canonicalSessionUserId,
    isAuthBootstrapComplete,
    isOperatorAccessResolved,
    operatorAccess,
    session,
  ]);

  /* Deterministic timezone capture: record the browser's IANA zone silently,
     refreshed when it drifts from what the profile holds. Never a question. */
  const timezoneSyncRef = useRef(false);
  useEffect(() => {
    if (!session || !cloudProfile) return;
    if (timezoneSyncRef.current) return;
    let browserTimezone = "";
    try {
      browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!browserTimezone) return;
    timezoneSyncRef.current = true;
    const stored = (cloudProfile as { timezone?: string | null }).timezone ?? null;
    if (stored === browserTimezone) return;
    void recordMemberTimezoneRpc({ session, timezone: browserTimezone }).catch(() => null);
  }, [cloudProfile, session]);

  /* Load the viewer's profile + setup status wherever setup state matters. */
  useEffect(() => {
    const needsOnboardingProfile =
      activePage === "settings" ||
      activePage === "community" ||
      activePage === "onboarding" ||
      publicRoute.kind === "community_funnel";
    if (!needsOnboardingProfile) return;
    if (!isAuthBootstrapComplete) return;
    if (!session) return;
    if (cloudProfile) {
      setHasLoadedOnboardingProfile(true);
      return;
    }
    if (hasLoadedOnboardingProfile) {
      return;
    }
    void loadProfileForOnboarding(session);
  }, [
    activePage,
    cloudProfile,
    hasLoadedOnboardingProfile,
    isAuthBootstrapComplete,
    publicRoute.kind,
    session,
  ]);

  const shellPublicRoute: PublicRoute = publicRoute;

  const navStackRef = useRef<NavSnapshot[]>([]);
  const readCurrentRoutePath = () =>
    `${window.location.pathname}${window.location.search}` || "/";
  const buildCurrentAppRoutePath = (): string | null =>
    applyShellVariantToAppPath(
      buildAppRoutePath({
        page: activePage,
        view: activeView,
        settingsPage,
        communitySlug: selectedActiveCommunitySlug,
        communityTab,
        communityResourceModuleId:
          activePage === "community" && communityTab === "resources" ? communityResourceModuleId : null,
        communitySettingsPane:
          activePage === "community" && communityTab === "settings" ? communitySettingsPane : null,
        docsSlug: activePage === "docs" ? selectedProductDocSlug : null,
        operatorTab: activePage === "operator" ? activeOperatorTab : null,
      }) ?? "",
      shellVariant,
    ) || null;
  const takeNavSnapshot = (): NavSnapshot => ({
    page: activePage,
    view: activeView,
    settingsPage,
    communitySlug: selectedActiveCommunitySlug,
    communityTab,
    routePath: buildCurrentAppRoutePath() ?? readCurrentRoutePath(),
  });
  const pushNavSnapshot = () => {
    const snapshot = takeNavSnapshot();
    pushUniqueNavSnapshot(navStackRef.current, snapshot);
  };
  const openGlobalSettings = (page: SettingsPage): void => {
    if (activePage === "settings" && settingsPage === page) return;
    if (activePage !== "settings") pushNavSnapshot();
    navigateTo(buildSettingsPath(page));
  };
  const openOperatorConsole = (tab: OperatorTab = "platform"): void => {
    if (!hasOperatorAccess) return;
    if (activePage !== "operator") pushNavSnapshot();
    navigateTo(`/operator/${tab}`);
  };
  const {
    syncCommunitySelection,
    openPublicCommunityFunnel,
    openCommunityTab,
    openCommunityChat,
    openCommunityBySlug,
  } = useWebCommunityRouteController<CommunityRecord>({
    activePage,
    activeView,
    activeCommunityId: selectedActiveCommunityId,
    activeCommunitySlug: selectedActiveCommunitySlug,
    communityTab,
    communities,
    navigateTo,
    pushNavSnapshot,
    setActivePage,
    setActiveView,
    applyCommunityShellState,
    setUnreadCount,
  });
  const restoreNavSnapshot = (snapshot: NavSnapshot) => {
    const nextRoutePath = snapshot.routePath?.trim() || "/";
    navigateTo(nextRoutePath, { replace: true });
  };
  const goBack = (): boolean => {
    const snapshot = popDistinctNavSnapshot(navStackRef.current, readCurrentRoutePath());
    if (!snapshot) return false;
    restoreNavSnapshot(snapshot);
    return true;
  };

  const backTargetSnapshot = [...navStackRef.current].reverse()[0] ?? null;
  const backTargetLabel = backTargetSnapshot ? formatBackTargetLabelShared(backTargetSnapshot) : null;
  const effectiveBackTargetLabel = backTargetLabel;

  const activeCommunityIdRef = useRef<string | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const appToastTimeoutRef = useRef<number | null>(null);
  const lastShownAuthErrorRef = useRef<string | null>(null);
  const [communityAiAgentPreferredTab, setCommunityAiAgentPreferredTab] = useState<
    "instructions" | "skills"
  >("instructions");
  const [chatgptConnection, setChatgptConnection] = useState<CloudChatgptConnectionStatus>({
    provider: "chatgpt",
    auth_kind: "oauth_tokens",
    connected: false,
    email: null,
    account_id: null,
    access_token_expires_at: null,
    validated_at: null,
    updated_at: null,
  });
  const [openAiConnection, setOpenAiConnection] = useState<CloudOpenAiConnectionStatus>({
    provider: "openai",
    auth_kind: "api_key",
    connected: false,
    key_last_four: null,
    validated_at: null,
    updated_at: null,
  });
  const [isLoadingChatgptConnection, setIsLoadingChatgptConnection] = useState(false);
  const persistCreateCommunityIntent = useCallback((draft: CreateCommunityIntentDraft): void => {
    storeAuthResumeState({
      intent: { reason: "create_community", payload: { draft } },
    });
  }, []);
  const { loadCommunities, loadUserProfiles } = useWebCommunityAccessController<
    AuthSession,
    CommunityRecord,
    UserProfile
  >({
    toCanonicalCommunityVisibility,
    activeCommunitySlug: selectedActiveCommunitySlug,
    loadingResetKey: canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    setIsLoadingCommunities,
    setHasResolvedCommunities,
    setCommunityRoleById,
    setCommunities,
    applyCommunityShellState,
    setProfilesByUserId,
  });

  useEffect(() => {
    setHasResolvedCommunities(false);
  }, [canonicalSessionUserId]);

  const enterJoinedCommunity = useCallback(
    (opts: { communityId: string; communitySlug?: string | null }) => {
      const communityId = String(opts.communityId ?? "").trim();
      if (!communityId) return;

      const resolvedSlug =
        String(opts.communitySlug ?? "").trim() || resolveKnownCommunitySlugById(communityId);

      syncCommunitySelection({
        communityId,
        communitySlug: resolvedSlug || null,
      });
      setPublicRoute({ kind: "app" });
      applyAppRouteState({
        page: "community",
        view: "home",
        settingsPage: "agent",
        communitySlug: resolvedSlug || null,
        communityTab: "chat",
      });

      const currentSession = sessionRef.current ?? session;
      if (currentSession) {
        void loadCommunities(currentSession).catch(() => {
          // Keep the route transition responsive; membership refresh can fail independently.
        });
      }
    },
    [
      applyAppRouteState,
      session,
      loadCommunities,
      resolveKnownCommunitySlugById,
      syncCommunitySelection,
    ],
  );

  const {
    loadSelfProfile,
    saveProfileToCloud,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
    handleSetCommunityMemberRole,
    handleRemoveCommunityMember,
    handleBanCommunityMember,
  } = useCommunityAdminController<
    AuthSession,
    UserProfile,
    UserProfileDetail
  >({
    activeCommunityId,
    ...authenticatedSessionArg,
    ensureCommunityChatThread,
    confirmAction: (message) => confirm(message),
    reloadCommunities: loadCommunities,
    reloadCommunityAccess: reloadActiveCommunityAccess,
    getProfileSaveSession: () => sessionRef.current ?? session,
    profileName: profileUi.profileName,
    profileHandle: profileUi.profileHandle,
    profileBio: profileUi.profileBio,
    profileSocialLinks: profileUi.profileSocialLinks,
    profileAvatarUrl: profileUi.profileAvatarUrl,
    profileAvatarStorageId: profileUi.profileAvatarStorageId,
    profileAvatarFocusX: profileUi.profileAvatarFocusX,
    profileAvatarFocusY: profileUi.profileAvatarFocusY,
    profileAvatarZoom: profileUi.profileAvatarZoom,
    profileSaveTimeoutRef: profileUi.profileSaveTimeoutRef,
    profileSaveFailureMessage: "Failed to save profile.",
    profileSaveUnauthenticatedErrorMessage: null,
    onProfileSaveUnauthenticated: () => {
      requireSignIn();
    },
    applyLoadedProfileToLocal: profileUi.applyLoadedProfileToLocal,
    setProfilesByUserId,
    setCloudProfile,
    setProfileName: profileUi.setProfileName,
    setProfileHandle: profileUi.setProfileHandle,
    setProfileBio: profileUi.setProfileBio,
    setProfileSocialLinks: profileUi.setProfileSocialLinks,
    setProfileAvatarUrl: profileUi.setProfileAvatarUrl,
    setProfileAvatarStorageId: profileUi.setProfileAvatarStorageId,
    setProfileAvatarFocusX: profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: profileUi.setProfileAvatarZoom,
    setIsSavingProfile: profileUi.setIsSavingProfile,
    setProfileSaveError: profileUi.setProfileSaveError,
    setProfileSaveSuccess: profileUi.setProfileSaveSuccess,
    setIsLoadingCommunityAnalytics,
    setCommunityAnalyticsError,
    setCommunityAnalyticsSummary,
    setCommunityAnalyticsSeries,
  });
  const loadCommunityMemberBillingHistory = useCallback(async (membershipId: string) => {
    const usableSession = await ensureUsableAuthSession();
    const communityId = activeCommunityIdRef.current ?? activeCommunityId;
    if (!usableSession || !communityId) return null;
    return await fetchCloudCommunityMemberBillingHistory({
      session: usableSession,
      communityId,
      membershipId,
      limit: 20,
    });
  }, [activeCommunityId, ensureUsableAuthSession]);
  const reloadActiveCommunityDirectoryMembers = useCallback(async () => {
    const usableSession = await ensureUsableAuthSession();
    const communityId = activeCommunityIdRef.current ?? activeCommunityId;
    if (!usableSession || !communityId) return;
    await loadCommunityDirectoryMembers(communityId, usableSession);
  }, [activeCommunityId, ensureUsableAuthSession, loadCommunityDirectoryMembers]);
  const handleSetCommunityContextMemberRole = useCallback(async (
    membershipId: string,
    role: "admin" | "moderator" | "member",
  ) => {
    await handleSetCommunityMemberRole(membershipId, role);
    await reloadActiveCommunityDirectoryMembers();
  }, [handleSetCommunityMemberRole, reloadActiveCommunityDirectoryMembers]);
  const handleRemoveCommunityContextMember = useCallback(async (membershipId: string) => {
    await handleRemoveCommunityMember(membershipId);
    await reloadActiveCommunityDirectoryMembers();
  }, [handleRemoveCommunityMember, reloadActiveCommunityDirectoryMembers]);
  const handleBanCommunityContextMember = useCallback(async (membershipId: string) => {
    await handleBanCommunityMember(membershipId);
    await reloadActiveCommunityDirectoryMembers();
  }, [handleBanCommunityMember, reloadActiveCommunityDirectoryMembers]);
  const handleSetCommunityContextFreeAccessMode = useCallback(async (mode: "open" | "approval") => {
    const usableSession = await ensureUsableAuthSession();
    const communityId = activeCommunityIdRef.current ?? activeCommunityId;
    if (!usableSession || !communityId || !canManageMembersActiveCommunity) return;
    const isStillActiveCommunity = () =>
      (activeCommunityIdRef.current ?? activeCommunityId) === communityId;
    setCommunityFreeAccessModeError(null);
    setIsSettingCommunityFreeAccessMode(true);
    try {
      const result = await setCloudCommunityFreeAccessMode({
        session: usableSession,
        communityId,
        mode,
      });
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === communityId
            ? {
                ...community,
                entry_policy: result?.entry_policy ?? mode,
                updated_at: result?.updated_at ?? community.updated_at,
              }
            : community,
        ),
      );
      const approvedPendingRequestCount = Math.max(
        0,
        Number(result?.approved_pending_request_count ?? 0) || 0,
      );
      if ((result?.entry_policy ?? mode) !== "approval" && isStillActiveCommunity()) {
        setCommunityJoinRequests([]);
      }
      if (approvedPendingRequestCount > 0 && isStillActiveCommunity()) {
        await loadCommunityDirectoryMembers(communityId, usableSession);
      }
    } catch (error) {
      if (!isStillActiveCommunity()) return;
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update auto-join.";
      setCommunityFreeAccessModeError(message || "Failed to update auto-join.");
    } finally {
      if (isStillActiveCommunity()) {
        setIsSettingCommunityFreeAccessMode(false);
      }
    }
  }, [
    activeCommunityId,
    canManageMembersActiveCommunity,
    ensureUsableAuthSession,
    loadCommunityDirectoryMembers,
    setCommunityJoinRequests,
  ]);

  const {
    loadCommunityAgentConfig,
    handleSaveCommunityAgentConfig,
  } = useCommunityAgentConfigController<AuthSession, CommunityAgentLanding, CommunityAgentConfig>({
    activeCommunityId,
    ...authenticatedSessionArg,
    communityAgentConfigLanding,
    communityAgentConfigCommunitySystemPrompt,
    normalizeConfigForSave: normalizeCommunityAgentDraftForSave,
    hydrateConfigEditor: hydrateCommunityAgentEditor,
    setLoadedCommunityId: (communityId) => {
      communityAgentConfigLoadedCommunityIdRef.current = communityId;
    },
    markConfigClean: () => {
      communityAgentConfigDirtyRef.current = false;
    },
    setIsLoadingCommunityAgentConfig,
    setCommunityAgentConfigError,
    setIsSavingCommunityAgentConfig,
    setCommunityAgentConfigSaveError,
    saveValidationErrorMessage: "Add at least one onboarding prompt.",
    loadFailureMessage: "Failed to load AI agent config.",
    saveFailureMessage: "Failed to save AI agent changes.",
  });
  const {
    createCommunitySkill: handleCreateCommunitySkill,
    createUserPlatformSkill: handleCreateUserPlatformSkill,
    updateUserPlatformSkill: handleUpdateUserPlatformSkill,
    saveUserPlatformSkill: handleSaveUserPlatformSkill,
    deleteUserPlatformSkill: handleDeleteUserPlatformSkill,
    attachSkillPackageToCommunity: handleAttachSkillPackageToCommunity,
    updateCommunitySkillAttachment: handleUpdateCommunitySkillAttachment,
    detachCommunitySkill: handleDetachCommunitySkill,
  } = skillsModel.actions;
  const effectiveSkillsForSettings = skillsModel.settingsEffectiveSkills;
  const effectiveSkillsErrorForSettings = skillsModel.settingsEffectiveSkillsError;

  const {
    loadCommunityFunnelConfig,
    handleSaveCommunityFunnel,
  } = useCommunityFunnelController<AuthSession, CommunityFunnelConfig>({
    activeCommunityId,
    ...authenticatedSessionArg,
    communityFunnelConfig,
    normalizeConfigForSave: normalizeCommunityFunnelConfig,
    saveConfig: async ({ session, communityId, normalizedConfig }) => {
      const saved = await saveCloudCommunityPublicPresentation<AuthSession, CommunityFunnelConfig>({
        session,
        communityId,
        config: normalizedConfig,
      });
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === communityId
            ? {
                ...community,
                updated_at: saved?.updated_at || community.updated_at,
              }
            : community,
        ),
      );
      return saved?.funnel ?? normalizedConfig;
    },
    hydrateEditor: hydrateCommunityFunnelEditor,
    setLoadedCommunityId: (communityId) => {
      communityFunnelLoadedCommunityIdRef.current = communityId;
    },
    markDraftClean: () => {
      communityFunnelDirtyRef.current = false;
    },
    setIsLoadingCommunityFunnel,
    setCommunityFunnelError,
    setCommunityFunnelSaveError,
    setIsSavingCommunityFunnel,
    loadFailureMessage: "Failed to load funnel settings.",
    saveFailureMessage: "Failed to save funnel settings.",
  });

  const {
    syncCommunitySettingsSelection,
  } = useCommunitySettingsFormController<CommunityRecord>({
    slugifyCommunityName,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityPricingDirtyRef,
    setCommunitySettingsError,
    setCommunityMemberSettingsError,
    setCommunitySettingsName,
    setCommunitySettingsSlug,
    setCommunitySettingsOneLiner,
    setCommunitySettingsAbout,
    setCommunitySettingsVisibility,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusY,
    setCommunitySettingsAvatarZoom,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdAnnual,
    setCommunityMemberMuted,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
  });

  const {
    loadCommunityMemberSettings,
    loadCommunityPricing,
  } = useCommunitySettingsDataController<AuthSession>({
    ensureSession: ensureUsableAuthSession,
    communitySettingsLoadedCommunityIdRef,
    communityPricingDirtyRef,
    setCommunityMemberMuted,
    setIsLoadingCommunityMemberSettings,
    setCommunityMemberSettingsError,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdAnnual,
  });

  const activeCommunitySettingsSource = activeCommunity;

  const {
    handleToggleCommunityMute,
    handleLeaveCommunity,
    handleSaveCommunitySettings,
  } = useCommunitySettingsGovernanceController<AuthSession>({
    activeCommunityAvatarStorageId: activeCommunitySettingsSource?.avatar_storage_id ?? null,
    activeCommunityBannerStorageId: activeCommunitySettingsSource?.banner_storage_id ?? null,
    activeCommunityAvatarUrl: activeCommunitySettingsSource?.avatar_url ?? null,
    activeCommunityBannerUrl: activeCommunitySettingsSource?.banner_url ?? null,
    activeCommunityId,
    ...authenticatedSessionArg,
    confirmAction: (message) => confirm(message),
    loadCommunities,
    onLeaveCommunityLocalState: (leavingId) => {
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      setActivePage("discover");
      setActiveView("home");
      setCommunities((prev) => prev.filter((community) => community.id !== leavingId));
    },
    setCommunityMemberSettingsError,
    setIsLoadingCommunityMemberSettings,
    setCommunityMemberMuted,
    setIsLeavingCommunity,
    communitySettingsName,
    communitySettingsSlug,
    communitySettingsOneLiner,
    communitySettingsAbout,
    communitySettingsVisibility,
    communitySettingsAvatarUrl,
    communitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    communitySettingsAvatarZoom,
    communitySettingsBannerUrl,
    communitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    communitySettingsBannerZoom,
    communitySettingsPricingMode,
    communitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdAnnual,
    isValidCommunitySlug,
    setCommunitySettingsError,
    setIsSavingCommunitySettings,
    onSaveCommunitySettingsSuccess: (result) => {
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === result.community_id
            ? {
                ...community,
                name: result.name,
                slug: result.slug,
                one_liner: result.one_liner,
                about: result.about ?? null,
                avatar_url: result.avatar_url,
                avatar_storage_id: result.avatar_storage_id ?? null,
                avatar_focus_x: result.avatar_focus_x ?? 0.5,
                avatar_focus_y: result.avatar_focus_y ?? 0.5,
                avatar_zoom: result.avatar_zoom ?? 1,
                banner_url: result.banner_url,
                banner_storage_id: result.banner_storage_id ?? null,
                banner_focus_x: result.banner_focus_x ?? 0.5,
                banner_focus_y: result.banner_focus_y ?? 0.5,
                banner_zoom: result.banner_zoom ?? 1,
                visibility: toCanonicalCommunityVisibility(result.visibility, "unlisted"),
                updated_at: result.updated_at,
              }
            : community,
        ),
      );
      if (activeCommunityId === result.community_id) {
        applyCommunityShellState({
          communityId: result.community_id,
          communitySlug: result.slug,
        });
      }
      communitySettingsDirtyRef.current = false;
      communityPricingDirtyRef.current = false;
    },
  });
  const {
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
  } = useCommunityMembersReviewController<
    AuthSession,
    CommunityJoinRequest
  >({
    activeCommunityId,
    ...authenticatedSessionArg,
    loadUserProfiles: (userIds, session) => loadUserProfiles(userIds, session),
    reloadCommunityDirectoryMembers: loadCommunityDirectoryMembers,
    onJoinRequestApproved: ({ communityId, requestId }) => {
      captureProductAnalyticsEvent("community join request approved", {
        community_id: communityId,
        request_id: requestId,
        surface: "workspace_community_panel",
      });
    },
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
  });

  const [discoverCommunities, setDiscoverCommunities] = useState<DiscoverCommunity[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [lastDiscoverLoadAttemptedAt, setLastDiscoverLoadAttemptedAt] = useState(0);

  const openPremiumBilling = () => openGlobalSettings("billing");

  const { loadDiscoverCommunities } = useWebDiscoverController({
    toCanonicalCommunityVisibility,
    setIsLoadingDiscover,
    setDiscoverError,
    setDiscoverCommunities,
    setLastDiscoverLoadAttemptedAt,
  });

  const { showAppToastMessage } = useWebToastController({
    appToastTimeoutRef,
    setAppToast,
  });
  resetWebSessionStateRef.current = () => resetWebSessionStateAfterSignOut({
    beginBrowserSignedOutState,
    setCommunities,
    setIsLoadingCommunities,
    setCommunityRoleById,
    setActiveCommunityId,
    setCommunityTab,
    resetCommunityChatState,
    resetCommunityContentState,
    setCommunitySettingsName,
    setCommunitySettingsSlug,
    setCommunitySettingsOneLiner,
    setCommunitySettingsVisibility,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsError,
    setIsSavingCommunitySettings,
    setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver,
    setDiscoverCommunities,
  });
  useEffect(() => {
    if (!authError) {
      lastShownAuthErrorRef.current = null;
      return;
    }
    if (readAuthResumeState()?.intent?.reason === "open_workspace_draft") {
      return;
    }
    if (lastShownAuthErrorRef.current === authError) return;
    lastShownAuthErrorRef.current = authError;
    showAppToastMessage(authError);
  }, [authError, showAppToastMessage]);

  const handleImportExternalMemory = useCallback(async (): Promise<void> => {
    const result = await personalAccountSettings.importExternalMemory();
    if (!result) return;
    const importedLabel = `${result.importedCount} memory item${result.importedCount === 1 ? "" : "s"}`;
    const duplicateLabel =
      result.duplicateCount > 0
        ? ` · skipped ${result.duplicateCount} duplicate${result.duplicateCount === 1 ? "" : "s"}`
        : "";
    showAppToastMessage(`Imported ${importedLabel}${duplicateLabel}`);
  }, [
    personalAccountSettings,
    showAppToastMessage,
  ]);

  useEffect(() => {
    activeCommunityIdRef.current = activeCommunityId;
  }, [activeCommunityId]);

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "funnel") return;
    if (!session || !activeCommunityId || !canManageMembersActiveCommunity) {
      resetCommunityFunnelState();
      return;
    }
    if (communityFunnelLoadedCommunityIdRef.current === activeCommunityId) return;
    void loadCommunityFunnelConfig(activeCommunityId, session);
  }, [
    activePage,
    communityTab,
    session,
    activeCommunityId,
    canManageMembersActiveCommunity,
    loadCommunityFunnelConfig,
    resetCommunityFunnelState,
  ]);

  const communityPolynetController = useWebCommunityPolynetController<AuthSession>({
    activePage,
    communityTab,
    activeCommunityId,
    session: session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn: () => requireSignIn(),
    canViewPolynet: canViewActiveCommunityPolynet,
  });

  useWebPathRouteLifecycle({
    publicRouteKind: publicRoute.kind,
    activePage,
    activeView,
    settingsPage,
    activeCommunitySlug: selectedActiveCommunitySlug,
    communityTab,
    communityExperienceMode,
    communityResourceModuleId,
    communitySettingsPane,
    docsSlug: activePage === "docs" ? selectedProductDocSlug : null,
    operatorTab: activePage === "operator" ? activeOperatorTab : null,
    applyLocationToState,
    setStripeConnectReturn,
    buildAppRoutePath: (state) => applyShellVariantToAppPath(buildAppRoutePath(state) ?? "", shellVariant) || null,
  });


  useEffect(() => {
    if (shellVariant !== "standard" || !isLikelyMobileDevice) return;
    if (hasOAuthCallbackParamsInLocation()) return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const nextPath = applyShellVariantToKnownPath(currentPath, "mobile");
    if (!nextPath || nextPath === currentPath) return;
    window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
    applyLocationToState();
  }, [applyLocationToState, isLikelyMobileDevice, shellVariant]);

  useWebUiPersistenceLifecycle({
    communityAnalyticsRange,
    profileStorageUserId,
    profileName: profileUi.profileName,
    profileHandle: profileUi.profileHandle,
    profileBio: profileUi.profileBio,
    readProfileDraftForUser,
    writeProfileDraftForUser,
    setProfileName: profileUi.setProfileName,
    setProfileHandle: profileUi.setProfileHandle,
    setProfileBio: profileUi.setProfileBio,
  });

  // Cloud session is hydrated from browser auth continuity during lifecycle bootstrap.

  useEffect(() => {
    setCloudProfile(null);
    setAccountSetupStatus(null);
    setIsLoadingAccountSetupStatus(false);
    setHasLoadedOnboardingProfile(false);
    setIsOnboardingModalOpen(false);
  }, [profileStorageUserId]);

  const visibleCommunityProfileIds = useMemo(() => {
    const shouldLoadCommunityProfiles = activePage === "community";
    if (!shouldLoadCommunityProfiles) return [] as string[];
    const ids = new Set<string>();
    for (const member of communityDirectoryMembers) {
      const userId = String(member.user_id ?? "").trim();
      if (userId) ids.add(userId);
    }
    for (const message of communityMessages) {
      const senderId = String(message.sender_id ?? "").trim();
      if (senderId) ids.add(senderId);
    }
    for (const event of communityActivityEvents) {
      const actorId = String(event.actor_user_id ?? "").trim();
      if (actorId) ids.add(actorId);
    }
    for (const bundle of communityInteractionRoots) {
      const actorId = String(bundle.root.actor_user_id ?? "").trim();
      if (actorId) ids.add(actorId);
      const lastReplyActorId = String(bundle.root.last_reply_actor_user_id ?? "").trim();
      if (lastReplyActorId) ids.add(lastReplyActorId);
    }
    for (const replies of Object.values(communityInteractionRepliesByRootId)) {
      for (const bundle of replies) {
        const actorId = String(bundle.reply.actor_user_id ?? "").trim();
        if (actorId) ids.add(actorId);
      }
    }
    if (canonicalSessionUserId) ids.add(canonicalSessionUserId);
    return Array.from(ids);
  }, [
    activePage,
    canonicalSessionUserId,
    communityActivityEvents,
    communityDirectoryMembers,
    communityInteractionRepliesByRootId,
    communityInteractionRoots,
    communityMessages,
  ]);

  const savedProfilesByUserId = useMemo(() => {
    if (!canonicalSessionUserId || !cloudProfile) return profilesByUserId;
    const existingDisplayProfile = profilesByUserId[canonicalSessionUserId] ?? undefined;
    const cloudHasProfileAvatar = Boolean(cloudProfile.avatar_storage_id || cloudProfile.avatar_url);
    // Merge instead of rebuilding: fields the self-profile payload doesn't
    // carry (e.g. premium_badge) keep their bulk-hydrated values.
    return {
      ...profilesByUserId,
      [canonicalSessionUserId]: mergeUserProfileEntry<UserProfile>(existingDisplayProfile, {
        user_id: canonicalSessionUserId,
        display_name: cloudProfile.display_name ?? existingDisplayProfile?.display_name ?? null,
        handle: cloudProfile.handle ?? null,
        normalized_handle: cloudProfile.normalized_handle ?? null,
        bio: cloudProfile.bio ?? existingDisplayProfile?.bio ?? null,
        social_links: cloudProfile.social_links ?? existingDisplayProfile?.social_links ?? null,
        avatar_url: cloudProfile.avatar_url ?? existingDisplayProfile?.avatar_url ?? null,
        avatar_storage_id: cloudProfile.avatar_storage_id ?? existingDisplayProfile?.avatar_storage_id ?? null,
        avatar_focus_x: cloudHasProfileAvatar
          ? cloudProfile.avatar_focus_x ?? 0.5
          : existingDisplayProfile?.avatar_focus_x ?? 0.5,
        avatar_focus_y: cloudHasProfileAvatar
          ? cloudProfile.avatar_focus_y ?? 0.5
          : existingDisplayProfile?.avatar_focus_y ?? 0.5,
        avatar_zoom: cloudHasProfileAvatar
          ? cloudProfile.avatar_zoom ?? 1
          : existingDisplayProfile?.avatar_zoom ?? 1,
        premium_badge:
          (cloudProfile as { premium_badge?: UserProfile["premium_badge"] }).premium_badge ??
          existingDisplayProfile?.premium_badge ??
          undefined,
      }),
    } satisfies Record<string, UserProfile>;
  }, [canonicalSessionUserId, cloudProfile, profilesByUserId]);

  useEffect(() => {
    if (!session || visibleCommunityProfileIds.length === 0) return;
    const hydrateVisibleProfiles = () => {
      void loadUserProfiles(visibleCommunityProfileIds, session);
      void loadSelfProfile(session);
    };
    const refreshVisibleProfiles = () => {
      void loadUserProfiles(visibleCommunityProfileIds, session, { force: true });
      void loadSelfProfile(session);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshVisibleProfiles();
      }
    };
    hydrateVisibleProfiles();
    window.addEventListener("focus", refreshVisibleProfiles);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshVisibleProfiles);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [session, loadSelfProfile, loadUserProfiles, visibleCommunityProfileIds]);

  useWebDiscoverPreloadLifecycle({
    activePage,
    isLoadingDiscover,
    lastDiscoverLoadAttemptedAt,
    loadDiscoverCommunities,
  });
  const shouldHydrateCommunityContextPanel =
    activePage === "community" &&
    communityTab === "chat";
  useWebCommunityChatPreloadLifecycle<AuthSession>({
    session: session,
    activePage,
    activeCommunityId,
    hasResolvedCommunityChat,
    loadCommunityChat,
  });

  useCommunitySettingsAccessLifecycle<AuthSession, CommunityRecord>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    activeCommunityAccess,
    communities,
    syncCommunitySettingsSelection,
    loadCommunityMemberSettings,
    loadCommunityPricing,
    setCommunityMemberMuted,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdAnnual,
  });

  const {
    activeCommunityFeedState,
    reactingPostId: communityFeedReactingPostId,
    moderatingPostId: communityFeedModeratingPostId,
    reactToPost: handleReactToCommunityFeedPost,
    hidePost: handleHideCommunityFeedPost,
    retry: retryCommunityAiFeed,
  } = useCommunityAiFeedController<AuthSession>({
    activeCommunityId,
    isAiFeedTabActive: communityTab === "ai_feed",
    viewerCacheKey: session?.user?.id ?? "anonymous",
    session: session,
    ensureSession: ensureUsableAuthSession,
  });

  const communityAttentionCommunityIds = useMemo(
    () => communities.map((community) => community.id),
    [communities],
  );
  const {
    typingPresence: communityTypingUsers,
    signalThreadTyping,
    attentionByCommunityId,
    chatDividerBoundary,
    handleChatCaughtUp,
  } = useWebCommunityAttentionModel({
    activeCommunityId,
    activePage,
    canPostMessages: canPostMessagesActiveCommunity,
    communityIds: communityAttentionCommunityIds,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    session,
    chat: {
      hasResolved: hasResolvedCommunityChat,
      inputValue: communityMessageInput,
      isUserAtBottom,
      messages: communityMessages,
    },
    interactions: {
      roots: communityInteractionRoots,
      repliesByRootId: communityInteractionRepliesByRootId,
    },
    aiFeed: {
      isLoading: activeCommunityFeedState.isLoading,
      live: activeCommunityFeedState.live,
    },
    resources: {
      isLoading: isLoadingResources,
      rows: communityResources,
    },
    events: {
      cacheKey: communityEventsCacheKey,
      hasLoadedVisibleRange: hasLoadedActiveCommunityEventsRange,
      isLoading: isLoadingCommunityEvents,
      rows: communityEvents,
    },
  });
  useCommunityAgentConfigLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    canManageMembersActiveCommunity,
    loadCommunityAgentConfig,
    communityAgentConfigLoadedCommunityIdRef,
    setCommunityAgentConfigError,
  });

  useCommunityDirectoryLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    loadCommunityDirectoryMembers,
  });

  const activeCommunityMembersJoinReviewMode = useMemo<CommunityMembersJoinReviewMode | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityMembersJoinReviewMode({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  useCommunityMembersReviewLifecycle<
    AuthSession,
    CommunityJoinRequest,
    CommunityRecord
  >({
    ...sessionArg,
    activeCommunityId,
    communities,
    canReviewJoinRequests: canReviewJoinRequestsActiveCommunity,
    activeCommunityMembersJoinReviewMode,
    shouldLoad: shouldHydrateCommunityContextPanel,
    loadCommunityJoinRequests,
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
  });

  useCommunityAdminAnalyticsLifecycle({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    canViewActiveCommunityAnalytics,
    communityAnalyticsRange,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
  });

  function resumePendingAuthIntent(): void {
    if (!session) return;
    const intent = readAuthResumeState()?.intent;
    if (!intent) return;
    clearAuthResumeState();
    routePendingAuthIntent(intent, {
      select_model: (payload) => {
        void payload;
      },
      open_workspace_draft: (payload) => {
        void payload;
        void resolveAndEnterMemberDestination({ replace: true }).then((entered) => {
          if (!entered) navigateTo("/discover", { replace: true });
        });
      },
      connect_provider: (payload) => {
        if (payload.provider === "chatgpt") {
          void providerConnectionUi.handleConnectChatgpt();
          return;
        }
        if (payload.provider === "openai") {
          openGlobalSettings("account");
          showAppToastMessage("Paste your OpenAI API key in Account settings.");
          return;
        }
        showAppToastMessage("Provider connection is not available.");
	      },
      create_community: (payload) => {
        openCreateCommunityModal(payload.draft);
      },
      redeem_purchase_claim: (payload) => {
        void redeemPurchaseClaim(payload.token);
      },
      join_public_community: (payload) => {
        void joinPublicCommunity({
          communityId: payload.community_id ?? undefined,
          communitySlug: payload.community_slug ?? undefined,
        });
      },
      redeem_pending_purchases: (payload) => {
        void redeemPendingPurchases({ navigate: payload.navigate, silentNoop: payload.silent_noop });
      },
      try_polynet_free: () => {
        void routeTryPolynetFree(session);
      },
    });
  }

  const providerConnectionUi = useWebProviderConnectionUiController<AuthSession>({
    session: session,
    getSession: () => sessionRef.current ?? session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn: (intent) => requireSignIn(intent),
    chatgptConnection,
    onConnectionsUpdated: (connections) => {
      setOpenAiConnection(connections.openai);
      setChatgptConnection(connections.chatgpt);
      void refreshAccountSetupStatus();
    },
    chatgptSecuritySettingsUrl: CHATGPT_SECURITY_SETTINGS_URL,
    getReturnToPath: () => `${window.location.pathname}${window.location.search}`,
  });
  const { applyProviderConnectionLoadError } = providerConnectionUi;

  const handleConnectCommunityAgentServeProvider = useCallback((): void => {
    void providerConnectionUi.handleConnectChatgpt();
  }, [providerConnectionUi]);

  const loadProviderConnections = useCallback(async (session: AuthSession): Promise<void> => {
    const usableSession = await ensureUsableAuthSession(session);
    if (!usableSession) return;
    setIsLoadingChatgptConnection(true);
    try {
      const result = await loadCloudProviderConnections({
        session: usableSession,
      });
      setOpenAiConnection(result.openai);
      setChatgptConnection(result.chatgpt);
      applyProviderConnectionLoadError(null);
    } catch (error) {
      const message = formatProviderConnectionErrorMessage(error, "Failed to load provider connections.");
      applyProviderConnectionLoadError(message);
    } finally {
      setIsLoadingChatgptConnection(false);
    }
  }, [applyProviderConnectionLoadError, ensureUsableAuthSession]);

  useEffect(() => {
    if (!session) {
      navStackRef.current = [];
      setChatgptConnection({
        provider: "chatgpt",
        auth_kind: "oauth_tokens",
        connected: false,
        email: null,
        account_id: null,
        access_token_expires_at: null,
        validated_at: null,
        updated_at: null,
      });
      setOpenAiConnection({
        provider: "openai",
        auth_kind: "api_key",
        connected: false,
        key_last_four: null,
        validated_at: null,
        updated_at: null,
      });
      setAccountSetupStatus(null);
      setIsLoadingAccountSetupStatus(false);
      setIsLoadingChatgptConnection(false);
      return;
    }
    void (async () => {
      const usableSession = await ensureUsableAuthSession(session);
      if (!usableSession) return;
      await Promise.all([
        loadProviderConnections(usableSession),
        refreshAccountSetupStatus(usableSession),
      ]);
    })();
  }, [session, loadProviderConnections, refreshAccountSetupStatus]);

  const {
    cancelMyPendingJoinRequest,
    joinPublicCommunity,
    loadPublicCommunity,
    startCheckoutForPlan,
  } = useWebPublicFunnelActions<
    PublicCommunityRecord,
    PublicPlanSummary,
    CommunityAccess,
    MyCommunityJoinRequest
  >({
    getSession: () => sessionRef.current,
    getCurrentPublicCommunitySlug: () => publicCommunityUi.publicCommunity?.slug ?? null,
    ensureSession: ensureUsableAuthSession,
    ...sessionArg,
    requireSignIn,
    loadCommunities,
    openCommunityWorkspace: ({ communityId, communitySlug }) => {
      enterCommunityThroughBridge({ communityId, communitySlug: communitySlug ?? null });
    },
    onJoinRequestSent: ({ communityId, communitySlug }) => {
      captureProductAnalyticsEvent("community join request sent", {
        community_id: communityId,
        community_slug: communitySlug,
        surface: "public_funnel",
      });
    },
    setIsJoiningPublicCommunity: publicCommunityUi.setIsJoiningPublicCommunity,
    setIsCancellingPublicCommunityJoinRequest: publicCommunityUi.setIsCancellingPublicCommunityJoinRequest,
    setPublicJoinError: publicCommunityUi.setPublicJoinError,
    setPublicCommunity: publicCommunityUi.setPublicCommunity,
    setPublicCommunityAccess: publicCommunityUi.setPublicCommunityAccess,
    setIsLoadingMyPublicCommunityJoinRequest: publicCommunityUi.setIsLoadingMyPublicCommunityJoinRequest,
    setMyPublicCommunityJoinRequest: publicCommunityUi.setMyPublicCommunityJoinRequest,
    setIsLoadingPublicCommunity: publicCommunityUi.setIsLoadingPublicCommunity,
    setPublicCommunityError: publicCommunityUi.setPublicCommunityError,
    setPublicCommunityPlans: publicCommunityUi.setPublicCommunityPlans,
    setCheckoutError,
    setCheckoutStatus,
    navigateToUrl: (url) => window.location.assign(url),
  });

  const { startStripeConnectOnboarding } =
    useWebAccountCommerceActions({
      getSession: () => sessionRef.current,
      ensureSession: ensureUsableAuthSession,
      requireSignIn: () => requireSignIn(),
      onConnectOnboardingStarted: ({ context, communitySlug, country }) => {
        captureProductAnalyticsEvent("stripe connect onboarding started", {
          billing_context: context,
          community_slug: communitySlug,
          country,
          surface: context === "community" ? "community_settings" : "account_settings",
        });
      },
      setAccountCommerceError,
      setIsStartingStripeConnectOnboarding,
      navigateToUrl: (url) => window.location.assign(url),
    });

  const {
    redeemPurchaseClaim,
    loadPendingPurchaseClaims,
    loadAccountCommerceStatus,
    redeemPendingPurchases,
  } = useWebCommerceClaimActions({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    openCommunityWorkspace: ({ communityId, communitySlug }) => {
      enterCommunityThroughBridge({ communityId, communitySlug: communitySlug ?? null });
    },
    loadCommunities,
    clearPendingPurchaseClaimToken,
    storePendingPurchaseClaimToken,
    setCheckoutClaimToken,
    setCheckoutStatus,
    setIsRedeemingClaim,
    setRedeemClaimError,
    setIsLoadingPendingPurchases,
    setPendingPurchasesError,
    setPendingPurchaseClaims,
    setIsRedeemingPendingPurchases,
    setPendingPurchasesSuccess,
    setIsLoadingAccountCommerce,
    setAccountCommerceError,
    setAccountCommerceStatus,
    redeemPendingPurchasesInFlightRef,
  });

  const loadBuilderPartnerProgram = useCallback(
    async (nextSession?: AuthSession | null): Promise<BuilderPartnerProgramSnapshot | null> => {
      const requestId = ++builderPartnerProgramLoadRequestIdRef.current;
      const usableSession = await ensureUsableAuthSession(nextSession ?? undefined, "builder_partner_program_load");
      if (!usableSession) {
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          setBuilderPartnerProgram(null);
        }
        return null;
      }
      setIsLoadingBuilderPartnerProgram(true);
      setBuilderPartnerProgramError(null);
      try {
        const snapshot = await loadBuilderPartnerProgramCanonical({
          session: usableSession,
        });
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          setBuilderPartnerProgram(snapshot);
        }
        return snapshot;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load Builder Partner status.";
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          if (isTransportRefreshError(error)) {
            console.warn("Builder Partner Program refresh failed:", error);
            setBuilderPartnerProgramError(null);
          } else {
            setBuilderPartnerProgramError(message);
            setBuilderPartnerProgram(null);
          }
        }
        return null;
      } finally {
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          setIsLoadingBuilderPartnerProgram(false);
        }
      }
    },
    [ensureUsableAuthSession],
  );

  const acceptBuilderPartnerTerms = useCallback(async (termsVersion: string): Promise<void> => {
    const usableSession = await ensureUsableAuthSession();
    if (!usableSession) {
      requireSignIn();
      return;
    }
    setIsAcceptingBuilderPartnerTerms(true);
    setBuilderPartnerProgramError(null);
    try {
      const snapshot = await acceptBuilderPartnerTermsCanonical({
        session: usableSession,
        termsVersion,
      });
      setBuilderPartnerProgram(snapshot);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to unlock Builder Partner Program.";
      setBuilderPartnerProgramError(message);
    } finally {
      setIsAcceptingBuilderPartnerTerms(false);
    }
  }, [ensureUsableAuthSession, requireSignIn]);

  useEffect(() => {
    void captureBuilderPartnerAttributionFromCurrentUrl({
      session,
    }).catch((error) => {
      console.warn("Failed to capture Builder Partner attribution:", error);
    });
  }, [canonicalSessionUserId, session]);

  useEffect(() => {
    if (!session) {
      setBuilderPartnerProgram(null);
      setBuilderPartnerProgramError(null);
      setIsLoadingBuilderPartnerProgram(false);
      return;
    }
    if (activeView !== "settings" || settingsGroup !== "partners") return;
    void loadBuilderPartnerProgram(session as AuthSession);
  }, [
    activeView,
    canonicalSessionUserId,
    communities.length,
    loadBuilderPartnerProgram,
    session,
    settingsGroup,
  ]);

  async function setDevAccountTier(tier: "free" | "architect"): Promise<void> {
    const session = await ensureUsableAuthSession();
    if (!session || !canUseDevTierOverride) return;
    setIsSettingDevAccountTier(true);
    setDevAccountTierError(null);
    try {
      await setDevAccountTierCanonical({
        session,
        tier,
      });
      await loadAccountCommerceStatus(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to set dev account tier.";
      setDevAccountTierError(message);
    } finally {
      setIsSettingDevAccountTier(false);
    }
  }

  const startPremiumSubscriptionCheckout = useCallback(async (): Promise<void> => {
    const session = await ensureUsableAuthSession();
    if (!session) {
      requireSignIn();
      return;
    }
    try {
      const returnUrl = buildPremiumSubscriptionReturnUrl();
      const data = await startCloudPremiumSubscriptionCheckout({
        session,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
      });
      const checkoutUrl =
        data && typeof data === "object" && typeof (data as { checkout_url?: unknown }).checkout_url === "string"
          ? String((data as { checkout_url?: unknown }).checkout_url).trim()
          : "";
      if (!checkoutUrl) throw new Error("Missing checkout_url.");
      captureProductAnalyticsEvent("premium subscription checkout started", {
        surface: "settings_billing",
      });
      window.location.assign(checkoutUrl);
    } catch (error) {
      throw new Error(formatWorkspaceBillingCheckoutError(error, { kind: "premium_subscription" }));
    }
  }, [ensureUsableAuthSession, requireSignIn]);

  const communityUi = useWebCommunityUiController<
    AuthSession,
    CommunityRecord,
    AccountCommerceStatus
  >({
    ...authenticatedSessionArg,
    communities,
    communityRoleById,
    accountCommerceStatus,
    accountCommerceError,
    isAccountSetupComplete: isAccountSetupCompleteForBuilderActions,
    communityInitials,
    loadAccountCommerceStatus,
    persistCreateCommunityIntent,
    onPrimaryUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onCreateUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onAccountSetupRequired: openProfileSetup,
    onOwnedCommunityLimitReached: () => {
      setIsFreeAccountInfoOpen(true);
    },
    onCommunityCreated: (community) => {
      setCommunities((prev) => [community, ...prev]);
      setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
      void enterJoinedCommunity({
        communityId: community.id,
        communitySlug: community.slug,
      });
    },
    readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile,
    maxCreateImageDataUrlChars: WEB_IMAGE_DATA_URL_CHAR_LIMIT,
    createUnauthenticatedErrorMessage: "Sign in to create a community.",
    bannerLoadFailureMessage: "Failed to load banner.",
  });
  const { openCreateCommunityModal } = communityUi;

  const {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
    checkoutSuccessSessionId,
    claimTokenParam,
    isPublicCommunityFunnel,
    showPublicSignIn,
    selectedPublicCommunityPlan,
    publicVisibilityLabel,
    resolvedPublicCommunity,
    canEnterPublicCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel,
  } = useWebPublicCommunityRouteController<PublicCommunityRecord, MyCommunityJoinRequest>({
    publicRoute: shellPublicRoute,
    publicCommunity: publicCommunityUi.publicCommunity,
    publicCommunityPlans: publicCommunityUi.publicCommunityPlans,
    publicCommunityAccess: publicCommunityUi.publicCommunityAccess,
    myPublicCommunityJoinRequest: publicCommunityUi.myPublicCommunityJoinRequest,
    isSignedIn: Boolean(session),
    /* Re-fire the funnel load only when signed-in status flips — not on every
       session object identity change, which re-hammered the load (and the
       expensive stats query) and blinked the right panel. */
    sessionDependency: Boolean(session),
    loadPublicCommunity,
  });
  /* Visitor lens: locked shell-nav tabs reopen the join gate on the funnel
     surface (nonce bump crosses the shell/surface boundary). */
  const [visitorGateNonce, setVisitorGateNonce] = useState(0);
  const pendingPurchaseBannerKey = pendingPurchaseClaims
    .map((claim) => claim.community_id)
    .sort()
    .join("|");

  useEffect(() => {
    setIsPendingPurchasesBannerDismissed(false);
  }, [pendingPurchaseBannerKey]);

  useWebJoinedCommunityRouteResolution<AuthSession, CommunityRecord, CommunityAccess>({
    publicRouteKind: shellPublicRoute.kind,
    activePage,
    activeCommunitySlug: selectedActiveCommunitySlug,
    communities,
    session: session,
    isAuthBootstrapComplete,
    ensureSession: ensureUsableAuthSession,
    loadCommunities,
    syncCommunitySelection,
    navigateTo,
  });

  useWebPostAuthBillingLifecycle({
    session: session,
    sessionRef,
    claimTokenParam,
    isRedeemingClaim,
    isJoiningPublicCommunity: publicCommunityUi.isJoiningPublicCommunity,
    lastAutoRedeemPendingPurchasesUserIdRef,
    autoRedeemPendingPurchasesAttemptRef,
    autoRedeemPendingPurchasesTimeoutRef,
    setAccountCommerceStatus,
    setAccountCommerceError,
    setIsLoadingAccountCommerce,
    getAuthUid: getAuthUid,
    redeemPurchaseClaim,
    redeemPendingPurchases,
    loadPendingPurchaseClaims,
    loadAccountCommerceStatus,
    joinPublicCommunity,
  });

  useWebPostAuthStripeConnectLifecycle({
    session,
    stripeConnectReturn,
    clearStripeConnectReturn: () => setStripeConnectReturn(null),
    setAccountCommerceError,
    loadAccountCommerceStatus,
    startStripeConnectOnboarding,
  });

  const { retryCheckoutFinalize } = useCheckoutFinalizeController({
    checkoutSuccessSessionId,
    getSession: () => sessionRef.current,
    redeemPurchaseClaim,
    persistClaimToken: storePendingPurchaseClaimToken,
    setCheckoutStatus,
    setCheckoutError,
      setCheckoutClaimToken,
      setRedeemClaimError,
  });

  useEffect(() => {
    if (claimTokenParam) scrubCurrentRouteSearchParams(["token"]);
    if (checkoutSuccessSessionId) scrubCurrentRouteSearchParams(["session_id"]);
  }, [checkoutSuccessSessionId, claimTokenParam]);

  const hasPendingChatgptAuth = providerConnectionUi.hasPendingChatgptAuth;
  const {
    handleSettingsBannerDrop,
    handleSettingsAvatarDrop,
    handleCommunityAvatarUpload,
    handleCommunityBannerUpload,
    handleProfileAvatarUpload,
    handleProfileAvatarDrop,
  } = useWebSettingsImageUploadController({
    setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver: profileUi.setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusY,
    setCommunitySettingsAvatarZoom,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom,
    setCommunitySettingsError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty,
    onCommunityAvatarUploadSuccess: () => setIsCommunityAvatarFocusModalOpen(true),
    onCommunityBannerUploadSuccess: () => setIsCommunityBannerFocusModalOpen(true),
    isLikelyImageFile,
    maxWebImageDataUrlChars: WEB_IMAGE_DATA_URL_CHAR_LIMIT,
    setProfileAvatarUrl: profileUi.setProfileAvatarUrl,
    setProfileAvatarStorageId: profileUi.setProfileAvatarStorageId,
    setProfileAvatarFocusX: profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: profileUi.setProfileAvatarZoom,
    setAuthError,
    onProfileAvatarUploadSuccess: () => profileUi.setIsProfileAvatarFocusModalOpen(true),
  });
  const accountSetupSurface = useWebAccountSetupSurfaceController<AuthSession>({
    session,
    getSession: () => sessionRef.current ?? session,
    profile: profileUi,
    chatgptConnection,
    openAiConnection,
    isLoadingProviderConnections: isLoadingChatgptConnection,
    provider: providerConnectionUi,
    isSaving: isSavingOnboarding,
    error: onboardingError,
    onAvatarUpload: handleProfileAvatarUpload,
  });

  const canUseDevTierOverride = useMemo(
    () =>
      canUseCreatorDevTierOverride({
        email: session?.user?.email ?? null,
        isDev: import.meta.env.DEV,
        featureFlag: import.meta.env.VITE_ENABLE_DEV_TIER_OVERRIDE,
      }),
    [session?.user?.email],
  );
  const userAccessPolicy = useMemo(
    () =>
      resolveUserAccessPolicy({
        surface: "web",
        authState: session ? "authenticated" : "anonymous",
        accountTier: accountCommerceStatus?.account_tier ?? null,
        userEmail: session?.user?.email ?? null,
      }),
    [session, accountCommerceStatus?.account_tier],
  );

  const activeCommunityFunnelAction = useMemo<CommunityFunnelAction | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityFunnelAction({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  const {
    communityVoiceIntent,
    communityVoiceUiState,
    memberAgentVoiceIntent,
    memberAgentVoiceUiState,
    handleVoiceInputClick,
    finishVoiceInputForSubmit,
    cancelVoiceInput,
  } = useWebVoiceInputController<AuthSession>({
    ...authenticatedSessionArg,
    sessionRef: sessionRef,
    activeCommunity,
    activeCommunityFunnelAction,
    canPostMessagesActiveCommunity,
    requireSignIn: () => requireSignIn(),
    showAppToastMessage,
    resolveCommunityTranscriptTarget: () => communityVoiceTranscriptTargetRef.current,
    setCommunityMessageInput,
    chatInputRef,
    appendMemberAgentTranscript: (transcript) =>
      memberAgentComposerApiRef.current?.appendTranscript(transcript),
    focusMemberAgentInput: () => memberAgentComposerApiRef.current?.focusInput(),
  });

  const handleCommunityVoiceInputClick = useCallback((
    target: CommunityVoiceTranscriptTarget | null,
    owner: CommunityVoiceButtonOwner,
  ) => {
    if (!isProfileSetupCompleteForPublicActions) {
      openProfileSetup();
      return;
    }
    const activeOwner =
      communityVoiceUiState === "idle" ? null : communityVoiceButtonOwner ?? "main";
    if (activeOwner !== null && activeOwner !== owner) {
      showAppToastMessage("Finish the current voice capture first.");
      return;
    }
    if (communityVoiceUiState === "idle") {
      communityVoiceTranscriptTargetRef.current = target;
      setCommunityVoiceButtonOwner(owner);
    }
    void handleVoiceInputClick("community");
  }, [
    communityVoiceButtonOwner,
    communityVoiceUiState,
    handleVoiceInputClick,
    isProfileSetupCompleteForPublicActions,
    openProfileSetup,
    showAppToastMessage,
  ]);

  useEffect(() => {
    if (communityVoiceUiState !== "idle") return;
    communityVoiceTranscriptTargetRef.current = null;
    setCommunityVoiceButtonOwner(null);
  }, [communityVoiceUiState]);

  const activeCommunityVoiceButtonOwner: CommunityVoiceButtonOwner | null =
    communityVoiceUiState === "idle" ? null : communityVoiceButtonOwner ?? "main";
  const communityVoiceButtonTitle = isProfileSetupCompleteForPublicActions
    ? communityVoiceIntent.title
    : "Finish your profile to use voice input in community chat.";
  const mainCommunityVoiceButtonState =
    activeCommunityVoiceButtonOwner === null || activeCommunityVoiceButtonOwner === "main"
      ? communityVoiceUiState
      : "idle";
  const drawerCommunityVoiceButtonState =
    activeCommunityVoiceButtonOwner === "drawer" ? communityVoiceUiState : "idle";

	  const displayName = useCallback(
	    (userId: string): string => {
	      const remote = savedProfilesByUserId[userId];
	      const remoteName = remote?.display_name?.trim();
	      if (remoteName) return remoteName;
	      if (canonicalSessionUserId && userId === canonicalSessionUserId) {
          const sessionDisplayName = String(session?.user?.displayName ?? "").trim();
          if (sessionDisplayName) return sessionDisplayName;
	      }
	      return shortId(
          userId,
          canonicalSessionUserId ?? undefined,
          session?.user?.email ?? undefined,
        );
	    },
	    [canonicalSessionUserId, session?.user?.displayName, session?.user?.email, savedProfilesByUserId]
	  );

  const hasSelectedCommunity = Boolean(String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim());
  const shellProjection = buildWebShellProjection({
    publicRouteKind: shellPublicRoute.kind,
    shellVariant,
    activePage,
    mobileSettingsView,
    isPublicCommunityFunnel,
  });
  const {
    isGlobalSettings,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobileShell,
    showMobileSettingsIndex,
    showMobilePublicFunnel,
    showDesktopCommunityRail,
    showDesktopCommunityNav,
    hasLeftPanel,
    mobileShellMode,
  } = shellProjection;
  const mobileThreadPageOpen = Boolean(
    showMobileShell
    && mobileRootPage === "community"
    && selectedCommunityInteractionRootId,
  );
  const mobileChromeAutoHideEnabled = Boolean(
    showMobileAppShell
    && shellPublicRoute.kind === "app"
    && activePage === "community"
    && communityTab === "chat"
    && mobileRootPage === "community"
    && !mobileThreadPageOpen
  );
  const mobileChromeScrollTrackingEnabled = Boolean(
    mobileChromeAutoHideEnabled
    && !mobileOverlay
  );
  useEffect(() => {
    if (mobileChromeAutoHideEnabled && !mobileOverlay) return;
    setMobileChromeReadingMode(false);
  }, [mobileChromeAutoHideEnabled, mobileOverlay]);
  const mobileChromeReadingModeActive = Boolean(
    mobileChromeScrollTrackingEnabled
    && mobileChromeReadingMode
  );
  const canReorderCommunities = railCommunities.length > 1;
  const hasCommunityRailMiddleContent = railCommunities.length > 0;
  const communityRailIds = useMemo(() => railCommunities.map((community) => community.id), [railCommunities]);
  const { setContainerElement: setCommunityRailListElement, getItemBindings: getCommunityRailItemBindings, draggingId: draggingCommunityId } =
    useRailPointerReorder({
      itemIds: communityRailIds,
      enabled: canReorderCommunities,
      onMoveToIndex: handleReorderCommunityRail,
    });
  const funnelPreviewVisibility = toCanonicalCommunityVisibility(activeCommunity?.visibility, "unlisted");
  const funnelPreviewVisibilityLabel = formatCommunityVisibilityLabel(funnelPreviewVisibility);
  const funnelPreviewAction = deriveCommunityFunnelAction({
    entry_policy: activeCommunity?.entry_policy,
  });
  const activeCommunitySocialMemberCount = activeCommunity && typeof communitySocialSummary.memberCount === "number"
    ? communitySocialSummary.memberCount
    : null;
  /* Save-then-preview: the Preview button is only shown in the saved state,
     so it simply opens the LIVE visitor route for the owner. previewMode
     forces the visitor lens + disables Join; no draft snapshot is carried. */
  const handlePreviewCommunityFunnel = useCallback(() => {
    const slug = String(activeCommunity?.slug ?? "").trim();
    if (!slug) return;
    const previewPath = applyShellVariantToPublicPath(buildCommunityFunnelPreviewPath(slug) ?? "", shellVariant);
    if (!previewPath) return;
    pushNavSnapshot();
    navigateTo(previewPath);
  }, [activeCommunity?.slug, shellVariant, pushNavSnapshot, navigateTo]);

  useEffect(() => {
    const telemetryPathname = buildCurrentTelemetryPathname();
    updateSentryUiContext({
      authState: session ? "authenticated" : "anonymous",
      userId: canonicalSessionUserId,
      accountTier: accountCommerceStatus?.account_tier ?? null,
      pathname: telemetryPathname,
      publicRouteKind: publicRoute.kind,
      activePage,
      activeView,
      communityId: activeCommunityId,
      communitySlug: activeCommunitySlug,
    });
    updatePosthogUiContext({
      authState: session ? "authenticated" : "anonymous",
      userId: canonicalSessionUserId,
      accountTier: accountCommerceStatus?.account_tier ?? null,
      pathname: telemetryPathname,
      publicRouteKind: publicRoute.kind,
      activePage,
      activeView,
      communityId: activeCommunityId,
      communitySlug: activeCommunitySlug,
    });
  }, [
    activeCommunityId,
    activeCommunitySlug,
    activePage,
    activeView,
    accountCommerceStatus?.account_tier,
    canonicalSessionUserId,
    publicRoute.kind,
    session,
  ]);

  useEffect(() => {
    if (!canonicalSessionUserId) {
      lastTrackedAuthSessionUserIdRef.current = null;
      return;
    }
    if (lastTrackedAuthSessionUserIdRef.current === canonicalSessionUserId) return;
    lastTrackedAuthSessionUserIdRef.current = canonicalSessionUserId;
    captureProductAnalyticsEvent("auth session established", {
      surface: publicRoute.kind === "app" ? activePage : publicRoute.kind,
    });
  }, [activePage, canonicalSessionUserId, publicRoute.kind]);

  const pendingToken =
    (checkoutClaimToken ?? (publicRoute.kind === "claim" ? publicRoute.token : "")).trim() ||
    readPendingPurchaseClaimToken();
  const handlePublicLandingPrimaryAction = () => {
    if (isPublicFunnelPreviewRoute) return;
    if (!publicCommunityUi.publicCommunity) return;
    if (canEnterPublicCommunity && publicCommunityUi.publicCommunityAccess?.community_id) {
      enterCommunityThroughBridge({
        communityId: publicCommunityUi.publicCommunityAccess.community_id,
        communitySlug: publicCommunityUi.publicCommunity.slug ?? null,
      });
      return;
    }
    /* A completed-but-unredeemed purchase must redeem, never re-checkout —
       otherwise the paid-return window can charge twice. */
    const unredeemedClaimToken = readPendingPurchaseClaimToken();
    if (unredeemedClaimToken) {
      void redeemPurchaseClaim(unredeemedClaimToken);
      return;
    }
    if (canJoinWithCheckout && selectedPublicCommunityPlan) {
      const communityFunnelPath = applyShellVariantToPublicPath(
        buildCommunityFunnelPath(publicCommunityUi.publicCommunity.slug) ?? `/c/${encodeURIComponent(publicCommunityUi.publicCommunity.slug)}`,
        shellVariant,
      );
      void startCheckoutForPlan(
        publicCommunityUi.publicCommunity.slug,
        selectedPublicCommunityPlan.billing_period,
        communityFunnelPath,
      );
      return;
    }
    if (!canJoinForFree && !canJoinWithApproval) return;
    void joinPublicCommunity({ communitySlug: publicCommunityUi.publicCommunity.slug });
  };

  const handlePublicCheckoutContinue = () => {
    if (!pendingToken) return;
    if (showPublicSignIn) {
      requireSignIn({ reason: "redeem_purchase_claim", payload: { token: pendingToken } });
      return;
    }
    void redeemPurchaseClaim(pendingToken);
  };

  const handlePublicClaimContinue = () => {
    const token = (pendingToken || manualClaimToken).trim();
    if (!token) return;
    void redeemPurchaseClaim(token);
  };
  const handleCancelPendingPublicJoinRequest = () => {
    const slug = publicCommunityUi.publicCommunity?.slug ?? publicFunnelSlug ?? "";
    if (!slug || !approvalPending) return;
    void cancelMyPendingJoinRequest(slug);
  };
  const hasAuthenticatedAppShellPresentation =
    shellPublicRoute.kind === "app" && authPresentationState !== "signed_out";
  const isAuthRecoveringSignedInAppShell =
    shellPublicRoute.kind === "app" && authPresentationState === "recovering_signed_in";
  const shouldHoldLandingForAuth =
    shellPublicRoute.kind === "app" &&
    activePage === "landing" &&
    typeof window !== "undefined" &&
    (isLegacyWorkspaceRoutePath(window.location.pathname || "/") ||
      (authPresentationState !== "signed_out" &&
        isRootAppRoutePath(window.location.pathname || "/")));
  const isAccountGraphHydratingCriticalAppShell =
    shellPublicRoute.kind === "app" &&
    authPresentationState === "signed_in" &&
    accountGraphHydrationPhase === "critical";

	  const handleTopbarBackFromSettings = () => {
	    handleTopbarBackToCommunity();
	  };
	  const handleTopbarBackFromPublicFunnel = () => {
	    void goBack();
	  };
	  function handleTopbarBackToCommunity() {
	    if (goBack()) return;
	    const communitySlug = String(
	      selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "",
	    ).trim();
	    if (communitySlug) {
	      openCommunityChat(communitySlug, { clearUnread: true });
	      return;
	    }
	    if (session) {
	      void resolveAndEnterMemberDestination({ session, replace: true }).then((entered) => {
	        if (!entered) navigateTo("/discover", { replace: true });
	      });
	      return;
	    }
	    navigateTo("/discover", { replace: true });
	  }
		  const handleOpenLandingCommunity = () => {
		    const communitySlug = String(activeCommunity?.slug ?? "").trim();
		    if (!communitySlug) return;
		    openCommunityChat(communitySlug, { clearUnread: true });
		  };
		  const handleOpenDiscover = () => {
		    const transition = deriveOpenDiscoverTransition({ activePage });
		    if (transition.shouldPushSnapshot) pushNavSnapshot();
		    setActiveView(transition.nextView);
		    setActivePage(transition.nextPage);
		  };
    const applyCommunityAboutResult = (result: CloudCommunityAboutSaveResult) => {
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === result.community_id
            ? {
                ...community,
                about: result.about,
                updated_at: result.updated_at,
              }
            : community,
        ),
      );
    };
    const {
      handleSelectMobileRootPage,
      openMobileAgentSettings,
      handleExitMobileSettings,
      openMobileCreateCommunity,
      openMobileDrawer,
    } = useWebMobileShellController({
      activeCommunitySlug: String(activeCommunity?.slug ?? "").trim() || null,
      selectedActiveCommunitySlug,
      mobileRootPage,
      hasSelectedCommunity,
      canViewMembers:
        (hasSelectedCommunity && canViewMembersActiveCommunity) ||
        ((shellPublicRoute.kind === "community_funnel" ||
          shellPublicRoute.kind === "community_funnel_preview") &&
          Boolean(resolvedPublicCommunity)),
      forceCommunityRoot:
        showMobileShell &&
        (shellPublicRoute.kind === "community_funnel" ||
          shellPublicRoute.kind === "community_funnel_preview"),
      mobileOverlay,
      showMobileShell,
      showMobileSettingsShell,
      canOpenDirectMessages: Boolean(session),
      isDirectMessagesOpen,
      isThreadPageOpen: mobileThreadPageOpen,
      setMobileOverlay,
      setMobileRootPage,
      setMobileSettingsView,
      openGlobalSettings,
      openCommunityChat,
      handleOpenDiscover,
      openDirectMessages: handleOpenDirectMessages,
      closeDirectMessages: handleCloseDirectMessages,
      closeThreadPage: handleCloseCommunityInteractionDrawer,
      hasCommunityCreateAccess: Number(accountCommerceStatus?.max_communities ?? 0) > 0,
      openCommunityCreateFlow: openCreateCommunityModal,
      setIsFreeAccountInfoOpen,
    });
    useEffect(() => {
      if (shellPublicRoute.kind !== "app") return;
      if (activePage !== "community") return;
      if (hasSelectedCommunity) return;
      navigateTo("/discover", { replace: true });
    }, [activePage, hasSelectedCommunity, shellPublicRoute.kind]);
  const handleSelectActiveCommunity = useCallback((community: CommunityRecord): boolean => {
    if (
      !confirmDiscardUnsavedCommunitySettingsWeb({
        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
        isCommunityAgentConfigDirty: communityAgentConfigDirtyRef.current,
        activeCommunityId: selectedActiveCommunityId,
        nextCommunityId: community.id,
        confirmDiscard: (message) => window.confirm(message),
      })
    ) {
      return false;
    }
    syncCommunitySelection({
      communitySlug: (community.slug ?? "").trim() || null,
      communityId: community.id,
    });
    return true;
  }, [
    selectedActiveCommunityId,
    syncCommunitySelection,
  ]);

  const handleSelectCommunitySettingsPane = useCallback((pane: CommunitySettingsPane, opts?: { replace?: boolean }) => {
    setCommunitySettingsPane(pane);
    const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
    if (!nextCommunitySlug) return;
    const settingsPath = buildCommunityTabPath(nextCommunitySlug, "settings", null, pane);
    if (!settingsPath) return;
    navigateTo(settingsPath, opts?.replace ? { replace: true } : {});
  }, [activeCommunity?.slug, navigateTo, selectedActiveCommunitySlug]);

  const isCommunityOnboardingPreviewMode =
    publicRoute.kind === "app" &&
    activePage === "community" &&
    communityExperienceMode === "onboarding_preview";
  const handlePreviewCommunityOnboarding = useCallback(() => {
    const slug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
    const path = buildCommunityOnboardingPreviewPath(slug);
    if (path) navigateTo(path);
  }, [activeCommunity?.slug, navigateTo, selectedActiveCommunitySlug]);
  const handleExitCommunityOnboardingPreview = useCallback(() => {
    const slug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
    const path = buildCommunityTabPath(slug, "settings", null, "workflows");
    if (path) navigateTo(path, { replace: true });
  }, [activeCommunity?.slug, navigateTo, selectedActiveCommunitySlug]);

  const isCommunityFunnelAboutDirty =
    Boolean(activeCommunity) && communitySettingsAbout !== (activeCommunity?.about ?? "");

  const hasCommunitySettingsDirtyOutsideFunnelAbout = useCallback(() => {
    if (!activeCommunity) return false;
    const numberChanged = (left: number, right: number) => Math.abs(left - right) >= 0.0001;
    return (
      communityPricingDirtyRef.current ||
      communitySettingsName !== (activeCommunity.name ?? "") ||
      communitySettingsSlug !== slugifyCommunityName(activeCommunity.slug ?? "") ||
      communitySettingsOneLiner !== (activeCommunity.one_liner ?? "") ||
      communitySettingsVisibility !== toCanonicalCommunityVisibility(activeCommunity.visibility, "unlisted") ||
      communitySettingsAvatarUrl !== (activeCommunity.avatar_url ?? null) ||
      numberChanged(communitySettingsAvatarFocusX, activeCommunity.avatar_focus_x ?? 0.5) ||
      numberChanged(communitySettingsAvatarFocusY, activeCommunity.avatar_focus_y ?? 0.5) ||
      numberChanged(communitySettingsAvatarZoom, activeCommunity.avatar_zoom ?? 1) ||
      communitySettingsBannerUrl !== (activeCommunity.banner_url ?? null) ||
      numberChanged(communitySettingsBannerFocusX, activeCommunity.banner_focus_x ?? 0.5) ||
      numberChanged(communitySettingsBannerFocusY, activeCommunity.banner_focus_y ?? 0.5) ||
      numberChanged(communitySettingsBannerZoom, activeCommunity.banner_zoom ?? 1)
    );
  }, [
    activeCommunity,
    communitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    communitySettingsAvatarUrl,
    communitySettingsAvatarZoom,
    communitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    communitySettingsBannerUrl,
    communitySettingsBannerZoom,
    communitySettingsName,
    communitySettingsOneLiner,
    communitySettingsSlug,
    communitySettingsVisibility,
    slugifyCommunityName,
  ]);

  const handleResetCommunityFunnelAbout = useCallback(() => {
    setCommunitySettingsAbout(activeCommunity?.about ?? "");
    setCommunitySettingsError(null);
    communitySettingsDirtyRef.current = hasCommunitySettingsDirtyOutsideFunnelAbout();
  }, [
    activeCommunity?.about,
    hasCommunitySettingsDirtyOutsideFunnelAbout,
    setCommunitySettingsAbout,
    setCommunitySettingsError,
  ]);

  const handleSaveCommunityFunnelAbout = useCallback(async (): Promise<boolean> => {
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession || !activeCommunity) {
      setCommunitySettingsError("Sign in and select a community before saving funnel text.");
      return false;
    }
    setCommunitySettingsError(null);
    setIsSavingCommunitySettings(true);
    try {
      const result = await saveCloudCommunityAbout({
        session: activeSession,
        communityId: activeCommunity.id,
        about: communitySettingsAbout.trim() || null,
      });
      if (!result) throw new Error("Failed to save funnel text.");
      applyCommunityAboutResult(result);
      communitySettingsDirtyRef.current = hasCommunitySettingsDirtyOutsideFunnelAbout();
      return true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save funnel text.";
      setCommunitySettingsError(message);
      return false;
    } finally {
      setIsSavingCommunitySettings(false);
    }
  }, [
    activeCommunity,
    applyCommunityAboutResult,
    communitySettingsAbout,
    ensureUsableAuthSession,
    hasCommunitySettingsDirtyOutsideFunnelAbout,
    setCommunitySettingsError,
    setIsSavingCommunitySettings,
  ]);

  const communityContextJoinRequests = useMemo(
    () =>
      communityJoinRequests
        .filter((request) => String(request.status ?? "").trim().toLowerCase() === "pending")
        .map((request) => {
          const profile = savedProfilesByUserId[request.user_id] ?? null;
          return {
            id: request.id,
            userId: request.user_id,
            displayName: profile?.display_name ?? displayName(request.user_id),
            avatarUrl: profile?.avatar_url ?? null,
            avatarFocusX: profile?.avatar_focus_x ?? null,
            avatarFocusY: profile?.avatar_focus_y ?? null,
            avatarZoom: profile?.avatar_zoom ?? null,
            message: (request.message ?? "").trim() || null,
            createdAtLabel: formatRelativeTime(request.created_at),
          };
        }),
    [communityJoinRequests, displayName, savedProfilesByUserId],
  );

  const { communityChatPanelProps, communitySecondarySurfaceProps } =
    buildWebCommunitySurfaceProjection({
      activePage,
      communityTab,
      activeCommunity,
      session: session,
      ensureSession: ensureUsableAuthSession,
      selectedActiveCommunitySlug,
      hasAuthenticatedPresentation: hasAuthenticatedAppShellPresentation,
      isAuthRecoveringSignedIn: isAuthRecoveringSignedInAppShell,
      hasSession: Boolean(session),
      onOpenDirectMessageFromCommunity: handleOpenDirectMessageFromCommunity,
      hasResolvedCommunities,
      isLoadingCommunities,
      sessionUserId: canonicalSessionUserId,
      communityMemberCount: communityDirectoryMemberCount ?? activeCommunitySocialMemberCount,
      canViewActiveCommunitySettings,
      communitySettingsLayer,
      communitySettingsPane,
      onSelectCommunitySettingsPane: handleSelectCommunitySettingsPane,
      onPreviewCommunityOnboarding: handlePreviewCommunityOnboarding,
      canManageCommunitySettings,
      requireSignIn,
      accountCommerceStatus,
      accountCommerceError,
      startStripeConnectOnboarding,
      isStartingStripeConnectOnboarding,
      settingsState: {
        isSettingsBannerDragOver,
        isProcessingCommunitySettingsBanner,
        isCommunityAvatarFocusModalOpen,
        isCommunityBannerFocusModalOpen,
        communitySettingsAvatarFocusX,
        communitySettingsAvatarFocusY,
        communitySettingsAvatarZoom,
        communitySettingsBannerUrl,
        communitySettingsBannerFocusX,
        communitySettingsBannerFocusY,
        communitySettingsBannerZoom,
        communitySettingsBannerUploadError,
        isSettingsAvatarDragOver,
        communitySettingsAvatarUrl,
        communitySettingsName,
        communitySettingsSlug,
        communitySettingsOneLiner,
        communitySettingsAbout,
        communitySettingsVisibility,
        communitySettingsPricingMode,
        communitySettingsPriceUsdMonthly,
        communitySettingsPriceUsdAnnual,
        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
        communitySettingsError,
        isSavingCommunitySettings,
        communityMemberMuted,
        isLoadingCommunityMemberSettings,
        isLeavingCommunity,
        communityMemberSettingsError,
      },
      settingsActions: {
        setIsSettingsBannerDragOver,
        handleSettingsBannerDrop,
        handleCommunityBannerUpload,
        setCommunitySettingsBannerUrl,
        setCommunitySettingsBannerFocusX,
        setCommunitySettingsBannerFocusY,
        setCommunitySettingsBannerZoom,
        setCommunitySettingsBannerUploadError,
        markCommunitySettingsDirty,
        setIsSettingsAvatarDragOver,
        handleSettingsAvatarDrop,
        handleCommunityAvatarUpload,
        setCommunitySettingsAvatarUrl,
        setCommunitySettingsAvatarFocusX,
        setCommunitySettingsAvatarFocusY,
        setCommunitySettingsAvatarZoom,
        setCommunitySettingsName,
        setCommunitySettingsSlug,
        setCommunitySettingsOneLiner,
        setCommunitySettingsAbout,
        setCommunitySettingsVisibility,
        setCommunitySettingsPricingMode,
        setCommunitySettingsPriceUsdMonthly,
        setCommunitySettingsPriceUsdAnnual,
        communityPricingDirtyRef,
        handleSaveCommunitySettings,
        handleToggleCommunityMute,
        handleLeaveCommunity,
      },
      setIsCommunityAvatarFocusModalOpen,
      setIsCommunityBannerFocusModalOpen,
      communitySettingsAvatarUrl,
      communitySettingsAvatarFocusX,
      communitySettingsAvatarFocusY,
      communitySettingsAvatarZoom,
      communitySettingsBannerUrl,
      communitySettingsBannerFocusX,
      communitySettingsBannerFocusY,
      communitySettingsBannerZoom,
      markCommunitySettingsDirty,
      feedState: {
        livePosts: activeCommunityFeedState.live,
        rankedPosts: activeCommunityFeedState.ranked,
        isLoading: activeCommunityFeedState.isLoading,
        error: activeCommunityFeedState.error,
        reactingPostId: communityFeedReactingPostId,
        moderatingPostId: communityFeedModeratingPostId,
      },
      feedActions: {
        react: handleReactToCommunityFeedPost,
        hidePost: handleHideCommunityFeedPost,
        retry: retryCommunityAiFeed,
      },
      polynetState: communityPolynetController.state,
      polynetActions: communityPolynetController.actions,
      canViewActiveCommunityPolynet,
      onBackToCommunityChat: () => {
        const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
        if (nextCommunitySlug) {
          openCommunityChat(nextCommunitySlug, { clearUnread: true, pushSnapshot: false });
        }
      },
      aiAgentHasSession: Boolean(session),
      canManageMembersActiveCommunity,
      aiAgentPreferredTab: communityAiAgentPreferredTab,
      isLoadingCommunityAgentConfig,
      communityAgentConfigError,
      aiAgentInstructionsEditorProps: {
        communityAgentConfigDirtyRef,
        handleSaveCommunityAgentConfig,
        handleResetCommunityAgentConfig,
        isSavingCommunityAgentConfig,
        communityAgentConfigSaveError,
        communityAgentConfigCommunitySystemPrompt,
        setCommunityAgentConfigCommunitySystemPrompt,
        markCommunityAgentConfigDirty,
      },
      aiAgentSkillsEditorProps: {
        intro: "Attach reusable skill packages here so this community lens can load behavior units on demand without bloating the base prompt.",
        emptyState: "Attach the first skill package to this community. Attached skills become available when members explicitly mention them in this lens.",
        addButtonLabel: "Create skill",
        platformSkills: skillsModel.communityPlatformSkills,
        skills: communitySkillAttachments,
        packages: ownedSkillPackages,
        isLoading: isLoadingCommunitySkillAttachments,
        isLoadingPackages: isLoadingOwnedSkillPackages,
        error: communitySkillAttachmentError,
        packagesError: ownedSkillPackagesError,
        mutationError: communitySkillMutationError,
        isCreatingSkill: isCreatingSkill,
        attachingPackageId: attachingSkillPackageId,
        updatingSkillId: updatingCommunitySkillAttachmentId,
        removingSkillId: removingCommunitySkillAttachmentId,
        onCreateSkill: handleCreateCommunitySkill,
        onAttachPackage: handleAttachSkillPackageToCommunity,
        onUpdateSkill: handleUpdateCommunitySkillAttachment,
        onDetachSkill: handleDetachCommunitySkill,
      },
      isLoadingCommunityFunnel,
      communityFunnelError,
      funnelEditorProps: {
        communityFunnelDirtyRef,
        handleSaveCommunityFunnel,
        handleResetCommunityFunnel,
        handlePreviewCommunityFunnel,
        isSavingCommunityFunnel,
        communityFunnelSaveError,
        communityFunnelConfig,
        setCommunityFunnelConfig,
        markCommunityFunnelDirty,
        funnelOneLiner: communitySettingsOneLiner,
        funnelAbout: communitySettingsAbout,
        setFunnelAbout: setCommunitySettingsAbout,
        isFunnelAboutDirty: isCommunityFunnelAboutDirty,
        markCommunitySettingsDirty,
        handleSaveCommunityFunnelAbout,
        handleResetCommunityFunnelAbout,
        isSavingCommunitySettings,
        communitySettingsError,
        previewCommunity: {
          slug: activeCommunity?.slug ?? null,
          name: activeCommunity?.name ?? "Community",
          one_liner: communitySettingsOneLiner || null,
          about: communitySettingsAbout || null,
          avatar_url: activeCommunity?.avatar_url ?? null,
          avatar_focus_x: activeCommunity?.avatar_focus_x ?? null,
          avatar_focus_y: activeCommunity?.avatar_focus_y ?? null,
          avatar_zoom: activeCommunity?.avatar_zoom ?? null,
          banner_url: activeCommunity?.banner_url ?? null,
          banner_focus_x: activeCommunity?.banner_focus_x ?? null,
          banner_focus_y: activeCommunity?.banner_focus_y ?? null,
          banner_zoom: activeCommunity?.banner_zoom ?? null,
          visibility: activeCommunity?.visibility ?? "unlisted",
          admin_count: funnelPreviewAdminCount,
          online_count: funnelPreviewOnlineCount,
          online_faces: funnelPreviewOnlineFaces,
        },
        previewVisibilityLabel: funnelPreviewVisibilityLabel,
        previewMemberCount: activeCommunitySocialMemberCount,
        previewFunnelAction: funnelPreviewAction,
      },
      canViewActiveCommunityAnalytics,
      canViewPlatformAnalytics: hasOperatorAccess,
      analyticsState: {
        communityAnalyticsRange,
        isLoadingCommunityAnalytics,
        communityAnalyticsError,
        communityAnalyticsSummary,
        communityAnalyticsSeries,
      },
      analyticsActions: {
        setCommunityAnalyticsRange,
        openPlatformAnalytics: () => openOperatorConsole("platform"),
      },
      resourcesState: {
        isLoadingResources,
        isLoadingResourceModules,
        modules: communityResourceModules,
        resources: communityResources,
        selectedModuleId: communityResourceModuleId,
        openResourceEmbedId,
      },
      resourcesActions: {
        setOpenResourceEmbedId,
        handleSelectModule: setCommunityResourceModuleId,
        openNewModuleModal,
        handleEditModule,
        handleSetModuleStatus,
        handleDeleteModule,
        handleReorderModules,
        handleReorderResources,
        handleMoveResourceToModule,
        openNewResourceModal,
        openNewSourceModal,
        resourceEditor,
        handleDeleteResource,
        handleCreatePageDraftFromSource,
        handleCreateBlankPageDraft,
        reloadResources: async () => {
          const usableSession = await ensureUsableAuthSession();
          if (!usableSession || !activeCommunityId) return;
          await loadCommunityResources(activeCommunityId, usableSession);
        },
      },
      eventsState: {
        events: communityEvents,
        isLoadingEvents: isLoadingCommunityEvents,
        eventsError: communityEventsError,
        visibleMonthIso: communityEventsVisibleMonthIso,
      },
      eventsActions: {
        setVisibleMonthIso: setCommunityEventsVisibleMonthIso,
        getVisibleRange: getWebCommunityEventsMonthRange,
        reloadEvents: async (range) => {
          const usableSession = await ensureUsableAuthSession();
          if (!usableSession || !activeCommunityId) return;
          await loadCommunityEvents(activeCommunityId, usableSession, range);
        },
        saveEvent: handleSaveCommunityEvent,
        cancelEvent: handleCancelCommunityEvent,
      },
      canManageResourcesActiveCommunity,
      canModerateContentActiveCommunity,
      resourceModuleModalProps,
      resourceModuleDeleteModalProps,
      resourceModalProps,
      canPostMessagesActiveCommunity,
      isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
      isLoadingChat,
      hasResolvedCommunityChat,
      isLoadingMoreChat,
      communityChatHasMore,
      communityMessages,
      communityActivityEvents,
      communityMessageById,
      messageReactions,
      typingPresence: communityTypingUsers,
      onThreadTypingSignal: signalThreadTyping,
      profilesByUserId: savedProfilesByUserId,
      mentionableCommunityMembers: communityDirectoryMembers,
      editingMessageId,
      editingMessageText,
      reactionPickerMessageId,
      replyingToMessage,
      communityAttachments,
      communityMessageInput,
      communityMessageMentions,
      setCommunityMessageMentions,
      communityAgentServeIssue,
      onDismissCommunityAgentServeIssue: handleDismissCommunityAgentServeIssue,
      onConnectCommunityAgentServeProvider: handleConnectCommunityAgentServeProvider,
      isSendingCommunityMessage,
      communityChatError,
      copiedCommunityMessageId,
      isUserAtBottom,
      unreadCount,
      reactionEmojis: WEB_COMMUNITY_REACTION_EMOJIS,
      messageListRef: communityChatListRef,
      fileInputRef: communityFileInputRef,
      chatInputRef,
      onChatScroll: handleChatScroll,
      onFinishProfileSetup: openProfileSetup,
      onScrollToBottom: scrollCommunityChatToBottom,
      onSetReplyingToMessage: setReplyingToMessage,
      onRemoveCommunityAttachment: removeCommunityAttachment,
      onCommunityAttachmentError: setCommunityChatError,
      onIngestCommunityAttachmentsFromFileList: ingestCommunityAttachmentsFromFileList,
      onCommunityFileInputChange: handleCommunityFileInputChange,
      onCommunityAttachmentDrop: handleCommunityAttachmentDrop,
      onCommunityAttachmentDragEnter: handleCommunityAttachmentDragEnter,
      onCommunityAttachmentDragOver: handleCommunityAttachmentDragOver,
      onCommunityAttachmentDragLeave: handleCommunityAttachmentDragLeave,
      onCommunityAttachmentPaste: handleCommunityAttachmentPaste,
      isCommunityAttachmentDragOver,
      onCommunityMessageInputChange: setCommunityMessageInputFromTextarea,
      onSendCommunityMessage: handleSendCommunityMessage,
      displayName,
      shouldShowCommunitySenderMeta,
      getAvatarColor,
      getInitials,
      formatChatTime,
      parseReplyPrefix,
      truncateReplyPreview,
      renderTextWithLinks,
      onScrollToReplyMessage: scrollToCommunityMessage,
      onOpenCommunityChatLightbox: openCommunityChatLightbox,
      onToggleReaction: handleToggleReaction,
      onSetReactionPickerMessageId: setReactionPickerMessageId,
      onStartReply: handleStartReply,
      onCopyMessage: handleCopyCommunityMessage,
      onStartEdit: handleStartEdit,
      onDeleteMessage: handleDeleteMessage,
      onEditingMessageTextChange: setEditingMessageText,
      onSaveEdit: handleSaveEdit,
      onCancelEdit: handleCancelEdit,
      voiceButtonProps: {
        state: mainCommunityVoiceButtonState,
        title: activeCommunityVoiceButtonOwner === "drawer"
          ? "Finish the current voice capture in the thread first."
          : communityVoiceButtonTitle,
        onClick: () => handleCommunityVoiceInputClick(null, "main"),
        disabled: activeCommunityVoiceButtonOwner === "drawer",
      },
      drawerVoiceButtonProps: {
        state: drawerCommunityVoiceButtonState,
        title: activeCommunityVoiceButtonOwner === "main"
          ? "Finish the current voice capture in the main chat first."
          : communityVoiceButtonTitle,
        disabled: activeCommunityVoiceButtonOwner === "main",
      },
      onCommunityVoiceInputClick: handleCommunityVoiceInputClick,
      lightboxModalProps: {
        isOpen: isCommunityChatLightboxOpen,
        images: communityChatLightboxImages,
        index: communityChatLightboxIndex,
        setIndex: setCommunityChatLightboxIndex,
        onClose: closeCommunityChatLightbox,
      },
      interactionProjection: {
        enabled: COMMUNITY_INTERACTION_PROJECTION_ENABLED,
        mobileThreadPage: mobileThreadPageOpen,
        onMobileReadingModeChange: mobileChromeScrollTrackingEnabled
          ? setMobileChromeReadingMode
          : undefined,
        roots: visibleCommunityInteractionRoots,
        selectedRootId: selectedCommunityInteractionRootId,
        replies: selectedCommunityInteractionReplies,
        isLoadingRoots: isLoadingCommunityInteractions,
        isLoadingReplies: isLoadingCommunityInteractionReplies,
        error: communityInteractionError,
        repliesError: communityInteractionRepliesError,
        onSelectRoot: handleSelectCommunityInteractionRoot,
        onCloseDrawer: handleCloseCommunityInteractionDrawer,
        onToggleReaction: handleToggleCommunityInteractionReaction,
        onEditMessage: handleEditCommunityInteractionMessage,
        onDeleteMessage: handleDeleteCommunityInteractionMessage,
        currentUserId: canonicalSessionUserId,
        chatLastSeenAt: chatDividerBoundary,
        rootChangeReason: communityInteractionRootChangeReason,
        canLoadOlderRoots: canLoadOlderCommunityInteractionRoots,
        isLoadingOlderRoots: isLoadingOlderCommunityInteractionRoots,
        onLoadOlderRoots: () => {
          if (!activeCommunityId) return;
          void loadOlderCommunityInteractionRoots(activeCommunityId, session);
        },
        onCaughtUp: handleChatCaughtUp,
        onRetryRoots: () => {
          if (!activeCommunityId) return;
          void loadCommunityInteractionRoots(activeCommunityId, session);
        },
        onRetryReplies: (rootId: string) => {
          void loadCommunityInteractionReplies(rootId, session);
        },
        onRetrySend: handleRetryPendingCanonicalInteraction,
        onDiscardPending: handleDiscardPendingCanonicalInteraction,
        typingPresence: communityTypingUsers,
        onlineUserIds: activeCommunityOnlineUserIds,
        presenceSummary: activeCommunityPresenceSummary,
        communityMemberCount: communityDirectoryMemberCount,
        communityMembers: communityDirectoryMembers,
        communityMembersHasMore: communityDirectoryMembersHasMore,
        isLoadingCommunityMembers: isLoadingCommunityDirectoryMembers,
        isLoadingMoreCommunityMembers: isLoadingMoreCommunityDirectoryMembers,
        communityMembersLoadError: communityDirectoryMembersLoadError,
        onLoadMoreCommunityMembers: () => {
          if (!activeCommunityId || !session) return;
          void loadMoreCommunityDirectoryMembers(activeCommunityId, session);
        },
        communityId: activeCommunityId,
        communityOwnerId: activeCommunity?.owner_id ?? null,
        canManageCommunityMembers: canManageMembersActiveCommunity,
        communityEntryPolicy: activeCommunity?.entry_policy ?? null,
        canSetCommunityFreeAccessMode:
          canManageMembersActiveCommunity &&
          (activeCommunity?.entry_policy === "open" || activeCommunity?.entry_policy === "approval"),
        isSettingCommunityFreeAccessMode,
        communityFreeAccessModeError,
        onSetCommunityFreeAccessMode: handleSetCommunityContextFreeAccessMode,
        canReviewCommunityJoinRequests: canReviewJoinRequestsActiveCommunity,
        communityJoinReviewMode: activeCommunityMembersJoinReviewMode,
        communityJoinRequests: communityContextJoinRequests,
        isLoadingCommunityJoinRequests,
        communityJoinRequestsError,
        decidingCommunityJoinRequestId,
        onApproveCommunityJoinRequest: handleApproveCommunityJoinRequest,
        onDenyCommunityJoinRequest: handleDenyCommunityJoinRequest,
        communityMemoryOverview: communityPolynetController.state.overview,
        isLoadingCommunityMemory: communityPolynetController.state.isLoading,
        communityMemoryError: communityPolynetController.state.error,
        onRefreshCommunityMemory: communityPolynetController.actions.refresh,
        onOpenCommunityMemory: () => {
          const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
          if (nextCommunitySlug) {
            openCommunityTab(nextCommunitySlug, "polynet", { pushSnapshot: false });
          }
        },
        canViewMemberPlanDetails: canViewMemberPlanDetailsActiveCommunity,
        isActiveCommunityOwner,
        communityInitials,
        onSetCommunityMemberRole: handleSetCommunityContextMemberRole,
        onRemoveCommunityMember: handleRemoveCommunityContextMember,
        onBanCommunityMember: handleBanCommunityContextMember,
        loadMemberBillingHistory: loadCommunityMemberBillingHistory,
      },
    });
  const activateDiscoverCommunityCard = useCallback((opts: {
    canActivate: boolean;
    community: DiscoverCommunity;
  }) => {
    if (!opts.canActivate) return;
    const slug = opts.community.slug.trim();
    if (!slug) return;
    setDiscoverError(null);

    const knownCommunityId = resolveKnownCommunityIdBySlug(slug);
    if (knownCommunityId) {
      enterJoinedCommunity({
        communityId: knownCommunityId,
        communitySlug: slug,
      });
      return;
    }

    publicCommunityUi.setPublicCommunity({
      slug,
      name: opts.community.name,
      one_liner: opts.community.one_liner ?? null,
      about: opts.community.about ?? null,
      avatar_url: opts.community.avatar_url ?? null,
      avatar_focus_x: opts.community.avatar_focus_x ?? null,
      avatar_focus_y: opts.community.avatar_focus_y ?? null,
      avatar_zoom: opts.community.avatar_zoom ?? null,
      banner_url: opts.community.banner_url ?? null,
      banner_focus_x: opts.community.banner_focus_x ?? null,
      banner_focus_y: opts.community.banner_focus_y ?? null,
      banner_zoom: opts.community.banner_zoom ?? null,
      visibility: opts.community.visibility,
      entry_policy: opts.community.entry_policy ?? null,
      created_at: opts.community.created_at,
      updated_at: opts.community.updated_at,
      funnel: opts.community.funnel ?? null,
      member_count: typeof opts.community.member_count === "number" ? opts.community.member_count : null,
      admin_count: null,
      online_count: null,
      online_faces: null,
    });
    publicCommunityUi.setPublicCommunityPlans(opts.community.active_plan ? [opts.community.active_plan] : []);
    publicCommunityUi.setPublicCommunityAccess(null);
    publicCommunityUi.setPublicCommunityError(null);
    publicCommunityUi.setPublicJoinError(null);
    publicCommunityUi.setMyPublicCommunityJoinRequest(null);
    publicCommunityUi.setIsLoadingMyPublicCommunityJoinRequest(false);
    publicCommunityUi.setIsLoadingPublicCommunity(true);
    setCheckoutError(null);
    setCheckoutStatus("idle");
    openPublicCommunityFunnel(slug, { pushSnapshot: true });
  }, [
    enterJoinedCommunity,
    openPublicCommunityFunnel,
    publicCommunityUi,
    resolveKnownCommunityIdBySlug,
    setCheckoutError,
    setCheckoutStatus,
  ]);
  const openOwnedPartnerCommunitySettings = useCallback((communityId: string) => {
    if (
      !confirmDiscardUnsavedCommunitySettingsWeb({
        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
        isCommunityAgentConfigDirty: communityAgentConfigDirtyRef.current,
        activeCommunityId: selectedActiveCommunityId,
        nextCommunityId: communityId,
        confirmDiscard: (message) => window.confirm(message),
      })
    ) {
      return;
    }
    const nextCommunitySlug =
      resolveKnownCommunitySlugById(communityId) ??
      (String(
        communities.find((community) => community.id === communityId)?.slug ?? "",
      ).trim() || null);
    if (!nextCommunitySlug) return;
    openCommunityTab(nextCommunitySlug, "settings", { pushSnapshot: false });
  }, [
    communities,
    openCommunityTab,
    resolveKnownCommunitySlugById,
    selectedActiveCommunityId,
  ]);
  const builderPartnerProgramPanelProps: WebBuilderPartnerProgramPanelProps = {
    session: session,
    requireSignIn,
    accountCommerceStatus,
    accountCommerceError,
    builderPartnerProgram,
    isLoadingBuilderPartnerProgram,
    builderPartnerProgramError,
    isAcceptingBuilderPartnerTerms,
    renderMarkdown,
    loadBuilderPartnerProgram: async (nextSession) => {
      await loadBuilderPartnerProgram(nextSession as AuthSession);
    },
    acceptBuilderPartnerTerms,
    openAccountSetup: openProfileSetup,
    openCreateCommunityModal: () => openCreateCommunityModal(),
    communities,
    communityRoleById,
    openOwnedCommunitySettings: openOwnedPartnerCommunitySettings,
    startStripeConnectOnboarding: (opts) => {
      void startStripeConnectOnboarding({
        context: opts?.context ?? "account",
        communitySlug: opts?.communitySlug ?? null,
        country: opts?.country ?? null,
      });
    },
    isStartingStripeConnectOnboarding,
  };
  const settingsPanelsProps: WebSettingsPanelsProps = {
    settingsGroup: settingsGroup as SettingsGroup,
    profile: {
      session: session,
      cloudProfile,
      profileUi,
      handleProfileAvatarDrop,
      handleProfileAvatarUpload,
      getInitials,
      saveProfileToCloud,
    },
    account: {
      session: session,
      authError,
      requireSignIn,
      handleSignOut,
      isLoadingChatgptConnection,
      chatgptConnection,
      isLoadingOpenAiConnection: isLoadingChatgptConnection,
      openAiConnection,
      hasPendingChatgptAuth,
      formatRelativeTime,
      communities,
      communityRoleById,
      openOwnedCommunitySettings: openOwnedPartnerCommunitySettings,
      communityInitials,
      builderPartnerProgram,
      isLoadingBuilderPartnerProgram,
      builderPartnerProgramError,
      isAcceptingBuilderPartnerTerms,
      renderMarkdown,
      loadBuilderPartnerProgram: async (nextSession) => {
        await loadBuilderPartnerProgram(nextSession as AuthSession);
      },
      acceptBuilderPartnerTerms,
      openAccountSetup: openProfileSetup,
      openCreateCommunityModal: () => openCreateCommunityModal(),
      startStripeConnectOnboarding: (opts) => {
        void startStripeConnectOnboarding({
          context: opts?.context ?? "account",
          communitySlug: opts?.communitySlug ?? null,
          country: opts?.country ?? null,
        });
      },
      canUseDevTierOverride,
      setDevAccountTier,
      redeemPendingPurchases: async () => {
        await redeemPendingPurchases();
      },
      ensureSession: ensureUsableAuthSession,
      loadPendingPurchaseClaims: async (session) => {
        await loadPendingPurchaseClaims(session as AuthSession);
      },
      providerConnectionUi,
      billingUi,
    },
    personalAccount: {
      session,
      formatRelativeTime,
      controller: personalAccountSettings,
    },
    billing: {
      session: session,
      startPremiumSubscriptionCheckout,
      billingUi,
    },
    skills: {
      session: session,
      requireSignIn,
      effectiveSkills: effectiveSkillsForSettings,
      isLoadingEffectiveSkills,
      effectiveSkillsError: effectiveSkillsErrorForSettings,
      userPlatformSkills,
      isLoadingUserPlatformSkills,
      userPlatformSkillError,
      userPlatformSkillMutationError,
      isCreatingUserPlatformSkill,
      updatingUserPlatformSkillInstallId,
      removingUserPlatformSkillInstallId,
      onCreateUserPlatformSkill: handleCreateUserPlatformSkill,
      onSaveUserPlatformSkill: handleSaveUserPlatformSkill,
      onUpdateUserPlatformSkill: handleUpdateUserPlatformSkill,
      onDeleteUserPlatformSkill: handleDeleteUserPlatformSkill,
    },
    appearance: {
      appTheme,
      setAppTheme,
    },
  };
  const activeCommunityAttentionSummary = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false, events: false })
    : { chat: false, ai_feed: false, resources: false, events: false };
  const activeCommunityAttentionCount =
    Number(Boolean(activeCommunityAttentionSummary.chat || (activePage === "community" && activeCommunityId && unreadCount > 0))) +
    Number(Boolean(activeCommunityAttentionSummary.ai_feed)) +
    Number(Boolean(activeCommunityAttentionSummary.resources)) +
    Number(Boolean(activeCommunityAttentionSummary.events));
  const directMessageWebNotifications = useDirectMessageWebNotifications({
    isEnabled: Boolean(session),
    unreadCount: directMessagesUnreadCount,
    onOpenConversation: handleOpenDirectConversationById,
  });
  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const dmConversationId = String(url.searchParams.get("dm") ?? "").trim();
    if (!dmConversationId) return;
    url.searchParams.delete("dm");
    window.history.replaceState(
      window.history.state ?? {},
      document.title,
      `${url.pathname}${url.search}${url.hash}`,
    );
    handleOpenDirectConversationById(dmConversationId);
  }, [session, handleOpenDirectConversationById]);
  const directMessagesUnreadLabel =
    directMessagesUnreadCount > 0 ? `${directMessagesUnreadCount} unread` : null;
  const directMessagesButton = session ? (
    <button
      className={`icon-button direct-messages-topbar-button${isDirectMessagesOpen ? " active" : ""}`}
      onClick={handleToggleDirectMessages}
      aria-expanded={isDirectMessagesOpen}
      aria-label={
        isDirectMessagesOpen
          ? "Close direct messages"
          : directMessagesUnreadLabel
            ? `Open direct messages, ${directMessagesUnreadLabel}`
            : "Open direct messages"
      }
      title={
        isDirectMessagesOpen
          ? "Close direct messages"
          : directMessagesUnreadLabel
            ? `Direct messages (${directMessagesUnreadLabel})`
            : "Direct messages"
      }
      type="button"
    >
      <MessageCircle aria-hidden="true" />
      {directMessagesUnreadCount > 0 ? (
        <span className="unread-badge">
          {directMessagesUnreadCount > 99 ? "99+" : directMessagesUnreadCount}
        </span>
      ) : null}
    </button>
  ) : null;
  const handleSelectCommunityTab = useCallback((tab: CommunityTab) => {
    setCommunityResourceModuleId(null);
    if (tab === "chat") {
      markCommunityChatSelected();
    }
    if (isCommunityRouteManagedTab(tab)) {
      const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
      if (nextCommunitySlug) {
        openCommunityTab(nextCommunitySlug, tab, { pushSnapshot: false });
        return;
      }
    }
    applyCommunityShellState({ communityTab: tab });
  }, [
    activeCommunity,
    applyCommunityShellState,
    markCommunityChatSelected,
    openCommunityTab,
    selectedActiveCommunitySlug,
  ]);
  const handleSelectCommunityTabFromMobile = useCallback((tab: CommunityTab) => {
    setMobileOverlay(null);
    handleSelectCommunityTab(tab);
  }, [handleSelectCommunityTab]);
  const handleCommunityOnboardingOrientationCompleted = useCallback(() => {
    setCommunityOnboardingFirstPostFocusRequest((current) => current + 1);
    if (!isCommunityOnboardingPreviewMode) handleSelectCommunityTab("chat");
  }, [handleSelectCommunityTab, isCommunityOnboardingPreviewMode]);

  const standalonePublicRouteViewProps = buildWebStandalonePublicRouteViewProps({
    publicRouteKind: publicRoute.kind,
    showSignIn: showPublicSignIn,
    requireSignIn,
    handleSignOut,
    checkoutStatus,
    retryCheckoutFinalize,
    handlePublicCheckoutContinue,
    handlePublicClaimContinue,
    checkoutError,
    pendingToken,
    manualClaimToken,
    setManualClaimToken,
    isRedeemingClaim,
    redeemClaimError,
    authError,
  });

  if (standalonePublicRouteViewProps) {
    return (
      <Suspense fallback={<div className="landing-auth-hold" aria-hidden="true" />}>
        <WebStandalonePublicRouteShell {...standalonePublicRouteViewProps} />
      </Suspense>
    );
  }

  const shouldSuppressPreviewSidebarAuthError =
    readAuthResumeState()?.intent?.reason === "open_workspace_draft";
  const previewSidebarAuthError = shouldSuppressPreviewSidebarAuthError ? null : authError;

  const globalOverlayHostProps = buildWebGlobalOverlayHostProps({
    session: session,
    accountCommerceStatus,
    setAccountCommerceError,
    setIsFreeAccountInfoOpen,
    personalMemoryUi: personalAccountSettings.personalMemoryUi,
    handleImportExternalMemory,
    providerConnectionModalHostProps: providerConnectionUi.modalHostProps,
    onOpenPremiumBilling: openPremiumBilling,
    isFreeAccountInfoOpen,
    accountCommerceError,
    communityModalHostProps: communityUi.modalHostProps,
    appToast,
  });

  const selectedCommunityAnalyticsPath = buildCommunityTabPath(
    selectedActiveCommunitySlug ?? activeCommunity?.slug,
    "analytics",
  );
  const mainSurfaceHostProps = buildWebAppMainSurfaceHostProps({
    activePage,
    isPublicCommunityFunnel,
    publicRoute: shellPublicRoute,
    holdLandingForAuth: shouldHoldLandingForAuth,
    landingPageProps: {
      onTryFree: () => {
        void routeTryPolynetFree();
      },
    },
    onboardingPageProps: {
      accountSetupStatus: effectiveAccountSetupStatus,
      setup: accountSetupSurface.model,
      isAvatarFocusModalOpen: profileUi.isProfileAvatarFocusModalOpen,
      isAvatarDragOver: profileUi.isProfileAvatarDragOver,
      setIsAvatarDragOver: profileUi.setIsProfileAvatarDragOver,
      setAvatarFocusX: profileUi.setProfileAvatarFocusX,
      setAvatarFocusY: profileUi.setProfileAvatarFocusY,
      setAvatarZoom: profileUi.setProfileAvatarZoom,
      setIsAvatarFocusModalOpen: profileUi.setIsProfileAvatarFocusModalOpen,
      onAvatarDrop: handleProfileAvatarDrop,
      onRemoveAvatar: () => {
        profileUi.setProfileAvatarUrl(null);
        profileUi.setProfileAvatarStorageId(null);
        profileUi.setProfileAvatarFocusX(0.5);
        profileUi.setProfileAvatarFocusY(0.5);
        profileUi.setProfileAvatarZoom(1);
      },
      onNextProfile: saveOnboardingProfile,
      onFinishOnboarding: finishOnboarding,
      onClose: closeProfileSetup,
    },
    platformBridgePageProps: {
      bridge:
        session && effectiveAccountSetupStatus && !effectiveAccountSetupStatus.completed
          ? {
              variant: "platform" as const,
              communityName: "Polynet",
              communityAvatarUrl: null,
              communityAvatarFocusX: null,
              communityAvatarFocusY: null,
              communityAvatarZoom: null,
              paidReceiptLabel: null,
              enterLabel: "Enter Polynet",
              setup: accountSetupSurface.model,
              onEnter: completePlatformBridge,
            }
          : null,
    },
    showOnboardingModal: shellPublicRoute.kind === "app" && isOnboardingModalOpen,
    settingsSurfaceHostProps: {
      settingsGroup: settingsGroup as SettingsGroup,
      showMobileSettingsShell,
      showMobileSettingsIndex,
      onSelectMobileSettingsPage: (page) => {
        setSettingsPage(page);
        setMobileSettingsView("detail");
      },
      onShowMobileSettingsIndex: () => setMobileSettingsView("index"),
      showOperatorConsole: hasOperatorAccess,
      onOpenOperatorConsole: () => openOperatorConsole("platform"),
      settingsPanelsProps,
    },
    publicCommunityFunnelProps: {
      publicRouteSlug:
        publicRoute.kind === "community_funnel" ||
        publicRoute.kind === "community_funnel_preview"
          ? publicRoute.slug
          : undefined,
      publicCommunity: resolvedPublicCommunity
        ? {
            ...resolvedPublicCommunity,
            slug: resolvedPublicCommunity.slug ?? undefined,
          }
        : null,
      isMobile: showMobilePublicFunnel,
      shellVariant,
      isPreviewMode: isPublicFunnelPreviewRoute,
      gateOpenNonce: visitorGateNonce,
      mobileMembersOverlayOpen:
        showMobileShell &&
        (publicRoute.kind === "community_funnel" ||
          publicRoute.kind === "community_funnel_preview") &&
        mobileOverlay === "members",
      onCloseMobileMembersOverlay: () => setMobileOverlay(null),
      publicVisibilityLabel,
      selectedPublicCommunityPlanLabel: selectedPublicCommunityPlan
        ? formatPlanPrice(selectedPublicCommunityPlan)
        : null,
      hasSelectedPublicCommunityPlan: Boolean(selectedPublicCommunityPlan),
      isLoadingPublicCommunity: publicCommunityUi.isLoadingPublicCommunity,
      canEnterCommunity: canEnterPublicCommunity,
      canJoinForFree,
      canJoinWithApproval,
      canJoinWithCheckout,
      checkoutStatus,
      isJoiningPublicCommunity: publicCommunityUi.isJoiningPublicCommunity,
      isCancellingPublicCommunityJoinRequest:
        publicCommunityUi.isCancellingPublicCommunityJoinRequest,
      isLoadingMyPublicCommunityJoinRequest:
        publicCommunityUi.isLoadingMyPublicCommunityJoinRequest,
      approvalPending,
      approvalDenied,
      canRequestAgain,
      approvalReapplyLabel,
      onPrimaryJoinAction: handlePublicLandingPrimaryAction,
      onCancelPendingJoinRequest: handleCancelPendingPublicJoinRequest,
      publicCommunityError: publicCommunityUi.publicCommunityError,
      publicJoinError: publicCommunityUi.publicJoinError,
      checkoutError,
      showSignIn: showPublicSignIn,
      bridge:
        /* The pitch converts first: the bridge opens on an entry ATTEMPT
           (join/enter/claim), never on arrival. */
        !isPublicFunnelPreviewRoute &&
        session &&
        resolvedPublicCommunity &&
        effectiveAccountSetupStatus &&
        !effectiveAccountSetupStatus.completed &&
        isBridgeGateOpen
          ? {
              variant: "community" as const,
              communityName: resolvedPublicCommunity.name,
              communityAvatarUrl: resolvedPublicCommunity.avatar_url ?? null,
              communityAvatarFocusX: resolvedPublicCommunity.avatar_focus_x ?? null,
              communityAvatarFocusY: resolvedPublicCommunity.avatar_focus_y ?? null,
              communityAvatarZoom: resolvedPublicCommunity.avatar_zoom ?? null,
              paidReceiptLabel:
                checkoutStatus === "succeeded" && !canEnterPublicCommunity
                  ? "Payment received — you're in as soon as this is done"
                  : null,
              enterLabel: approvalPending
                ? "Finish setup"
                : `Enter ${resolvedPublicCommunity.name}`,
              setup: accountSetupSurface.model,
              onEnter: completeBridgeAndEnter,
            }
          : null,
    },
    communityHostProps: {
      communityTab,
      onSelectCommunityTab: handleSelectCommunityTab,
      firstPostFocusRequest: communityOnboardingFirstPostFocusRequest,
      chatPanelProps: {
        ...communityChatPanelProps,
        mobileMembersOverlayOpen: showMobileShell && mobileOverlay === "members",
        onCloseMobileMembersOverlay: () => setMobileOverlay(null),
      },
      secondaryPanelsProps: communitySecondarySurfaceProps,
    },
    discoverPanelProps: {
      isLoadingDiscover,
      discoverCommunitiesCount: discoverCommunities.length,
      discoverError,
      discoverCommunities,
      formatPlanPrice: (plan) => (plan ? formatPlanPrice(plan) : "Free"),
      onActivateCommunity: (community) => {
        activateDiscoverCommunityCard({
          canActivate: Boolean(community.slug),
          community,
        });
      },
    },
    productDocsPanelProps: {
      activeSlug: selectedProductDocSlug,
      onSelectSlug: (slug) => {
        const nextSlug = String(slug || PRODUCT_DOCS_DEFAULT_SLUG).trim() || PRODUCT_DOCS_DEFAULT_SLUG;
        setSelectedProductDocSlug(nextSlug);
        navigateTo(buildAppRoutePath({
          page: "docs",
          view: "home",
    settingsPage,
          communitySlug: null,
          communityTab: "chat",
          docsSlug: nextSlug,
        }) ?? "/docs");
      },
      renderMarkdown,
    },
    operatorDashboardProps:
      session && operatorAccess
        ? {
            session,
            activeTab: activeOperatorTab,
            onSelectTab: openOperatorConsole,
            onOpenCommunityAnalytics: selectedCommunityAnalyticsPath
              ? () => navigateTo(selectedCommunityAnalyticsPath)
              : null,
          }
        : null,
  });
  const memberAgentDockCommunity = activePage === "community" ? activeCommunity : null;
  const memberAgentSurfaceContext: MemberAgentSurfaceContextV1 | null =
    activePage === "community" && memberAgentDockCommunity?.slug
      ? {
          version: 1,
          kind: "community",
          community_slug: memberAgentDockCommunity.slug,
          section: communityTab,
        }
      : activePage === "discover"
        ? { version: 1, kind: "discover", section: "communities" }
        : activePage === "settings" ||
            activePage === "docs" ||
            activePage === "operator"
          ? {
              version: 1,
              kind: "platform",
              page: activePage,
              section:
                activePage === "settings"
                  ? settingsPage
                  : activePage === "operator"
                    ? activeOperatorTab
                    : null,
            }
          : null;
  const isMemberAgentDockVisible =
    Boolean(session) &&
    publicRoute.kind === "app" &&
    activePage !== "landing" &&
    activePage !== "onboarding" &&
    hasResolvedCommunities &&
    Boolean(memberAgentSurfaceContext) &&
    !isDirectMessagesOpen &&
    !isOnboardingModalOpen;
  const memberAgentVoiceScopeKey = `${activePage}:${communityTab}:${memberAgentDockCommunity?.id ?? "platform"}`;
  const previousMemberAgentVoiceScopeKeyRef = useRef(memberAgentVoiceScopeKey);
  useEffect(() => {
    const scopeChanged =
      previousMemberAgentVoiceScopeKeyRef.current !== memberAgentVoiceScopeKey;
    previousMemberAgentVoiceScopeKeyRef.current = memberAgentVoiceScopeKey;
    if (
      memberAgentVoiceUiState !== "idle" &&
      (!isMemberAgentDockVisible || scopeChanged)
    ) {
      cancelVoiceInput();
    }
  }, [
    cancelVoiceInput,
    isMemberAgentDockVisible,
    memberAgentVoiceScopeKey,
    memberAgentVoiceUiState,
  ]);
  const globalOverlays = (
    <>
      <WebGlobalOverlayHost {...globalOverlayHostProps} />
      <Suspense fallback={null}>
        <WebMemberAgentDock
          ref={memberAgentComposerApiRef}
          isVisible={isMemberAgentDockVisible}
          mobileShellActive={showMobileShell}
          mobileRoot={showMobileShell && mobileRootPage === "agent"}
          onRequestOpen={() => setMobileRootPage("agent")}
          communityId={memberAgentDockCommunity?.id ?? null}
          communityName={memberAgentDockCommunity?.name ?? null}
          surfaceContext={memberAgentSurfaceContext}
          session={session}
          ensureSession={ensureUsableAuthSession}
          fetchPublic={fetchWithPublic}
          fetchAuth={fetchWithAuth}
          voiceButtonProps={{
            state: memberAgentVoiceUiState,
            title: memberAgentVoiceIntent.title,
            onClick: () => {
              void handleVoiceInputClick("member_agent");
            },
          }}
          finalizeVoiceInputForSubmit={() =>
            finishVoiceInputForSubmit("member_agent")
          }
        />
      </Suspense>
      <WebDirectMessagesHost
        isOpen={isDirectMessagesOpen}
        mobileRoot={showMobileShell && mobileRootPage === "messages"}
        openRequest={directMessageOpenRequest}
        openConversationRequest={directMessageOpenConversationRequest}
        session={session}
        ensureSession={ensureUsableAuthSession}
        sessionUserId={canonicalSessionUserId}
        getInitials={getInitials}
        getAvatarColor={getAvatarColor}
        renderTextWithLinks={renderTextWithLinks}
        requireSignIn={() => requireSignIn()}
        showAppToastMessage={showAppToastMessage}
        onUnreadCountChange={setDirectMessagesUnreadCount}
        onIncomingDirectMessage={directMessageWebNotifications.notifyIncoming}
        onDirectMessageSent={directMessageWebNotifications.requestPermissionIfNeeded}
        notificationsState={directMessageWebNotifications.notificationsState}
        onToggleNotifications={directMessageWebNotifications.toggleNotifications}
        onClose={handleCloseDirectMessages}
      />
    </>
  );
  const mainSurfaceFallback = (
    <main className="workspace community-mode">
      <div className="landing-auth-hold" aria-hidden="true" />
    </main>
  );
  const mainSurface = (
    <Suspense fallback={mainSurfaceFallback}>
      <WebAppMainSurfaceHost {...mainSurfaceHostProps} />
    </Suspense>
  );
  const activeIndicators = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false, events: false, mentions: false })
    : { chat: false, ai_feed: false, resources: false, events: false, mentions: false };
  const localActiveCommunityChatAttention = Boolean(activePage === "community" && activeCommunityId && unreadCount > 0);
  const communityTabIndicators = {
    chat: Boolean(activeIndicators.chat || localActiveCommunityChatAttention),
    ai_feed: Boolean(activeIndicators.ai_feed),
    resources: Boolean(activeIndicators.resources),
    events: Boolean(activeIndicators.events),
    // An unseen mention-of-you upgrades the chat dot to the accent variant.
    mentions: Boolean(activeIndicators.mentions),
  };
  const communityRailAttentionById: Record<string, boolean> = {};
  for (const [communityId, indicators] of Object.entries(attentionByCommunityId)) {
    if (indicators.chat || indicators.ai_feed || indicators.resources || indicators.events || indicators.mentions) {
      communityRailAttentionById[communityId] = true;
    }
  }
  if (activeCommunityId && localActiveCommunityChatAttention) {
    communityRailAttentionById[activeCommunityId] = true;
  }
  /* The visitor lens on the shell: /c/:slug feeds the SAME nav the member
     page uses — community identity from the public payload, every capability
     false, gated tabs locked. One more lens, not another page. */
  const isVisitorCommunitySurface =
    publicRoute.kind === "community_funnel" || publicRoute.kind === "community_funnel_preview";
  const visitorShellActiveCommunity =
    isVisitorCommunitySurface && resolvedPublicCommunity
      ? {
          id: `visitor:${resolvedPublicCommunity.slug ?? publicFunnelSlug ?? ""}`,
          slug: resolvedPublicCommunity.slug ?? null,
          name: resolvedPublicCommunity.name,
          avatar_url: resolvedPublicCommunity.avatar_url ?? null,
          avatar_focus_x: resolvedPublicCommunity.avatar_focus_x ?? null,
          avatar_focus_y: resolvedPublicCommunity.avatar_focus_y ?? null,
          avatar_zoom: resolvedPublicCommunity.avatar_zoom ?? null,
          banner_url: resolvedPublicCommunity.banner_url ?? null,
          banner_focus_x: resolvedPublicCommunity.banner_focus_x ?? null,
          banner_focus_y: resolvedPublicCommunity.banner_focus_y ?? null,
          banner_zoom: resolvedPublicCommunity.banner_zoom ?? null,
        }
      : null;
  const shellChromeHostProps = buildWebShellChromeHostProps({
    showMobileAppShell,
    showMobileSettingsShell,
    showMobilePublicFunnel,
    mobileOverlay,
    mobileChromeAutoHideEnabled,
    mobileChromeReadingMode: mobileChromeReadingModeActive,
    showMobileShell,
    mobileShellMode,
    mobileRootPage,
    mobileThreadPageOpen,
    forceMobileCommunityRoot: showMobileShell && isVisitorCommunitySurface,
    showMobileSettingsIndex,
    activePage,
    activeCommunity: isVisitorCommunitySurface ? visitorShellActiveCommunity : activeCommunity,
    activeCommunityAttentionCount,
    activeCommunityMemberFaces:
      isVisitorCommunitySurface
        ? resolvedPublicCommunity?.online_faces ?? []
        : canViewMembersActiveCommunity
        ? activeCommunityPresenceSummary?.online_faces ?? []
        : [],
    activeCommunityMemberCount:
      isVisitorCommunitySurface
        ? resolvedPublicCommunity?.member_count ?? null
        : canViewMembersActiveCommunity
        ? communityDirectoryMemberCount ??
          activeCommunityPresenceSummary?.member_count ??
          null
        : null,
    canOpenMobileMembers:
      isVisitorCommunitySurface
        ? Boolean(resolvedPublicCommunity)
        : canViewMembersActiveCommunity,
    openMobileDrawer,
    handleExitMobileSettings,
    handleCloseMobileThreadPage: handleCloseCommunityInteractionDrawer,
    handleSelectMobileRootPage,
    setMobileOverlay,
    isPublicCommunityFunnel,
    isPublicFunnelPreviewRoute: publicRoute.kind === "community_funnel_preview",
    hasBackTargetSnapshot: Boolean(backTargetSnapshot),
    backTargetLabel: effectiveBackTargetLabel ?? null,
    activeView,
    directMessagesButton,
    publicFunnelPreviewExitPath:
      publicRoute.kind === "community_funnel_preview"
        ? applyShellVariantToAppPath(
            buildCommunityTabPath(publicRoute.slug, "funnel") ?? "",
            shellVariant,
          ) || null
        : null,
    handleTopbarBackFromPublicFunnel,
    handleTopbarBackFromSettings,
    handleTopbarBackToCommunity,
    communityTab: isVisitorCommunitySurface ? "chat" : communityTab,
    communityTabIndicators: isVisitorCommunitySurface
      ? { chat: false, ai_feed: false, resources: false, events: false, mentions: false }
      : communityTabIndicators,
    canViewMembersActiveCommunity: !isVisitorCommunitySurface && canViewMembersActiveCommunity,
    canViewActiveCommunitySettings: !isVisitorCommunitySurface && canViewActiveCommunitySettings,
    canViewActiveCommunityPolynet: !isVisitorCommunitySurface && canViewActiveCommunityPolynet,
    canManageMembersActiveCommunity: !isVisitorCommunitySurface && canManageMembersActiveCommunity,
    canViewActiveCommunityAnalytics: !isVisitorCommunitySurface && canViewActiveCommunityAnalytics,
    lockedCommunityNavTabs: isVisitorCommunitySurface
      ? { ai_feed: true, resources: true, events: true }
      : null,
    handleSelectCommunityTab: isVisitorCommunitySurface
      ? (tab) => {
          if (tab !== "chat") setVisitorGateNonce((nonce) => nonce + 1);
        }
      : handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile: isVisitorCommunitySurface
      ? (tab) => {
          if (tab !== "chat") setVisitorGateNonce((nonce) => nonce + 1);
        }
      : handleSelectCommunityTabFromMobile,
    onCopyCommunityJoinLink: copyTextToClipboard,
    openMobileAgentSettings,
    canOpenDirectMessages: Boolean(session),
    directMessagesUnreadCount,
    /* Rail bridge: on the visitor route, app state changes don't render
       (publicRoute stays "community_funnel"), so shell verbs must really
       NAVIGATE — the rail is real, its clicks must be too. */
    handleOpenDiscover: isVisitorCommunitySurface
      ? () => navigateTo("/discover")
      : handleOpenDiscover,
    openMobileCreateCommunity,
    hasCommunityCreateAccess: Number(accountCommerceStatus?.max_communities ?? 0) > 0,
    openCommunityCreateFlow: openCreateCommunityModal,
    communities,
    railCommunities,
    communityRailAttentionById,
    isLoadingCommunities,
    selectedActiveCommunitySlug,
    handleSelectActiveCommunity: isVisitorCommunitySurface
      ? (community) => {
          const path = buildCommunityTabPath(community.slug ?? null, "chat");
          if (path) navigateTo(path);
          return false;
        }
      : (community) => {
          const nextCommunity =
            railCommunities.find((candidate) => candidate.id === community.id) ??
            communities.find((candidate) => candidate.id === community.id);
          return nextCommunity ? handleSelectActiveCommunity(nextCommunity) : false;
        },
    openCommunityChat,
    communityInitials,
    showDesktopCommunityRail,
    showDesktopCommunityNav,
    hasCommunityRailMiddleContent,
    canReorderCommunities,
    draggingCommunityId,
    setCommunityRailListElement,
    getCommunityRailItemBindings,
    setIsFreeAccountInfoOpen,
    handleOpenGlobalSettings: isVisitorCommunitySurface
      ? () => navigateTo(buildSettingsPath("agent"))
      : () => openGlobalSettings("agent"),
    settingsGroup: settingsGroup as SettingsGroup,
    setSettingsPage,
    showOperatorConsole: hasOperatorAccess,
    openOperatorConsole: () => openOperatorConsole("platform"),
    hasLeftPanel,
    isGlobalSettings,
    mainSurface,
    globalOverlays,
  });

  return (
    <WebCommunityOnboardingController
      session={communityChatPanelProps.session}
      ensureSession={ensureUsableAuthSession}
      communityId={memberAgentDockCommunity?.id ?? null}
      communityName={memberAgentDockCommunity?.name ?? null}
      communityAvatarUrl={memberAgentDockCommunity?.avatar_url ?? null}
      communityAvatarFocusX={memberAgentDockCommunity?.avatar_focus_x ?? null}
      communityAvatarFocusY={memberAgentDockCommunity?.avatar_focus_y ?? null}
      communityAvatarZoom={memberAgentDockCommunity?.avatar_zoom ?? null}
      isEnabled={Boolean(
        memberAgentDockCommunity &&
        communityChatPanelProps.hasAuthenticatedPresentation &&
        communityChatPanelProps.hasSession
      )}
      previewMode={isCommunityOnboardingPreviewMode}
      canPreview={canManageCommunitySettings}
      onExitPreview={handleExitCommunityOnboardingPreview}
      onOrientationCompleted={handleCommunityOnboardingOrientationCompleted}
    >
      <WebShellChromeHost {...shellChromeHostProps} />
    </WebCommunityOnboardingController>
  );
}
