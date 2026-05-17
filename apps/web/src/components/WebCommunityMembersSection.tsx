import { useEffect, useRef, useState } from "react";

import type { CloudCommunityMembershipAdminRow } from "../../../../shared/cloudCommunityMembershipGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { type CommunityMembersJoinReviewMode } from "../communityJoinPolicy";

type CommunityMember = CloudCommunityMembershipAdminRow;
type MemberSettingsTab = "status" | "payments";

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
};

const MEMBERS_PAGE_SIZE = 25;

type UserProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WebCommunityMembersSectionProps = {
  activeCommunity: ActiveCommunity | null;
  capabilities: {
    canManageMembers: boolean;
    canManageJoinPolicy: boolean;
    canReviewJoinRequests: boolean;
    canViewMemberPlanDetails: boolean;
    isActiveCommunityOwner: boolean;
  };
  state: {
    communityMembers: CommunityMember[];
    filteredCommunityMembers: CommunityMember[];
    isLoadingCommunityMembers: boolean;
    hasResolvedCommunityMembers: boolean;
    communityMembersRoleFilter: string;
    communityMembersPlanFilter: string;
    communityMembersPageIndex: number;
    activeCommunityMembersJoinReviewMode: CommunityMembersJoinReviewMode | null;
    communityJoinRequests: CommunityJoinRequest[];
    communityJoinRequestsError: string | null;
    decidingCommunityJoinRequestId: string | null;
    isLoadingCommunityJoinRequests: boolean;
    isSavingFreeAccessMode: boolean;
    isJoinRequestsModalOpen: boolean;
    profilesByUserId: Record<string, UserProfile>;
  };
  actions: {
    setCommunityMembersRoleFilter: (value: string) => void;
    setCommunityMembersPlanFilter: (value: string) => void;
    setCommunityMembersPageIndex: (value: number | ((previous: number) => number)) => void;
    setIsJoinRequestsModalOpen: (isOpen: boolean) => void;
    displayName: (userId: string) => string;
    handleSetCommunityFreeAccessMode: (mode: "open" | "approval") => Promise<void> | void;
    handleSetCommunityMemberRole: (membershipId: string, role: "admin" | "moderator" | "member") => Promise<void> | void;
    handleRemoveCommunityMember: (membershipId: string) => Promise<void> | void;
    handleBanCommunityMember: (membershipId: string) => Promise<void> | void;
    handleApproveCommunityJoinRequest: (requestId: string) => Promise<void> | void;
    handleDenyCommunityJoinRequest: (requestId: string) => Promise<void> | void;
    copyTextToClipboard: (value: string) => Promise<void> | void;
    getAvatarColor: (seed: string) => string;
    getInitials: (value: string) => string;
    communityInitials: (value: string) => string;
    formatRelativeTime: (value: string) => string;
  };
};

type MemberInitialActions = Pick<WebCommunityMembersSectionProps["actions"], "communityInitials" | "getInitials">;

function memberFallbackInitials(displayName: string, userId: string, actions: MemberInitialActions): string {
  const trimmed = displayName.trim();
  const anonymousMatch = /^Member\s+#([A-Za-z0-9]{2,})$/.exec(trimmed);
  if (anonymousMatch) return anonymousMatch[1]!.slice(0, 2).toUpperCase();
  return trimmed ? actions.communityInitials(trimmed) : actions.getInitials(userId);
}

export function WebCommunityMembersSection(props: WebCommunityMembersSectionProps) {
  const { activeCommunity, capabilities, state, actions } = props;
  const canManageMembers = capabilities.canManageMembers;
  const canManageJoinPolicy = capabilities.canManageJoinPolicy;
  const canReviewJoinRequests = capabilities.canReviewJoinRequests;
  const canViewMemberPlanDetails = capabilities.canViewMemberPlanDetails;
  const [didCopyJoinPath, setDidCopyJoinPath] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberSettingsTab, setMemberSettingsTab] = useState<MemberSettingsTab>("status");
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
  const selectedMember = selectedMemberId
    ? state.communityMembers.find((member) => member.id === selectedMemberId) ?? null
    : null;
  const selectedMemberProfile = selectedMember ? state.profilesByUserId[selectedMember.user_id] ?? null : null;
  const selectedMemberDisplayName = selectedMember
    ? String(
      selectedMemberProfile?.display_name
      ?? actions.displayName(selectedMember.user_id)
      ?? "",
    ).trim() || actions.displayName(selectedMember.user_id)
    : "";
  const selectedMemberAvatarUrl = selectedMemberProfile?.avatar_url ?? null;
  const selectedMemberAvatarFocusX = selectedMemberProfile?.avatar_focus_x ?? 0.5;
  const selectedMemberAvatarFocusY = selectedMemberProfile?.avatar_focus_y ?? 0.5;
  const selectedMemberAvatarZoom = selectedMemberProfile?.avatar_zoom ?? 1;
  const selectedMemberInitials = selectedMember
    ? memberFallbackInitials(selectedMemberDisplayName, selectedMember.user_id, actions)
    : "";
  const setCommunityMembersPageIndex = actions.setCommunityMembersPageIndex;
  const visibleMembers = canManageMembers ? state.filteredCommunityMembers : state.communityMembers;
  const filterIsActive = canManageMembers && (
    state.communityMembersRoleFilter !== "all" ||
    state.communityMembersPlanFilter !== "all"
  );
  const totalVisibleMembers = visibleMembers.length;
  const maxMemberPageIndex = Math.max(0, Math.ceil(totalVisibleMembers / MEMBERS_PAGE_SIZE) - 1);
  const memberPageIndex = Math.min(Math.max(0, state.communityMembersPageIndex), maxMemberPageIndex);
  const memberPageStart = memberPageIndex * MEMBERS_PAGE_SIZE;
  const memberPageEnd = Math.min(memberPageStart + MEMBERS_PAGE_SIZE, totalVisibleMembers);
  const pagedMembers = visibleMembers.slice(memberPageStart, memberPageEnd);
  const memberPageSummary = totalVisibleMembers > 0
    ? `Showing ${memberPageStart + 1}-${memberPageEnd} of ${totalVisibleMembers} ${
        filterIsActive ? "matching " : ""
      }members`
    : null;
  const canGoToPreviousMemberPage = memberPageIndex > 0;
  const canGoToNextMemberPage = memberPageEnd < totalVisibleMembers;
  const shouldShowMemberPagination = totalVisibleMembers > MEMBERS_PAGE_SIZE;
  useEffect(() => {
    if (state.communityMembersPageIndex > maxMemberPageIndex) {
      setCommunityMembersPageIndex(maxMemberPageIndex);
    }
  }, [maxMemberPageIndex, setCommunityMembersPageIndex, state.communityMembersPageIndex]);

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
  const openMemberSettings = (memberId: string) => {
    setSelectedMemberId(memberId);
    setMemberSettingsTab("status");
  };
  const closeMemberSettings = () => {
    setSelectedMemberId(null);
    setMemberSettingsTab("status");
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
    if (!canViewMemberPlanDetails) return null;
    const amount = formatAmount(member);
    const period =
      member.billing_period === "monthly" ? "/mo" : member.billing_period === "annual" ? "/yr" : "";
    if (!String(member.price_point_id ?? "").trim()) return null;
    if (amount) return `${amount}${period}`;
    return null;
  };
  const formatJoinedAt = (value: string): string => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  };
  const planOptions = (() => {
    const seenPricePoints = new Set<string>();
    const dynamicPlanOptions: Array<{ value: string; label: string; amount: number }> = [];
    if (!canViewMemberPlanDetails) {
      return [{ value: "all", label: "All plans" }];
    }
    for (const member of state.communityMembers) {
      const pricePointId = String(member.price_point_id ?? "").trim();
      if (!pricePointId || seenPricePoints.has(pricePointId)) continue;
      seenPricePoints.add(pricePointId);
      const amountRaw = Number(member.amount_base_units ?? 0);
      const amount = Number.isFinite(amountRaw) ? amountRaw : 0;
      const formattedAmount = formatAmount(member);
      const period =
        member.billing_period === "monthly" ? "/mo" : member.billing_period === "annual" ? "/yr" : "";
      dynamicPlanOptions.push({
        value: pricePointId,
        label: formattedAmount ? `${formattedAmount}${period}` : "Paid plan",
        amount,
      });
    }
    dynamicPlanOptions.sort((a, b) => a.amount - b.amount || a.label.localeCompare(b.label));
    const options: Array<{ value: string; label: string }> = [{ value: "all", label: "All plans" }];
    for (const option of dynamicPlanOptions) {
      options.push({ value: option.value, label: option.label });
    }
    return options;
  })();
  const autoApproveNewMembers = state.activeCommunityMembersJoinReviewMode === "free_auto";
  const canReviewFreeMembers = Boolean(
    activeCommunity &&
      canReviewJoinRequests &&
      state.activeCommunityMembersJoinReviewMode !== "paid",
  );
  const showPendingApprovals =
    canReviewFreeMembers &&
    state.activeCommunityMembersJoinReviewMode === "free_approval";
  const pendingApprovalsCount = state.isLoadingCommunityJoinRequests ? "…" : String(state.communityJoinRequests.length);

  return (
    <>
      <div className="community-panel members-panel">
        <div className={`members-layout${canManageMembers ? " with-invites" : ""}`}>
          <section className="members-section">
            <div className="members-header-row">
              <div className="members-header">Members</div>
              <div className="members-count">
                {filterIsActive
                  ? `${totalVisibleMembers} / ${state.communityMembers.length}`
                  : state.communityMembers.length}
              </div>
            </div>
            {canManageMembers && (
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
                {canViewMemberPlanDetails ? (
                  <label className="members-filter-field">
                    <span>Plan</span>
                    <select
                      className="select-styled members-surface-select"
                      value={state.communityMembersPlanFilter}
                      onChange={(event) => actions.setCommunityMembersPlanFilter(event.target.value)}
                    >
                      {planOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                {canManageJoinPolicy ? (
                  <label
                    className={`members-switch${
                      state.isLoadingCommunityJoinRequests || state.isSavingFreeAccessMode ? " is-disabled" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={autoApproveNewMembers}
                      disabled={state.isLoadingCommunityJoinRequests || state.isSavingFreeAccessMode}
                      onChange={(event) => {
                        const nextAutoApprove = event.target.checked;
                        void actions.handleSetCommunityFreeAccessMode(nextAutoApprove ? "open" : "approval");
                      }}
                    />
                    <span className="members-switch-track">
                      <span className="members-switch-thumb" />
                    </span>
                  </label>
                ) : (
                  <div className="members-policy-text">
                    Owners and admins can change join approval mode.
                  </div>
                )}
              </div>
            )}
            {showPendingApprovals && (
              <div className="members-queue-row">
                <button
                  className="members-queue-button"
                  type="button"
                  disabled={
                    state.isLoadingCommunityJoinRequests ||
                    state.isSavingFreeAccessMode
                  }
                  onClick={() => actions.setIsJoinRequestsModalOpen(!state.isJoinRequestsModalOpen)}
                >
                  <div className="members-queue-copy">
                    <div className="members-queue-title">Pending approvals</div>
                    <div className="members-queue-text">
                      Review people who asked to join before they can access the community.
                    </div>
                  </div>
                  <div className="members-queue-count">{pendingApprovalsCount}</div>
                </button>
                {state.isJoinRequestsModalOpen && (
                  <div className="members-queue-expanded">
                    {state.isLoadingCommunityJoinRequests ? (
                      <div className="members-queue-empty">Loading…</div>
                    ) : state.communityJoinRequests.length === 0 ? (
                      <div className="members-queue-empty">No pending approvals.</div>
                    ) : (
                      <div className="members-queue-list">
                        {state.communityJoinRequests.map((request) => {
                          const message = (request.message ?? "").trim();
                          const details = [actions.formatRelativeTime(request.created_at), message]
                            .filter(Boolean)
                            .join(" • ");
                          const isDeciding = state.decidingCommunityJoinRequestId === request.id;
                          return (
                            <div key={request.id} className="members-queue-item">
                              <div className="members-queue-item-main">
                                <div className="members-queue-item-name">
                                  {actions.displayName(request.user_id)}
                                </div>
                                <div className="members-queue-item-meta">
                                  {details || "Requested access"}
                                </div>
                              </div>
                              <div className="members-queue-item-actions">
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
                    {state.communityJoinRequestsError && (
                      <div className="auth-error">{state.communityJoinRequestsError}</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {state.communityJoinRequestsError && (
              <div className="auth-error">
                {state.communityJoinRequestsError}
              </div>
            )}
            {!canManageMembers ? (
              <div className="members-readonly-note">
                Only owners and admins can manage roles or remove members.
              </div>
            ) : null}
            <div className="members-list">
              {!state.hasResolvedCommunityMembers && state.isLoadingCommunityMembers ? (
                <div className="members-loading-shell" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="member-item-skeleton">
                      <div className="member-avatar-skeleton web-skeleton-pill" />
                      <div className="member-info-skeleton">
                        <div className="member-line-skeleton member-line-skeleton-title web-skeleton-row" />
                        <div className="member-line-skeleton member-line-skeleton-meta web-skeleton-row" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : state.communityMembers.length === 0 ? (
                <div className="members-empty">No members yet.</div>
              ) : visibleMembers.length === 0 ? (
                <div className="members-empty">No matching members.</div>
              ) : (
                pagedMembers.map((member) => {
                  const profile = state.profilesByUserId[member.user_id] ?? null;
                  const displayName =
                    String(profile?.display_name ?? actions.displayName(member.user_id) ?? "").trim()
                    || actions.displayName(member.user_id);
                  const avatarUrl = profile?.avatar_url ?? null;
                  const initials = memberFallbackInitials(displayName, member.user_id, actions);
                  const memberIsOwner = Boolean(
                    activeCommunity && activeCommunity.owner_id === member.user_id,
                  );
                  const viewerIsOwner = capabilities.isActiveCommunityOwner;
                  const viewerIsAdmin = canManageMembers && !viewerIsOwner;
                  const memberIsAdmin = member.role === "admin";
                  const memberIsModerator = member.role === "moderator";
                  const memberPriceLabel = formatMemberAccess(member);
                  const canEditThisMember = !memberIsOwner && (viewerIsOwner || viewerIsAdmin);
                  const canRemoveThisMember = !memberIsOwner && (viewerIsOwner || viewerIsAdmin);
                  const canOpenSettings = canManageMembers && !memberIsOwner;
                  const roleOptions =
                    viewerIsOwner || viewerIsAdmin
                      ? (["member", "moderator", "admin"] as const)
                      : memberIsAdmin
                        ? (["admin"] as const)
                        : memberIsModerator
                          ? (["moderator"] as const)
                          : (["member"] as const);
                  return (
                    <div key={member.id} id={`community-member-${member.id}`} className="member-item">
                      <UserAvatar
                        className="member-avatar"
                        readyClassName="has-image"
                        name={displayName}
                        imageUrl={avatarUrl}
                        focusX={profile?.avatar_focus_x ?? 0.5}
                        focusY={profile?.avatar_focus_y ?? 0.5}
                        zoom={profile?.avatar_zoom ?? 1}
                        alt={displayName}
                        fallback={initials}
                        fallbackStyle={{ backgroundColor: actions.getAvatarColor(member.user_id) }}
                      />
                      <div className="member-info">
                        <div className="member-name-row">
                          <span className="member-name">{displayName}</span>
                          {memberPriceLabel ? (
                            <span className="member-price-label">{memberPriceLabel}</span>
                          ) : null}
                        </div>
                        <div className="member-meta">
                          <span className="member-role">{memberIsOwner ? "owner" : member.role}</span>
                        </div>
                      </div>
                      {canOpenSettings ? (
                        <button
                          className="member-settings-trigger"
                          type="button"
                          aria-label={`Open settings for ${displayName}`}
                          title="Member settings"
                          onClick={() => openMemberSettings(member.id)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
                            <path d="M19.4 15a1 1 0 0 0 .2 1.1l.05.05a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.05-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.91V20a2 2 0 0 1-4 0v-.08a1 1 0 0 0-.65-.92 1 1 0 0 0-1.1.2l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1 1 0 0 0 .2-1.1 1 1 0 0 0-.91-.6H4a2 2 0 0 1 0-4h.08a1 1 0 0 0 .92-.65 1 1 0 0 0-.2-1.1l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.91V4a2 2 0 0 1 4 0v.08a1 1 0 0 0 .65.92 1 1 0 0 0 1.1-.2l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05a1 1 0 0 0-.2 1.1 1 1 0 0 0 .91.6H20a2 2 0 0 1 0 4h-.08a1 1 0 0 0-.92.65A1 1 0 0 0 19.4 15Z" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            {state.hasResolvedCommunityMembers && shouldShowMemberPagination ? (
              <div className="members-pagination">
                <div className="members-pagination-summary">{memberPageSummary}</div>
                <div className="members-pagination-actions">
                  {canGoToPreviousMemberPage ? (
                    <button
                      type="button"
                      className="members-pagination-action"
                      onClick={() =>
                        setCommunityMembersPageIndex((previous) => Math.max(0, previous - 1))
                      }
                    >
                      Previous
                    </button>
                  ) : null}
                  {canGoToNextMemberPage ? (
                    <button
                      type="button"
                      className="members-pagination-action members-pagination-next"
                      onClick={() =>
                        setCommunityMembersPageIndex((previous) =>
                          Math.min(maxMemberPageIndex, previous + 1),
                        )
                      }
                    >
                      Show 25 more
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {activeCommunity && canManageMembers && (
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
      {selectedMember && activeCommunity && (
        <div className="modal-overlay" onClick={closeMemberSettings}>
          <div
            className="modal member-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="create-community-heading">
                <div className="modal-title" id="member-settings-title">
                  Member settings
                </div>
                <div className="create-community-subtitle">
                  Review status and billing details for {actions.displayName(selectedMember.user_id)}.
                </div>
              </div>
              <button className="modal-close" onClick={closeMemberSettings} title="Close">
                ×
              </button>
            </div>
            <div className="modal-body member-settings-modal-body">
              <div className="member-settings-tablist" role="tablist" aria-label="Member settings sections">
                <button
                  type="button"
                  className={`member-settings-tab${memberSettingsTab === "status" ? " is-active" : ""}`}
                  aria-selected={memberSettingsTab === "status"}
                  onClick={() => setMemberSettingsTab("status")}
                >
                  Member status
                </button>
                <button
                  type="button"
                  className={`member-settings-tab${memberSettingsTab === "payments" ? " is-active" : ""}`}
                  aria-selected={memberSettingsTab === "payments"}
                  onClick={() => setMemberSettingsTab("payments")}
                >
                  Payment history
                </button>
              </div>
              {memberSettingsTab === "status" ? (
                <div className="member-settings-section">
                  <div className="member-settings-summary">
                    <UserAvatar
                      className="member-avatar member-settings-avatar"
                      readyClassName="has-image"
                      name={selectedMemberDisplayName}
                      imageUrl={selectedMemberAvatarUrl}
                      focusX={selectedMemberAvatarFocusX}
                      focusY={selectedMemberAvatarFocusY}
                      zoom={selectedMemberAvatarZoom}
                      alt={selectedMemberDisplayName}
                      fallback={selectedMemberInitials}
                      fallbackStyle={
                        selectedMemberAvatarUrl
                          ? undefined
                          : { backgroundColor: actions.getAvatarColor(selectedMember.user_id) }
                      }
                    />
                    <div className="member-settings-summary-copy">
                      <div className="member-settings-summary-name">
                        {selectedMemberDisplayName}
                      </div>
                      <div className="member-settings-summary-meta">
                        Joined {formatJoinedAt(selectedMember.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="member-settings-grid">
                    <div className="member-settings-field">
                      <span>Status</span>
                      <div className="member-settings-value">
                        {selectedMember.role === "owner" ? "Owner" : selectedMember.role}
                      </div>
                    </div>
                    <div className="member-settings-field">
                      <span>Joined</span>
                      <div className="member-settings-value">{formatJoinedAt(selectedMember.created_at)}</div>
                    </div>
                  </div>
                  <div className="member-settings-actions">
                    <label className="member-settings-field member-settings-field-full">
                      <span>Role</span>
                      <select
                        className="select-styled members-surface-select member-settings-role-select"
                        value={selectedMember.role}
                        onChange={(event) => {
                          const next = event.target.value as "admin" | "moderator" | "member";
                          if (next === selectedMember.role) return;
                          void actions.handleSetCommunityMemberRole(selectedMember.id, next);
                        }}
                      >
                        {(["member", "moderator", "admin"] as const).map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="danger member-settings-remove"
                      type="button"
                      onClick={() => {
                        closeMemberSettings();
                        void actions.handleRemoveCommunityMember(selectedMember.id);
                      }}
                    >
                      Remove member
                    </button>
                    <button
                      className="danger member-settings-remove"
                      type="button"
                      onClick={() => {
                        closeMemberSettings();
                        void actions.handleBanCommunityMember(selectedMember.id);
                      }}
                    >
                      Ban member
                    </button>
                  </div>
                </div>
              ) : (
                <div className="member-settings-section">
                  {formatMemberAccess(selectedMember) ? (
                    <div className="member-settings-payment-card">
                      <div className="member-settings-payment-title">Current plan</div>
                      <div className="member-settings-payment-value">{formatMemberAccess(selectedMember)}</div>
                      <div className="member-settings-payment-note">
                        Historical payments are not available yet. This view shows the current membership billing snapshot.
                      </div>
                    </div>
                  ) : (
                    <div className="member-settings-empty">No payment history.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
