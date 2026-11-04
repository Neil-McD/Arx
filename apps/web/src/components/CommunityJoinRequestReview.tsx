import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
const PENDING_JOIN_REQUEST_DISPLAY_LIMIT = 200;
export type CommunityAdmissionJoinRequest = {
  id: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  message: string | null;
  createdAtLabel: string;
};

export type CommunityJoinRequestReviewProps = {
  canReviewJoinRequests?: boolean;
  joinReviewMode?: "paid" | "free_auto" | "free_approval" | null;
  pendingJoinRequests?: CommunityAdmissionJoinRequest[] | null;
  isLoadingJoinRequests?: boolean;
  joinRequestsError?: string | null;
  decidingJoinRequestId?: string | null;
  onApproveJoinRequest?: (requestId: string) => Promise<void> | void;
  onDenyJoinRequest?: (requestId: string) => Promise<void> | void;
  displayName: (userId: string) => string;
};
export function CommunityJoinRequestReview(props: CommunityJoinRequestReviewProps) {
  const pendingJoinRequests = props.pendingJoinRequests ?? [];
  const hasPendingJoinRequestOverflow =
    pendingJoinRequests.length > PENDING_JOIN_REQUEST_DISPLAY_LIMIT;
  const visiblePendingJoinRequests = hasPendingJoinRequestOverflow
    ? pendingJoinRequests.slice(0, PENDING_JOIN_REQUEST_DISPLAY_LIMIT)
    : pendingJoinRequests;
  const [joinRequestsExpanded, setJoinRequestsExpanded] = useState(false);
  // A selection: approve or deny several at once, one request at a time underneath.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeciding, setBulkDeciding] = useState(false);
  const joinRequestPanelId = useId();
  const pendingJoinRequestCount = visiblePendingJoinRequests.length;
  const canShowJoinRequests = Boolean(
    props.canReviewJoinRequests &&
      props.joinReviewMode === "free_approval" &&
      pendingJoinRequests.length > 0,
  );
  const requestCountLabel =
    hasPendingJoinRequestOverflow ? "200+" : String(pendingJoinRequestCount);
  const requestDividerLabel = `${requestCountLabel} request${
    hasPendingJoinRequestOverflow || pendingJoinRequestCount !== 1 ? "s" : ""
  } to join`;
  const requestDividerAriaLabel = hasPendingJoinRequestOverflow
    ? "200 or more requests to join"
    : requestDividerLabel;
  const isJoinRequestDecisionPending = Boolean(props.decidingJoinRequestId);
  const canShowJoinRequestLoadError = Boolean(
    props.canReviewJoinRequests &&
      props.joinReviewMode === "free_approval" &&
      pendingJoinRequests.length === 0 &&
      !props.isLoadingJoinRequests &&
      props.joinRequestsError,
  );
  useEffect(() => {
    if (!canShowJoinRequests) setJoinRequestsExpanded(false);
  }, [canShowJoinRequests]);
  // Decided or vanished requests leave the selection.
  useEffect(() => {
    setSelected((current) => {
      const live = new Set(pendingJoinRequests.map((request) => request.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [pendingJoinRequests]);
  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = visiblePendingJoinRequests.length > 0 && visiblePendingJoinRequests.every((request) => selected.has(request.id));
  const decideSelected = async (decide: ((requestId: string) => Promise<void> | void) | undefined) => {
    if (!decide || bulkDeciding) return;
    setBulkDeciding(true);
    try {
      for (const id of [...selected]) await decide(id);
    } finally {
      setBulkDeciding(false);
    }
  };
  const isBusy = isJoinRequestDecisionPending || bulkDeciding || Boolean(props.isLoadingJoinRequests);
  const renderJoinRequest = (request: CommunityAdmissionJoinRequest) => {
    const name = (request.displayName ?? "").trim() || props.displayName(request.userId);
    const isDeciding = props.decidingJoinRequestId === request.id;
    return (
      <div key={request.id} className="community-context-request-row">
        <input
          className="community-context-request-select"
          type="checkbox"
          checked={selected.has(request.id)}
          disabled={bulkDeciding}
          aria-label={`Select ${name}`}
          onChange={() => toggleSelected(request.id)}
        />
        <UserAvatar
          className="community-context-request-avatar"
          readyClassName="has-image"
          name={name}
          imageUrl={request.avatarUrl}
          focusX={request.avatarFocusX ?? 0.5}
          focusY={request.avatarFocusY ?? 0.5}
          zoom={request.avatarZoom ?? 1}
          alt=""
          aria-hidden={true}
          fallback={null}
        />
        <div className="community-context-request-copy">
          <div className="community-context-request-title">
            <strong>{name}</strong>
            <span>{request.createdAtLabel}</span>
          </div>
          {request.message ? (
            <div className="community-context-request-message">{request.message}</div>
          ) : null}
        </div>
        <div className="community-context-request-actions">
          <button
            className="community-context-request-action"
            type="button"
            disabled={isBusy || !props.onApproveJoinRequest}
            aria-busy={isDeciding || undefined}
            aria-label={`Approve ${name}`}
            title="Approve"
            onClick={() => void props.onApproveJoinRequest?.(request.id)}
          >
            <Check size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <button
            className="community-context-request-action"
            type="button"
            disabled={isBusy || !props.onDenyJoinRequest}
            aria-busy={isDeciding || undefined}
            aria-label={`Deny ${name}`}
            title="Deny"
            onClick={() => void props.onDenyJoinRequest?.(request.id)}
          >
            <X size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };
  if (!props.canReviewJoinRequests || props.joinReviewMode !== "free_approval") return null;
  return <>
    {props.isLoadingJoinRequests && !pendingJoinRequests.length ? <div className="community-context-admission-status" role="status">Loading join requests…</div> : null}
        {canShowJoinRequests ? (
          <button
            className={`community-context-request-divider${joinRequestsExpanded ? " is-open" : ""}`}
            type="button"
            aria-busy={props.isLoadingJoinRequests || undefined}
            aria-controls={joinRequestPanelId}
            aria-expanded={joinRequestsExpanded}
            aria-label={requestDividerAriaLabel}
            onClick={() => setJoinRequestsExpanded((expanded) => !expanded)}
          >
            <span>
              {requestDividerLabel}
              <ChevronDown size={13} strokeWidth={2.1} aria-hidden="true" />
            </span>
          </button>
        ) : null}
        {canShowJoinRequestLoadError ? (
          <div className="community-context-admission-status" role="status">
            {props.joinRequestsError}
          </div>
        ) : null}
        {canShowJoinRequests && joinRequestsExpanded ? (
          <div className="community-context-request-panel" id={joinRequestPanelId}>
            {visiblePendingJoinRequests.length > 1 || selected.size > 0 ? (
              <div className="community-context-request-bulk">
                <label>
                  <input
                    className="community-context-request-select"
                    type="checkbox"
                    checked={allSelected}
                    disabled={bulkDeciding}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(visiblePendingJoinRequests.map((request) => request.id)))}
                  />
                  <span>{selected.size ? `${selected.size} selected` : "Select all"}</span>
                </label>
                {selected.size ? (
                  <span className="community-context-request-bulk-actions">
                    <button type="button" disabled={isBusy || !props.onApproveJoinRequest} aria-busy={bulkDeciding || undefined}
                      onClick={() => void decideSelected(props.onApproveJoinRequest)}>Approve</button>
                    <button type="button" disabled={isBusy || !props.onDenyJoinRequest} aria-busy={bulkDeciding || undefined}
                      onClick={() => void decideSelected(props.onDenyJoinRequest)}>Deny</button>
                  </span>
                ) : null}
              </div>
            ) : null}
            {visiblePendingJoinRequests.map(renderJoinRequest)}
            {props.joinRequestsError ? (
              <div className="community-context-admission-status">{props.joinRequestsError}</div>
            ) : null}
          </div>
        ) : null}
  </>;
}
