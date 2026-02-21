import { CommunityMemberList } from "./CommunityMemberList";
import { CommunityMemoryReviewSection } from "./CommunityMemoryReviewSection";
import { CommunityInvitesSection } from "./CommunityInvitesSection";
import type {
  CommunityMembersActions,
  CommunityMembersCapabilities,
  CommunityMembersPanelState,
} from "./communityMembersContracts";

type CommunityMembersPanelProps = {
  capabilities: CommunityMembersCapabilities;
  state: CommunityMembersPanelState;
  actions: CommunityMembersActions;
};

export function CommunityMembersPanel(props: CommunityMembersPanelProps) {
  const { capabilities, state, actions } = props;
  return (
    <div className="community-panel members-panel">
      <div className={`members-layout${(capabilities.canInvite || capabilities.canManageMembers) ? " with-invites" : ""}`}>
        <section className="members-section">
          <div className="members-header-row">
            <div className="members-header">Members</div>
            <div className="members-count">{state.communityMembers.length}</div>
          </div>
          <CommunityMemberList
            members={state.communityMembers}
            profilesByUserId={state.profilesByUserId}
            displayName={actions.displayName}
            canManageMembers={capabilities.canManageMembers}
            containerClassName="members-list"
            emptyClassName="members-empty"
            enableRoleManagement
            isActiveCommunityOwner={capabilities.isActiveCommunityOwner}
            activeCommunityOwnerId={state.activeCommunityOwnerId}
            onSetRole={actions.handleSetCommunityMemberRole}
            onRemoveMember={actions.handleRemoveCommunityMember}
          />
        </section>

        {capabilities.hasActiveCommunity && capabilities.hasSession && (capabilities.canInvite || capabilities.canManageMembers) && (
          <section className="invites-section">
            {capabilities.canManageMembers && (
              <CommunityMemoryReviewSection
                state={state.memoryReview}
                actions={actions.memoryReview}
              />
            )}
            {capabilities.canInvite && (
              <CommunityInvitesSection
                state={state.invites}
                actions={actions.invites}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
