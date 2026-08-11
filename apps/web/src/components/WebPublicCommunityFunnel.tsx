import type {
  CommunityFunnelConfig,
  CommunityFunnelContentV2,
  CommunityFunnelSlot,
  CommunityPublicFace,
  PublicPlanSummary,
} from "../../../../shared/communityTypes";
import { getAvatarColor } from "../../../../shared/chatUi";
import {
  buildCommunityFunnelPrimaryActionView,
  type CommunityFunnelUiMode,
} from "../../../../shared/communityFunnelUi";
import type { ReactNode } from "react";
import {
  WebCommunityBridgeCard,
  type WebCommunityBridgeCardProps,
} from "./WebCommunityBridgeCard";
import { CommunityContextPanel } from "./CommunityContextPanel";
import { CommunityFunnelPreview } from "./CommunityFunnelPreview";
import { WebMobileDrawer } from "./WebMobileDrawer";

type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";

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
  host?: Omit<CommunityPublicFace, "user_id"> | null;
  member_count?: number | null;
  member_faces_preview?: CommunityPublicFace[] | null;
  online_count?: number | null;
  online_count_capped?: boolean | null;
  online_faces?: CommunityPublicFace[] | null;
  funnel?: CommunityFunnelConfig | null;
};

type WebPublicCommunityFunnelProps = {
  publicCommunity: PublicCommunityFunnelCommunityLike | null;
  publicRouteSlug?: string;
  isPreviewMode?: boolean;
  previewSlot?: CommunityFunnelSlot;
  previewExitPath?: string | null;
  previewDocument?: CommunityFunnelContentV2 | null;
  previewVslUrl?: string | null;
  previewDocumentIsLoading?: boolean;
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
  onPrimaryJoinAction: () => void;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  checkoutError: string | null;
  mobileMembersOverlayOpen?: boolean;
  onCloseMobileMembersOverlay?: () => void;
  bridge?: WebCommunityBridgeCardProps | null;
};

function getInitialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function deriveFunnelMode(args: {
  canEnterCommunity: boolean;
  canJoinWithCheckout: boolean;
  canJoinWithApproval: boolean;
  canJoinForFree: boolean;
}): CommunityFunnelUiMode {
  if (args.canEnterCommunity) return "enter";
  if (args.canJoinWithCheckout) return "checkout";
  if (args.canJoinWithApproval) return "request_access";
  if (args.canJoinForFree) return "join";
  return "private";
}

export function WebPublicCommunityFunnel(props: WebPublicCommunityFunnelProps) {
  const {
    publicCommunity,
    publicRouteSlug,
    isPreviewMode = false,
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
    onPrimaryJoinAction,
    publicCommunityError,
    publicJoinError,
    checkoutError,
  } = props;

  const communityName = publicCommunity?.name ?? publicRouteSlug ?? "Community";
  const funnel = publicCommunity?.funnel ?? null;
  const funnelMode = deriveFunnelMode({
    canEnterCommunity,
    canJoinWithCheckout,
    canJoinWithApproval,
    canJoinForFree,
  });
  const primaryAction = buildCommunityFunnelPrimaryActionView({
    mode: funnelMode,
    plan: selectedPublicCommunityPlan,
    isBusy: isJoiningPublicCommunity || checkoutStatus === "loading",
    approvalPending,
    approvalDenied,
    canRequestAgain,
  });
  const isPrimaryActionDisabled =
    isPreviewMode ||
    !publicCommunity ||
    checkoutStatus === "loading" ||
    isJoiningPublicCommunity ||
    (!canEnterCommunity && canJoinWithCheckout && !primaryAction.hasValidPaidPlan) ||
    (!canEnterCommunity && !canJoinWithCheckout && !canJoinForFree && !canJoinWithApproval) ||
    (canJoinWithApproval && (approvalPending || (approvalDenied && !canRequestAgain)));
  const funnelErrors = [publicCommunityError, publicJoinError, checkoutError].filter(
    Boolean,
  ) as string[];
  const publicMemberFaces = publicCommunity?.member_faces_preview ?? [];
  const publicOnlineFaces = publicCommunity?.online_faces ?? [];
  const closeMobileMembersOverlay = props.onCloseMobileMembersOverlay ?? (() => {});
  const mobileMembersDrawer = publicCommunity ? (
    <WebMobileDrawer
      isOpen={Boolean(props.mobileMembersOverlayOpen)}
      ariaLabel={`${communityName} members`}
      title="Members"
      side="right"
      className="mobile-members-drawer public-funnel-members-drawer"
      footer={(
        <button
          className="cfg-join public-funnel-members-join"
          type="button"
          disabled={isPrimaryActionDisabled}
          onClick={() => {
            closeMobileMembersOverlay();
            onPrimaryJoinAction();
          }}
        >
          {primaryAction.label}
        </button>
      )}
      onClose={closeMobileMembersOverlay}
    >
      <CommunityContextPanel
        communityName={communityName}
        onlineFaces={publicOnlineFaces}
        onlineCount={publicCommunity.online_count ?? null}
        onlineCountCapped={Boolean(publicCommunity.online_count_capped)}
        memberCount={publicCommunity.member_count ?? null}
        lockedSections={{ members: true }}
        membersPreview={publicMemberFaces}
        onLockedSectionActivate={closeMobileMembersOverlay}
        displayName={(userId) =>
          [...publicOnlineFaces, ...publicMemberFaces].find(
            (face) => face.user_id === userId,
          )?.display_name ?? "Member"
        }
        getInitials={getInitialsFromLabel}
        getAvatarColor={getAvatarColor}
        sectionMode="members"
      />
    </WebMobileDrawer>
  ) : null;
  const renderWithBridge = (content: ReactNode) => (
    <>
      {content}
      {mobileMembersDrawer}
      {props.bridge ? (
        <div className="cfg-gate cvs-gate cvs-gate-bridge">
          <WebCommunityBridgeCard {...props.bridge} />
        </div>
      ) : null}
    </>
  );
  if (isLoadingPublicCommunity && !publicCommunity) {
    return (
      <div
        className="community-funnel-preview"
        aria-busy="true"
      >
        <main className="community-funnel-preview-main community-funnel-preview-empty">
          <strong>Loading community…</strong>
        </main>
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
        <CommunityFunnelPreview
          community={publicCommunity}
          content={props.previewDocument ?? null}
          deterministicContent={
            props.previewSlot === "default"
              ? {
                  headline: publicCommunity.one_liner?.trim() || communityName,
                  body: publicCommunity.about?.trim() || null,
                }
              : null
          }
          vslUrl={props.previewVslUrl}
          primaryActionLabel={primaryAction.label}
          isLoading={props.previewDocumentIsLoading}
          error={props.previewDocumentError}
        />
      </div>
    );
  }

  if (publicCommunity && funnel?.published_content_v2) {
    return renderWithBridge(
      <CommunityFunnelPreview
        community={publicCommunity}
        content={funnel.published_content_v2}
        vslUrl={funnel.published_vsl_url}
        primaryActionLabel={primaryAction.label}
        isPreview={false}
        primaryActionDisabled={isPrimaryActionDisabled}
        onPrimaryAction={onPrimaryJoinAction}
        error={funnelErrors[0] ?? null}
      />
    );
  }

  if (publicCommunity) {
    return renderWithBridge(
      <CommunityFunnelPreview
        community={publicCommunity}
        content={null}
        deterministicContent={{
          headline: publicCommunity.one_liner?.trim() || communityName,
          body: publicCommunity.about?.trim() || null,
        }}
        primaryActionLabel={primaryAction.label}
        isPreview={false}
        primaryActionDisabled={isPrimaryActionDisabled}
        onPrimaryAction={onPrimaryJoinAction}
        error={funnelErrors[0] ?? null}
      />
    );
  }

  return (
    <div className="community-funnel-preview">
      <main className="community-funnel-preview-main community-funnel-preview-empty">
        <strong role="alert">
          {funnelErrors[0] ?? "Community unavailable."}
        </strong>
      </main>
    </div>
  );
}
