import type {
  CommunityFunnelConfig,
} from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelActionCardArtStyle,
  buildCommunityFunnelCopy,
  buildCommunityHeroStyle,
  filterOnlineAvatarFaces,
} from "../../../../shared/communityFunnelUi";
import { CommunityFunnelSurface } from "./CommunityFunnelSurface";

type FunnelMode = "join_free" | "join_approval" | "checkout" | "private";
type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

export type PublicCommunityFunnelCommunityLike = {
  slug?: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  member_count?: number | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_faces?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }> | null;
  funnel?: CommunityFunnelConfig | null;
};

type WebPublicCommunityFunnelProps = {
  publicCommunity: PublicCommunityFunnelCommunityLike | null;
  publicRouteSlug?: string;
  isPreviewMode?: boolean;
  publicVisibilityLabel: string;
  selectedPublicCommunityPlanLabel: string | null;
  hasSelectedPublicCommunityPlan: boolean;
  isLoadingPublicCommunity: boolean;
  canJoinForFree: boolean;
  canJoinWithApproval: boolean;
  canJoinWithCheckout: boolean;
  checkoutStatus: CheckoutStatus;
  isJoiningPublicCommunity: boolean;
  isLoadingMyPublicCommunityJoinRequest: boolean;
  approvalPending: boolean;
  approvalDenied: boolean;
  onPrimaryJoinAction: () => void;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  checkoutError: string | null;
  showSignIn: boolean;
  funnelConfigOverride?: CommunityFunnelConfig | null;
  memberCountOverride?: number | null;
};

function deriveFunnelMode(args: {
  canJoinWithCheckout: boolean;
  canJoinWithApproval: boolean;
  canJoinForFree: boolean;
}): FunnelMode {
  if (args.canJoinWithCheckout) return "checkout";
  if (args.canJoinWithApproval) return "join_approval";
  if (args.canJoinForFree) return "join_free";
  return "private";
}

function buildPrimaryActionLabel(args: {
  mode: FunnelMode;
  isJoiningPublicCommunity: boolean;
  approvalPending: boolean;
  approvalDenied: boolean;
}): string {
  if (args.mode === "checkout") return "Join now";
  if (args.mode === "join_approval") {
    if (args.isJoiningPublicCommunity) return "Joining…";
    if (args.approvalPending) return "Pending";
    if (args.approvalDenied) return "Denied";
    return "Join now";
  }
  if (args.mode === "join_free") return args.isJoiningPublicCommunity ? "Joining…" : "Join now";
  return "Private community";
}

export function WebPublicCommunityFunnel(props: WebPublicCommunityFunnelProps) {
  const {
    publicCommunity,
    publicRouteSlug,
    isPreviewMode = false,
    publicVisibilityLabel,
    selectedPublicCommunityPlanLabel,
    hasSelectedPublicCommunityPlan,
    isLoadingPublicCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    checkoutStatus,
    isJoiningPublicCommunity,
    isLoadingMyPublicCommunityJoinRequest,
    approvalPending,
    approvalDenied,
    onPrimaryJoinAction,
    publicCommunityError,
    publicJoinError,
    checkoutError,
    showSignIn,
    funnelConfigOverride,
    memberCountOverride,
  } = props;

  const communityName = publicCommunity?.name ?? publicRouteSlug ?? "Community";
  const funnel = funnelConfigOverride ?? publicCommunity?.funnel ?? null;
  const aboutText = publicCommunity?.about?.trim() ?? "";
  const memberCount =
    typeof memberCountOverride === "number"
      ? memberCountOverride
      : typeof publicCommunity?.member_count === "number"
        ? publicCommunity.member_count
        : null;
  const adminCount =
    typeof publicCommunity?.admin_count === "number" ? publicCommunity.admin_count : null;
  const onlineCount =
    typeof publicCommunity?.online_count === "number" ? publicCommunity.online_count : null;
  const onlineFaces = filterOnlineAvatarFaces(publicCommunity?.online_faces, 4);
  const isPublishedVisibility = publicVisibilityLabel === "Published";
  const isFreePricing = !selectedPublicCommunityPlanLabel || selectedPublicCommunityPlanLabel.trim().toLowerCase() === "free";
  const pricingLabel = isFreePricing ? "FREE" : selectedPublicCommunityPlanLabel;

  const funnelMode = deriveFunnelMode({
    canJoinWithCheckout,
    canJoinWithApproval,
    canJoinForFree,
  });
  const funnelCopy = buildCommunityFunnelCopy(funnelMode);
  const cardBlurb = publicCommunity?.one_liner ?? funnelCopy.body;
  const primaryActionLabel = buildPrimaryActionLabel({
    mode: funnelMode,
    isJoiningPublicCommunity,
    approvalPending,
    approvalDenied,
  });
  const isPrimaryActionDisabled =
    isPreviewMode ||
    isLoadingPublicCommunity ||
    !publicCommunity ||
    checkoutStatus === "loading" ||
    isJoiningPublicCommunity ||
    isLoadingMyPublicCommunityJoinRequest ||
    (canJoinWithCheckout && !hasSelectedPublicCommunityPlan) ||
    (!canJoinWithCheckout && !canJoinForFree && !canJoinWithApproval) ||
    (canJoinWithApproval && (approvalPending || approvalDenied));
  const heroStyle = buildCommunityHeroStyle(publicCommunity);
  const actionCardArtStyle = buildCommunityFunnelActionCardArtStyle({
    community: publicCommunity,
    funnel,
  });
  const funnelErrors = [publicCommunityError, publicJoinError, checkoutError].filter(
    Boolean,
  ) as string[];
  const action = {
    communityName,
    communityLinkLabel: publicCommunity?.slug ? `c/${publicCommunity.slug}` : null,
    communityLinkHref: publicCommunity?.slug ? `/c/${publicCommunity.slug}` : null,
    avatarUrl: publicCommunity?.avatar_url ?? null,
    cardBlurb,
    memberCount,
    onlineCount,
    adminCount,
    onlineFaces,
    primaryActionLabel,
    isPrimaryActionDisabled,
    onPrimaryAction: onPrimaryJoinAction,
    canJoinWithApproval,
    showSignIn,
    approvalPending,
    approvalDenied,
    isPreviewMode,
  };

  if (isLoadingPublicCommunity && !publicCommunity) {
    return (
      <div className="public-funnel-page">
        <div className="public-funnel-shell public-funnel-shell-split public-funnel-shell-loading" aria-busy="true">
          <article className="public-funnel-main-column public-funnel-main-column-loading">
            <div className="public-funnel-loading-title web-skeleton-block" aria-hidden="true" />
            <div className="public-funnel-media-shell public-funnel-media-shell-skeleton web-skeleton-block" aria-hidden="true" />
            <div className="public-funnel-loading-metadata" aria-hidden="true">
              <div className="public-funnel-loading-chip web-skeleton-pill" />
              <div className="public-funnel-loading-chip web-skeleton-pill" />
              <div className="public-funnel-loading-chip web-skeleton-pill" />
            </div>
            <div className="public-funnel-loading-copy" aria-hidden="true">
              <div className="web-skeleton-row public-funnel-loading-row" />
              <div className="web-skeleton-row public-funnel-loading-row" />
              <div className="web-skeleton-row public-funnel-loading-row public-funnel-loading-row-short" />
            </div>
          </article>

          <aside className="public-funnel-sidebar">
            <div className="public-funnel-action-card public-funnel-action-card-skeleton" aria-hidden="true">
              <div className="public-funnel-hero-art public-funnel-hero-art-skeleton web-skeleton-block" />
              <div className="public-funnel-action-content">
                <div className="public-funnel-avatar public-funnel-avatar-skeleton web-skeleton-block" />
                <div className="public-funnel-loading-copy">
                  <div className="web-skeleton-row public-funnel-loading-row public-funnel-loading-row-medium" />
                  <div className="web-skeleton-row public-funnel-loading-row public-funnel-loading-row-short" />
                  <div className="web-skeleton-row public-funnel-loading-row" />
                </div>
                <div className="public-funnel-action-stats public-funnel-action-stats-skeleton">
                  <div className="public-funnel-action-stat">
                    <div className="web-skeleton-row public-funnel-loading-stat-value" />
                    <div className="web-skeleton-row public-funnel-loading-stat-label" />
                  </div>
                  <div className="public-funnel-action-stat">
                    <div className="web-skeleton-row public-funnel-loading-stat-value" />
                    <div className="web-skeleton-row public-funnel-loading-stat-label" />
                  </div>
                  <div className="public-funnel-action-stat">
                    <div className="web-skeleton-row public-funnel-loading-stat-value" />
                    <div className="web-skeleton-row public-funnel-loading-stat-label" />
                  </div>
                </div>
                <div className="public-funnel-loading-button web-skeleton-block" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <CommunityFunnelSurface
      title={communityName}
      heroMediaKind={funnel?.hero_media_kind ?? "image"}
      heroMediaUrl={funnel?.hero_media_url ?? null}
      visibilityLabel={publicVisibilityLabel}
      visibilityVariant={isPublishedVisibility ? "published" : "unlisted"}
      memberCount={memberCount}
      pricingLabel={pricingLabel}
      isFreePricing={isFreePricing}
      inlineAction={action}
      sidebarAction={action}
      heroArtStyle={actionCardArtStyle ?? heroStyle}
      aboutText={aboutText}
      alertMessages={!isLoadingPublicCommunity ? funnelErrors : []}
      showPoweredBy
    />
  );
}
