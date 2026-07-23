/* The visitor LENS on the community page. This is NOT a page of its own:
   the shell renders the same nav column a member sees (App feeds it visitor
   capability values + locked tabs), and this surface renders the same chat
   panel DOM — the real WebCommunityInteractionProjection with its real
   CommunityContextPanel — fed by the public data plane. On top: one gate
   (logo, banner, VSL, counts, one-liner, Join, "View it first") and the
   rope in the composer slot. Locks reopen the gate. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { CloudCommunityPolynetOverview } from "../../../../shared/cloudCommunityPolynetGateway";
import { formatCompactStat } from "../../../../shared/communityFunnelUi";
import type { CommunityFunnelHeroMediaKind } from "../../../../shared/communityTypes";
import {
  buildWebCommunityVisitorProjection,
  type VisitorHostLike,
} from "../controllers/buildWebCommunityVisitorProjection";
import {
  renderHeroMediaDefault,
  renderTextWithLinks,
  type CommunityFunnelSurfaceAction,
  type CommunityFunnelSurfaceBanner,
} from "./CommunityFunnelSurface";
import {
  CommunityVisitorChatFrostChip,
  CommunityVisitorGate,
  CommunityVisitorGhostThread,
  CommunityVisitorJoinRope,
  CommunityVisitorMobileJoinDock,
} from "./CommunityVisitorChrome";
import { CommunityContextPanel } from "./CommunityContextPanel";
import { WebCommunityBridgeCard, type WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";
import { WebCommunityInteractionProjection } from "./WebCommunityInteractionProjection";
import { WebMobileDrawer } from "./WebMobileDrawer";
import "./CommunityVisitorChrome.css";

type VisitorPublicFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type WebCommunityVisitorSurfaceStats = {
  onlineCount: number | null;
  onlineFaces: VisitorPublicFace[];
  memberCount: number | null;
  memoryNoteCount: number | null;
  messagesTodayCount: number | null;
  memberFacesPreview: VisitorPublicFace[];
};

type WebCommunityVisitorSurfaceProps = {
  title: string;
  action: CommunityFunnelSurfaceAction;
  host: VisitorHostLike | null;
  banner: CommunityFunnelSurfaceBanner | null;
  aboutText: string;
  communityCreatedAt: string | null;
  heroMediaKind: CommunityFunnelHeroMediaKind;
  heroMediaUrl: string | null;
  heroArtImageUrl?: string | null;
  heroArtImageStyle?: CSSProperties | null;
  stats: WebCommunityVisitorSurfaceStats;
  memoryOverview: CloudCommunityPolynetOverview | null;
  pricingLabel: string;
  isFreePricing: boolean;
  alertMessages?: string[];
  gateSlugKey?: string | null;
  /** Bumped by the shell when a locked nav tab is tapped — reopens the gate. */
  gateOpenNonce?: number;
  isMobileLayout?: boolean;
  mobileMembersOverlayOpen?: boolean;
  onCloseMobileMembersOverlay?: () => void;
  /** The gate card's second state: signed-in, setup incomplete — collect
      identity + inference in place, then enter. Unskippable while present. */
  bridge?: WebCommunityBridgeCardProps | null;
};

const NOOP = () => {};

function getInitialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatVisitorChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WebCommunityVisitorSurface(props: WebCommunityVisitorSurfaceProps) {
  const {
    title,
    action,
    host,
    aboutText,
    stats,
    pricingLabel,
    isFreePricing,
    alertMessages = [],
    gateSlugKey = null,
  } = props;

  const gateEligible = Boolean(gateSlugKey);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMounted, setGateMounted] = useState(false);
  const [isHostIntroExpanded, setIsHostIntroExpanded] = useState(false);
  const lastGateNonceRef = useRef(props.gateOpenNonce ?? 0);

  /* The gate shows on EVERY arrival — "View it first" dismisses for this
     visit only; a fresh load brings the front door back. */
  useEffect(() => {
    if (!gateEligible) return;
    setGateMounted(true);
    setGateOpen(true);
  }, [gateEligible]);

  useEffect(() => {
    setIsHostIntroExpanded(false);
  }, [title, aboutText]);

  const dismissGate = () => {
    setGateOpen(false);
    window.setTimeout(() => setGateMounted(false), 450);
  };

  const reopenGate = () => {
    setGateMounted(true);
    window.setTimeout(() => setGateOpen(true), 20);
  };

  const closeMembersAndReopenGate = () => {
    props.onCloseMobileMembersOverlay?.();
    reopenGate();
  };

  useEffect(() => {
    const nonce = props.gateOpenNonce ?? 0;
    if (nonce === lastGateNonceRef.current) return;
    lastGateNonceRef.current = nonce;
    reopenGate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gateOpenNonce]);

  const [isVslPlaying, setIsVslPlaying] = useState(false);
  const gateMediaNode = renderHeroMediaDefault(props.heroMediaKind, props.heroMediaUrl, {
    eager: true,
    onActivate: () => setIsVslPlaying(true),
    playHint: "Watch the intro",
  });

  const { roots, profilesByUserId } = useMemo(
    () =>
      buildWebCommunityVisitorProjection({
        communityName: title,
        aboutText,
        host,
        communityCreatedAt: props.communityCreatedAt,
      }),
    [title, aboutText, host, props.communityCreatedAt],
  );

  const presenceFaces = useMemo(
    () =>
      stats.onlineFaces.map((face) => ({
        user_id: face.user_id,
        display_name: face.display_name,
        avatar_url: face.avatar_url,
        initials: getInitialsFromLabel(face.display_name ?? "?"),
      })),
    [stats.onlineFaces],
  );

  const memberPreviewFaces = useMemo(
    () =>
      stats.memberFacesPreview.map((face) => ({
        user_id: face.user_id,
        display_name: face.display_name,
        avatar_url: face.avatar_url,
        initials: getInitialsFromLabel(face.display_name ?? "?"),
      })),
    [stats.memberFacesPreview],
  );

  const ropePrompt = props.isMobileLayout
    ? "Join to participate"
    : "This is where you'd talk — and where the community answers you, any hour…";

  /* The frost: everything in the feed below the pinned host post sits behind
     glass. Measured against the real DOM (static content, remeasured on
     resize) so the pinned post stays clear and the frost fills the rest. */
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const [frostRect, setFrostRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const shell = previewShellRef.current;
    if (!shell) return;
    const measure = () => {
      const feedScroll = shell.querySelector(".community-interaction-feed-scroll");
      if (!feedScroll) {
        setFrostRect(null);
        return;
      }
      const shellRect = shell.getBoundingClientRect();
      const feedRect = feedScroll.getBoundingClientRect();
      /* No pinned post → the whole feed area is the glass. */
      const firstGroup = shell.querySelector(".community-interaction-group");
      const groupBottom = firstGroup
        ? firstGroup.getBoundingClientRect().bottom + 6
        : feedRect.top;
      const top = Math.max(feedRect.top, groupBottom) - shellRect.top;
      /* The frost fills everything below the pinned post and the ghost thread. */
      const height = feedRect.bottom - shellRect.top - top;
      if (height < 48) {
        setFrostRect(null);
        return;
      }
      setFrostRect({
        top,
        left: feedRect.left - shellRect.left,
        width: feedRect.width,
        height,
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(shell);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [roots]);

  return (
    <>
      <div className="community-chat cvs-chat">
        <div className="workspace-body chat-feed">
          {alertMessages.length > 0 ? (
            <div className="cfg-alerts">
              {alertMessages.map((message) => (
                <div key={message} className="cfg-alert">
                  {message}
                </div>
              ))}
            </div>
          ) : null}
          <div className="community-interaction-scroll cvs-preview" ref={previewShellRef}>
            <WebCommunityInteractionProjection
              activeCommunityName={title}
              roots={roots}
              selectedRootId={null}
              replies={[]}
              isLoadingRoots={false}
              isLoadingReplies={false}
              error={null}
              repliesError={null}
              onSelectRoot={reopenGate}
              onToggleReaction={reopenGate}
              onCloseDrawer={NOOP}
              onRetryRoots={NOOP}
              onRetryReplies={NOOP}
              profilesByUserId={profilesByUserId}
              displayName={(userId) => profilesByUserId[userId]?.display_name ?? "Member"}
              getAvatarColor={() => "var(--accent-gold, #d66a8a)"}
              getInitials={getInitialsFromLabel}
              formatChatTime={formatVisitorChatTime}
              renderTextWithLinks={renderTextWithLinks}
              currentUserId={null}
              mainComposer={
                <CommunityVisitorJoinRope
                  action={action}
                  ropePrompt={ropePrompt}
                  pricingLabel={pricingLabel}
                  isFreePricing={isFreePricing}
                  onRopeFieldActivate={reopenGate}
                />
              }
              firstRootBodyExpansion={props.isMobileLayout ? {
                expanded: isHostIntroExpanded,
                onToggle: () => setIsHostIntroExpanded((expanded) => !expanded),
              } : undefined}
              presenceSummary={{
                member_count: stats.memberCount,
                online_count: stats.onlineCount,
                online_faces: presenceFaces,
              }}
              communityMemberCount={stats.memberCount}
              contextPanelLockedSections={{ members: true, memory: true }}
              onContextPanelLockedSectionActivate={reopenGate}
              communityMemoryCountLabel={
                typeof stats.memoryNoteCount === "number" && stats.memoryNoteCount > 0
                  ? formatCompactStat(stats.memoryNoteCount)
                  : null
              }
              contextPanelMembersPreview={memberPreviewFaces}
              communityMemoryOverview={props.memoryOverview}
            />
            {frostRect ? (
              <div
                className="cvs-frost"
                style={{
                  top: frostRect.top,
                  left: frostRect.left,
                  width: frostRect.width,
                  height: frostRect.height,
                }}
                onClick={reopenGate}
              >
                {roots.length <= 1 ? <CommunityVisitorGhostThread /> : null}
                <CommunityVisitorChatFrostChip
                  messagesTodayCount={stats.messagesTodayCount}
                  onActivate={reopenGate}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {props.isMobileLayout ? (
        <CommunityVisitorMobileJoinDock
          action={action}
          pricingLabel={pricingLabel}
          isFreePricing={isFreePricing}
        />
      ) : null}

      <WebMobileDrawer
        isOpen={Boolean(props.mobileMembersOverlayOpen)}
        ariaLabel={`${title} members`}
        title="Members"
        side="right"
        className="mobile-members-drawer cvs-members-drawer"
        footer={(
          <button
            className="cfg-join cvs-members-join"
            type="button"
            disabled={action.isPrimaryActionDisabled}
            onClick={() => {
              props.onCloseMobileMembersOverlay?.();
              action.onPrimaryAction();
            }}
          >
            {action.primaryActionLabel}
          </button>
        )}
        onClose={props.onCloseMobileMembersOverlay ?? NOOP}
      >
        <CommunityContextPanel
          communityName={title}
          onlineFaces={presenceFaces}
          onlineCount={stats.onlineCount}
          memberCount={stats.memberCount}
          lockedSections={{ members: true }}
          onLockedSectionActivate={closeMembersAndReopenGate}
          membersPreview={memberPreviewFaces}
          displayName={() => "Member"}
          getInitials={getInitialsFromLabel}
          getAvatarColor={() => "var(--accent-gold, #d66a8a)"}
          sectionMode="members"
        />
      </WebMobileDrawer>

      {props.bridge ? (
        /* Bridge state: the front door asks for credentials. No backdrop
           dismiss, no "View it first" — completing it is the only way in. */
        <div className="cfg-gate cvs-gate cvs-gate-bridge">
          <WebCommunityBridgeCard {...props.bridge} />
        </div>
      ) : gateMounted ? (
        <div
          className={`cfg-gate cvs-gate${gateOpen ? "" : " off"}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissGate();
          }}
        >
          <CommunityVisitorGate
            action={action}
            pricingLabel={pricingLabel}
            isFreePricing={isFreePricing}
            media={gateMediaNode}
            isMediaPlaying={isVslPlaying}
            onViewFirst={dismissGate}
          />
        </div>
      ) : null}
    </>
  );
}
