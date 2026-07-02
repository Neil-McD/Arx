/* Visitor conversion chrome: the join gate and the composer-slot rope.
   The gate is the community's front door — logo, banner, VSL, member count,
   who's online, the one-liner, Join, and "View it first". Nothing else. */
import type { CSSProperties, ReactNode } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { formatCompactStat } from "../../../../shared/communityFunnelUi";
import {
  ActionStatusCards,
  type CommunityFunnelSurfaceAction,
} from "./CommunityFunnelSurface";
import "./CommunityVisitorChrome.css";

export function CommunityVisitorGate(props: {
  action: CommunityFunnelSurfaceAction;
  pricingLabel: string;
  isFreePricing: boolean;
  bannerUrl: string | null;
  bannerStyle: CSSProperties | null;
  media: ReactNode;
  isMediaPlaying?: boolean;
  onViewFirst: () => void;
}) {
  const { action } = props;
  /* One hero per card: the VSL when it exists, the banner otherwise. */
  const hasMediaHero = Boolean(props.media);
  return (
    <div
      className={`cfg-gatecard cvs-gatecard${hasMediaHero ? " cvs-gatecard-no-banner" : ""}${
        props.isMediaPlaying ? " cvs-gatecard-wide" : ""
      }`}
      style={props.isMediaPlaying ? { width: "min(720px, 94vw)" } : undefined}
    >
      {!hasMediaHero ? (
        <div className="cfg-gbanner" aria-hidden="true">
          {props.bannerUrl ? (
            <img src={props.bannerUrl} alt="" draggable={false} style={props.bannerStyle ?? undefined} />
          ) : null}
        </div>
      ) : null}
      <div className={`cfg-gav${hasMediaHero ? " cvs-gav-plain" : ""}`}>
        <CommunityAvatar
          className="cfg-fill"
          imageUrl={action.avatarUrl}
          focusX={action.avatarFocusX}
          focusY={action.avatarFocusY}
          zoom={action.avatarZoom}
          name={action.communityName}
          alt={`${action.communityName} avatar`}
        />
      </div>
      <div className="cfg-gname">{action.communityName}</div>
      <p className="cfg-gpromise">{action.cardBlurb}</p>
      {props.media ? <div className="cvs-gate-media">{props.media}</div> : null}
      <div className="cfg-gstats">
        {typeof action.memberCount === "number" ? (
          <span>
            <b>{formatCompactStat(action.memberCount)}</b> members
          </span>
        ) : null}
        {typeof action.onlineCount === "number" && action.onlineCount > 0 ? (
          <span>
            <span className="cfg-od" aria-hidden="true" />
            <b>{formatCompactStat(action.onlineCount)}</b> online now
          </span>
        ) : null}
        <span>{props.isFreePricing ? "Free to join" : props.pricingLabel}</span>
      </div>
      <button
        className="cfg-join"
        type="button"
        disabled={action.isPrimaryActionDisabled}
        onClick={action.onPrimaryAction}
      >
        {action.primaryActionLabel}
      </button>
      <div className="cfg-gmicro">Instant access{props.isFreePricing ? "" : " · cancel anytime"}</div>
      <ActionStatusCards action={action} />
      <button className="cfg-glook" type="button" onClick={props.onViewFirst}>
        View it first ↓
      </button>
    </div>
  );
}

/* The member composer's visual twin: same .chat-input-bar anatomy, inert.
   Hovering it shows you can't type — and lights the Join button up. */
export function CommunityVisitorJoinRope(props: {
  action: CommunityFunnelSurfaceAction;
  ropePrompt: string;
  pricingLabel: string;
  isFreePricing: boolean;
  onRopeFieldActivate: () => void;
}) {
  const { action } = props;
  return (
    <div className="cvs-composer">
      <div className="cvs-composer-row">
        <div
          className="chat-input-bar cvs-composer-bar"
          role="button"
          tabIndex={0}
          onClick={props.onRopeFieldActivate}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") props.onRopeFieldActivate();
          }}
        >
          <span className="ask-icon-btn ask-plus" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <textarea
            className="chat-input"
            placeholder={props.ropePrompt}
            rows={1}
            readOnly
            tabIndex={-1}
            aria-label="Join to message the community"
          />
          <span className="chat-send ask-send-btn ask-send-btn-v2" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
            </svg>
          </span>
        </div>
        <button
          className="cfg-join cvs-composer-join"
          type="button"
          disabled={action.isPrimaryActionDisabled}
          onClick={action.onPrimaryAction}
        >
          {action.primaryActionLabel}
        </button>
      </div>
      <div className="cfg-terms">
        <b>{props.isFreePricing ? "Free to join" : props.pricingLabel}</b>
        {!props.isFreePricing ? " · cancel anytime" : ""} · instant access
      </div>
      <ActionStatusCards action={action} />
    </div>
  );
}

/* The frost over the rest of the conversation: real rows behind glass,
   one lock chip floating on top. */
export function CommunityVisitorChatFrostChip(props: {
  messagesTodayCount: number | null;
  onActivate: () => void;
}) {
  const label =
    typeof props.messagesTodayCount === "number" && props.messagesTodayCount > 0
      ? `${props.messagesTodayCount} message${props.messagesTodayCount === 1 ? "" : "s"} today — unlocks when you join`
      : "The conversation unlocks when you join";
  return (
    <button className="cvs-frost-chip" type="button" onClick={props.onActivate}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
