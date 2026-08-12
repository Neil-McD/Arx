import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CommunityFunnelUiFaceLike } from "../../../../shared/communityFunnelUi";

const MAX_VISIBLE_MEMBER_FACES = 5;

function formatMemberCount(count: number): string {
  const normalized = Math.max(0, Math.floor(count));
  return `${new Intl.NumberFormat().format(normalized)} ${normalized === 1 ? "member" : "members"}`;
}

export function CommunityFunnelMemberProof(props: {
  communityName: string;
  faces?: CommunityFunnelUiFaceLike[] | null;
  memberCount?: number | null;
}) {
  const visibleFaces = (props.faces ?? []).slice(0, MAX_VISIBLE_MEMBER_FACES);
  const memberCount = Math.max(0, Math.floor(props.memberCount ?? 0));
  const hiddenCount = Math.max(0, memberCount - visibleFaces.length);
  if (memberCount === 0 && visibleFaces.length === 0) return null;

  return (
    <div
      className="community-funnel-member-proof"
      aria-label={`${formatMemberCount(memberCount)} in ${props.communityName}`}
    >
      {visibleFaces.length > 0 ? (
        <div className="community-funnel-member-faces" aria-hidden="true">
          {visibleFaces.map((face, index) => (
            <UserAvatar
              key={face.user_id}
              className="community-funnel-member-face"
              readyClassName="has-image"
              name={face.display_name?.trim() || "Member"}
              imageUrl={face.avatar_url}
              focusX={face.avatar_focus_x}
              focusY={face.avatar_focus_y}
              zoom={face.avatar_zoom}
              alt=""
              fallback="?"
              loading="eager"
              fetchPriority={index === 0 ? "high" : "auto"}
              aria-hidden={true}
              style={{ zIndex: visibleFaces.length - index }}
            />
          ))}
          {hiddenCount > 0 ? (
            <span className="community-funnel-member-face community-funnel-member-more">
              +{hiddenCount}
            </span>
          ) : null}
        </div>
      ) : null}
      <span>{formatMemberCount(memberCount)}</span>
    </div>
  );
}
