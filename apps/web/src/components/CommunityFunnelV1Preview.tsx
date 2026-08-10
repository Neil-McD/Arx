import {
  Brain,
  ChevronDown,
  Play,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type {
  CommunityFunnelDocumentV1,
  CommunityFunnelSectionV1,
} from "../../../../shared/communityTypes";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import "./CommunityFunnelV1Preview.css";

type Face = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type PreviewCommunity = {
  id?: string;
  name: string;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  member_count?: number | null;
  member_faces_preview?: Face[] | null;
  host?: {
    display_name: string | null;
    avatar_url: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  } | null;
};

const BENEFIT_ICONS: LucideIcon[] = [UsersRound, Brain, Sparkles, UsersRound];

function PreviewMedia(props: {
  community: PreviewCommunity;
  section: Extract<CommunityFunnelSectionV1, { type: "media" }>;
}) {
  const embed = props.section.media_url
    ? parseEmbedUrl(props.section.media_url)
    : null;
  return (
    <section className="funnel-v1-media" aria-label="Community media">
      {embed ? (
        <iframe
          src={embed.src}
          title={`${props.community.name} intro video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : props.community.banner_url ? (
        <div className="funnel-v1-media-poster">
          <img
            src={props.community.banner_url}
            alt=""
            style={{
              objectPosition: `${(props.community.banner_focus_x ?? 0.5) * 100}% ${(props.community.banner_focus_y ?? 0.5) * 100}%`,
              transform: `scale(${props.community.banner_zoom ?? 1})`,
            }}
          />
          <span className="funnel-v1-play" aria-hidden="true">
            <Play />
          </span>
        </div>
      ) : (
        <div className="funnel-v1-media-empty">
          <CommunityAvatar
            communityId={props.community.id}
            name={props.community.name}
            imageUrl={props.community.avatar_url ?? null}
            className="funnel-v1-media-empty-avatar"
            style={{ width: 88, height: 88 }}
          />
          <span>Add an approved intro video or community banner.</span>
        </div>
      )}
      {props.section.caption ? (
        <p className="funnel-v1-media-caption">{props.section.caption}</p>
      ) : null}
    </section>
  );
}

export function CommunityFunnelV1Preview(props: {
  community: PreviewCommunity;
  document: CommunityFunnelDocumentV1;
  primaryActionLabel: string;
  isLoading?: boolean;
  error?: string | null;
}) {
  const { community, document } = props;
  const faces = (community.member_faces_preview ?? [])
    .filter((face) => Boolean(face.avatar_url))
    .slice(0, 8);
  const memberCount =
    typeof community.member_count === "number" ? community.member_count : null;

  const renderSection = (section: CommunityFunnelSectionV1, index: number) => {
    if (section.type === "hero") {
      return (
        <section
          key={section.id}
          className={`funnel-v1-hero is-${section.alignment}`}
        >
          {section.eyebrow ? (
            <span className="funnel-v1-eyebrow">{section.eyebrow}</span>
          ) : null}
          <h1>{section.headline}</h1>
          <p>{section.body}</p>
        </section>
      );
    }
    if (section.type === "media")
      return (
        <PreviewMedia
          key={section.id}
          community={community}
          section={section}
        />
      );
    if (section.type === "benefits") {
      return (
        <section
          key={section.id}
          className="funnel-v1-benefits"
          aria-label={section.heading ?? "Community benefits"}
        >
          {section.heading ? <h2>{section.heading}</h2> : null}
          <div className="funnel-v1-pillars">
            {section.items.map((item, itemIndex) => {
              const Icon = BENEFIT_ICONS[itemIndex] ?? Sparkles;
              return (
                <article key={`${section.id}-${itemIndex}`}>
                  <Icon aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              );
            })}
          </div>
        </section>
      );
    }
    if (section.type === "social_proof") {
      if (
        !section.headline &&
        !section.body &&
        !faces.length &&
        memberCount === null
      )
        return null;
      return (
        <section key={section.id} className="funnel-v1-member-proof">
          {section.headline ? <h2>{section.headline}</h2> : null}
          {faces.length ? (
            <div className="funnel-v1-facepile" aria-label="Community members">
              {faces.map((face) => (
                <img key={face.user_id} src={face.avatar_url ?? ""} alt="" />
              ))}
              {memberCount !== null && memberCount > faces.length ? (
                <span>+{memberCount - faces.length}</span>
              ) : null}
            </div>
          ) : null}
          <p>
            {section.body ??
              (memberCount !== null
                ? `${memberCount.toLocaleString()} members and counting`
                : "Members and counting")}
          </p>
        </section>
      );
    }
    if (section.type === "testimonial") {
      return (
        <section key={section.id} className="funnel-v1-proof">
          {community.host?.avatar_url ? (
            <img src={community.host.avatar_url} alt="" />
          ) : null}
          <blockquote>
            <p>“{section.quote}”</p>
            <footer>
              <strong>{section.attribution}</strong>
            </footer>
          </blockquote>
        </section>
      );
    }
    if (section.type === "faq") {
      return (
        <section key={section.id} className="funnel-v1-faq">
          <h2>{section.heading ?? "Frequently asked questions"}</h2>
          {section.items.map((item, itemIndex) => (
            <details key={`${section.id}-${itemIndex}`}>
              <summary>
                {item.question}
                <ChevronDown aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
      );
    }
    return (
      <section
        key={section.id}
        className={`funnel-v1-final-cta ${index === 0 ? "is-first" : ""}`}
      >
        <h2>{section.headline}</h2>
        {section.body ? <p>{section.body}</p> : null}
        <button type="button" disabled>
          {props.primaryActionLabel}
        </button>
        <small>
          Draft preview · The live visitor action remains unchanged.
        </small>
      </section>
    );
  };

  return (
    <div
      className={[
        "funnel-v1-preview",
        `is-${document.theme.appearance}`,
        `is-${document.theme.character}`,
        `accent-${document.theme.accent}`,
        `density-${document.theme.density}`,
        `radius-${document.theme.radius}`,
      ].join(" ")}
      aria-busy={props.isLoading || undefined}
    >
      <main className="funnel-v1-preview-main">
        <header className="funnel-v1-brand">
          <CommunityAvatar
            communityId={community.id}
            name={community.name}
            imageUrl={community.avatar_url ?? null}
            focusX={community.avatar_focus_x}
            focusY={community.avatar_focus_y}
            zoom={community.avatar_zoom}
            className="funnel-v1-brand-avatar"
            style={{ width: 28, height: 28 }}
          />
          <span>{community.name}</span>
        </header>
        {props.error ? (
          <div className="funnel-v1-preview-error">{props.error}</div>
        ) : null}
        {document.sections.map(renderSection)}
      </main>
    </div>
  );
}
