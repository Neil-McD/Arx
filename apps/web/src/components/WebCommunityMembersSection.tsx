import { useEffect, useRef, useState } from "react";

import { deriveCommunityJoinMode, type CommunityEntryPolicy } from "../communityJoinPolicy";

type CommunityMember = {
  id: string;
  user_id: string;
  role: string;
  access_source?: "free_grant" | "manual_grant" | "paid_unlock" | "paid_subscription" | null;
  is_entitled?: boolean;
  entitlement_ends_at?: string | null;
  subscription_status?: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended" | null;
  subscription_cancel_at_period_end?: boolean | null;
  billing_period?: string | null;
  amount_base_units?: number | null;
  currency?: string | null;
  currency_decimals?: number | null;
};

type CommunityJoinRequest = {
  id: string;
  user_id: string;
  message: string | null;
  created_at: string;
};

type ActiveCommunity = {
  id: string;
  slug: string;
  owner_id: string;
  entry_policy?: CommunityEntryPolicy | null;
};

type UserProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
};

type WebCommunityMembersSectionProps = {
  activeCommunity: ActiveCommunity | null;
  hasSession: boolean;
  capabilities: {
    canManageMembersActiveCommunity: boolean;
    canReviewJoinRequestsActiveCommunity: boolean;
    isActiveCommunityOwner: boolean;
  };
  state: {
    communityMembers: CommunityMember[];
    filteredCommunityMembers: CommunityMember[];
    communityMembersRoleFilter: string;
    membersCommunityHasPaidPlans: boolean | null;
    activeCommunityJoinMode: string | null;
    communityJoinRequests: CommunityJoinRequest[];
    communityJoinRequestsError: string | null;
    decidingCommunityJoinRequestId: string | null;
    isLoadingMembersCommunityPricing: boolean;
    isLoadingCommunityJoinRequests: boolean;
    isSavingFreeAccessMode: boolean;
    isJoinRequestsModalOpen: boolean;
    profilesByUserId: Record<string, UserProfile>;
  };
  actions: {
    setCommunityMembersRoleFilter: (value: string) => void;
    setIsJoinRequestsModalOpen: (isOpen: boolean) => void;
    displayName: (userId: string) => string;
    handleSetCommunityFreeAccessMode: (mode: "open" | "approval") => Promise<void> | void;
    handleSetCommunityMemberRole: (userId: string, role: "admin" | "moderator" | "member") => Promise<void> | void;
    handleRemoveCommunityMember: (userId: string) => Promise<void> | void;
    handleApproveCommunityJoinRequest: (requestId: string) => Promise<void> | void;
    handleDenyCommunityJoinRequest: (requestId: string) => Promise<void> | void;
    copyTextToClipboard: (value: string) => Promise<void> | void;
    getAvatarColor: (seed: string) => string;
    getInitials: (value: string) => string;
    communityInitials: (value: string) => string;
    formatRelativeTime: (value: string) => string;
  };
};

export function WebCommunityMembersSection(props: WebCommunityMembersSectionProps) {
  const { activeCommunity, hasSession, capabilities, state, actions } = props;
  const [didCopyJoinPath, setDidCopyJoinPath] = useState(false);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const joinPath = activeCommunity ? `/c/${encodeURIComponent(activeCommunity.slug)}` : "";
  const joinUrl = activeCommunity
    ? typeof window === "undefined"
      ? joinPath
      : new URL(joinPath, window.location.origin).toString()
    : "";
  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyJoinPath = async () => {
    if (!joinUrl) return;
    await actions.copyTextToClipboard(joinUrl);
    setDidCopyJoinPath(true);
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setDidCopyJoinPath(false);
      copyResetTimeoutRef.current = null;
    }, 1400);
  };
  const formatAmount = (member: CommunityMember): string | null => {
    const amount = Number(member.amount_base_units);
    const currency = String(member.currency ?? "").trim().toUpperCase();
    const decimals = Number(member.currency_decimals ?? 2);
    if (!Number.isFinite(amount) || amount < 0 || !currency) return null;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: Math.max(0, decimals),
        maximumFractionDigits: Math.max(0, decimals),
      }).format(amount / 10 ** Math.max(0, decimals));
    } catch {
      return null;
    }
  };
  const formatMemberAccess = (member: CommunityMember): string | null => {
    const source = String(member.access_source ?? "").trim().toLowerCase();
    const amount = formatAmount(member);
    const period =
      member.billing_period === "monthly" ? "/mo" : member.billing_period === "yearly" ? "/yr" : "";
    const base =
      source === "free_grant"
        ? "free"
        : source === "manual_grant"
          ? "complimentary"
          : source === "paid_unlock"
              ? amount ? `unlock ${amount}${period}` : "paid unlock"
              : source === "paid_subscription"
                ? amount ? `${amount}${period}` : "subscription"
                : "";
    const status = String(member.subscription_status ?? "").trim().toLowerCase();
    const statusLabel =
      status === "cancel_at_period_end"
        ? "cancels at period end"
        : status === "past_due"
          ? "past due"
          : status === "active"
            ? "active"
            : "";
    if (base && statusLabel && source === "paid_subscription") return `${base} · ${statusLabel}`;
    if (base) return base;
    if (statusLabel) return statusLabel;
    return null;
  };
  const formatEntitlementEnds = (member: CommunityMember): string | null => {
    const raw = String(member.entitlement_ends_at ?? "").trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return `through ${parsed.toLocaleDateString()}`;
  };
  const activeCommunityJoinMode = activeCommunity
    ? deriveCommunityJoinMode({
      entry_policy: activeCommunity.entry_policy,
      })
    : null;
  const effectiveActiveCommunityJoinMode = activeCommunityJoinMode ?? state.activeCommunityJoinMode;
  const autoApproveNewMembers = effectiveActiveCommunityJoinMode === "join_free";
  const canReviewFreeMembers = Boolean(
    activeCommunity &&
      capabilities.canReviewJoinRequestsActiveCommunity &&
      state.membersCommunityHasPaidPlans === false,
  );
  const showPendingApprovals =
    canReviewFreeMembers &&
    (effectiveActiveCommunityJoinMode === "request_access" || state.communityJoinRequests.length > 0);
  const pendingApprovalsCount = state.isLoadingCommunityJoinRequests ? "…" : String(state.communityJoinRequests.length);

  return (
    <>
      <div className="community-panel members-panel">
        <div className={`members-layout${capabilities.canManageMembersActiveCommunity ? " with-invites" : ""}`}>
          <section className="members-section">
            <div className="members-header-row">
              <div className="members-header">Members</div>
              <div className="members-count">
                {state.communityMembersRoleFilter !== "all"
                  ? `${state.filteredCommunityMembers.length} / ${state.communityMembers.length}`
                  : state.communityMembers.length}
              </div>
            </div>
            {capabilities.canManageMembersActiveCommunity && (
              <div className="members-filter-row">
                <label className="members-filter-field">
                  <span>Role</span>
                  <select
                    className="select-styled members-surface-select"
                    value={state.communityMembersRoleFilter}
                    onChange={(event) => actions.setCommunityMembersRoleFilter(event.target.value)}
                  >
                    <option value="all">All roles</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="member">Member</option>
                  </select>
                </label>
              </div>
            )}
            {canReviewFreeMembers && activeCommunity && (
              <div className="members-policy-row">
                <div className="members-policy-copy">
                  <div className="members-policy-title">Auto-approve new members</div>
                  <div className="members-policy-text">
                    Let free members join immediately instead of sending them to a review queue.
                  </div>
                </div>
                <label
                  className={`members-switch${
                    state.isLoadingMembersCommunityPricing || state.isSavingFreeAccessMode ? " is-disabled" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={autoApproveNewMembers}
                    disabled={state.isLoadingMembersCommunityPricing || state.isSavingFreeAccessMode}
                    onChange={(event) => {
                      const nextAutoApprove = event.target.checked;
                      void actions.handleSetCommunityFreeAccessMode(nextAutoApprove ? "open" : "approval");
                    }}
                  />
                  <span className="members-switch-track">
                    <span className="members-switch-thumb" />
                  </span>
                </label>
              </div>
            )}
            {showPendingApprovals && (
              <div className="members-queue-row">
                <button
                  className="members-queue-button"
                  type="button"
                  disabled={
                    state.isLoadingMembersCommunityPricing ||
                    state.isLoadingCommunityJoinRequests ||
                    state.isSavingFreeAccessMode
                  }
                  onClick={() => actions.setIsJoinRequestsModalOpen(true)}
                >
                  <div className="members-queue-copy">
                    <div className="members-queue-title">Pending approvals</div>
                    <div className="members-queue-text">
                      Review people who asked to join before they can access the community.
                    </div>
                  </div>
                  <div className="members-queue-count">{pendingApprovalsCount}</div>
                </button>
              </div>
            )}
            {state.communityJoinRequestsError && (
              <div className="auth-error">
                {state.communityJoinRequestsError}
              </div>
            )}
            <div className="members-list">
              {state.communityMembers.length === 0 ? (
                <div className="members-empty">No members yet.</div>
              ) : state.filteredCommunityMembers.length === 0 ? (
                <div className="members-empty">No matching members.</div>
              ) : (
                state.filteredCommunityMembers.map((member) => {
                  const profile = state.profilesByUserId[member.user_id] ?? null;
                  const avatarUrl = profile?.avatar_url ?? null;
                  const initials = profile?.display_name
                    ? actions.communityInitials(profile.display_name)
                    : actions.getInitials(member.user_id);
                  const memberIsOwner = Boolean(
                    activeCommunity && activeCommunity.owner_id === member.user_id,
                  );
                  const viewerIsOwner = capabilities.isActiveCommunityOwner;
                  const viewerIsAdmin = capabilities.canManageMembersActiveCommunity && !viewerIsOwner;
                  const memberIsModerator = member.role === "moderator";
                  const memberIsAdmin = member.role === "admin";
                  const canEditThisMember = !memberIsOwner && (viewerIsOwner || viewerIsAdmin);
                  const canRemoveThisMember = !memberIsOwner && (viewerIsOwner || viewerIsAdmin);
                  const roleOptions =
                    viewerIsOwner || viewerIsAdmin
                      ? (["member", "moderator", "admin"] as const)
                      : memberIsAdmin
                        ? (["admin"] as const)
                        : memberIsModerator
                          ? (["moderator"] as const)
                          : (["member"] as const);
                  return (
                    <div key={member.id} className="member-item">
                      <div
                        className={`member-avatar${avatarUrl ? " has-image" : ""}`}
                        style={avatarUrl ? undefined : { backgroundColor: actions.getAvatarColor(member.user_id) }}
                      >
                        {avatarUrl ? <img src={avatarUrl} alt={actions.displayName(member.user_id)} draggable={false} /> : initials}
                      </div>
                      <div className="member-info">
                        <span className="member-name">{actions.displayName(member.user_id)}</span>
                        <div className="member-meta">
                          <span className="member-role">{memberIsOwner ? "owner" : member.role}</span>
                          {formatMemberAccess(member) ? (
                            <span className="member-role">{formatMemberAccess(member)}</span>
                          ) : null}
                          {formatEntitlementEnds(member) ? (
                            <span className="member-role">{formatEntitlementEnds(member)}</span>
                          ) : null}
                        </div>
                        {!capabilities.canManageMembersActiveCommunity || memberIsOwner ? null : (
                          <div className="member-controls">
                            <select
                              className="select-styled"
                              value={member.role}
                              disabled={!canEditThisMember}
                              onChange={(event) => {
                                const next = event.target.value as "admin" | "moderator" | "member";
                                if (next === member.role) return;
                                void actions.handleSetCommunityMemberRole(member.user_id, next);
                              }}
                            >
                              {roleOptions.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                            {canRemoveThisMember && (
                              <button
                                className="danger"
                                type="button"
                                onClick={() => void actions.handleRemoveCommunityMember(member.user_id)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {activeCommunity && hasSession && capabilities.canManageMembersActiveCommunity && (
            <section className="invites-section">
              <div className="members-header-row">
                <div className="members-header">Join path</div>
              </div>
              <div className="invites-card">
                <div className="invite-create-shell">
                  <div className="members-policy-copy">
                    <div className="members-policy-title">Copy the normal join path</div>
                    <div className="members-policy-text">
                      Share the standard community URL. It follows the normal join flow instead of bypassing the gate.
                    </div>
                  </div>
                  <div className="invite-row">
                    <div className="invite-main">
                      <div className="invite-code">{joinPath}</div>
                      <div className="invite-status active">standard join route</div>
                    </div>
                    <button
                      className={`invite-inline-copy${didCopyJoinPath ? " is-copied" : ""}`}
                      type="button"
                      onClick={() => void handleCopyJoinPath()}
                      disabled={!joinUrl}
                      title={didCopyJoinPath ? "Copied" : "Copy join path"}
                      aria-label={didCopyJoinPath ? "Copied" : "Copy join path"}
                    >
                      {didCopyJoinPath ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="9" y="9" width="11" height="11" rx="2" />
                          <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {state.isJoinRequestsModalOpen && (
        <div className="modal-overlay" onClick={() => actions.setIsJoinRequestsModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Pending approvals</div>
              <button
                className="modal-close"
                onClick={() => actions.setIsJoinRequestsModalOpen(false)}
                title="Close"
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {state.isLoadingCommunityJoinRequests ? (
                <div className="chat-empty">Loading…</div>
              ) : state.communityJoinRequests.length === 0 ? (
                <div className="model-note">No pending approvals.</div>
              ) : (
                <div className="invite-list">
                  {state.communityJoinRequests.map((request) => {
                    const message = (request.message ?? "").trim();
                    const details = [actions.formatRelativeTime(request.created_at), message].filter(Boolean).join(" • ");
                    const isDeciding = state.decidingCommunityJoinRequestId === request.id;
                    return (
                      <div key={request.id} className="invite-row">
                        <div className="invite-main">
                          <div className="invite-code">{actions.displayName(request.user_id)}</div>
                          <div className="invite-status active">{details || "Requested access"}</div>
                        </div>
                        <div className="invite-actions">
                          <button
                            className="secondary"
                            type="button"
                            disabled={isDeciding}
                            onClick={() => void actions.handleApproveCommunityJoinRequest(request.id)}
                            title="Approve"
                          >
                            ✓
                          </button>
                          <button
                            className="danger"
                            type="button"
                            disabled={isDeciding}
                            onClick={() => void actions.handleDenyCommunityJoinRequest(request.id)}
                            title="Deny"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {state.communityJoinRequestsError && <div className="auth-error">{state.communityJoinRequestsError}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
