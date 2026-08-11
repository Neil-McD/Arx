import {
  Brain,
  ChevronDown,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Fragment } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { buildCommunityFunnelMemberProofView } from "../../../../shared/communityFunnelUi";
import type {
  CommunityFunnelDocumentV1,
  CommunityFunnelSectionV1,
  CommunityPublicFace,
} from "../../../../shared/communityTypes";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { MemberAvatarStack } from "./MemberAvatarStack";
import "./CommunityFunnelV1Preview.css";

type PreviewCommunity = {
  id?: string;
  name: string;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  member_count?: number | null;
  member_faces_preview?: CommunityPublicFace[] | null;
  host?: {
    display_name: string | null;
    avatar_url: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  } | null;
};

const BENEFIT_ICONS: LucideIcon[] = [UsersRound, Brain, Sparkles, UsersRound];

function PreviewMedia(props: { community: PreviewCommunity; vslUrl: string }) {
  const embed = parseEmbedUrl(props.vslUrl);
  if (!embed) return null;
  return (
    <section className="funnel-v1-media" aria-label="Community media">
      <iframe
        src={embed.src}
        title={`${props.community.name} Video Sales Letter`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </section>
  );
}

export function CommunityFunnelV1Preview(props: {
  community: PreviewCommunity;
  document: CommunityFunnelDocumentV1 | null;
  deterministicContent?: {
    headline: string;
    body: string | null;
  } | null;
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
  const memberProof = buildCommunityFunnelMemberProofView({
    memberCount: community.member_count,
    faces: community.member_faces_preview,
  });

  const renderMemberProof = () => {
    if (!memberProof) return null;
    return (
      <section
        className="funnel-v1-member-proof-row"
        aria-label={memberProof.ariaLabel}
      >
        <MemberAvatarStack
          className="funnel-v1-member-proof-avatars"
          faces={memberProof.faces}
          totalCount={memberProof.memberCount}
          limit={5}
          decorative={true}
          imageLoading="lazy"
        />
        <span>{memberProof.label}</span>
      </section>
    );
  };

  const renderBrand = (variant: "default" | "document" = "document") => (
    <header
      className={`funnel-v1-brand${variant === "default" ? " is-default" : ""}`}
    >
      <CommunityAvatar
        communityId={community.id}
        name={community.name}
        imageUrl={community.avatar_url ?? null}
        focusX={community.avatar_focus_x}
        focusY={community.avatar_focus_y}
        zoom={community.avatar_zoom}
        className="funnel-v1-brand-avatar"
        style={
          variant === "default"
            ? {
                width: "clamp(68px, 7vw, 80px)",
                height: "clamp(68px, 7vw, 80px)",
              }
            : { width: 28, height: 28 }
        }
      />
      <span>{community.name}</span>
    </header>
  );

  const renderConversionSpine = (params: {
    key?: string;
    variant: "default" | "document";
    headline?: string;
    body?: string | null;
  }) => {
    const isDefault = params.variant === "default";
    return (
      <section
        key={params.key}
        className={
          isDefault
            ? "funnel-v1-conversion-spine is-default"
            : "funnel-v1-conversion-spine is-document funnel-v1-final-cta"
        }
      >
        {!isDefault && params.headline ? <h2>{params.headline}</h2> : null}
        {!isDefault && params.body ? <p>{params.body}</p> : null}
        <div className="funnel-v1-conversion-action">
          {renderMemberProof()}
          <button
            type="button"
            disabled={isPreview || props.primaryActionDisabled}
            onClick={isPreview ? undefined : props.onPrimaryAction}
          >
            {props.primaryActionLabel}
          </button>
          {!isDefault && isPreview ? (
            <small>Draft preview · Publishing is always explicit.</small>
          ) : null}
        </div>
      </section>
    );
  };

  if (!document) {
    if (!props.deterministicContent) {
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
    return (
      <div className="funnel-v1-preview is-editorial accent-blue density-balanced radius-soft">
        <main className="funnel-v1-preview-main funnel-v1-default">
          {renderBrand("default")}
          {props.error ? (
            <div className="funnel-v1-preview-error">{props.error}</div>
          ) : null}
          <section className="funnel-v1-hero funnel-v1-default-hero">
            <h1>{props.deterministicContent.headline}</h1>
            {props.deterministicContent.body ? (
              <p>{props.deterministicContent.body}</p>
            ) : null}
          </section>
          {renderConversionSpine({ variant: "default" })}
        </main>
      </div>
    );
  }

  const renderSection = (section: CommunityFunnelSectionV1) => {
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
      return null;
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
    return renderConversionSpine({
      key: section.id,
      variant: "document",
      headline: section.headline,
      body: section.body,
    });
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
        {renderBrand()}
        {props.error ? (
          <div className="funnel-v1-preview-error">{props.error}</div>
        ) : null}
        {document.sections.map((section) => renderSection(section))}
      </main>
    </div>
  );
}
