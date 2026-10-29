import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Globe2, Lock, Play, Tag, Users } from "lucide-react";

import type { CommunityFunnelRenderModel } from "../../../../shared/communityFunnelUi";
import { formatPublicPlanJoinPrice } from "../../../../shared/communityFunnelUi";
import type { CommunityPublicFace, PublicPlanSummary } from "../../../../shared/communityTypes";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { renderHeroMediaDefault } from "./CommunityFunnelSurface";
import { CommunityFunnelMemberProof } from "./CommunityFunnelMemberProof";
import { EditableSalesGallery, EditableSalesText, type SalesPageEditControls } from "./WebCommunitySalesPageEditing";
import "./WebCommunitySalesPage.css";

// The About page as a sales page: one page that a
// visitor lands on and a member opens from the About tab. Media, the facts a
// buyer checks (who runs it, how many people, what it costs), the pitch, and a
// card beside it with the join button. It only arranges what the public funnel
// already has: the published funnel copy and video, the community profile,
// member stats and the selling plan. The caller supplies the action, so the
// public page joins or checks out and the member view invites.

export type CommunitySalesPageCommunity = {
  id?: string;
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
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  host?: Omit<CommunityPublicFace, "user_id"> | null;
  member_count?: number | null;
  online_count?: number | null;
  admin_count?: number | null;
  member_faces_preview?: CommunityPublicFace[] | null;
};

// A picture or video in the sales page gallery (layout pages.about.media).
export type SalesPageMediaItem = { kind: "image" | "video"; url: string; caption: string };

// What the sales page editor posts into its preview frame: the unpublished
// gallery and text.
export const SALES_PREVIEW_MESSAGE = "polynet:sales-page-preview";

export type WebCommunitySalesPageProps = {
  community: CommunitySalesPageCommunity;
  plan: PublicPlanSummary | null;
  renderModel: CommunityFunnelRenderModel;
  // Shown under the card's stats: the join button and its status notes.
  action: ReactNode;
  // A short address under the card's name, e.g. polynet.ai/c/the-2-hour-club.
  address?: string | null;
  alertMessages?: string[];
  // The owner's gallery: shown instead of the single video or banner.
  media?: SalesPageMediaItem[] | null;
  // The owner's text under the media: shown instead of the funnel copy.
  text?: string | null;
  // Off: no member faces, counts or stats anywhere on the page.
  showMembers?: boolean;
  // The owner editing the page in place (About tab › Edit page).
  edit?: SalesPageEditControls | null;
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

function compactCount(value: number): string {
  return value >= 10_000
    ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : value.toLocaleString();
}

function priceFact(community: CommunitySalesPageCommunity, plan: PublicPlanSummary | null): string {
  if (community.entry_policy === "paid_subscription") return formatPublicPlanJoinPrice(plan) ?? "Paid";
  if (community.entry_policy === "approval") return "Free · by approval";
  return "Free";
}

function SalesPageMedia(props: { community: CommunitySalesPageCommunity; vslUrl: string | null }) {
  if (props.vslUrl) {
    return (
      <div className="community-sales-media">
        {renderHeroMediaDefault("video", props.vslUrl, { eager: true, playHint: "Watch the intro" })}
      </div>
    );
  }
  if (!props.community.banner_url) return null;
  return (
    <div className="community-sales-media">
      <img
        src={props.community.banner_url}
        alt=""
        style={{
          objectPosition: `${(props.community.banner_focus_x ?? 0.5) * 100}% ${(props.community.banner_focus_y ?? 0.5) * 100}%`,
        }}
      />
    </div>
  );
}

function videoThumbnail(url: string): string | null {
  const embed = parseEmbedUrl(url);
  if (embed?.provider === "youtube") return embed.thumbnailUrl;
  if (embed?.provider === "loom") return `https://cdn.loom.com/sessions/thumbnails/${embed.id}-00001.jpg`;
  return null;
}

// A picture on the gallery shows whole. The slide takes the picture's own
// shape, kept between portrait 4:5 and wide 4:1 so a very tall or very wide
// one can't swamp the page; whatever room is left is filled by a soft, blurred
// copy of the picture rather than bars.
const GALLERY_RATIO_MIN = 4 / 5;
const GALLERY_RATIO_MAX = 4;

function GallerySlidePicture(props: { url: string; alt: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <div
      className="community-sales-media is-picture"
      style={ratio ? { aspectRatio: String(Math.min(GALLERY_RATIO_MAX, Math.max(GALLERY_RATIO_MIN, ratio))) } : undefined}
    >
      <img className="community-sales-media-backdrop" src={props.url} alt="" aria-hidden="true" />
      <img
        src={props.url}
        alt={props.alt}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
        }}
      />
    </div>
  );
}

// The gallery: one slide at a time, arrows and the arrow keys to move, and a
// row of thumbnails to jump. A video plays in place; moving on stops it.
export function SalesPageGallery(props: {
  items: SalesPageMediaItem[];
  communityName: string;
  // Editing on the page: the slide shown is held by the editor, which adds a
  // toolbar on the slide, an editable caption and a "+" after the thumbnails.
  index?: number;
  onIndexChange?: (index: number) => void;
  stageOverlay?: ReactNode;
  caption?: ReactNode;
  afterThumbs?: ReactNode;
}) {
  const { items } = props;
  const [ownIndex, setOwnIndex] = useState(0);
  const index = props.index ?? ownIndex;
  const setIndex = (next: number | ((value: number) => number)) => {
    const value = typeof next === "function" ? next(index) : next;
    if (props.onIndexChange) props.onIndexChange(value);
    else setOwnIndex(value);
  };
  useEffect(() => {
    if (index >= items.length) setIndex(Math.max(0, items.length - 1));
  }, [index, items.length]);
  const current = items[Math.min(index, items.length - 1)];
  if (!current) return null;
  const many = items.length > 1;
  const go = (step: number) => setIndex((value) => (value + step + items.length) % items.length);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!many) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
  };
  return (
    <figure className="community-sales-gallery" aria-roledescription="carousel" aria-label={`${props.communityName} pictures and videos`}>
      <div className="community-sales-gallery-stage" tabIndex={many ? 0 : undefined} onKeyDown={onKeyDown}>
        <div className="community-sales-gallery-slide" key={`${index}:${current.url}`} aria-roledescription="slide" aria-label={`${index + 1} of ${items.length}`}>
          {current.kind === "video"
            ? <div className="community-sales-media">{renderHeroMediaDefault("video", current.url, { eager: index === 0, playHint: "Watch" })}</div>
            : <GallerySlidePicture url={current.url} alt={current.caption || ""} />}
        </div>
        {many ? <span className="community-sales-gallery-count" aria-hidden="true">{index + 1} / {items.length}</span> : null}
        {props.stageOverlay}
      </div>
      {props.caption !== undefined
        ? props.caption
        : current.caption ? <figcaption className="community-sales-gallery-caption">{current.caption}</figcaption> : null}
      {many || props.afterThumbs ? (
        <div className="community-sales-gallery-nav">
        {/* The arrows sit beside the thumbnails, not on the slide, so they
            never cover part of a picture (2026-10-28). */}
        {many ? (
          <button type="button" className="community-sales-gallery-arrow" aria-label="Previous" onClick={() => go(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <div className="community-sales-gallery-thumbs" role="tablist" aria-label="Choose a slide">
          {items.map((item, itemIndex) => {
            const picture = item.kind === "image" ? item.url : videoThumbnail(item.url);
            return (
              <button
                key={`${itemIndex}:${item.url}`}
                type="button"
                role="tab"
                aria-selected={itemIndex === index}
                aria-label={`${item.kind === "video" ? "Video" : "Picture"} ${itemIndex + 1}${item.caption ? `: ${item.caption}` : ""}`}
                className={`community-sales-gallery-thumb${itemIndex === index ? " is-current" : ""}${picture ? "" : " is-blank"}`}
                onClick={() => setIndex(itemIndex)}
              >
                {picture ? <img src={picture} alt="" loading="lazy" /> : null}
                {item.kind === "video" ? <span className="community-sales-gallery-play" aria-hidden="true"><Play size={12} fill="currentColor" /></span> : null}
              </button>
            );
          })}
          {props.afterThumbs}
        </div>
        {many ? (
          <button type="button" className="community-sales-gallery-arrow" aria-label="Next" onClick={() => go(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : null}
        </div>
      ) : null}
    </figure>
  );
}

export function WebCommunitySalesPage(props: WebCommunitySalesPageProps) {
  const { community, renderModel } = props;
  const showMembers = props.showMembers !== false;
  const memberCount = showMembers && typeof community.member_count === "number" ? community.member_count : null;
  const onlineCount = showMembers && typeof community.online_count === "number" ? community.online_count : null;
  const adminCount = showMembers && typeof community.admin_count === "number" ? community.admin_count : null;
  const isCustom = renderModel.mode === "custom";
  const about = String(community.about ?? "").trim();
  const hostName = community.host?.display_name?.trim() || null;
  const isOpen = community.entry_policy === "open";
  const media = props.media ?? [];
  const ownText = String(props.text ?? "").trim();

  return (
    <div className="community-sales-page">
      <article className="community-sales-main">
        <h1 className="community-sales-title">{community.name}</h1>
        {props.edit
          ? <EditableSalesGallery items={media} communityName={community.name} edit={props.edit} />
          : media.length > 0
            ? <SalesPageGallery items={media} communityName={community.name} />
            : <SalesPageMedia community={community} vslUrl={renderModel.vslUrl} />}

        <ul className="community-sales-facts" aria-label="At a glance">
          <li>
            {isOpen ? <Globe2 size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
            {isOpen ? "Open to join" : "Private"}
          </li>
          {memberCount !== null ? (
            <li>
              <Users size={16} aria-hidden="true" />
              {compactCount(memberCount)} {memberCount === 1 ? "member" : "members"}
            </li>
          ) : null}
          <li>
            <Tag size={16} aria-hidden="true" />
            {priceFact(community, props.plan)}
          </li>
          {hostName ? (
            <li className="community-sales-host">
              <UserAvatar
                className="community-sales-host-avatar"
                readyClassName="has-image"
                imageClassName="community-sales-host-avatar-image"
                fallbackClassName="community-sales-host-avatar-fallback"
                name={hostName}
                imageUrl={community.host?.avatar_url ?? null}
                focusX={community.host?.avatar_focus_x ?? 0.5}
                focusY={community.host?.avatar_focus_y ?? 0.5}
                zoom={community.host?.avatar_zoom ?? 1}
                fallback={<span>{initials(hostName)}</span>}
                alt=""
                aria-hidden={true}
              />
              By {hostName}
            </li>
          ) : null}
        </ul>

        {props.alertMessages?.length ? (
          <div className="community-sales-alerts" role="status">
            {props.alertMessages.map((message) => <p key={message}>{message}</p>)}
          </div>
        ) : null}

        <div className="community-sales-action-inline">{props.action}</div>

        {props.edit ? (
          <EditableSalesText text={ownText} edit={props.edit} />
        ) : <div className="community-sales-copy">
          {ownText ? (
            renderMarkdown(ownText, { headingLevelOffset: 1 })
          ) : isCustom ? (
            <>
              {renderModel.headline ? <p className="community-sales-lead">{renderModel.headline}</p> : null}
              {renderModel.subheadline ? <p>{renderModel.subheadline}</p> : null}
              {renderModel.pillars.length ? (
                <ul className="community-sales-pillars">
                  {renderModel.pillars.map((pillar, index) => (
                    <li key={`${index}:${pillar.title}`}>
                      <strong>{pillar.title}</strong>
                      <span>{pillar.body}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {renderModel.longFormMarkdown ? renderMarkdown(renderModel.longFormMarkdown, { headingLevelOffset: 1 }) : null}
            </>
          ) : about ? (
            renderMarkdown(about, { headingLevelOffset: 1 })
          ) : community.one_liner ? (
            <p className="community-sales-lead">{community.one_liner}</p>
          ) : null}
        </div>}
      </article>

      <aside className="community-sales-card" aria-label={`Join ${community.name}`}>
        {community.banner_url ? (
          <div className="community-sales-card-banner">
            <img
              src={community.banner_url}
              alt=""
              style={{
                objectPosition: `${(community.banner_focus_x ?? 0.5) * 100}% ${(community.banner_focus_y ?? 0.5) * 100}%`,
              }}
            />
          </div>
        ) : null}
        <div className="community-sales-card-body">
          <div className="community-sales-card-identity">
            <UserAvatar
              className="community-sales-card-avatar"
              readyClassName="has-image"
              imageClassName="community-sales-card-avatar-image"
              fallbackClassName="community-sales-card-avatar-fallback"
              name={community.name}
              imageUrl={community.avatar_url ?? null}
              focusX={community.avatar_focus_x ?? 0.5}
              focusY={community.avatar_focus_y ?? 0.5}
              zoom={community.avatar_zoom ?? 1}
              fallback={<span>{initials(community.name)}</span>}
              alt=""
              aria-hidden={true}
            />
            <div>
              <h2>{community.name}</h2>
              {props.address ? <p className="community-sales-card-address">{props.address}</p> : null}
            </div>
          </div>
          {community.one_liner ? <p className="community-sales-card-description">{community.one_liner}</p> : null}
          {showMembers ? (
            <CommunityFunnelMemberProof
              communityName={community.name}
              faces={community.member_faces_preview ?? []}
              memberCount={memberCount}
            />
          ) : null}
          {memberCount !== null || onlineCount !== null || adminCount !== null ? (
            <dl className="community-sales-card-stats">
              {memberCount !== null ? (
                <div>
                  <dt>Members</dt>
                  <dd>{compactCount(memberCount)}</dd>
                </div>
              ) : null}
              {onlineCount !== null ? (
                <div>
                  <dt>Online</dt>
                  <dd>{compactCount(onlineCount)}</dd>
                </div>
              ) : null}
              {adminCount !== null ? (
                <div>
                  <dt>{adminCount === 1 ? "Admin" : "Admins"}</dt>
                  <dd>{compactCount(adminCount)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className="community-sales-card-action">{props.action}</div>
        </div>
      </aside>
    </div>
  );
}
