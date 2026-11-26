import type { ComponentProps } from "react";
import type { AppPage, AppView, CommunityTab, SettingsGroup } from "../../../../shared/appShellNavigation";
import type { PublicRoute } from "../../../../shared/webAppRouteState";
import { buildAppRoutePath, buildSettingsIndexPath, buildSettingsPath } from "../../../../shared/webAppRouteState";
import { formatPlanPrice } from "../../../../shared/accountCommerce";
import { getAvatarColor, getInitials } from "../../../../shared/chatUi";
import { renderTextWithLinks } from "../../../../shared/linkEmbedUi";
import type { UserProfile as SharedUserProfile } from "../../../../shared/communityTypes";
import { PRODUCT_DOCS_DEFAULT_SLUG } from "../docs/productDocsMeta";
import { captureProductAnalyticsEvent } from "../posthogAnalytics";
import type { AuthSession } from "../auth";
import type { WebSettingsPanelsProps } from "../components/WebSettingsPanels";
import type { WebCommunityDiscoverPageProps } from "../components/WebCommunityDiscoverPage";
import type { WebAppCompositionRoot } from "../components/WebAppCompositionRoot";
import { buildWebGlobalOverlayHostProps } from "./buildWebGlobalOverlayHostProps";
import { buildWebAppMainSurfaceHostProps } from "./buildWebAppMainSurfaceHostProps";

export type CommunityAttentionSummary = {
  chat: boolean;
  resources: boolean;
  events: boolean;
  mentions: boolean;
  channels: unknown[];
};

const EMPTY_ATTENTION: CommunityAttentionSummary = {
  chat: false,
  resources: false,
  events: false,
  mentions: false,
  channels: [],
};

export function deriveWebCommunityAttentionChrome(params: {
  activeCommunityId: string | null;
  attentionByCommunityId: Record<string, CommunityAttentionSummary>;
}) {
  const activeCommunityAttentionSummary = params.activeCommunityId
    ? (params.attentionByCommunityId[params.activeCommunityId] ?? EMPTY_ATTENTION)
    : EMPTY_ATTENTION;
  const activeCommunityAttentionCount =
    Number(Boolean(activeCommunityAttentionSummary.chat)) +
    Number(Boolean(activeCommunityAttentionSummary.resources)) +
    Number(Boolean(activeCommunityAttentionSummary.events));
  const communityTabIndicators = {
    chat: Boolean(activeCommunityAttentionSummary.chat),
    resources: Boolean(activeCommunityAttentionSummary.resources),
    events: Boolean(activeCommunityAttentionSummary.events),
    mentions: Boolean(activeCommunityAttentionSummary.mentions),
  };
  const communityRailAttentionById: Record<string, boolean> = {};
  for (const [communityId, indicators] of Object.entries(params.attentionByCommunityId)) {
    if (indicators.chat || indicators.resources || indicators.events || indicators.mentions) {
      communityRailAttentionById[communityId] = true;
    }
  }
  return {
    activeCommunityAttentionSummary,
    activeCommunityAttentionCount,
    communityTabIndicators,
    communityRailAttentionById,
  };
}

export function buildWebAppGlobalOverlayProps(params: {
  communityModalHostProps: Parameters<typeof buildWebGlobalOverlayHostProps>[0]["communityModalHostProps"];
  canonicalSessionUserId: string | null;
  displayName: (userId: string) => string;
  savedProfilesByUserId: Record<string, SharedUserProfile>;
  builderOffer: {
    community: any;
    close: () => void;
    confirm: (action: any) => Promise<void> | void;
  };
  founderBilling: {
    actionCommunityId: string | null;
    error: string | null;
  };
  pendingLaunchCommunity: any;
  session: AuthSession | null;
  ensureSession: any;
  completePendingCommunityLaunch: any;
  appToast: Parameters<typeof buildWebGlobalOverlayHostProps>[0]["appToast"];
}) {
  const hostProfile = params.canonicalSessionUserId
    ? (params.savedProfilesByUserId[params.canonicalSessionUserId] ?? null)
    : null;
  const hostName = params.canonicalSessionUserId
    ? params.displayName(params.canonicalSessionUserId)
    : null;
  const hostAvatarUrl = hostProfile?.avatar_url ?? null;
  const hostAvatarFocusX = hostProfile?.avatar_focus_x ?? null;
  const hostAvatarFocusY = hostProfile?.avatar_focus_y ?? null;
  const hostAvatarZoom = hostProfile?.avatar_zoom ?? null;

  return buildWebGlobalOverlayHostProps({
    communityModalHostProps: {
      ...params.communityModalHostProps,
      // The new form's preview card names who will host it.
      createModal: {
        ...params.communityModalHostProps.createModal,
        hostName,
        hostAvatarUrl,
        hostAvatarFocusX,
        hostAvatarFocusY,
        hostAvatarZoom,
      },
    },
    builderOfferProps: {
      community: params.builderOffer.community,
      isSubmitting:
        Boolean(params.builderOffer.community) &&
        params.founderBilling.actionCommunityId === params.builderOffer.community?.community_id,
      error: params.founderBilling.error,
      onClose: params.builderOffer.close,
      onConfirm: params.builderOffer.confirm,
    },
    communityLaunchProps: params.pendingLaunchCommunity && params.session
      ? {
          community: params.pendingLaunchCommunity,
          hostName,
          hostAvatarUrl,
          hostAvatarFocusX,
          hostAvatarFocusY,
          hostAvatarZoom,
          ensureSession: params.ensureSession,
          onComplete: params.completePendingCommunityLaunch,
        }
      : null,
    appToast: params.appToast,
  });
}

export function buildWebAppMainSurfaceProps(params: {
  activePage: AppPage;
  activeView: AppView;
  communityTab: CommunityTab;
  isPublicCommunityFunnel: boolean;
  publicRoute: PublicRoute;
  session: AuthSession | null;
  shownSession: AuthSession | null;
  isAuthBootstrapComplete?: boolean;
  shouldHoldLandingForAuth: boolean;
  openNewCommunityPurchaseFlow: () => void;
  requireSignIn: (intent?: any) => void;
  effectiveAccountSetupStatus: any;
  accountSetupSurfaceModel: any;
  completeAccountSetupAndContinue: (legalAcceptance: any) => Promise<boolean>;
  isOnboardingModalOpen: boolean;
  settingsGroup: SettingsGroup;
  settingsPage: any;
  showMobileSettingsShell: boolean;
  showMobileSettingsIndex: boolean;
  navigateTo: (path: string) => void;
  settingsPanelsProps: WebSettingsPanelsProps;
  communityChatPanelProps: any;
  communitySecondarySurfaceProps: any;
  admission: Parameters<typeof buildWebAppMainSurfaceHostProps>[0]["communityHostProps"]["admission"];
  discoverPageProps: WebCommunityDiscoverPageProps;
  isLoadingDiscover: boolean;
  discoverCommunities: any[];
  discoverError: string | null;
  activateDiscoverCommunityCard: (input: { canActivate: boolean; community: any }) => void;
  selectedProductDocSlug: string | null;
  setSelectedProductDocSlug: (slug: string) => void;
}) {
  return buildWebAppMainSurfaceHostProps({
    activePage: params.activePage,
    isPublicCommunityFunnel: params.isPublicCommunityFunnel,
    publicRoute: params.publicRoute,
    session: params.shownSession,
    sessionCheckPending: params.isAuthBootstrapComplete === false,
    holdLandingForAuth: params.shouldHoldLandingForAuth,
    isSignedOut: !params.session,
    landingPageProps: {
      // "Start your community free": sign in (and finish account setup), then
      // community setup. The Agent plan is bought later, from the community.
      onStartBuilderPurchase: () => {
        if (params.session) params.openNewCommunityPurchaseFlow();
        else {
          captureProductAnalyticsEvent("signin_started", { reason: "create_community" });
          params.requireSignIn({ reason: "create_community", payload: { draft: null } });
        }
      },
    },
    onboardingPageProps: {
      accountSetupStatus: params.effectiveAccountSetupStatus,
      setup: params.accountSetupSurfaceModel,
      onCompleteAccountSetup: params.completeAccountSetupAndContinue,
    },
    platformBridgePageProps: {
      bridge:
        params.session && params.effectiveAccountSetupStatus && !params.effectiveAccountSetupStatus.completed
          ? {
              variant: "platform" as const,
              communityName: "Polynet",
              communityAvatarUrl: null,
              communityAvatarFocusX: null,
              communityAvatarFocusY: null,
              communityAvatarZoom: null,
              paidReceiptLabel: null,
              enterLabel: "Enter Polynet",
              accountSetupStatus: params.effectiveAccountSetupStatus,
              setup: params.accountSetupSurfaceModel,
              onEnter: params.completeAccountSetupAndContinue,
            }
          : null,
    },
    showOnboardingModal: params.publicRoute.kind === "app" && params.isOnboardingModalOpen,
    settingsSurfaceHostProps: {
      settingsGroup: params.settingsGroup,
      showMobileSettingsShell: params.showMobileSettingsShell,
      showMobileSettingsIndex: params.showMobileSettingsIndex,
      onSelectMobileSettingsPage: (page) => {
        params.navigateTo(buildSettingsPath(page));
      },
      onShowMobileSettingsIndex: () => params.navigateTo(buildSettingsIndexPath()),
      settingsPanelsProps: params.settingsPanelsProps,
    },
    communityHostProps: {
      activeView: params.activeView,
      communityTab: params.communityTab,
      chatPanelProps: {
        ...params.communityChatPanelProps,
      },
      secondaryPanelsProps: params.communitySecondarySurfaceProps,
      admission: params.admission,
    },
    discoverPageProps: params.discoverPageProps,
    discoverPanelProps: {
      isLoadingDiscover: params.isLoadingDiscover,
      discoverCommunitiesCount: params.discoverCommunities.length,
      discoverError: params.discoverError,
      discoverCommunities: params.discoverCommunities,
      formatPlanPrice: (plan) => (plan ? formatPlanPrice(plan) : "Free"),
      onActivateCommunity: (community) => {
        params.activateDiscoverCommunityCard({
          canActivate: Boolean(community.slug),
          community,
        });
      },
    },
    productDocsPanelProps: {
      activeSlug: params.selectedProductDocSlug,
      onSelectSlug: (slug) => {
        const nextSlug = String(slug || PRODUCT_DOCS_DEFAULT_SLUG).trim() || PRODUCT_DOCS_DEFAULT_SLUG;
        params.setSelectedProductDocSlug(nextSlug);
        params.navigateTo(buildAppRoutePath({
          page: "docs",
          view: "home",
          settingsPage: params.settingsPage,
          communitySlug: null,
          communityTab: "chat",
          docsSlug: nextSlug,
        }) ?? "/docs");
      },
    },
  });
}

export function buildWebAppDirectMessagesHostProps(params: {
  activeCommunityId: string | null;
  isOpen: boolean;
  onActiveConversationChange: (conversationId: string | null) => void;
  addressConversationId: string | null;
  mobileRoot: boolean;
  openRequest: any;
  openConversationRequest: any;
  session: AuthSession | null;
  ensureSession: any;
  sessionUserId: string | null;
  requireSignIn: () => void;
  showAppToastMessage: (message: string) => void;
  setDirectMessagesUnreadCount: (count: number) => void;
  directMessageWebNotifications: {
    notifyIncoming: any;
    requestPermissionIfNeeded: any;
    notificationsState: any;
    toggleNotifications: any;
  };
  onClose: () => void;
}): ComponentProps<typeof WebAppCompositionRoot>["directMessagesHostProps"] {
  return {
    activeCommunityId: params.activeCommunityId,
    isOpen: params.isOpen,
    onActiveConversationChange: params.onActiveConversationChange,
    addressConversationId: params.addressConversationId,
    mobileRoot: params.mobileRoot,
    openRequest: params.openRequest,
    openConversationRequest: params.openConversationRequest,
    session: params.session,
    ensureSession: params.ensureSession,
    sessionUserId: params.sessionUserId,
    getInitials,
    getAvatarColor,
    renderTextWithLinks,
    requireSignIn: params.requireSignIn,
    showAppToastMessage: params.showAppToastMessage,
    onUnreadCountChange: params.setDirectMessagesUnreadCount,
    onIncomingDirectMessage: params.directMessageWebNotifications.notifyIncoming,
    onDirectMessageSent: params.directMessageWebNotifications.requestPermissionIfNeeded,
    notificationsState: params.directMessageWebNotifications.notificationsState,
    onToggleNotifications: params.directMessageWebNotifications.toggleNotifications,
    onClose: params.onClose,
  };
}
