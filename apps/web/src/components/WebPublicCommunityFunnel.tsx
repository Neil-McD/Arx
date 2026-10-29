import { useEffect, useState } from "react";
import type {
  CommunityFunnelConfig,
  PublicPlanSummary,
} from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelPrimaryActionView,
  buildCommunityFunnelRenderModel,
  deriveCommunityFunnelUiMode,
} from "../../../../shared/communityFunnelUi";
import type { WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";
import { WebCommunityFunnelRenderer } from "./WebCommunityFunnelRenderer";
import { SALES_PREVIEW_MESSAGE, WebCommunitySalesPage, type CommunitySalesPageCommunity, type SalesPageMediaItem } from "./WebCommunitySalesPage";
import { ActionStatusCards } from "./CommunityFunnelSurface";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import { WebCommunityBridgeCard } from "./WebCommunityBridgeCard";
import { communityJoinUrl } from "../controllers/useWebCommunityFrame";
import { useWebCommunityThemeStyle } from "../controllers/useWebCommunityThemeStyle";
import type { AuthSession } from "../auth";
import { useCommunityOfferChoice, WebCommunityOfferChooser } from "./WebCommunityOfferChooser";
import "./WebPublicCommunityFunnel.css";

type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";

export type PublicCommunityFunnelCommunityLike = CommunitySalesPageCommunity & {
  id?: string;
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
  // "funnel": the owner's layout makes the About page the public page.
  about_presentation?: "page" | "funnel" | null;
  // The sales page's gallery and its own text (layout pages.about).
  about_media?: SalesPageMediaItem[] | null;
  about_text?: string | null;
  about_show_members?: boolean | null;
};

type WebPublicCommunityFunnelProps = {
  publicCommunity: PublicCommunityFunnelCommunityLike | null;
  publicRouteSlug?: string;
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
  /** A higher offer picked on the sales page's offer cards. */
  onStartOfferCheckout?: (offerKey: string, billingPeriod: "monthly" | "annual") => void;
  /** Who is looking, so a member sees their offer and can upgrade. */
  offerSession?: AuthSession | null;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  checkoutError: string | null;
  /** Present when the signed-in viewer still owes platform credentials —
      renders the gate card's second state instead of the pitch gate. */
  bridge?: WebCommunityBridgeCardProps | null;
};

// Settings > Sales page previews a style before it's published, in a frame
// (/c/<slug>/preview?presentation=…&embed=1). Read once when the page loads:
// the app rewrites /c/<slug>/preview to the canonical /c/<slug> before this
// page first renders, which drops these parameters.
const SALES_PREVIEW_PARAMS = (() => {
  if (typeof window === "undefined" || !/\/preview\/?$/.test(window.location.pathname)) {
    return { presentation: null, embed: false };
  }
  const params = new URLSearchParams(window.location.search);
  const presentation = params.get("presentation");
  return {
    presentation: presentation === "funnel" || presentation === "page" ? presentation : null,
    embed: params.get("embed") === "1",
  };
})();

export function WebPublicCommunityFunnel(props: WebPublicCommunityFunnelProps) {
  const {
    publicCommunity,
    publicRouteSlug,
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

  // The editor beside the preview frame sends its unpublished gallery and text,
  // so the owner sees them before publishing. Only the parent window, on this
  // site, can send them, and only into the embedded preview.
  const [draftAbout, setDraftAbout] = useState<{ media: SalesPageMediaItem[]; text: string; showMembers: boolean } | null>(null);
  useEffect(() => {
    if (!SALES_PREVIEW_PARAMS.embed) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data as { type?: string; media?: unknown; text?: unknown; showMembers?: unknown } | null;
      if (data?.type !== SALES_PREVIEW_MESSAGE || !Array.isArray(data.media) || typeof data.text !== "string") return;
      setDraftAbout({ media: data.media as SalesPageMediaItem[], text: data.text, showMembers: data.showMembers !== false });
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: `${SALES_PREVIEW_MESSAGE}:ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const isEmbeddedPreview = SALES_PREVIEW_PARAMS.embed;
  const aboutMedia = draftAbout?.media ?? publicCommunity?.about_media ?? [];
  const aboutText = draftAbout?.text ?? publicCommunity?.about_text ?? "";
  const showMembers = draftAbout?.showMembers ?? publicCommunity?.about_show_members !== false;

  const communityName = publicCommunity?.name ?? publicRouteSlug ?? "Community";
  const asSalesPage = SALES_PREVIEW_PARAMS.presentation
    ? SALES_PREVIEW_PARAMS.presentation === "funnel"
    : publicCommunity?.about_presentation === "funnel";
  // The public page wears the community's own look.
  const salesTheme = useWebCommunityThemeStyle(publicCommunity?.id ?? null);
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
    isEmbeddedPreview ||
    !publicCommunity ||
    checkoutStatus === "loading" ||
    isJoiningPublicCommunity ||
    (!canEnterCommunity && canJoinWithCheckout && (!hasSelectedPublicCommunityPlan || !primaryAction.hasValidPaidPlan)) ||
    (!canEnterCommunity && !canJoinWithCheckout && !canJoinForFree && !canJoinWithApproval) ||
    (canJoinWithApproval && (approvalPending || (approvalDenied && !canRequestAgain)));
  const offerChoice = useCommunityOfferChoice({
    // The owner's preview shows what a visitor sees (no session).
    communityId: publicCommunity?.id ?? null,
    session: isEmbeddedPreview ? null : props.offerSession ?? null,
    preferredPeriod: paidPlan?.billing_period ?? null,
    onStartOfferCheckout: isEmbeddedPreview ? undefined : props.onStartOfferCheckout,
    navigateToUrl: (url) => window.location.assign(url),
  });
  const funnelErrors = [publicCommunityError, publicJoinError, checkoutError].filter(
    Boolean,
  ) as string[];
  // A higher offer picked on the offer cards takes over the join button.
  const offerButton = offerChoice.button;
  const action = {
    communityName,
    primaryActionLabel: offerButton ? (checkoutStatus === "loading" ? "Opening checkout…" : offerButton.label) : primaryActionLabel,
    isPrimaryActionDisabled: offerButton ? isEmbeddedPreview || checkoutStatus === "loading" || offerButton.disabled : isPrimaryActionDisabled,
    onPrimaryAction: offerButton ? offerButton.onClick : onPrimaryJoinAction,
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

  const salesAddress = (() => {
    const url = communityJoinUrl(publicCommunity?.slug ?? publicRouteSlug);
    return url ? url.replace(/^https?:\/\//, "") : null;
  })();
  const alertMessages = !isLoadingPublicCommunity ? funnelErrors : [];
  if (asSalesPage && publicCommunity) {
    return (
      <div className="community-sales-public" data-community-theme={salesTheme.attribute ?? undefined}>
        <WebCommunitySalesPage
          community={publicCommunity}
          plan={paidPlan}
          renderModel={renderModel}
          media={aboutMedia}
          text={aboutText}
          showMembers={showMembers}
          address={salesAddress}
          alertMessages={alertMessages}
          action={
            <div className="community-sales-join">
              <WebCommunityOfferChooser choice={offerChoice} preferredPeriod={paidPlan?.billing_period ?? null} />
              <button
                type="button"
                className="community-sales-join-button"
                disabled={action.isPrimaryActionDisabled}
                onClick={action.onPrimaryAction}
              >
                {action.primaryActionLabel}
              </button>
              {offerChoice.note ? <p className="community-sales-join-note">{offerChoice.note}</p> : null}
              <ActionStatusCards action={action} />
            </div>
          }
        />
        {props.bridge ? (
          <WebBlockingSetupModal
            titleId="community-account-setup-title"
            descriptionId="community-account-setup-description"
            busy={props.bridge.setup.submission.isSaving}
            className="polynet-account-setup-modal"
          >
            <WebCommunityBridgeCard {...props.bridge} />
          </WebBlockingSetupModal>
        ) : null}
      </div>
    );
  }

  return (
    <div className="community-funnel-public" data-community-theme={salesTheme.attribute ?? undefined}>
      <WebCommunityFunnelRenderer
        communityId={publicCommunity?.id}
        communityName={communityName}
        avatarUrl={publicCommunity?.avatar_url ?? null}
        avatarFocusX={publicCommunity?.avatar_focus_x ?? null}
        avatarFocusY={publicCommunity?.avatar_focus_y ?? null}
        avatarZoom={publicCommunity?.avatar_zoom ?? null}
        memberCount={showMembers ? memberCount : null}
        memberFaces={showMembers ? publicCommunity?.member_faces_preview ?? [] : []}
        renderModel={renderModel}
        action={action}
        alertMessages={alertMessages}
        bridge={props.bridge ?? null}
        offers={offerChoice.offers.length ? (
          <>
            <WebCommunityOfferChooser choice={offerChoice} preferredPeriod={paidPlan?.billing_period ?? null} />
            {offerChoice.note ? <p className="community-funnel-offers-note">{offerChoice.note}</p> : null}
          </>
        ) : null}
      />
    </div>
  );
}
