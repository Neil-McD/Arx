/* The visitor LENS on the community page. This is NOT a page of its own:
   the shell renders the same nav column a member sees (App feeds it visitor
   capability values + locked tabs), and this surface renders the same chat
   panel DOM — the real WebCommunityInteractionProjection with its real
   CommunityContextPanel — fed by the public data plane. On top: one gate
   (logo, banner, VSL, counts, one-liner, Join, "View it first") and the
   rope in the composer slot. Locks reopen the gate. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { formatCompactStat } from "../../../../shared/communityFunnelUi";
import type { CommunityFunnelHeroMediaKind } from "../../../../shared/communityTypes";
import {
  buildWebCommunityVisitorProjection,
  type VisitorFeaturedMessageLike,
  type VisitorHostLike,
} from "../controllers/buildWebCommunityVisitorProjection";
import {
  hasSeenGate,
  markGateSeen,
  renderHeroMediaDefault,
  renderTextWithLinks,
  type CommunityFunnelSurfaceAction,
  type CommunityFunnelSurfaceBanner,
} from "./CommunityFunnelSurface";
import { CommunityVisitorGate, CommunityVisitorJoinRope } from "./CommunityVisitorChrome";
import { WebCommunityInteractionProjection } from "./WebCommunityInteractionProjection";
import "./CommunityVisitorChrome.css";

export type WebCommunityVisitorSurfaceStats = {
  onlineCount: number | null;
  onlineFaces: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  memberCount: number | null;
  memoryNoteCount: number | null;
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
  featuredMessages: VisitorFeaturedMessageLike[] | null;
  stats: WebCommunityVisitorSurfaceStats;
  pricingLabel: string;
  isFreePricing: boolean;
  alertMessages?: string[];
  gateSlugKey?: string | null;
  /** Bumped by the shell when a locked nav tab is tapped — reopens the gate. */
  gateOpenNonce?: number;
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
    banner,
    aboutText,
    stats,
    pricingLabel,
    isFreePricing,
    alertMessages = [],
    gateSlugKey = null,
  } = props;

  const gateEligible = Boolean(gateSlugKey) && !action.isPreviewMode;
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMounted, setGateMounted] = useState(false);
  const lastGateNonceRef = useRef(props.gateOpenNonce ?? 0);

  useEffect(() => {
    if (!gateEligible || !gateSlugKey) return;
    if (hasSeenGate(gateSlugKey)) return;
    setGateMounted(true);
    setGateOpen(true);
  }, [gateEligible, gateSlugKey]);

  const dismissGate = () => {
    if (gateSlugKey) markGateSeen(gateSlugKey);
    setGateOpen(false);
    window.setTimeout(() => setGateMounted(false), 450);
  };

  const reopenGate = () => {
    if (action.isPreviewMode) return;
    setGateMounted(true);
    window.setTimeout(() => setGateOpen(true), 20);
  };

  useEffect(() => {
    const nonce = props.gateOpenNonce ?? 0;
    if (nonce === lastGateNonceRef.current) return;
    lastGateNonceRef.current = nonce;
    reopenGate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gateOpenNonce]);

  const bannerUrl = banner?.url ?? props.heroArtImageUrl ?? null;
  const mediaNode = renderHeroMediaDefault(props.heroMediaKind, props.heroMediaUrl);

  const { roots, profilesByUserId } = useMemo(
    () =>
      buildWebCommunityVisitorProjection({
        communityName: title,
        aboutText,
        host,
        featuredMessages: props.featuredMessages,
        communityCreatedAt: props.communityCreatedAt,
      }),
    [title, aboutText, host, props.featuredMessages, props.communityCreatedAt],
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

  const ropePrompt = props.featuredMessages?.length
    ? `Reply to ${profilesByUserId["visitor-sender-0"]?.display_name ?? "the room"}, ask the room anything…`
    : "This is where you'd talk — and where the community answers you, any hour…";

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
          <div className="community-interaction-scroll">
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
            />
          </div>
        </div>
      </div>

      {gateMounted ? (
        <div
          className={`cfg-gate${gateOpen ? "" : " off"}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissGate();
          }}
        >
          <CommunityVisitorGate
            action={action}
            pricingLabel={pricingLabel}
            isFreePricing={isFreePricing}
            bannerUrl={bannerUrl}
            bannerStyle={banner?.url ? null : props.heroArtImageStyle ?? null}
            media={mediaNode}
            onViewFirst={dismissGate}
          />
        </div>
      ) : null}
    </>
  );
}
