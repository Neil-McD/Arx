import { useId, type ReactNode } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type {
  CommunityFunnelRenderModel,
  CommunityFunnelUiFaceLike,
} from "../../../../shared/communityFunnelUi";
import { renderMarkdown } from "../../../../shared/markdownUi";
import {
  ActionStatusCards,
  renderHeroMediaDefault,
  type CommunityFunnelSurfaceAction,
} from "./CommunityFunnelSurface";
import { CommunityFunnelMemberProof } from "./CommunityFunnelMemberProof";
import { WebCommunityCreators } from "./WebCommunityCreators";
import "./WebCommunityCreators.css";
import { WebCommunityBridgeCard, type WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import "./WebCommunityFunnelRenderer.css";

function FunnelPillarIcon(props: { index: number }) {
  if (props.index === 0) {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="18" cy="17" r="6" />
        <circle cx="33" cy="20" r="5" />
        <path d="M7 38c1-8 5-12 11-12s10 4 11 12M28 29c6-1 11 2 13 8" />
      </svg>
    );
  }
  if (props.index === 1) {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 39V11M24 15c-5-7-14-3-13 4-6 2-6 12 0 14 0 7 9 10 13 3M24 15c5-7 14-3 13 4 6 2 6 12 0 14 0 7-9 10-13 3" />
        <path d="M15 22c3 0 5 2 5 5M33 22c-3 0-5 2-5 5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="m24 6 3.2 12.8L40 22l-12.8 3.2L24 38l-3.2-12.8L8 22l12.8-3.2L24 6Z" />
      <path d="m39 6 1 4 4 1-4 1-1 4-1-4-4-1 4-1 1-4ZM9 33l1.3 5.7L16 40l-5.7 1.3L9 47l-1.3-5.7L2 40l5.7-1.3L9 33Z" />
    </svg>
  );
}

function FunnelAction(props: {
  action: CommunityFunnelSurfaceAction;
  position: "primary" | "final";
}) {
  return (
    <div className={`community-funnel-action is-${props.position}`}>
      <button
        type="button"
        disabled={props.action.isPrimaryActionDisabled}
        onClick={props.action.onPrimaryAction}
      >
        {props.action.primaryActionLabel}
      </button>
    </div>
  );
}

export type WebCommunityFunnelRendererProps = {
  communityId?: string;
  communityName: string;
  avatarUrl?: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  memberCount?: number | null;
  memberFaces?: CommunityFunnelUiFaceLike[] | null;
  renderModel: CommunityFunnelRenderModel;
  action: CommunityFunnelSurfaceAction;
  bridge?: WebCommunityBridgeCardProps | null;
  alertMessages?: string[];
  /** "Choose your offer" cards, shown above the first join button when there are 2+ offers. */
  offers?: ReactNode;
};

export function WebCommunityFunnelRenderer(props: WebCommunityFunnelRendererProps) {
  const titleId = useId();
  const memberProof = (
    <CommunityFunnelMemberProof
      communityName={props.communityName}
      faces={props.memberFaces}
      memberCount={props.memberCount}
    />
  );
  const media: ReactNode = props.renderModel.vslUrl
    ? renderHeroMediaDefault("video", props.renderModel.vslUrl, {
        eager: true,
        playHint: "Watch the story",
      })
    : null;

  return (
    <div className={`community-funnel-renderer is-${props.renderModel.mode}`}>
      <div className="community-funnel-layout" aria-labelledby={titleId}>
        <div className="community-funnel-ambient" aria-hidden="true" />
        <header className="community-funnel-identity community-funnel-reveal">
          <CommunityAvatar
            className="community-funnel-community-avatar"
            communityId={props.communityId}
            name={props.communityName}
            imageUrl={props.avatarUrl}
            focusX={props.avatarFocusX}
            focusY={props.avatarFocusY}
            zoom={props.avatarZoom}
            alt=""
            loading="eager"
            fetchPriority="high"
            aria-hidden={true}
          />
          <span>{props.communityName}</span>
        </header>
        {props.communityId ? <WebCommunityCreators communityId={props.communityId} readOnly className="community-funnel-creators community-funnel-reveal" /> : null}

        <section className="community-funnel-hero community-funnel-reveal">
          <h1 id={titleId}>{props.renderModel.headline}</h1>
          {props.renderModel.subheadline ? <p>{props.renderModel.subheadline}</p> : null}
        </section>

        {props.alertMessages?.length ? (
          <div className="community-funnel-alerts" role="status">
            {props.alertMessages.map((message) => <p key={message}>{message}</p>)}
          </div>
        ) : null}

        {media ? (
          <section className="community-funnel-vsl community-funnel-reveal">{media}</section>
        ) : null}

        {props.renderModel.mode === "default" ? (
          <>
            {props.offers ? <div className="community-funnel-offers">{props.offers}</div> : null}
            <FunnelAction action={props.action} position="primary" />
            <ActionStatusCards action={props.action} />
          </>
        ) : null}

        {props.renderModel.mode === "custom" ? (
          <>
            {props.offers ? <div className="community-funnel-offers">{props.offers}</div> : null}
            <FunnelAction action={props.action} position="primary" />
            {memberProof}
          </>
        ) : null}

        {props.renderModel.pillars.length === 3 ? (
          <section className="community-funnel-pillars" aria-label="Community benefits">
            {props.renderModel.pillars.map((pillar, index) => (
              <article key={`${index}:${pillar.title}`}>
                <FunnelPillarIcon index={index} />
                <h2>{pillar.title}</h2>
                <p>{pillar.body}</p>
              </article>
            ))}
          </section>
        ) : null}

        {props.renderModel.longFormMarkdown ? (
          <section className="community-funnel-long-form">
            {renderMarkdown(props.renderModel.longFormMarkdown, { headingLevelOffset: 1 })}
          </section>
        ) : null}

        {props.renderModel.mode === "custom" ? (
          <section className="community-funnel-conversion">
            <FunnelAction action={props.action} position="final" />
            {props.renderModel.mode === "custom" ? <ActionStatusCards action={props.action} /> : null}
          </section>
        ) : null}
      </div>

      {props.bridge ? (
        <WebBlockingSetupModal
          titleId="community-account-setup-title"
          descriptionId="community-account-setup-description"
          busy={props.bridge.setup.submission.isSaving}
          className="polynet-account-setup-modal"
        >
          <WebCommunityBridgeCard {...props.bridge} />
        </WebBlockingSetupModal>
      ) : null}
    </div>
  );
}
