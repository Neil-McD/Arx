/* Visitor conversion chrome: the receipt gate and the join rope.
   Laws: the gate is a receipt, not a pitch — it enumerates exactly what
   opens, with true counts; locks respond with specificity (contextNote
   names what the visitor reached for); nothing manufactured. */
import { Brain, FolderOpen, Hash, Lock, MessageCircle, Users } from "lucide-react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { formatCompactStat } from "../../../../shared/communityFunnelUi";
import {
  ActionStatusCards,
  type CommunityFunnelSurfaceAction,
} from "./CommunityFunnelSurface";
import type { CSSProperties } from "react";
import "./CommunityVisitorChrome.css";

export type VisitorReceiptStats = {
  memberCount: number | null;
  joinedLast30dCount: number | null;
  messagesTodayCount: number | null;
  memoryNoteCount: number | null;
  resourceCount: number | null;
};

export type VisitorGateContext = {
  /** What the visitor reached for, e.g. "the member roster". */
  note: string;
  /** Receipt row to highlight. */
  row: "conversation" | "members" | "memory" | "resources" | null;
} | null;

function ReceiptRow(props: {
  icon: JSX.Element;
  label: string;
  highlighted: boolean;
}) {
  return (
    <div className={`cvs-receipt-row${props.highlighted ? " is-hit" : ""}`}>
      {props.icon}
      <span>{props.label}</span>
    </div>
  );
}

export function CommunityVisitorGate(props: {
  action: CommunityFunnelSurfaceAction;
  hostName: string | null;
  pricingLabel: string;
  isFreePricing: boolean;
  bannerUrl: string | null;
  bannerStyle: CSSProperties | null;
  stats: VisitorReceiptStats;
  context: VisitorGateContext;
  onLookAround: () => void;
}) {
  const { action, stats } = props;
  const memberLine =
    typeof stats.memberCount === "number"
      ? `${formatCompactStat(stats.memberCount)} members${
          typeof stats.joinedLast30dCount === "number" && stats.joinedLast30dCount > 0
            ? ` — ${formatCompactStat(stats.joinedLast30dCount)} joined this month`
            : ""
        }`
      : null;
  const conversationLine =
    typeof stats.messagesTodayCount === "number" && stats.messagesTodayCount > 0
      ? `The conversation — ${formatCompactStat(stats.messagesTodayCount)} messages today`
      : "The conversation — post, reply, react";
  const memoryLine =
    typeof stats.memoryNoteCount === "number" && stats.memoryNoteCount > 0
      ? `Memory — ${formatCompactStat(stats.memoryNoteCount)} note${stats.memoryNoteCount === 1 ? "" : "s"} the room has learned`
      : null;
  const resourceLine =
    typeof stats.resourceCount === "number" && stats.resourceCount > 0
      ? `${formatCompactStat(stats.resourceCount)} resources`
      : null;

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
      <div className="cfg-ghandle">
        {props.hostName ? `Hosted by ${props.hostName}` : action.communityLinkLabel ?? ""}
        {memberLine ? ` · ${memberLine.split(" — ")[0]}` : ""}
      </div>
      {props.context ? (
        <div className="cvs-gate-context" role="status">
          <Lock size={13} strokeWidth={2} aria-hidden="true" />
          <span>
            You reached for {props.context.note} — it opens the moment you&apos;re in.
          </span>
        </div>
      ) : (
        <p className="cfg-gpromise">{action.cardBlurb}</p>
      )}
      <div className="cvs-receipt" aria-label="What opens when you join">
        <div className="cvs-receipt-title">Joining opens</div>
        <ReceiptRow
          icon={<MessageCircle size={14} strokeWidth={1.9} aria-hidden="true" />}
          label={conversationLine}
          highlighted={props.context?.row === "conversation"}
        />
        {memberLine ? (
          <ReceiptRow
            icon={<Users size={14} strokeWidth={1.9} aria-hidden="true" />}
            label={memberLine}
            highlighted={props.context?.row === "members"}
          />
        ) : null}
        {memoryLine ? (
          <ReceiptRow
            icon={<Brain size={14} strokeWidth={1.9} aria-hidden="true" />}
            label={memoryLine}
            highlighted={props.context?.row === "memory"}
          />
        ) : null}
        {resourceLine ? (
          <ReceiptRow
            icon={<FolderOpen size={14} strokeWidth={1.9} aria-hidden="true" />}
            label={resourceLine}
            highlighted={props.context?.row === "resources"}
          />
        ) : null}
        <ReceiptRow
          icon={<Hash size={14} strokeWidth={1.9} aria-hidden="true" />}
          label="AI feed and events"
          highlighted={false}
        />
      </div>
      {!props.isFreePricing ? (
        <div className="cvs-gate-price">
          <span>Membership</span>
          <b>{props.pricingLabel}</b>
        </div>
      ) : null}
      <button
        className="cfg-join"
        type="button"
        disabled={action.isPrimaryActionDisabled}
        onClick={action.onPrimaryAction}
      >
        {action.primaryActionLabel}
      </button>
      <div className="cfg-gmicro">
        {props.isFreePricing ? "Instant access · leave anytime" : "Instant access · cancel anytime"}
      </div>
      <ActionStatusCards action={action} />
      <button className="cfg-glook" type="button" onClick={props.onLookAround}>
        Look around their world first ↓
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
