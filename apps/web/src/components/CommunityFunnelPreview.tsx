import { Brain, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type {
  CommunityFunnelContentV2,
  CommunityPublicFace,
} from "../../../../shared/communityTypes";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { CommunityFunnelMemberProof } from "./CommunityFunnelMemberProof";
import "./CommunityFunnelPreview.css";

type PreviewCommunity = {
  id?: string;
  name: string;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  member_count?: number | null;
  member_faces_preview?: CommunityPublicFace[] | null;
};

const PILLAR_ICONS: readonly LucideIcon[] = [UsersRound, Brain, Sparkles];
const LONG_FORM_ELEMENTS = [
  "h2",
  "h3",
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
] as const;

function PreviewMedia(props: { community: PreviewCommunity; vslUrl: string }) {
  const embed = parseEmbedUrl(props.vslUrl);
  if (!embed) return null;
  return (
    <section className="community-funnel-media" aria-label="Video Sales Letter">
      <iframe
        src={embed.src}
        title={`${props.community.name} Video Sales Letter`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </section>
  );
}

export function CommunityFunnelPreview(props: {
  community: PreviewCommunity;
  content: CommunityFunnelContentV2 | null;
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
  const { community, content } = props;
  const isPreview = props.isPreview !== false;

  const renderBrand = (large = false) => (
    <header className={`community-funnel-brand${large ? " is-default" : ""}`}>
      <CommunityAvatar
        communityId={community.id}
        name={community.name}
        imageUrl={community.avatar_url ?? null}
        focusX={community.avatar_focus_x}
        focusY={community.avatar_focus_y}
        zoom={community.avatar_zoom}
        className="community-funnel-brand-avatar"
        style={
          large
            ? {
                width: "clamp(68px, 7vw, 80px)",
                height: "clamp(68px, 7vw, 80px)",
              }
            : { width: 32, height: 32 }
        }
      />
      <span>{community.name}</span>
    </header>
  );

  const renderMemberProof = () => {
    return (
      <CommunityFunnelMemberProof
        communityName={community.name}
        faces={community.member_faces_preview}
        memberCount={community.member_count}
      />
    );
  };

  const renderPrimaryAction = (position: "first" | "final") => (
    <div className={`community-funnel-canonical-action is-${position}`}>
      <button
        type="button"
        disabled={isPreview || props.primaryActionDisabled}
        onClick={isPreview ? undefined : props.onPrimaryAction}
      >
        {props.primaryActionLabel}
      </button>
      {position === "final" && isPreview ? (
        <small>Draft preview · Publishing is always explicit.</small>
      ) : null}
    </div>
  );

  if (!content) {
    if (!props.deterministicContent) {
      return (
        <div className="community-funnel-preview">
          <main className="community-funnel-preview-main community-funnel-preview-empty">
            <Sparkles aria-hidden="true" />
            <strong>Nothing to preview yet.</strong>
            <span>Prompt the agent to write your funnel.</span>
          </main>
        </div>
      );
    }
    return (
      <div className="community-funnel-preview">
        <main className="community-funnel-preview-main community-funnel-default">
          {renderBrand(true)}
          {props.error ? (
            <div className="community-funnel-preview-error">{props.error}</div>
          ) : null}
          <section className="community-funnel-hero community-funnel-default-hero">
            <h1>{props.deterministicContent.headline}</h1>
            {props.deterministicContent.body ? (
              <p>{props.deterministicContent.body}</p>
            ) : null}
          </section>
          <section className="community-funnel-conversion-spine is-default">
            {renderMemberProof()}
            {renderPrimaryAction("first")}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div
      className="community-funnel-preview"
      aria-busy={props.isLoading || undefined}
    >
      <main className="community-funnel-preview-main community-funnel-content">
        {renderBrand()}
        {props.error ? (
          <div className="community-funnel-preview-error">{props.error}</div>
        ) : null}
        <section className="community-funnel-hero">
          <h1>{content.headline}</h1>
          <p>{content.subheadline}</p>
        </section>
        {props.vslUrl ? (
          <PreviewMedia community={community} vslUrl={props.vslUrl} />
        ) : null}
        {renderPrimaryAction("first")}
        {renderMemberProof()}
        <section className="community-funnel-benefits" aria-label="Community benefits">
          <div className="community-funnel-pillars">
            {content.pillars.map((pillar, index) => {
              const Icon = PILLAR_ICONS[index] ?? Sparkles;
              return (
                <article key={`${pillar.title}-${index}`}>
                  <Icon aria-hidden="true" />
                  <h3>{pillar.title}</h3>
                  <p>{pillar.body}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="community-funnel-long-form" aria-label="About this community">
          <ReactMarkdown
            skipHtml={true}
            unwrapDisallowed={true}
            allowedElements={[...LONG_FORM_ELEMENTS]}
          >
            {content.long_form_markdown}
          </ReactMarkdown>
        </section>
        <section className="community-funnel-final-conversion">
          {renderPrimaryAction("final")}
        </section>
      </main>
    </div>
  );
}
