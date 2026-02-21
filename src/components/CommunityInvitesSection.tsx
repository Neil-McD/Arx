import { buildDesktopBestInviteLink } from "../../shared/communityInviteLinks";
import { copyTextToClipboard } from "../../shared/chatUi";
import type { CommunityInvitesActions, CommunityInvitesState } from "./communityMembersContracts";

type CommunityInvitesSectionProps = {
  state: CommunityInvitesState;
  actions: CommunityInvitesActions;
};

export function CommunityInvitesSection(props: CommunityInvitesSectionProps) {
  const { state, actions } = props;
  return (
    <>
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
          <button
            className="invite-create-btn"
            onClick={() => void actions.handleCreateInvite()}
            disabled={state.isCreatingInvite}
          >
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
              const bestInviteLink = buildDesktopBestInviteLink({
                shareBaseUrl: actions.getPublicShareBaseUrl(),
                communityId: state.activeCommunityId ?? null,
                inviteCode: invite.code,
              });
              return (
                <div key={invite.id} className="invite-row">
                  <div className="invite-main">
                    <div className="invite-code">{invite.code}</div>
                    <div className={`invite-status ${status}`}>
                      {status}
                      {invite.max_uses ? ` • max ${invite.max_uses}` : ""}
                      {invite.expires_at
                        ? ` • exp ${new Date(invite.expires_at).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <div className="invite-actions">
                    <button
                      className="secondary"
                      onClick={() => void copyTextToClipboard(bestInviteLink.link)}
                      title={bestInviteLink.kind === "web" ? "Copy web join link" : "Copy app link"}
                    >
                      Copy link
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void copyTextToClipboard(invite.code)}
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
    </>
  );
}
