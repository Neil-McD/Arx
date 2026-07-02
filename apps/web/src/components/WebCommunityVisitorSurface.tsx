/* The community page in visitor mode — V3 of the funnel. Renders the REAL
   member tree (CommunityNav + WebCommunityInteractionProjection with its
   CommunityContextPanel) fed by the public data plane, plus conversion
   chrome: arrival gate (receipt), join rope in the composer slot, and locks
   that answer with specificity. Laws: real or absent; gate the verbs, never
   the truth; the chrome never talks about the visitor's status. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityNav } from "../../../../shared/CommunityNav";
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
import {
  CommunityVisitorGate,
  CommunityVisitorJoinRope,
  type VisitorGateContext,
  type VisitorReceiptStats,
} from "./CommunityVisitorChrome";
import { WebCommunityInteractionProjection } from "./WebCommunityInteractionProjection";
import "./CommunityFunnelSurface.css";
import "./CommunityVisitorChrome.css";

export type WebCommunityVisitorSurfaceStats = {
  onlineCount: number | null;
  onlineFaces: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  memberCount: number | null;
  joinedLast30dCount: number | null;
  messagesTodayCount: number | null;
  memoryNoteCount: number | null;
  resourceCount: number | null;
};

type WebCommunityVisitorSurfaceProps = {
  isMobile?: boolean;
  title: string;
  action: CommunityFunnelSurfaceAction;
  host: VisitorHostLike | null;
  banner: CommunityFunnelSurfaceBanner | null;
  aboutText: string;
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
  showPoweredBy?: boolean;
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

const LOCKED_TAB_CONTEXT: Record<
  string,
  { note: string; row: "conversation" | "members" | "memory" | "resources" | null }
> = {
  ai_feed: { note: "the AI feed", row: null },
  resources: { note: "the resource library", row: "resources" },
  events: { note: "the events calendar", row: null },
};

export function WebCommunityVisitorSurface(props: WebCommunityVisitorSurfaceProps) {
  const {
    isMobile = false,
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
    showPoweredBy = false,
  } = props;

  const gateEligible = Boolean(gateSlugKey) && !action.isPreviewMode;
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMounted, setGateMounted] = useState(false);
  const [gateContext, setGateContext] = useState<VisitorGateContext>(null);

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

  const reopenGate = (context: VisitorGateContext = null) => {
    if (action.isPreviewMode) return;
    setGateContext(context);
    setGateMounted(true);
    window.setTimeout(() => setGateOpen(true), 20);
  };

  const hostName = host?.display_name?.trim() || null;
  const bannerUrl = banner?.url ?? props.heroArtImageUrl ?? null;
  const mediaNode = renderHeroMediaDefault(props.heroMediaKind, props.heroMediaUrl);

  const { roots, profilesByUserId } = useMemo(
    () =>
      buildWebCommunityVisitorProjection({
        communityName: title,
        aboutText,
        host,
        featuredMessages: props.featuredMessages,
      }),
    [title, aboutText, host, props.featuredMessages],
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

  const receiptStats: VisitorReceiptStats = {
    memberCount: stats.memberCount,
    joinedLast30dCount: stats.joinedLast30dCount,
    messagesTodayCount: stats.messagesTodayCount,
    memoryNoteCount: stats.memoryNoteCount,
    resourceCount: stats.resourceCount,
  };

  const activityParts: string[] = [];
  if (typeof stats.onlineCount === "number" && stats.onlineCount > 0) {
    activityParts.push(`${formatCompactStat(stats.onlineCount)} online`);
  }
  if (typeof stats.messagesTodayCount === "number" && stats.messagesTodayCount > 0) {
    activityParts.push(`${formatCompactStat(stats.messagesTodayCount)} messages today`);
  }

  const ropePrompt = props.featuredMessages?.length
    ? `Reply to ${profilesByUserId["visitor-sender-0"]?.display_name ?? "the room"}, ask the room anything…`
    : "This is where you'd talk — and where the community answers you, any hour…";

  return (
    <div className={`cfg-page${isMobile ? " is-mobile" : ""}`}>
      <div className="cvs-topbar">
        {activityParts.length > 0 ? (
          <span className="cvs-activity">
            <i aria-hidden="true" /> {activityParts.join(" · ")}
          </span>
        ) : null}
        <button
          className="cfg-join"
          type="button"
          disabled={action.isPrimaryActionDisabled}
          onClick={action.onPrimaryAction}
        >
          {action.primaryActionLabel}
        </button>
        {showPoweredBy ? (
          <span className="cfg-brand">
            Powered by Polynet · <a href="/">start your own →</a>
          </span>
        ) : null}
      </div>

      <div className="cfg-shell">
        <div className="cfg-mobile-ident">
          <div className="cfg-mav">
            <CommunityAvatar
              className="cfg-fill"
              imageUrl={action.avatarUrl}
              focusX={action.avatarFocusX}
              focusY={action.avatarFocusY}
              zoom={action.avatarZoom}
              name={action.communityName}
              alt=""
            />
          </div>
          <span>
            <b>{title}</b>
            <em>{action.cardBlurb}</em>
          </span>
        </div>

        <div className="cfg-nav">
          <CommunityNav
            activeCommunity={{
              slug: null,
              name: title,
              banner_url: bannerUrl,
              banner_focus_x: banner?.focusX ?? null,
              banner_focus_y: banner?.focusY ?? null,
              banner_zoom: banner?.zoom ?? null,
            }}
            communityTab="chat"
            canViewMembersActiveCommunity={false}
            canViewActiveCommunitySettings={false}
            canViewActiveCommunityPolynet={false}
            canManageMembersActiveCommunity={false}
            canViewActiveCommunityAnalytics={false}
            onSelectTab={(tab) => {
              if (tab === "chat") return;
              const context = LOCKED_TAB_CONTEXT[tab] ?? null;
              reopenGate(context ? { note: context.note, row: context.row } : null);
            }}
            buttonType="button"
            subtitle={action.cardBlurb}
            lockedTabs={{ ai_feed: true, resources: true, events: true }}
          />
          <div className="cfg-navfoot">
            Most rooms are members-only. <b>Join to enter.</b>
          </div>
        </div>

        <div className="cfg-center">
          <div className="cfg-topic">
            <b># chat</b>
            <span>the main room — members are in here now</span>
            {typeof stats.onlineCount === "number" && stats.onlineCount > 0 ? (
              <span className="cfg-live">
                <i aria-hidden="true" /> {formatCompactStat(stats.onlineCount)} online now
              </span>
            ) : null}
          </div>
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
              {mediaNode ? <div className="cfg-media">{mediaNode}</div> : null}
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
                  onSelectRoot={() => reopenGate({ note: "this thread", row: "conversation" })}
                  onToggleReaction={() => reopenGate({ note: "reacting", row: "conversation" })}
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
                      onRopeFieldActivate={() =>
                        reopenGate({ note: "posting", row: "conversation" })
                      }
                    />
                  }
                  presenceSummary={{
                    member_count: stats.memberCount,
                    online_count: stats.onlineCount,
                    online_faces: presenceFaces,
                  }}
                  communityMemberCount={stats.memberCount}
                  contextPanelLockedSections={{ members: true, memory: true }}
                  onContextPanelLockedSectionActivate={(section) =>
                    reopenGate(
                      section === "members"
                        ? { note: "the member roster", row: "members" }
                        : { note: "the community memory", row: "memory" },
                    )
                  }
                  communityMemoryCountLabel={
                    typeof stats.memoryNoteCount === "number" && stats.memoryNoteCount > 0
                      ? formatCompactStat(stats.memoryNoteCount)
                      : null
                  }
                />
              </div>
            </div>
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
            hostName={hostName}
            pricingLabel={pricingLabel}
            isFreePricing={isFreePricing}
            bannerUrl={bannerUrl}
            bannerStyle={banner?.url ? null : props.heroArtImageStyle ?? null}
            stats={receiptStats}
            context={gateContext}
            onLookAround={dismissGate}
          />
        </div>
      ) : null}
    </div>
  );
}
