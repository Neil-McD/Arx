import type { CommunityFunnelConfig } from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelRenderModel,
} from "../../../../shared/communityFunnelUi";
import type { WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";
import { WebCommunityFunnelRenderer } from "./WebCommunityFunnelRenderer";

type FunnelMode = "enter" | "join" | "request_access" | "checkout" | "private";
type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

export type PublicCommunityFunnelCommunityLike = {
  slug?: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  member_count?: number | null;
  member_faces_preview?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  }> | null;
  funnel?: CommunityFunnelConfig | null;
};

type WebPublicCommunityFunnelProps = {
  publicCommunity: PublicCommunityFunnelCommunityLike | null;
  publicRouteSlug?: string;
  isPreviewMode?: boolean;
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
    isPreviewMode = false,
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
  } = props;

  const communityName = publicCommunity?.name ?? publicRouteSlug ?? "Community";
  const funnel = publicCommunity?.funnel ?? null;
  const memberCount =
    typeof publicCommunity?.member_count === "number" ? publicCommunity.member_count : null;
  const isFreePricing = !selectedPublicCommunityPlanLabel || selectedPublicCommunityPlanLabel.trim().toLowerCase() === "free";
  const pricingLabel = isFreePricing ? "FREE" : selectedPublicCommunityPlanLabel;

  const funnelMode = deriveFunnelMode({
    canEnterCommunity,
    canJoinWithCheckout,
    canJoinWithApproval,
    canJoinForFree,
  });
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
      <div className="community-funnel-loading" aria-busy="true" aria-label="Loading community funnel">
        <div className="community-funnel-loading-inner" aria-hidden="true">
          <div className="community-funnel-loading-mark web-skeleton-pill" />
          <div className="community-funnel-loading-title web-skeleton-block" />
          <div className="community-funnel-loading-action web-skeleton-block" />
        </div>
      </div>
    );
  }

  const renderModel = buildCommunityFunnelRenderModel({
    communityName,
    oneLiner: publicCommunity?.one_liner,
    about: publicCommunity?.about,
    funnel,
  });

  return (
    <WebCommunityFunnelRenderer
      communityName={communityName}
      avatarUrl={publicCommunity?.avatar_url ?? null}
      avatarFocusX={publicCommunity?.avatar_focus_x ?? null}
      avatarFocusY={publicCommunity?.avatar_focus_y ?? null}
      avatarZoom={publicCommunity?.avatar_zoom ?? null}
      memberCount={memberCount}
      memberFaces={publicCommunity?.member_faces_preview ?? []}
      renderModel={renderModel}
      action={action}
      alertMessages={!isLoadingPublicCommunity ? funnelErrors : []}
      bridge={props.bridge ?? null}
    />
  );
}
