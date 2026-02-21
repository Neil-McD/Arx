type CommunityMember = {
  id: string;
  user_id: string;
  role: string;
  access_status?: string;
  subscription_billing_period?: string | null;
  subscription_amount_base_units?: number | string | null;
  subscription_currency?: string | null;
  subscription_currency_decimals?: number | null;
};

type CommunityInviteRecord = {
  id: string;
  code: string;
  max_uses: number | null;
  expires_at: string | null;
  revoked_at: string | null;
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
  free_join_requires_approval: boolean;
};

type UserProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
};

type CommunityMemberPlanCohort = {
  key: string;
  value: string;
  label: string;
  count: number;
};

type FormatSubscriptionPriceInput = {
  amountBaseUnits?: number | string | null;
  currency?: string | null;
  currencyDecimals?: number | null;
  billingPeriod: string;
};

type WebCommunityMembersSectionProps = {
  activeCommunity: ActiveCommunity | null;
  hasSession: boolean;
  capabilities: {
    canInviteActiveCommunity: boolean;
    canManageMembersActiveCommunity: boolean;
    canReviewJoinRequestsActiveCommunity: boolean;
    isActiveCommunityOwner: boolean;
  };
  state: {
    communityMembers: CommunityMember[];
    filteredCommunityMembers: CommunityMember[];
    communityMembersRoleFilter: string;
    communityMembersPlanFilter: string;
    communityMemberPlanCohorts: CommunityMemberPlanCohort[];
    membersCommunityHasPaidPlans: boolean | null;
    activeCommunityJoinMode: string;
    communityJoinRequests: CommunityJoinRequest[];
    communityJoinRequestsError: string | null;
    decidingCommunityJoinRequestId: string | null;
    isLoadingMembersCommunityPricing: boolean;
    isLoadingCommunityJoinRequests: boolean;
    isSavingFreeJoinRequiresApproval: boolean;
    isJoinRequestsModalOpen: boolean;
    inviteMaxUsesPreset: string;
    inviteMaxUsesCustom: string;
    inviteExpiryPreset: string;
    inviteExpiryCustom: string;
    inviteCreateError: string | null;
    isCreatingInvite: boolean;
    isLoadingCommunityInvites: boolean;
    communityInvites: CommunityInviteRecord[];
    profilesByUserId: Record<string, UserProfile>;
  };
  actions: {
    setCommunityMembersRoleFilter: (value: string) => void;
    setCommunityMembersPlanFilter: (value: string) => void;
    setIsJoinRequestsModalOpen: (isOpen: boolean) => void;
    setInviteMaxUsesPreset: (value: string) => void;
    setInviteMaxUsesCustom: (value: string) => void;
    setInviteExpiryPreset: (value: string) => void;
    setInviteExpiryCustom: (value: string) => void;
    displayName: (userId: string) => string;
    handleSetCommunityFreeJoinRequiresApproval: (requiresApproval: boolean) => Promise<void> | void;
    handleSetCommunityMemberRole: (userId: string, role: string) => Promise<void> | void;
    handleRemoveCommunityMember: (userId: string) => Promise<void> | void;
    handleCreateInvite: () => Promise<void> | void;
    handleRevokeInvite: (inviteId: string) => Promise<void> | void;
    handleDeleteInvite: (inviteId: string) => Promise<void> | void;
    handleApproveCommunityJoinRequest: (requestId: string) => Promise<void> | void;
    handleDenyCommunityJoinRequest: (requestId: string) => Promise<void> | void;
    copyTextToClipboard: (value: string) => Promise<void> | void;
    buildCommunityInstantAccessLink: (origin: string, slug: string, code: string) => string;
    getAvatarColor: (seed: string) => string;
    getInitials: (value: string) => string;
    communityInitials: (value: string) => string;
    formatSubscriptionPrice: (input: FormatSubscriptionPriceInput) => string;
    formatRelativeTime: (value: string) => string;
  };
};

export function WebCommunityMembersSection(props: WebCommunityMembersSectionProps) {
  const { activeCommunity, hasSession, capabilities, state, actions } = props;

  return (
    <>
      <div className="community-panel members-panel">
        <div className={`members-layout${capabilities.canInviteActiveCommunity ? " with-invites" : ""}`}>
          <section className="members-section">
            <div className="members-header-row">
              <div className="members-header">Members</div>
              <div className="members-count">
                {state.communityMembersRoleFilter !== "all" || state.communityMembersPlanFilter !== "all"
                  ? `${state.filteredCommunityMembers.length} / ${state.communityMembers.length}`
                  : state.communityMembers.length}
              </div>
            </div>
            {capabilities.canManageMembersActiveCommunity && (
              <div className="invite-create-row" style={{ marginTop: 10 }}>
                <label className="invite-field">
                  <span>Role</span>
                  <select
                    className="select-styled"
                    value={state.communityMembersRoleFilter}
                    onChange={(event) => actions.setCommunityMembersRoleFilter(event.target.value)}
                  >
                    <option value="all">All roles</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="mod">Moderator</option>
                    <option value="member">Member</option>
                  </select>
                </label>
                <label className="invite-field">
                  <span>Plan</span>
                  <select
                    className="select-styled"
                    value={state.communityMembersPlanFilter}
                    onChange={(event) => actions.setCommunityMembersPlanFilter(event.target.value)}
                  >
                    <option value="all">All plans</option>
                    <option value="free">Free / none</option>
                    <option value="monthly">Monthly (any)</option>
                    <option value="yearly">Annual (any)</option>
                    {state.communityMemberPlanCohorts.length > 0 && (
                      <optgroup label="Price cohorts">
                        {state.communityMemberPlanCohorts.map((cohort) => (
                          <option key={cohort.key} value={cohort.value}>
                            {cohort.label} ({cohort.count})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
            )}
            {activeCommunity &&
              capabilities.canReviewJoinRequestsActiveCommunity &&
              state.membersCommunityHasPaidPlans === false && (
                <div className="members-header-row" style={{ marginTop: 10 }}>
                  <label
                    className="resource-pin"
                    style={{ cursor: state.isSavingFreeJoinRequiresApproval ? "not-allowed" : "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={!activeCommunity.free_join_requires_approval}
                      disabled={state.isLoadingMembersCommunityPricing || state.isSavingFreeJoinRequiresApproval}
                      onChange={(event) => {
                        const nextAutoApprove = event.target.checked;
                        void actions.handleSetCommunityFreeJoinRequiresApproval(!nextAutoApprove);
                      }}
                    />
                    Auto-approve new members
                  </label>
                </div>
              )}
            {activeCommunity &&
              capabilities.canReviewJoinRequestsActiveCommunity &&
              state.membersCommunityHasPaidPlans === false &&
              (state.activeCommunityJoinMode === "request_access" || state.communityJoinRequests.length > 0) && (
                <div className="members-header-row" style={{ marginTop: 10 }}>
                  <button
                    className="secondary"
                    type="button"
                    disabled={
                      state.isLoadingMembersCommunityPricing ||
                      state.isLoadingCommunityJoinRequests ||
                      state.isSavingFreeJoinRequiresApproval
                    }
                    onClick={() => actions.setIsJoinRequestsModalOpen(true)}
                  >
                    Pending approvals ({state.isLoadingCommunityJoinRequests ? "…" : String(state.communityJoinRequests.length)})
                  </button>
                </div>
              )}
            {state.communityJoinRequestsError && (
              <div className="auth-error" style={{ marginTop: 8 }}>
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
                    (activeCommunity && activeCommunity.owner_id === member.user_id) || member.role === "owner",
                  );
                  const planPeriod = String(member.subscription_billing_period ?? "").trim().toLowerCase();
                  const showPlanLabel = planPeriod === "monthly" || planPeriod === "yearly";
                  const planLabel = showPlanLabel
                    ? actions.formatSubscriptionPrice({
                        amountBaseUnits: member.subscription_amount_base_units,
                        currency: member.subscription_currency,
                        currencyDecimals: member.subscription_currency_decimals,
                        billingPeriod: planPeriod,
                      })
                    : "";
                  const viewerIsOwner = capabilities.isActiveCommunityOwner;
                  const viewerIsAdmin = capabilities.canManageMembersActiveCommunity && !viewerIsOwner;
                  const memberIsAdmin = member.role === "admin";
                  const canEditThisMember = viewerIsOwner || !memberIsAdmin;
                  const canRemoveThisMember = viewerIsOwner || (viewerIsAdmin && !memberIsAdmin && !memberIsOwner);
                  const roleOptions = viewerIsOwner
                    ? ["member", "mod", "admin"]
                    : memberIsAdmin
                      ? ["admin"]
                      : ["member", "mod"];
                  return (
                    <div key={member.id} className="member-item">
                      <div className="member-avatar" style={{ backgroundColor: actions.getAvatarColor(member.user_id) }}>
                        {avatarUrl ? <img src={avatarUrl} alt={actions.displayName(member.user_id)} /> : initials}
                      </div>
                      <div className="member-info">
                        <span className="member-name">
                          {actions.displayName(member.user_id)}
                          {capabilities.canManageMembersActiveCommunity && member.access_status === "declined" ? " (declined)" : ""}
                        </span>
                        {!capabilities.canManageMembersActiveCommunity || memberIsOwner ? (
                          <span className="member-role">
                            {memberIsOwner ? "owner" : member.role}
                            {showPlanLabel ? ` • ${planLabel}` : ""}
                          </span>
                        ) : (
                          <div className="member-controls">
                            <select
                              className="select-styled"
                              value={member.role}
                              disabled={!canEditThisMember}
                              onChange={(event) => {
                                const next = event.target.value;
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

          {activeCommunity && hasSession && capabilities.canInviteActiveCommunity && (
            <section className="invites-section">
              <div className="members-header-row">
                <div className="members-header">Invites</div>
              </div>
              <div className="invites-card">
                <div className="invite-create-row invite-create-row-cta">
                  <label className="invite-field">
                    <span>Max uses</span>
                    <select
                      className="select-styled"
                      value={state.inviteMaxUsesPreset}
                      onChange={(event) => actions.setInviteMaxUsesPreset(event.target.value)}
                    >
                      <option value="unlimited">Unlimited</option>
                      <option value="1">1 use</option>
                      <option value="5">5 uses</option>
                      <option value="10">10 uses</option>
                      <option value="25">25 uses</option>
                      <option value="100">100 uses</option>
                      <option value="custom">Custom…</option>
                    </select>
                  </label>
                  <label className="invite-field">
                    <span>Expires</span>
                    <select
                      className="select-styled"
                      value={state.inviteExpiryPreset}
                      onChange={(event) => actions.setInviteExpiryPreset(event.target.value)}
                    >
                      <option value="never">Never</option>
                      <option value="24h">24 hours</option>
                      <option value="7d">7 days</option>
                      <option value="30d">30 days</option>
                      <option value="90d">90 days</option>
                      <option value="custom">Custom…</option>
                    </select>
                  </label>
                  <button className="invite-create-btn" onClick={() => void actions.handleCreateInvite()} disabled={state.isCreatingInvite}>
                    {state.isCreatingInvite ? "Creating…" : "Create"}
                  </button>
                </div>
                {(state.inviteMaxUsesPreset === "custom" || state.inviteExpiryPreset === "custom") && (
                  <div className="invite-create-row invite-create-row-custom">
                    {state.inviteMaxUsesPreset === "custom" && (
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Custom max uses"
                        value={state.inviteMaxUsesCustom}
                        onChange={(event) => actions.setInviteMaxUsesCustom(event.target.value)}
                      />
                    )}
                    {state.inviteExpiryPreset === "custom" && (
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Custom expiry (days)"
                        value={state.inviteExpiryCustom}
                        onChange={(event) => actions.setInviteExpiryCustom(event.target.value)}
                      />
                    )}
                  </div>
                )}
                {state.inviteCreateError && <div className="auth-error">{state.inviteCreateError}</div>}
                <div className="invite-list">
                  {state.isLoadingCommunityInvites ? (
                    <div className="chat-empty">Loading invites…</div>
                  ) : state.communityInvites.length === 0 ? (
                    <div className="chat-empty">No invites yet.</div>
                  ) : (
                    state.communityInvites.map((invite) => {
                      const revoked = Boolean(invite.revoked_at);
                      const expired = Boolean(invite.expires_at && new Date(invite.expires_at).getTime() < Date.now());
                      const status = revoked ? "revoked" : expired ? "expired" : "active";
                      const inviteLink = actions.buildCommunityInstantAccessLink(
                        window.location.origin,
                        activeCommunity.slug,
                        invite.code,
                      );
                      return (
                        <div key={invite.id} className="invite-row">
                          <div className="invite-main">
                            <div className="invite-code">{invite.code}</div>
                            <div className={`invite-status ${status}`}>
                              {status}
                              {invite.max_uses ? ` • max ${invite.max_uses}` : ""}
                              {invite.expires_at ? ` • exp ${new Date(invite.expires_at).toLocaleDateString()}` : ""}
                            </div>
                          </div>
                          <div className="invite-actions">
                            <button
                              className="secondary"
                              onClick={() => void actions.copyTextToClipboard(inviteLink)}
                              title="Copy instant access link"
                            >
                              Copy link
                            </button>
                            <button
                              className="secondary"
                              onClick={() => void actions.copyTextToClipboard(invite.code)}
                              title="Copy invite code"
                            >
                              Copy code
                            </button>
                            <button
                              className="secondary"
                              onClick={() => void actions.handleRevokeInvite(invite.id)}
                              disabled={revoked}
                              title="Revoke invite"
                            >
                              Revoke
                            </button>
                            <button
                              className="danger"
                              onClick={() => void actions.handleDeleteInvite(invite.id)}
                              title="Delete invite"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
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
