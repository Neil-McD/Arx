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
  onViewFirst: () => void;
}) {
  const { action } = props;
  return (
    <div className="cfg-gatecard cvs-gatecard">
      <div className="cfg-gbanner" aria-hidden="true">
        {props.bannerUrl ? (
          <img src={props.bannerUrl} alt="" draggable={false} style={props.bannerStyle ?? undefined} />
        ) : null}
      </div>
      <div className="cfg-gav">
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

export function CommunityVisitorJoinRope(props: {
  action: CommunityFunnelSurfaceAction;
  ropePrompt: string;
  pricingLabel: string;
  isFreePricing: boolean;
  onRopeFieldActivate: () => void;
}) {
  const { action } = props;
  return (
    <div className="cfg-rope cvs-rope">
      <div className="cfg-ropebox">
        <button className="cfg-roph cvs-roph" type="button" onClick={props.onRopeFieldActivate}>
          {props.ropePrompt}
        </button>
        <button
          className="cfg-join"
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
