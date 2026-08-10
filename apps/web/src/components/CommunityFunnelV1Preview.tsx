import {
  Brain,
  ChevronDown,
  Play,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { CommunityFunnelDocumentV1 } from "../../../../shared/communityTypes";
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

const PILLAR_ICONS: LucideIcon[] = [
  UsersRound,
  Brain,
  Sparkles,
];

export function CommunityFunnelV1Preview(props: {
  community: PreviewCommunity;
  document: CommunityFunnelDocumentV1;
  primaryActionLabel: string;
  isLoading?: boolean;
  error?: string | null;
}) {
  const { community, document } = props;
  const embed = document.intro_video_url ? parseEmbedUrl(document.intro_video_url) : null;
  const faces = (community.member_faces_preview ?? []).filter((face) => Boolean(face.avatar_url)).slice(0, 8);
  const memberCount = typeof community.member_count === "number" ? community.member_count : null;
  const founderName = community.host?.display_name?.trim() || `Founder of ${community.name}`;
  const faq = document.faq.filter((item) => item.question.trim() && item.answer.trim());

  return (
    <div className="funnel-v1-preview" aria-busy={props.isLoading || undefined}>
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

        <section className="funnel-v1-hero">
          <h1>{document.headline}</h1>
          <p>{document.subheadline}</p>
        </section>

        {props.error ? <div className="funnel-v1-preview-error">{props.error}</div> : null}

        <section className="funnel-v1-media" aria-label="Intro video">
          {embed ? (
            <iframe
              src={embed.src}
              title={`${community.name} intro video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : document.intro_video_url ? (
            <video src={document.intro_video_url} controls playsInline preload="metadata" />
          ) : community.banner_url ? (
            <div className="funnel-v1-media-poster">
              <img
                src={community.banner_url}
                alt=""
                style={{
                  objectPosition: `${(community.banner_focus_x ?? 0.5) * 100}% ${(community.banner_focus_y ?? 0.5) * 100}%`,
                  transform: `scale(${community.banner_zoom ?? 1})`,
                }}
              />
              <span className="funnel-v1-play" aria-hidden="true"><Play /></span>
            </div>
          ) : (
            <div className="funnel-v1-media-empty">
              <CommunityAvatar
                communityId={community.id}
                name={community.name}
                imageUrl={community.avatar_url ?? null}
                focusX={community.avatar_focus_x}
                focusY={community.avatar_focus_y}
                zoom={community.avatar_zoom}
                className="funnel-v1-media-empty-avatar"
                style={{ width: 88, height: 88 }}
              />
              <span>Add an intro video in Funnel settings.</span>
            </div>
          )}
        </section>

        <section className="funnel-v1-conversion">
          <button type="button" disabled>{props.primaryActionLabel}</button>
          <p>
            {memberCount !== null ? `${memberCount.toLocaleString()} members` : "Member community"}
            <span aria-hidden="true">·</span>
            Preview only
            <span aria-hidden="true">·</span>
            Action disabled
          </p>
        </section>

        <section className="funnel-v1-pillars" aria-label="Community pillars">
          {document.pillars.map((pillar, index) => {
            const Icon = PILLAR_ICONS[index] ?? Sparkles;
            return (
              <article key={index}>
                <Icon aria-hidden="true" />
                <h2>{pillar.title}</h2>
                <p>{pillar.body}</p>
              </article>
            );
          })}
        </section>

        {document.founder_quote ? (
          <section className="funnel-v1-proof">
            {community.host?.avatar_url ? (
              <img src={community.host.avatar_url} alt="" />
            ) : (
              <CommunityAvatar
                communityId={community.id}
                name={community.name}
                imageUrl={community.avatar_url ?? null}
                className="funnel-v1-proof-avatar"
                style={{ width: 108, height: 108 }}
              />
            )}
            <blockquote>
              <p>“{document.founder_quote}”</p>
              <footer>
                <strong>{founderName}</strong>
                <span>Founder of {community.name}</span>
              </footer>
            </blockquote>
          </section>
        ) : null}

        {faces.length || memberCount !== null ? (
          <section className="funnel-v1-member-proof">
            {faces.length ? (
              <div className="funnel-v1-facepile" aria-label="Community members">
                {faces.map((face) => <img key={face.user_id} src={face.avatar_url ?? ""} alt="" />)}
                {memberCount !== null && memberCount > faces.length ? <span>+{memberCount - faces.length}</span> : null}
              </div>
            ) : null}
            <p>{memberCount !== null ? `${memberCount.toLocaleString()} members and counting` : "Members and counting"}</p>
          </section>
        ) : null}

        {faq.length ? (
          <section className="funnel-v1-faq">
            <h2>Frequently asked questions</h2>
            {faq.map((item, index) => (
              <details key={index}>
                <summary>{item.question}<ChevronDown aria-hidden="true" /></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </section>
        ) : null}

        <section className="funnel-v1-final-cta">
          <button type="button" disabled>{props.primaryActionLabel}</button>
          <p>Preview only · The live visitor action will follow community access and pricing.</p>
        </section>
      </main>
    </div>
  );
}
