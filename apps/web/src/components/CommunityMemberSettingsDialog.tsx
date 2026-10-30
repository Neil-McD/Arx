import { useEffect, useRef, useState } from "react";

import type {
  CloudCommunityMemberBillingCurrentPlan,
  CloudCommunityMemberBillingHistory,
  CloudCommunityMemberBillingHistoryEvent,
} from "../../../../shared/cloudCommunityAdminGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";

export type CommunityMemberSettingsMember = {
  id: string;
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  role: string;
  co_creator?: boolean;
  created_at?: string | null;
};

export type CommunityMemberSettingsProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type CommunityMemberSettingsCommunity = {
  id: string;
  owner_id?: string | null;
};

type CommunityMemberSettingsDialogProps = {
  member: CommunityMemberSettingsMember | null;
  profile?: CommunityMemberSettingsProfile | null;
  activeCommunity: CommunityMemberSettingsCommunity | null;
  canManageMembers: boolean;
  canViewMemberPlanDetails: boolean;
  isActiveCommunityOwner: boolean;
  onClose: () => void;
  displayName: (userId: string) => string;
  getInitials: (value: string) => string;
  communityInitials: (value: string) => string;
  handleSetCommunityMemberRole: (membershipId: string, role: "co_creator" | "admin" | "moderator" | "member") => Promise<void> | void;
  handleRemoveCommunityMember: (membershipId: string) => Promise<void> | void;
  handleBanCommunityMember: (membershipId: string) => Promise<void> | void;
  loadMemberBillingHistory: (membershipId: string) => Promise<CloudCommunityMemberBillingHistory | null>;
};

function memberFallbackInitials(
  displayName: string,
  userId: string,
  actions: Pick<CommunityMemberSettingsDialogProps, "communityInitials" | "getInitials">,
): string {
  const trimmed = displayName.trim();
  const anonymousMatch = /^Member\s+#([A-Za-z0-9]{2,})$/.exec(trimmed);
  if (anonymousMatch) return anonymousMatch[1]!.slice(0, 2).toUpperCase();
  return trimmed ? actions.communityInitials(trimmed) : actions.getInitials(userId);
}

function formatBaseUnitsAmount(
  amountBaseUnits: number | string | null | undefined,
  currencyRaw: string | null | undefined,
  currencyDecimalsRaw: number | null | undefined,
): string | null {
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
}

function formatBillingPeriodSuffix(period: "monthly" | "annual" | null | undefined): string {
  if (period === "monthly") return "/mo";
  if (period === "annual") return "/yr";
  return "";
}

function formatBillingAmountWithPeriod(value: {
  amount_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
  billing_period: "monthly" | "annual" | null;
}): string | null {
  const amount = formatBaseUnitsAmount(
    value.amount_base_units,
    value.currency,
    value.currency_decimals ?? 2,
  );
  return amount ? `${amount}${formatBillingPeriodSuffix(value.billing_period)}` : null;
}

function formatBillingStatus(statusRaw: string | null | undefined): string | null {
  const status = String(statusRaw ?? "").trim().toLowerCase();
  if (!status) return null;
  return status
    .split("_")
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function formatJoinedAt(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatBillingEventDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatCurrentPlanLabel(plan: CloudCommunityMemberBillingCurrentPlan): string {
  return formatBillingAmountWithPeriod(plan) ?? formatBillingStatus(plan.status) ?? "Current plan";
}

function formatCurrentPlanDetail(plan: CloudCommunityMemberBillingCurrentPlan): string {
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
}

function formatBillingEventTitle(event: CloudCommunityMemberBillingHistoryEvent): string {
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
}

function formatBillingEventDetail(event: CloudCommunityMemberBillingHistoryEvent): string {
  const amount = formatBillingAmountWithPeriod(event);
  const periodEndLabel =
    event.status === "cancel_at_period_end"
      ? "Ends"
      : event.status === "active"
        ? "Renews"
        : "Period ends";
  const periodEnd = formatBillingEventDate(event.current_period_end_at);
  const source = event.source ? event.source.replace(/_/g, " ") : null;
  return [
    amount,
    periodEnd ? `${periodEndLabel} ${periodEnd}` : null,
    source,
  ].filter(Boolean).join(" • ");
}

type RoleChoice = "co_creator" | "admin" | "moderator" | "member";

// A co-creator is an admin the owner made one of the community's creators.
function normalizeRole(roleRaw: string | null | undefined, coCreator?: boolean): RoleChoice {
  const role = String(roleRaw ?? "").trim().toLowerCase();
  if (role === "admin" && coCreator) return "co_creator";
  if (role === "admin" || role === "moderator" || role === "member") return role;
  return "member";
}

const ROLE_LABEL: Record<RoleChoice, string> = {
  co_creator: "Co-creator",
  admin: "Admin",
  moderator: "Moderator",
  member: "Member",
};

export function CommunityMemberSettingsDialog(props: CommunityMemberSettingsDialogProps) {
  const [memberBillingHistoryByMemberId, setMemberBillingHistoryByMemberId] =
    useState<Record<string, CloudCommunityMemberBillingHistory>>({});
  const [memberBillingHistoryErrorByMemberId, setMemberBillingHistoryErrorByMemberId] =
    useState<Record<string, string>>({});
  const [loadingMemberBillingHistoryId, setLoadingMemberBillingHistoryId] =
    useState<string | null>(null);
  const requestedMemberBillingHistoryIdsRef = useRef<Set<string>>(new Set());
  const member = props.member;
  const profile = props.profile ?? null;
  const memberId = member?.id ?? null;
  const activeCommunityId = props.activeCommunity?.id ?? "";
  const canViewMemberPlanDetails = props.canViewMemberPlanDetails;
  const loadMemberBillingHistory = props.loadMemberBillingHistory;
  const memberRole = normalizeRole(member?.role, member?.co_creator);
  const memberIsOwner = Boolean(
    member &&
      (
        member.role === "owner" ||
        (props.activeCommunity?.owner_id && member.user_id === props.activeCommunity.owner_id) ||
        member.id.startsWith("owner:")
      ),
  );
  const memberIsAdmin = memberRole === "admin" || memberRole === "co_creator";
  const displayName = member
    ? String(
      profile?.display_name ??
      member.display_name ??
      props.displayName(member.user_id) ??
      "",
    ).trim() || props.displayName(member.user_id)
    : "";
  const avatarUrl = profile?.avatar_url ?? member?.avatar_url ?? null;
  const avatarFocusX = profile?.avatar_focus_x ?? member?.avatar_focus_x ?? 0.5;
  const avatarFocusY = profile?.avatar_focus_y ?? member?.avatar_focus_y ?? 0.5;
  const avatarZoom = profile?.avatar_zoom ?? member?.avatar_zoom ?? 1;
  const memberInitials = member
    ? memberFallbackInitials(displayName, member.user_id, props)
    : "";
  const billingHistory = memberId ? memberBillingHistoryByMemberId[memberId] ?? null : null;
  const currentPlan = billingHistory?.current_plan ?? null;
  const planLabel = currentPlan ? formatCurrentPlanLabel(currentPlan) : null;
  const planDetail = currentPlan ? formatCurrentPlanDetail(currentPlan) : null;
  const billingHistoryEvents = Array.isArray(billingHistory?.events) ? billingHistory.events : [];
  const billingHistoryError = memberId ? memberBillingHistoryErrorByMemberId[memberId] ?? null : null;
  const isLoadingBillingHistory = Boolean(memberId && loadingMemberBillingHistoryId === memberId);
  const canChangeRole = Boolean(
    member &&
      props.canManageMembers &&
      !memberIsOwner &&
      (props.isActiveCommunityOwner || !memberIsAdmin),
  );
  const canRemoveMember = Boolean(
    member &&
      props.canManageMembers &&
      !memberIsOwner &&
      (props.isActiveCommunityOwner || !memberIsAdmin),
  );
  const roleOptions = member
    ? props.isActiveCommunityOwner
      ? (["member", "moderator", "admin", "co_creator"] as const)
      : memberIsAdmin
        ? ([memberRole] as const)
        : (["member", "moderator"] as const)
    : (["member", "moderator"] as const);

  useEffect(() => {
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
            community_id: activeCommunityId,
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
      requestedMemberBillingHistoryIdsRef.current.delete(memberId);
      setLoadingMemberBillingHistoryId((current) => (
        current === memberId ? null : current
      ));
    };
  }, [
    activeCommunityId,
    canViewMemberPlanDetails,
    loadMemberBillingHistory,
    memberBillingHistoryByMemberId,
    memberId,
  ]);

  if (!member || !props.activeCommunity) return null;

  return (
    <div className="modal-overlay member-settings-overlay" onClick={props.onClose}>
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
          </div>
          <button className="modal-close" onClick={props.onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body member-settings-modal-body">
          <div className="member-settings-section">
            <div className="member-settings-summary">
              <UserAvatar
                className="member-avatar member-settings-avatar"
                readyClassName="has-image"
                name={displayName}
                imageUrl={avatarUrl}
                focusX={avatarFocusX}
                focusY={avatarFocusY}
                zoom={avatarZoom}
                alt={displayName}
                fallback={memberInitials}
              />
              <div className="member-settings-summary-copy">
                <div className="member-settings-summary-name-row">
                  <span className="member-settings-summary-name">{displayName}</span>
                  <span className="member-settings-role-badge">
                    {memberIsOwner ? "Owner" : ROLE_LABEL[memberRole]}
                  </span>
                </div>
                <div className="member-settings-summary-meta">
                  Joined {formatJoinedAt(member.created_at)}
                </div>
              </div>
            </div>
            <label className="member-settings-block">
              <span className="member-settings-block-label">Role</span>
              <select
                className="select-styled members-surface-select member-settings-role-select"
                value={memberRole}
                disabled={!canChangeRole}
                onChange={(event) => {
                  const next = event.target.value as RoleChoice;
                  if (next === memberRole) return;
                  void props.handleSetCommunityMemberRole(member.id, next);
                }}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </label>
            {planLabel ? (
              <div className="member-settings-payment-card">
                <div className="member-settings-payment-title">Current plan</div>
                <div className="member-settings-payment-value">{planLabel}</div>
                {planDetail ? (
                  <div className="member-settings-payment-note">
                    {planDetail}
                  </div>
                ) : null}
              </div>
            ) : null}
            {props.canViewMemberPlanDetails ? (
              <div className="member-settings-billing-history">
                <div className="member-settings-payment-title">Billing history</div>
                {isLoadingBillingHistory && !billingHistory ? (
                  <div className="member-settings-empty">Loading billing history…</div>
                ) : billingHistoryError ? (
                  <div className="member-settings-empty">
                    {billingHistoryError}
                  </div>
                ) : billingHistoryEvents.length ? (
                  <div className="member-settings-history-list">
                    {billingHistoryEvents.map((event) => {
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
            {props.canManageMembers ? (
              <div className="member-settings-danger">
                <span className="member-settings-danger-label">Danger zone</span>
                <div className="member-settings-danger-actions">
                  <button
                    className="member-settings-danger-btn"
                    type="button"
                    disabled={!canRemoveMember}
                    title={canRemoveMember ? "Remove member" : "Only owners can remove admins"}
                    onClick={() => {
                      if (!canRemoveMember) return;
                      props.onClose();
                      void props.handleRemoveCommunityMember(member.id);
                    }}
                  >
                    Remove
                  </button>
                  <button
                    className="member-settings-danger-btn"
                    type="button"
                    disabled={!canRemoveMember}
                    title={canRemoveMember ? "Ban member" : "Only owners can ban admins"}
                    onClick={() => {
                      if (!canRemoveMember) return;
                      props.onClose();
                      void props.handleBanCommunityMember(member.id);
                    }}
                  >
                    Ban
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
