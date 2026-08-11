import {
  Brain,
  ChevronDown,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Fragment } from "react";

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
  vslUrl: string;
}) {
  const embed = parseEmbedUrl(props.vslUrl);
  if (!embed) return null;
  return (
    <section className="funnel-v1-media" aria-label="Community media">
      <iframe
        src={embed.src}
        title={`${props.community.name} intro video`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </section>
  );
}

export function CommunityFunnelV1Preview(props: {
  community: PreviewCommunity;
  document: CommunityFunnelDocumentV1 | null;
  vslUrl?: string | null;
  primaryActionLabel: string;
  isLoading?: boolean;
  error?: string | null;
  isPreview?: boolean;
  primaryActionDisabled?: boolean;
  onPrimaryAction?: () => void;
}) {
  const { community, document } = props;
  const isPreview = props.isPreview !== false;
  const faces = (community.member_faces_preview ?? [])
    .filter((face) => Boolean(face.avatar_url))
    .slice(0, 8);
  const memberCount =
    typeof community.member_count === "number" ? community.member_count : null;

  if (!document) {
    return (
      <div className="funnel-v1-preview is-editorial accent-blue density-balanced radius-soft">
        <main className="funnel-v1-preview-main funnel-v1-preview-empty">
          <Sparkles aria-hidden="true" />
          <strong>Nothing to preview yet.</strong>
          <span>Prompt the agent to build your funnel.</span>
        </main>
      </div>
    );
  }

  const renderSection = (section: CommunityFunnelSectionV1, index: number) => {
    if (section.type === "hero") {
      return (
        <Fragment key={section.id}>
          <section className={`funnel-v1-hero is-${section.alignment}`}>
            {section.eyebrow ? (
              <span className="funnel-v1-eyebrow">{section.eyebrow}</span>
            ) : null}
            <h1>{section.headline}</h1>
            <p>{section.body}</p>
          </section>
          {props.vslUrl ? (
            <PreviewMedia community={community} vslUrl={props.vslUrl} />
          ) : null}
        </Fragment>
      );
    }
    if (section.type === "media") return null;
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
        <button
          type="button"
          disabled={isPreview || props.primaryActionDisabled}
          onClick={isPreview ? undefined : props.onPrimaryAction}
        >
          {props.primaryActionLabel}
        </button>
        {isPreview ? (
          <small>Draft preview · Publishing is always explicit.</small>
        ) : null}
      </section>
    );
  };

  return (
    <div
      className={[
        "funnel-v1-preview",
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
