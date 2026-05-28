import { useEffect, useRef, useState } from "react";

import type {
  CloudCommunityMemberBillingCurrentPlan,
  CloudCommunityMemberBillingHistory,
  CloudCommunityMemberBillingHistoryEvent,
} from "../../../../shared/cloudCommunityAdminGateway";
import type { CloudCommunityMembershipAdminRow } from "../../../../shared/cloudCommunityMembershipGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { type CommunityMembersJoinReviewMode } from "../communityJoinPolicy";

type CommunityMember = CloudCommunityMembershipAdminRow;

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
    communityMemberCount: number | null;
    isLoadingCommunityMembers: boolean;
    isLoadingMoreCommunityMembers: boolean;
    hasResolvedCommunityMembers: boolean;
    communityMembersHasMore: boolean;
    communityMembersLoadError: string | null;
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
    setCommunityMembersPageIndex: (value: number | ((previous: number) => number)) => void;
    handleShowMoreCommunityMembers: () => Promise<void> | void;
    setIsJoinRequestsModalOpen: (isOpen: boolean) => void;
    displayName: (userId: string) => string;
    handleSetCommunityFreeAccessMode: (mode: "open" | "approval") => Promise<void> | void;
    handleSetCommunityMemberRole: (membershipId: string, role: "admin" | "moderator" | "member") => Promise<void> | void;
    handleRemoveCommunityMember: (membershipId: string) => Promise<void> | void;
    handleBanCommunityMember: (membershipId: string) => Promise<void> | void;
    loadMemberBillingHistory: (membershipId: string) => Promise<CloudCommunityMemberBillingHistory | null>;
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
  const isActiveCommunityOwner = capabilities.isActiveCommunityOwner;
  const [didCopyJoinPath, setDidCopyJoinPath] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberBillingHistoryByMemberId, setMemberBillingHistoryByMemberId] =
    useState<Record<string, CloudCommunityMemberBillingHistory>>({});
  const [memberBillingHistoryErrorByMemberId, setMemberBillingHistoryErrorByMemberId] =
    useState<Record<string, string>>({});
  const [loadingMemberBillingHistoryId, setLoadingMemberBillingHistoryId] =
    useState<string | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const requestedMemberBillingHistoryIdsRef = useRef<Set<string>>(new Set());
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
  const visibleMembers = state.communityMembers;
  const totalVisibleMembers = visibleMembers.length;
  const knownCommunityMemberCount =
    typeof state.communityMemberCount === "number" ? state.communityMemberCount : null;
  const loadedCommunityMemberCountLabel =
    `${state.communityMembers.length}${state.communityMembersHasMore ? "+" : ""}`;
  const communityMemberCountLabel =
    knownCommunityMemberCount !== null ? String(knownCommunityMemberCount) : loadedCommunityMemberCountLabel;
  const maxMemberPageIndex = Math.max(0, Math.ceil(totalVisibleMembers / MEMBERS_PAGE_SIZE) - 1);
  const memberPageIndex = Math.min(Math.max(0, state.communityMembersPageIndex), maxMemberPageIndex);
  const memberPageStart = memberPageIndex * MEMBERS_PAGE_SIZE;
  const memberPageEnd = Math.min(memberPageStart + MEMBERS_PAGE_SIZE, totalVisibleMembers);
  const pagedMembers = visibleMembers.slice(memberPageStart, memberPageEnd);
  const totalCommunityMemberSummaryCount =
    knownCommunityMemberCount !== null
      ? knownCommunityMemberCount
      : state.communityMembersHasMore
        ? null
        : totalVisibleMembers;
  const memberPageSummary = totalVisibleMembers > 0
    ? totalCommunityMemberSummaryCount !== null
      ? `Showing ${memberPageStart + 1}-${memberPageEnd} of ${totalCommunityMemberSummaryCount} members`
      : `Showing ${memberPageStart + 1}-${memberPageEnd} loaded members`
    : null;
  const canGoToPreviousMemberPage = memberPageIndex > 0;
  const canGoToNextLoadedMemberPage = memberPageEnd < totalVisibleMembers;
  const canGoToNextMemberPage = canGoToNextLoadedMemberPage || state.communityMembersHasMore;
  const shouldShowMemberPagination =
    totalVisibleMembers > MEMBERS_PAGE_SIZE ||
    state.communityMembersHasMore ||
    state.isLoadingMoreCommunityMembers ||
    Boolean(state.communityMembersLoadError) ||
    canGoToPreviousMemberPage;
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
  };
  const closeMemberSettings = () => {
    setSelectedMemberId(null);
  };
  const formatBaseUnitsAmount = (
    amountBaseUnits: number | string | null | undefined,
    currencyRaw: string | null | undefined,
    currencyDecimalsRaw: number | null | undefined,
  ): string | null => {
    const amount = Number(amountBaseUnits);
    const currency = String(currencyRaw ?? "").trim().toUpperCase();
    const decimals = Number(currencyDecimalsRaw ?? 2);
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
  const formatBillingPeriodSuffix = (
    period: "monthly" | "annual" | null | undefined,
  ): string => {
    if (period === "monthly") return "/mo";
    if (period === "annual") return "/yr";
    return "";
  };
  const formatBillingAmountWithPeriod = (value: {
    amount_base_units: number | null;
    currency: string | null;
    currency_decimals: number | null;
    billing_period: "monthly" | "annual" | null;
  }): string | null => {
    const amount = formatBaseUnitsAmount(
      value.amount_base_units,
      value.currency,
      value.currency_decimals ?? 2,
    );
    return amount ? `${amount}${formatBillingPeriodSuffix(value.billing_period)}` : null;
  };
  const formatBillingStatus = (statusRaw: string | null | undefined): string | null => {
    const status = String(statusRaw ?? "").trim().toLowerCase();
    if (!status) return null;
    return status
      .split("_")
      .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
      .join(" ");
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
  const formatBillingEventDate = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  };
  const formatCurrentPlanLabel = (
    plan: CloudCommunityMemberBillingCurrentPlan,
  ): string => {
    return formatBillingAmountWithPeriod(plan) ?? formatBillingStatus(plan.status) ?? "Current plan";
  };
  const formatCurrentPlanDetail = (
    plan: CloudCommunityMemberBillingCurrentPlan,
  ): string => {
    const status = formatBillingStatus(plan.status);
    const periodEnd = formatBillingEventDate(plan.current_period_end_at);
    const periodEndLabel =
      plan.cancel_at_period_end || plan.status === "cancel_at_period_end"
        ? "Ends"
        : plan.status === "active"
          ? "Renews"
          : "Period ends";
    const source = plan.source ? plan.source.replace(/_/g, " ") : null;
    return [
      status,
      periodEnd ? `${periodEndLabel} ${periodEnd}` : null,
      source,
    ].filter(Boolean).join(" • ");
  };
  const formatBillingEventTitle = (
    event: CloudCommunityMemberBillingHistoryEvent,
  ): string => {
    if (event.kind === "checkout") {
      if (event.status === "complete") return "Checkout completed";
      if (event.status === "pending") return "Checkout pending";
      if (event.status === "expired") return "Checkout expired";
      return "Checkout recorded";
    }
    if (event.status === "active") return "Subscription active";
    if (event.status === "past_due") return "Subscription past due";
    if (event.status === "cancel_at_period_end") return "Cancellation scheduled";
    if (event.status === "canceled") return "Subscription canceled";
    if (event.status === "ended") return "Subscription ended";
    return "Subscription updated";
  };
  const formatBillingEventAmount = (
    event: CloudCommunityMemberBillingHistoryEvent,
  ): string | null => {
    return formatBillingAmountWithPeriod(event);
  };
  const formatBillingEventDetail = (
    event: CloudCommunityMemberBillingHistoryEvent,
  ): string => {
    const amount = formatBillingEventAmount(event);
    const periodEndLabel =
      event.status === "cancel_at_period_end"
        ? "Ends"
        : event.status === "active"
          ? "Renews"
          : "Period ends";
    const periodEnd = formatBillingEventDate(event.current_period_end_at);
    const source = event.source ? event.source.replace(/_/g, " ") : null;
    const details = [
      amount,
      periodEnd ? `${periodEndLabel} ${periodEnd}` : null,
      source,
    ].filter(Boolean);
    return details.join(" • ");
  };
  const selectedMemberBillingHistory = selectedMember
    ? memberBillingHistoryByMemberId[selectedMember.id] ?? null
    : null;
  const selectedMemberCurrentPlan = selectedMemberBillingHistory?.current_plan ?? null;
  const selectedMemberPlanLabel = selectedMemberCurrentPlan
    ? formatCurrentPlanLabel(selectedMemberCurrentPlan)
    : null;
  const selectedMemberPlanDetail = selectedMemberCurrentPlan
    ? formatCurrentPlanDetail(selectedMemberCurrentPlan)
    : null;
  const selectedMemberBillingHistoryEvents = Array.isArray(selectedMemberBillingHistory?.events)
    ? selectedMemberBillingHistory.events
    : [];
  const selectedMemberIsAdmin = selectedMember?.role === "admin";
  const canChangeSelectedMemberRole = Boolean(
    selectedMember && (isActiveCommunityOwner || !selectedMemberIsAdmin),
  );
  const canRemoveSelectedMember = Boolean(
    selectedMember && (isActiveCommunityOwner || !selectedMemberIsAdmin),
  );
  const selectedMemberRoleOptions = selectedMember
    ? isActiveCommunityOwner
      ? (["member", "moderator", "admin"] as const)
      : selectedMemberIsAdmin
        ? (["admin"] as const)
        : (["member", "moderator"] as const)
    : (["member", "moderator"] as const);
  const selectedMemberBillingHistoryError = selectedMember
    ? memberBillingHistoryErrorByMemberId[selectedMember.id] ?? null
    : null;
  const isLoadingSelectedMemberBillingHistory = Boolean(
    selectedMember && loadingMemberBillingHistoryId === selectedMember.id,
  );
  const loadMemberBillingHistory = actions.loadMemberBillingHistory;
  useEffect(() => {
    const memberId = selectedMember?.id ?? null;
    if (!memberId || !canViewMemberPlanDetails) return;
    if (memberBillingHistoryByMemberId[memberId]) return;
    if (requestedMemberBillingHistoryIdsRef.current.has(memberId)) return;
    requestedMemberBillingHistoryIdsRef.current.add(memberId);
    setLoadingMemberBillingHistoryId(memberId);
    let didCancel = false;
    void loadMemberBillingHistory(memberId)
      .then((history) => {
        if (didCancel) return;
        setMemberBillingHistoryErrorByMemberId((previous) => {
          const next = { ...previous };
          delete next[memberId];
          return next;
        });
        setMemberBillingHistoryByMemberId((previous) => ({
          ...previous,
          [memberId]: history ?? {
            community_id: activeCommunity?.id ?? "",
            member_id: memberId,
            current_plan: null,
            events: [],
          },
        }));
      })
      .catch((error) => {
        if (didCancel) return;
        console.warn("Failed to load member billing history:", error);
        setMemberBillingHistoryErrorByMemberId((previous) => ({
          ...previous,
          [memberId]: "Billing history could not be loaded.",
        }));
      })
      .finally(() => {
        requestedMemberBillingHistoryIdsRef.current.delete(memberId);
        if (!didCancel) {
          setLoadingMemberBillingHistoryId((current) => (
            current === memberId ? null : current
          ));
        }
      });
    return () => {
      didCancel = true;
    };
  }, [
    activeCommunity?.id,
    canViewMemberPlanDetails,
    loadMemberBillingHistory,
    memberBillingHistoryByMemberId,
    selectedMember?.id,
  ]);
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
                {communityMemberCountLabel}
              </div>
            </div>
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
              ) : state.communityMembers.length === 0 && !state.communityMembersHasMore ? (
                <div className="members-empty">No members yet.</div>
              ) : visibleMembers.length === 0 ? (
                <div className="members-empty">No members loaded yet.</div>
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
                  const canOpenSettings = canManageMembers && !memberIsOwner;
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
                      />
                      <div className="member-info">
                        <div className="member-name-row">
                          <span className="member-name">{displayName}</span>
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
                      disabled={state.isLoadingMoreCommunityMembers}
                      onClick={() => void actions.handleShowMoreCommunityMembers()}
                    >
                      {state.isLoadingMoreCommunityMembers ? "Loading" : "Show 25 more"}
                    </button>
                  ) : null}
                </div>
                {state.communityMembersLoadError ? (
                  <div className="members-pagination-error">
                    Could not load more members.
                  </div>
                ) : null}
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
                {selectedMemberPlanLabel ? (
                  <div className="member-settings-payment-card">
                    <div className="member-settings-payment-title">Current plan</div>
                    <div className="member-settings-payment-value">{selectedMemberPlanLabel}</div>
                    {selectedMemberPlanDetail ? (
                      <div className="member-settings-payment-note">
                        {selectedMemberPlanDetail}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {canViewMemberPlanDetails ? (
                  <div className="member-settings-billing-history">
                    <div className="member-settings-payment-title">Billing history</div>
                    {isLoadingSelectedMemberBillingHistory && !selectedMemberBillingHistory ? (
                      <div className="member-settings-empty">Loading billing history…</div>
                    ) : selectedMemberBillingHistoryError ? (
                      <div className="member-settings-empty">
                        {selectedMemberBillingHistoryError}
                      </div>
                    ) : selectedMemberBillingHistoryEvents.length ? (
                      <div className="member-settings-history-list">
                        {selectedMemberBillingHistoryEvents.map((event) => {
                          const detail = formatBillingEventDetail(event);
                          const occurredAt = formatBillingEventDate(event.occurred_at);
                          return (
                            <div key={event.id} className="member-settings-history-item">
                              <div className="member-settings-history-copy">
                                <div className="member-settings-history-title">
                                  {formatBillingEventTitle(event)}
                                </div>
                                {detail ? (
                                  <div className="member-settings-history-detail">{detail}</div>
                                ) : null}
                              </div>
                              {occurredAt ? (
                                <div className="member-settings-history-date">{occurredAt}</div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="member-settings-empty">
                        No billing events recorded for this member.
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="member-settings-actions">
                  <label className="member-settings-field member-settings-field-full">
                    <span>Role</span>
                    <select
                      className="select-styled members-surface-select member-settings-role-select"
                      value={selectedMember.role}
                      disabled={!canChangeSelectedMemberRole}
                      onChange={(event) => {
                        const next = event.target.value as "admin" | "moderator" | "member";
                        if (next === selectedMember.role) return;
                        void actions.handleSetCommunityMemberRole(selectedMember.id, next);
                      }}
                    >
                      {selectedMemberRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="danger member-settings-remove"
                    type="button"
                    disabled={!canRemoveSelectedMember}
                    title={canRemoveSelectedMember ? "Remove member" : "Only owners can remove admins"}
                    onClick={() => {
                      if (!canRemoveSelectedMember) return;
                      closeMemberSettings();
                      void actions.handleRemoveCommunityMember(selectedMember.id);
                    }}
                  >
                    Remove member
                  </button>
                  <button
                    className="danger member-settings-remove"
                    type="button"
                    disabled={!canRemoveSelectedMember}
                    title={canRemoveSelectedMember ? "Ban member" : "Only owners can ban admins"}
                    onClick={() => {
                      if (!canRemoveSelectedMember) return;
                      closeMemberSettings();
                      void actions.handleBanCommunityMember(selectedMember.id);
                    }}
                  >
                    Ban member
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
