import { getAvatarColor, getInitials } from "../../shared/chatUi";
import { communityInitials } from "../../shared/messageMetadataUi";
import type { CommunityMember, UserProfile } from "./communityMembersContracts";

export type CommunityMemberListMember = CommunityMember;

export type CommunityMemberListProfile = UserProfile;

type CommunityMemberListProps = {
  members: CommunityMemberListMember[];
  profilesByUserId: Record<string, CommunityMemberListProfile | undefined>;
  displayName: (userId: string) => string;
  canManageMembers: boolean;
  containerClassName: string;
  emptyClassName: string;
  enableRoleManagement?: boolean;
  isActiveCommunityOwner?: boolean;
  activeCommunityOwnerId?: string | null;
  onSetRole?: (userId: string, role: string) => Promise<void> | void;
  onRemoveMember?: (userId: string) => Promise<void> | void;
};

export function CommunityMemberList(props: CommunityMemberListProps) {
  return (
    <div className={props.containerClassName}>
      {props.members.length === 0 && (
        <div className={props.emptyClassName}>No members yet.</div>
      )}
      {props.members.map((member) => {
        const profile = props.profilesByUserId[member.user_id] ?? null;
        const avatarUrl = profile?.avatar_url ?? null;
        const initials = profile?.display_name
          ? communityInitials(profile.display_name)
          : getInitials(member.user_id);
        const memberIsOwner = Boolean(
          (props.activeCommunityOwnerId && props.activeCommunityOwnerId === member.user_id) ||
            member.role === "owner",
        );
        const viewerIsOwner = Boolean(props.isActiveCommunityOwner);
        const viewerIsAdmin = props.canManageMembers && !viewerIsOwner;
        const memberIsAdmin = member.role === "admin";
        const canEditThisMember = viewerIsOwner || !memberIsAdmin;
        const canRemoveThisMember =
          viewerIsOwner || (viewerIsAdmin && !memberIsAdmin && !memberIsOwner);
        const roleOptions = viewerIsOwner
          ? ["member", "mod", "admin"]
          : memberIsAdmin
            ? ["admin"]
            : ["member", "mod"];
        const canRenderRoleManagement = Boolean(
          props.enableRoleManagement &&
          props.canManageMembers &&
          props.onSetRole &&
          props.onRemoveMember &&
          !memberIsOwner,
        );

        return (
          <div key={member.id} className="member-item">
            <div
              className="member-avatar"
              style={{ backgroundColor: getAvatarColor(member.user_id) }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={props.displayName(member.user_id)} />
              ) : (
                initials
              )}
            </div>
            <div className="member-info">
              <span className="member-name">
                {props.displayName(member.user_id)}
                {props.canManageMembers && member.access_status === "declined" ? " (declined)" : ""}
              </span>
              {!canRenderRoleManagement ? (
                <span className="member-role">{member.role}</span>
              ) : (
                <div className="member-controls">
                  <select
                    className="select-styled"
                    value={member.role}
                    disabled={!canEditThisMember}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === member.role) return;
                      void props.onSetRole?.(member.user_id, next);
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
                      onClick={() => void props.onRemoveMember?.(member.user_id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
