import type {
  CommunityFunnelConfig,
  CommunityFunnelContentV2,
  PublicPlanSummary,
} from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelPrimaryActionView,
  buildCommunityFunnelRenderModel,
  deriveCommunityFunnelUiMode,
} from "../../../../shared/communityFunnelUi";
import type { WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";
import { WebCommunityFunnelRenderer } from "./WebCommunityFunnelRenderer";

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
  previewDocument?: CommunityFunnelContentV2 | null;
  previewVslUrl?: string | null;
  previewDocumentError?: string | null;
  selectedPublicCommunityPlan: PublicPlanSummary | null;
  isLoadingPublicCommunity: boolean;
  canEnterCommunity: boolean;
  canJoinForFree: boolean;
  canJoinWithApproval: boolean;
  canJoinWithCheckout: boolean;
  checkoutStatus: CheckoutStatus;
  isJoiningPublicCommunity: boolean;
  approvalPending: boolean;
  approvalDenied: boolean;
  canRequestAgain: boolean;
  approvalReapplyLabel?: string | null;
  showSignIn: boolean;
  isCancellingPendingRequest: boolean;
  onCancelPendingRequest: () => void;
  onPrimaryJoinAction: () => void;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  checkoutError: string | null;
  mobileMembersOverlayOpen?: boolean;
  onCloseMobileMembersOverlay?: () => void;
  /** Present when the signed-in viewer still owes platform credentials —
      renders the gate card's second state instead of the pitch gate. */
  bridge?: WebCommunityBridgeCardProps | null;
};

export function WebPublicCommunityFunnel(props: WebPublicCommunityFunnelProps) {
  const {
    publicCommunity,
    publicRouteSlug,
    isPreviewMode = false,
    previewDocument = null,
    previewVslUrl = null,
    previewDocumentError = null,
    selectedPublicCommunityPlan,
    isLoadingPublicCommunity,
    canEnterCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    checkoutStatus,
    isJoiningPublicCommunity,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel = null,
    showSignIn,
    isCancellingPendingRequest,
    onCancelPendingRequest,
    onPrimaryJoinAction,
    publicCommunityError,
    publicJoinError,
    checkoutError,
  } = props;

  const communityName = publicCommunity?.name ?? publicRouteSlug ?? "Community";
  const funnel = publicCommunity?.funnel ?? null;
  const memberCount =
    typeof publicCommunity?.member_count === "number" ? publicCommunity.member_count : null;
  const paidPlan = selectedPublicCommunityPlan;
  const hasSelectedPublicCommunityPlan = Boolean(paidPlan);
  const funnelMode = deriveCommunityFunnelUiMode({
    canEnterCommunity,
    canJoinWithCheckout,
    canJoinWithApproval,
    canJoinForFree,
  });
  const primaryAction = buildCommunityFunnelPrimaryActionView({
    mode: funnelMode,
    plan: paidPlan,
    isBusy: checkoutStatus === "loading" || isJoiningPublicCommunity,
    approvalPending,
    approvalDenied,
    canRequestAgain,
  });
  const primaryActionLabel = primaryAction.label;
  const isPrimaryActionDisabled =
    isPreviewMode ||
    !publicCommunity ||
    checkoutStatus === "loading" ||
    isJoiningPublicCommunity ||
    (!canEnterCommunity && canJoinWithCheckout && (!hasSelectedPublicCommunityPlan || !primaryAction.hasValidPaidPlan)) ||
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
    cancelPendingRequestLabel: isCancellingPendingRequest ? "Cancelling…" : "Cancel request",
    isCancelPendingRequestDisabled: isCancellingPendingRequest,
    onCancelPendingRequest,
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
    funnel: isPreviewMode && previewDocument
      ? {
          ...funnel,
          live_mode: "custom",
          published_content_v2: previewDocument,
          published_vsl_url: previewVslUrl,
        }
      : funnel,
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
      alertMessages={!isLoadingPublicCommunity
        ? [...funnelErrors, ...(previewDocumentError ? [previewDocumentError] : [])]
        : []}
      bridge={props.bridge ?? null}
    />
  );
}
