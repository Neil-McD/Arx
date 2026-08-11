import type {
  CommunityFunnelConfig,
  CommunityFunnelDocumentV1,
  CommunityPublicFace,
} from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelCopy,
  filterOnlineAvatarFaces,
} from "../../../../shared/communityFunnelUi";
import type { ComponentProps } from "react";
import type { WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";
import { WebCommunityVisitorSurface } from "./WebCommunityVisitorSurface";
import { CommunityFunnelV1Preview } from "./CommunityFunnelV1Preview";

type FunnelMode = "enter" | "join" | "request_access" | "checkout" | "private";
type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

import { applyShellVariantToPublicPath, type AppShellVariant } from "../../../../shared/webAppRouteState";

type PublicCommunityFunnelCommunityLike = {
  id?: string;
  slug?: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  member_count?: number | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_count_capped?: boolean | null;
  joined_last_30d_count?: number | null;
  messages_today_count?: number | null;
  memory_note_count?: number | null;
  resource_count?: number | null;
  created_at?: string | null;
  member_faces_preview?: CommunityPublicFace[] | null;
  memory_overview?: unknown;
  online_faces?: CommunityPublicFace[] | null;
  host?: {
    display_name: string | null;
    avatar_url: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  } | null;
  featured_messages?: Array<{
    id: string;
    body: string;
    created_at?: string | null;
    sender?: {
      display_name?: string | null;
      avatar_url?: string | null;
      avatar_focus_x?: number | null;
      avatar_focus_y?: number | null;
      avatar_zoom?: number | null;
    } | null;
    reactions?: Array<{ emoji: string; count: number }> | null;
  }> | null;
  funnel?: CommunityFunnelConfig | null;
};

type WebPublicCommunityFunnelProps = {
  publicCommunity: PublicCommunityFunnelCommunityLike | null;
  publicRouteSlug?: string;
  isMobile?: boolean;
  shellVariant?: AppShellVariant;
  isPreviewMode?: boolean;
  previewExitPath?: string | null;
  previewDocument?: CommunityFunnelDocumentV1 | null;
  previewVslUrl?: string | null;
  previewDocumentIsLoading?: boolean;
  previewDocumentError?: string | null;
  publicVisibilityLabel: string;
  selectedPublicCommunityPlanLabel: string | null;
  hasSelectedPublicCommunityPlan: boolean;
  isLoadingPublicCommunity: boolean;
  canEnterCommunity: boolean;
  canJoinForFree: boolean;
  canJoinWithApproval: boolean;
  canJoinWithCheckout: boolean;
  checkoutStatus: CheckoutStatus;
  isJoiningPublicCommunity: boolean;
  isCancellingPublicCommunityJoinRequest: boolean;
  approvalPending: boolean;
  approvalDenied: boolean;
  canRequestAgain: boolean;
  approvalReapplyLabel: string | null;
  onPrimaryJoinAction: () => void;
  onCancelPendingJoinRequest: () => void;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  checkoutError: string | null;
  showSignIn: boolean;
  /** Bumped by the shell when a locked nav tab is tapped (visitor lens). */
  gateOpenNonce?: number;
  mobileMembersOverlayOpen?: boolean;
  onCloseMobileMembersOverlay?: () => void;
  /** Present when the signed-in viewer still owes platform credentials —
      renders the gate card's second state instead of the pitch gate. */
  bridge?: WebCommunityBridgeCardProps | null;
};

function deriveFunnelMode(args: {
  canEnterCommunity: boolean;
  canJoinWithCheckout: boolean;
  canJoinWithApproval: boolean;
  canJoinForFree: boolean;
}): FunnelMode {
  if (args.canEnterCommunity) return "enter";
  if (args.canJoinWithCheckout) return "checkout";
  if (args.canJoinWithApproval) return "request_access";
  if (args.canJoinForFree) return "join";
  return "private";
}

function buildPrimaryActionLabel(args: {
  mode: FunnelMode;
  isJoiningPublicCommunity: boolean;
  approvalPending: boolean;
  approvalDenied: boolean;
  canRequestAgain: boolean;
  priceLabel: string | null;
}): string {
  if (args.mode === "enter") return "Enter community";
  if (args.mode === "checkout") return args.priceLabel ? `Join now · ${formatCtaPriceLabel(args.priceLabel)}` : "Join now";
  if (args.mode === "request_access") {
    if (args.isJoiningPublicCommunity) return "Joining…";
    if (args.approvalPending) return "Request pending";
    if (args.approvalDenied) return args.canRequestAgain ? "Request again" : "Request denied";
    return "Join now";
  }
  if (args.mode === "join") return args.isJoiningPublicCommunity ? "Joining…" : "Join now";
  return "Private community";
}

function formatCtaPriceLabel(priceLabel: string): string {
  return priceLabel
    .trim()
    .replace(/\/\s*month\b/i, "/mo")
    .replace(/\/\s*monthly\b/i, "/mo")
    .replace(/\/\s*year\b/i, "/yr")
    .replace(/\/\s*annual\b/i, "/yr");
}

export function WebPublicCommunityFunnel(props: WebPublicCommunityFunnelProps) {
  const {
    publicCommunity,
    publicRouteSlug,
    isMobile = false,
    shellVariant = "standard",
    isPreviewMode = false,
    publicVisibilityLabel,
    selectedPublicCommunityPlanLabel,
    hasSelectedPublicCommunityPlan,
    isLoadingPublicCommunity,
    canEnterCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    checkoutStatus,
    isJoiningPublicCommunity,
    isCancellingPublicCommunityJoinRequest,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel,
    onPrimaryJoinAction,
    onCancelPendingJoinRequest,
    publicCommunityError,
    publicJoinError,
    checkoutError,
    showSignIn,
    gateOpenNonce = 0,
  } = props;

  const communityName = publicCommunity?.name ?? publicRouteSlug ?? "Community";
  const funnel = publicCommunity?.funnel ?? null;
  const aboutText = publicCommunity?.about?.trim() ?? "";
  const memberCount =
    typeof publicCommunity?.member_count === "number" ? publicCommunity.member_count : null;
  const adminCount =
    typeof publicCommunity?.admin_count === "number" ? publicCommunity.admin_count : null;
  const onlineCount =
    typeof publicCommunity?.online_count === "number" ? publicCommunity.online_count : null;
  const onlineCountCapped = Boolean(publicCommunity?.online_count_capped);
  const onlineFaces = filterOnlineAvatarFaces(publicCommunity?.online_faces, 4);
  const isPublishedVisibility = publicVisibilityLabel === "Published";
  const isFreePricing = !selectedPublicCommunityPlanLabel || selectedPublicCommunityPlanLabel.trim().toLowerCase() === "free";
  const pricingLabel = isFreePricing ? "FREE" : selectedPublicCommunityPlanLabel;

  const funnelMode = deriveFunnelMode({
    canEnterCommunity,
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
    canRequestAgain,
    priceLabel: isFreePricing ? null : pricingLabel,
  });
  const isPrimaryActionDisabled =
    isPreviewMode ||
    !publicCommunity ||
    checkoutStatus === "loading" ||
    isJoiningPublicCommunity ||
    (!canEnterCommunity && canJoinWithCheckout && !hasSelectedPublicCommunityPlan) ||
    (!canEnterCommunity && !canJoinWithCheckout && !canJoinForFree && !canJoinWithApproval) ||
    (canJoinWithApproval && (approvalPending || (approvalDenied && !canRequestAgain)));
  const funnelErrors = [publicCommunityError, publicJoinError, checkoutError].filter(
    Boolean,
  ) as string[];
  const action = {
    communityName,
    communityLinkLabel: publicCommunity?.slug ? `c/${publicCommunity.slug}` : null,
    communityLinkHref: publicCommunity?.slug ? applyShellVariantToPublicPath(`/c/${publicCommunity.slug}`, shellVariant) : null,
    avatarUrl: publicCommunity?.avatar_url ?? null,
    avatarFocusX: publicCommunity?.avatar_focus_x ?? null,
    avatarFocusY: publicCommunity?.avatar_focus_y ?? null,
    avatarZoom: publicCommunity?.avatar_zoom ?? null,
    cardBlurb,
    memberCount,
    onlineCount,
    onlineCountCapped,
    adminCount,
    onlineFaces,
    primaryActionLabel,
    isPrimaryActionDisabled,
    onPrimaryAction: onPrimaryJoinAction,
    canJoinWithApproval,
    showSignIn,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel,
    canCancelPendingRequest: approvalPending,
    cancelPendingRequestLabel: isCancellingPublicCommunityJoinRequest ? "Canceling…" : "Cancel",
    isCancelPendingRequestDisabled: isCancellingPublicCommunityJoinRequest,
    onCancelPendingRequest: onCancelPendingJoinRequest,
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

  if (isPreviewMode && publicCommunity) {
    return (
      <div className="funnel-preview-presentation">
        <a
          className="funnel-preview-back"
          href={props.previewExitPath ?? "/discover"}
          aria-label="Back to funnel builder"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back to builder</span>
        </a>
        <CommunityFunnelV1Preview
          community={publicCommunity}
          document={props.previewDocument ?? null}
          vslUrl={props.previewVslUrl}
          primaryActionLabel={primaryActionLabel}
          isLoading={props.previewDocumentIsLoading}
          error={props.previewDocumentError}
        />
      </div>
    );
  }

  if (publicCommunity && funnel?.published_document_v1) {
    return (
      <CommunityFunnelV1Preview
        community={publicCommunity}
        document={funnel.published_document_v1}
        vslUrl={funnel.published_vsl_url}
        primaryActionLabel={primaryActionLabel}
        isPreview={false}
        primaryActionDisabled={isPrimaryActionDisabled}
        onPrimaryAction={onPrimaryJoinAction}
        error={funnelErrors[0] ?? null}
      />
    );
  }

  return (
    <WebCommunityVisitorSurface
      title={communityName}
      action={action}
      host={publicCommunity?.host ?? null}
      aboutText={aboutText}
      communityCreatedAt={publicCommunity?.created_at ?? null}
      heroMediaKind={funnel?.hero_media_kind ?? "image"}
      heroMediaUrl={funnel?.hero_media_url ?? null}
      featuredMessages={publicCommunity?.featured_messages ?? null}
      stats={{
        onlineCount,
        onlineCountCapped,
        onlineFaces,
        memberCount,
        memoryNoteCount: publicCommunity?.memory_note_count ?? null,
        messagesTodayCount: publicCommunity?.messages_today_count ?? null,
        memberFacesPreview: publicCommunity?.member_faces_preview ?? [],
      }}
      memoryOverview={
        (publicCommunity?.memory_overview as ComponentProps<
          typeof WebCommunityVisitorSurface
        >["memoryOverview"]) ?? null
      }
      pricingLabel={pricingLabel}
      isFreePricing={isFreePricing}
      alertMessages={!isLoadingPublicCommunity ? funnelErrors : []}
      gateSlugKey={publicCommunity?.slug ?? publicRouteSlug ?? null}
      gateOpenNonce={gateOpenNonce}
      isMobileLayout={shellVariant === "mobile"}
      mobileMembersOverlayOpen={props.mobileMembersOverlayOpen}
      onCloseMobileMembersOverlay={props.onCloseMobileMembersOverlay}
      bridge={props.bridge ?? null}
    />
  );
}
